"""Tests for application-layer field encryption, the blind index, production
settings gating, and the migrate_sqlite_to_postgres command."""

import base64
import os
import sqlite3
import subprocess
import sys

import pytest
from django.conf import settings
from django.db import connection
from django.test import override_settings

from fininzen import crypto

# Two distinct, valid 32-byte base64 keys for tests.
KEY1 = base64.b64encode(b"A" * 32).decode()
KEY2 = base64.b64encode(b"B" * 32).decode()

BASE_DIR = str(settings.BASE_DIR)

_PROD_ENV_KEYS = [
    "DATABASE_URL",
    "POSTGRES_DB",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_HOST",
    "POSTGRES_PORT",
    "POSTGRES_SSLMODE",
    "PGHOST",
    "PGDATABASE",
    "PGUSER",
    "FIELD_ENCRYPTION_KEYS",
    "FIELD_ENCRYPTION_KEY",
    "DB_PATH",
    "DJANGO_DEBUG",
    "DJANGO_SECRET_KEY",
    "DJANGO_ALLOWED_HOSTS",
]


def _clean_env(**overrides):
    """A subprocess env with all DB/crypto/prod knobs stripped, then overridden."""
    env = dict(os.environ)
    for k in _PROD_ENV_KEYS:
        env.pop(k, None)
    env.update(overrides)
    return env


# ── crypto core ──────────────────────────────────────────────────────────────
@override_settings(FIELD_ENCRYPTION_KEYS=[KEY1])
def test_encrypt_decrypt_roundtrip():
    token = crypto.encrypt("Stipendio Giugno")
    assert token.startswith("fenc:v1:")
    assert "Stipendio" not in token
    assert crypto.decrypt(token) == "Stipendio Giugno"


@override_settings(FIELD_ENCRYPTION_KEYS=[KEY1])
def test_encrypt_is_randomized():
    # Fresh nonce per call → same plaintext yields different ciphertext.
    assert crypto.encrypt("x") != crypto.encrypt("x")


@override_settings(FIELD_ENCRYPTION_KEYS=[])
def test_encrypt_requires_key():
    assert crypto.is_encryption_enabled() is False
    with pytest.raises(crypto.EncryptionError):
        crypto.encrypt("x")


def test_decrypt_passthrough_for_legacy_plaintext():
    # Non-envelope strings pass through unchanged regardless of key state.
    assert crypto.decrypt("legacy plaintext") == "legacy plaintext"


@override_settings(FIELD_ENCRYPTION_KEYS=[KEY1])
def test_decrypt_with_wrong_key_fails_cleanly():
    token = crypto.encrypt("secret")
    with override_settings(FIELD_ENCRYPTION_KEYS=[KEY2]):
        with pytest.raises(crypto.EncryptionError):
            crypto.decrypt(token)


@override_settings(FIELD_ENCRYPTION_KEYS=[KEY1])
def test_decrypt_corrupt_envelope_fails_cleanly():
    with pytest.raises(crypto.EncryptionError):
        crypto.decrypt("fenc:v1:not-valid-base64!!")


def test_key_rotation_old_key_still_decrypts():
    # Encrypt with KEY1 as primary…
    with override_settings(FIELD_ENCRYPTION_KEYS=[KEY1]):
        token = crypto.encrypt("rotate me")
    # …then rotate so KEY2 is primary but KEY1 is retained for reads.
    with override_settings(FIELD_ENCRYPTION_KEYS=[KEY2, KEY1]):
        assert crypto.decrypt("rotate me") == "rotate me"  # passthrough
        assert crypto.decrypt(token) == "rotate me"


def test_invalid_key_length_raises():
    from django.core.exceptions import ImproperlyConfigured

    bad = base64.b64encode(b"too-short").decode()
    with override_settings(FIELD_ENCRYPTION_KEYS=[bad]):
        with pytest.raises(ImproperlyConfigured):
            crypto.get_keys()


def test_blind_index_deterministic_and_keyed():
    with override_settings(FIELD_ENCRYPTION_KEYS=[KEY1]):
        a = crypto.blind_index("Esselunga")
        assert a == crypto.blind_index("Esselunga")
        assert len(a) == 64
    with override_settings(FIELD_ENCRYPTION_KEYS=[KEY2]):
        assert crypto.blind_index("Esselunga") != a  # different key → different index


# ── encrypted model fields ───────────────────────────────────────────────────
@pytest.mark.django_db
@override_settings(FIELD_ENCRYPTION_KEYS=[KEY1])
def test_asset_notes_ciphertext_at_rest_plaintext_via_orm(test_user):
    from portfolio.models import Asset

    asset = Asset.objects.create(name="Conto", notes="IBAN segreto", owner=test_user)
    with connection.cursor() as cur:
        cur.execute("SELECT notes FROM portfolio_asset WHERE id = %s", [asset.id])
        raw = cur.fetchone()[0]
    assert raw.startswith("fenc:v1:")
    assert "segreto" not in raw
    assert Asset.objects.get(id=asset.id).notes == "IBAN segreto"


@pytest.mark.django_db
@override_settings(FIELD_ENCRYPTION_KEYS=[KEY1])
def test_empty_notes_not_encrypted(test_user):
    from portfolio.models import Asset

    asset = Asset.objects.create(name="Conto", notes="", owner=test_user)
    with connection.cursor() as cur:
        cur.execute("SELECT notes FROM portfolio_asset WHERE id = %s", [asset.id])
        assert cur.fetchone()[0] == ""


@pytest.mark.django_db
@override_settings(FIELD_ENCRYPTION_KEYS=[KEY1])
def test_recurring_description_encrypted(test_user):
    from expenses.models import RecurringExpense
    import datetime

    rec = RecurringExpense.objects.create(
        description="Apple Music",
        amount="9.99",
        start_date=datetime.date(2026, 1, 1),
        owner=test_user,
    )
    with connection.cursor() as cur:
        cur.execute(
            "SELECT description FROM expenses_recurringexpense WHERE id = %s", [rec.id]
        )
        assert cur.fetchone()[0].startswith("fenc:v1:")
    assert RecurringExpense.objects.get(id=rec.id).description == "Apple Music"


# ── envelope-prefix collision: user text that starts with "fenc:" ────────────
@pytest.mark.django_db
@override_settings(FIELD_ENCRYPTION_KEYS=[KEY1])
def test_user_text_resembling_envelope_is_encrypted_not_stored_verbatim(test_user):
    """A note that merely starts with the 'fenc:' prefix must be encrypted (not
    short-circuited as 'already an envelope'), or it would be unreadable later."""
    from portfolio.models import Asset

    evil = "fenc:v1:this is just a note a user typed"
    asset = Asset.objects.create(name="Conto", notes=evil, owner=test_user)
    with connection.cursor() as cur:
        cur.execute("SELECT notes FROM portfolio_asset WHERE id = %s", [asset.id])
        raw = cur.fetchone()[0]
    assert raw.startswith("fenc:v1:")
    assert "a user typed" not in raw  # genuinely encrypted
    # Round-trips back to the exact original instead of raising on read.
    assert Asset.objects.get(id=asset.id).notes == evil


@pytest.mark.django_db
@override_settings(FIELD_ENCRYPTION_KEYS=[])
def test_envelope_prefixed_plaintext_reads_back_when_keyless(test_user):
    """With no key configured (dev/test), a 'fenc:'-looking value stored as
    plaintext reads back verbatim rather than raising EncryptionError."""
    from portfolio.models import Asset

    asset = Asset.objects.create(name="Conto", notes="fenc:not-real", owner=test_user)
    assert Asset.objects.get(id=asset.id).notes == "fenc:not-real"


# ── blind index: uniqueness, dedup, autocomplete ─────────────────────────────
@pytest.mark.django_db
@override_settings(FIELD_ENCRYPTION_KEYS=[KEY1])
def test_suggestion_blind_index_dedup_and_ciphertext(test_user):
    from expenses.models import Category, ExpenseDescriptionSuggestion as S

    cat = Category.objects.create(name="Spesa", owner=test_user)
    bidx = crypto.blind_index("Esselunga")
    s1, c1 = S.objects.get_or_create(
        owner=test_user, category=cat, text_bidx=bidx, defaults={"text": "Esselunga"}
    )
    s2, c2 = S.objects.get_or_create(
        owner=test_user, category=cat, text_bidx=bidx, defaults={"text": "Esselunga"}
    )
    assert c1 is True and c2 is False
    assert s1.pk == s2.pk
    # blind index auto-populated by pre_save and matches the keyed recompute.
    assert s1.text_bidx == crypto.blind_index("Esselunga")
    with connection.cursor() as cur:
        cur.execute(
            "SELECT text FROM expenses_expensedescriptionsuggestion WHERE id = %s",
            [s1.id],
        )
        assert cur.fetchone()[0].startswith("fenc:v1:")


@pytest.mark.django_db
@override_settings(FIELD_ENCRYPTION_KEYS=[KEY1])
def test_track_description_suggestion_uses_blind_index(test_user):
    from expenses.models import Category, Expense, ExpenseDescriptionSuggestion as S
    from expenses.services import track_description_suggestion
    import datetime

    cat = Category.objects.create(name="Spesa", owner=test_user)
    for _ in range(2):
        exp = Expense(
            description="Conad",
            amount="10.00",
            date=datetime.date(2026, 1, 1),
            category=cat,
            owner=test_user,
        )
        track_description_suggestion(exp)
    # Can't equality-filter the encrypted text directly — look it up via the
    # blind index (the whole point of text_bidx).
    rows = S.objects.filter(
        owner=test_user, category=cat, text_bidx=crypto.blind_index("Conad")
    )
    assert rows.count() == 1
    assert rows.first().use_count == 2
    assert rows.first().text == "Conad"


@pytest.mark.django_db
@override_settings(FIELD_ENCRYPTION_KEYS=[KEY1])
def test_autocomplete_prefix_over_encrypted_text(client, test_user):
    from expenses.models import Category, ExpenseDescriptionSuggestion as S

    cat = Category.objects.create(name="Spesa", owner=test_user)
    for t in ["Esselunga", "Eataly", "Conad"]:
        S.objects.create(owner=test_user, category=cat, text=t)
    res = client.get(
        f"/api/expenses/description-suggestions/?category_id={cat.id}&q=es"
    )
    assert res.status_code == 200
    body = res.json()
    assert "Esselunga" in body
    assert "Conad" not in body  # prefix excludes it
    assert "Eataly" not in body  # 'eataly' does not start with 'es'


# ── production settings gating (subprocess: must boot the WSGI app) ───────────
def _boot_wsgi(env):
    return subprocess.run(
        [sys.executable, "-c", "import fininzen.wsgi"],
        env=env,
        cwd=BASE_DIR,
        capture_output=True,
        text=True,
    )


def test_production_requires_postgres():
    env = _clean_env(
        DJANGO_DEBUG="0",
        DJANGO_SECRET_KEY="z" * 60,
        DJANGO_ALLOWED_HOSTS="example.com",
        FIELD_ENCRYPTION_KEYS=KEY1,
    )  # no DATABASE_URL/POSTGRES_* → defaults to SQLite → must refuse
    r = _boot_wsgi(env)
    assert r.returncode != 0
    assert "PostgreSQL" in (r.stderr + r.stdout)


def test_production_requires_encryption_key():
    env = _clean_env(
        DJANGO_DEBUG="0",
        DJANGO_SECRET_KEY="z" * 60,
        DJANGO_ALLOWED_HOSTS="example.com",
        POSTGRES_DB="fininzen",
        POSTGRES_HOST="localhost",
    )  # Postgres but no FIELD_ENCRYPTION_KEYS → must refuse
    r = _boot_wsgi(env)
    assert r.returncode != 0
    assert "FIELD_ENCRYPTION_KEYS" in (r.stderr + r.stdout)


def test_production_boots_with_postgres_and_key():
    env = _clean_env(
        DJANGO_DEBUG="0",
        DJANGO_SECRET_KEY="z" * 60,
        DJANGO_ALLOWED_HOSTS="example.com",
        DATABASE_URL="postgres://u:p@localhost:5432/fininzen",
        FIELD_ENCRYPTION_KEYS=KEY1,
    )
    r = _boot_wsgi(env)
    assert r.returncode == 0, r.stderr


def test_dev_boots_without_postgres_or_key():
    r = _boot_wsgi(_clean_env(DJANGO_DEBUG="1"))
    assert r.returncode == 0, r.stderr


# ── migrate_sqlite_to_postgres command (subprocess, temp SQLite source/dest) ──
def _manage(args, db_path, key=None, sqlite_extra=None):
    extra = {"FIELD_ENCRYPTION_KEYS": key} if key else {}
    env = _clean_env(DJANGO_DEBUG="1", DB_PATH=str(db_path), **extra)
    return subprocess.run(
        [sys.executable, "manage.py", *args],
        env=env,
        cwd=BASE_DIR,
        capture_output=True,
        text=True,
    )


def test_migrate_command_encrypts_on_write(tmp_path):
    src = tmp_path / "src.sqlite3"
    dst = tmp_path / "dst.sqlite3"

    # Source migrated and seeded WITHOUT a key → plaintext at rest (mirrors the
    # legacy production SQLite).
    assert _manage(["migrate", "--noinput"], src).returncode == 0
    assert _manage(["migrate", "--noinput"], dst).returncode == 0
    seed = (
        "from django.contrib.auth.models import User;"
        "from portfolio.models import Asset;"
        "from expenses.models import Category, ExpenseDescriptionSuggestion as S;"
        "u=User.objects.create_user('mig','m@e.com','pw12345678');"
        "a=Asset.objects.create(name='Conto', notes='IBAN top secret', owner=u);"
        "c=Category.objects.create(name='Spesa', owner=u);"
        "S.objects.create(owner=u, category=c, text='Esselunga')"
    )
    r = _manage(["shell", "-c", seed], src)
    assert r.returncode == 0, r.stderr

    # Source notes are plaintext before migration.
    con = sqlite3.connect(src)
    assert (
        con.execute("SELECT notes FROM portfolio_asset").fetchone()[0]
        == "IBAN top secret"
    )
    con.close()

    # Run the migration into dst WITH a key → encrypt on write.
    env = _clean_env(DJANGO_DEBUG="1", DB_PATH=str(dst), FIELD_ENCRYPTION_KEYS=KEY1)
    r = subprocess.run(
        [
            sys.executable,
            "manage.py",
            "migrate_sqlite_to_postgres",
            "--sqlite-path",
            str(src),
            "--apply",
        ],
        env=env,
        cwd=BASE_DIR,
        capture_output=True,
        text=True,
    )
    assert r.returncode == 0, r.stderr + r.stdout
    assert "complete and verified" in r.stdout

    # Destination holds ciphertext + a populated blind index.
    con = sqlite3.connect(dst)
    notes = con.execute("SELECT notes FROM portfolio_asset").fetchone()[0]
    text, bidx = con.execute(
        "SELECT text, text_bidx FROM expenses_expensedescriptionsuggestion"
    ).fetchone()
    user_count = con.execute("SELECT COUNT(*) FROM auth_user").fetchone()[0]
    con.close()
    assert notes.startswith("fenc:v1:") and "secret" not in notes
    assert text.startswith("fenc:v1:")
    assert len(bidx) == 64
    assert user_count == 1
