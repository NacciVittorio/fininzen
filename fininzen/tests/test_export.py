"""
Feature F regression tests — Data Export endpoint.

Covers:
- GET /api/export/?type=accounts|assets|transactions|cashflow|price_history → 200 text/csv
- GET /api/export/?type=all → 200 application/zip with one csv per kind
- Demo user → 403
- Missing / invalid type → 400
- Owner scoping (no cross-user leak)
"""

import csv
import io
import zipfile
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth.models import User
from django.test import Client

import fininzen.export_views as export_views
from expenses.models import Category, Expense
from portfolio.models import (
    Asset,
    AssetPriceHistory,
    AssetTransaction,
    ContributionSource,
    InvestmentType,
)


def _response_body(response):
    return b"".join(response.streaming_content)


@pytest.fixture
def itype_bank(test_user):
    return InvestmentType.objects.create(
        name="Bank",
        is_bank_account=True,
        supports_ticker=False,
        is_liquid_default=True,
        owner=test_user,
    )


@pytest.fixture
def itype_etf(test_user):
    return InvestmentType.objects.create(
        name="ETF",
        is_bank_account=False,
        supports_ticker=True,
        is_liquid_default=True,
        owner=test_user,
    )


@pytest.fixture
def bank_account(test_user, itype_bank):
    return Asset.objects.create(
        name="Main Bank",
        investment_type=itype_bank,
        currency="EUR",
        current_value=Decimal("1500.00"),
        invested_capital=Decimal("1500.00"),
        owner=test_user,
    )


@pytest.fixture
def etf_asset(test_user, itype_etf):
    return Asset.objects.create(
        name="VWCE",
        ticker="VWCE.DE",
        isin="IE00BK5BQT80",
        investment_type=itype_etf,
        currency="EUR",
        shares=Decimal("10.000000"),
        price_per_share=Decimal("110.0000"),
        current_value=Decimal("1100.00"),
        invested_capital=Decimal("1000.00"),
        owner=test_user,
    )


@pytest.fixture
def contribution_source(test_user):
    return ContributionSource.objects.create(name="TFR", owner=test_user)


@pytest.fixture
def buy_tx(test_user, etf_asset, contribution_source):
    return AssetTransaction.objects.create(
        asset=etf_asset,
        transaction_type=AssetTransaction.BUY,
        date=date(2026, 5, 1),
        shares=Decimal("10.000000"),
        price_per_share=Decimal("100.0000"),
        contribution_source=contribution_source,
        notes="initial buy",
        owner=test_user,
    )


@pytest.fixture
def bank_cash_in_tx(test_user, bank_account):
    return AssetTransaction.objects.create(
        asset=bank_account,
        transaction_type=AssetTransaction.CASH_IN,
        date=date(2026, 5, 4),
        shares=Decimal("1.000000"),
        price_per_share=Decimal("500.0000"),
        notes="salary deposit",
        owner=test_user,
    )


@pytest.fixture
def cat_food(test_user):
    return Category.objects.create(
        name="Food", category_type=Category.EXPENSE, owner=test_user
    )


@pytest.fixture
def lunch_expense(test_user, cat_food):
    return Expense.objects.create(
        description="Lunch",
        amount=Decimal("12.50"),
        category=cat_food,
        date=date(2026, 5, 2),
        owner=test_user,
    )


@pytest.fixture
def price_point(test_user, etf_asset):
    return AssetPriceHistory.objects.create(
        asset=etf_asset,
        date=date(2026, 5, 1),
        close=Decimal("110.0000"),
        owner=test_user,
    )


# ── 200 paths ────────────────────────────────────────────────────────────────


def test_export_accounts_returns_csv(client, bank_account, etf_asset):
    res = client.get("/api/export/?type=accounts")
    assert res.status_code == 200
    assert res["Content-Type"].startswith("text/csv")
    assert 'filename="fininzen_accounts_' in res["Content-Disposition"]
    assert "filename*=UTF-8''fininzen_accounts_" in res["Content-Disposition"]
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == ["id", "name", "investment_type", "currency", "current_balance"]
    names = [r[1] for r in rows[1:]]
    assert "Main Bank" in names
    # ETF (non-bank) must not appear in accounts export
    assert "VWCE" not in names


def test_export_assets_returns_all_assets(client, bank_account, etf_asset):
    res = client.get("/api/export/?type=assets")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    names = [r[1] for r in rows[1:]]
    assert "Main Bank" in names and "VWCE" in names


def test_export_transactions_returns_csv(client, buy_tx, bank_cash_in_tx):
    res = client.get("/api/export/?type=transactions")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == [
        "id",
        "asset_name",
        "transaction_type",
        "date",
        "shares",
        "price_per_share",
        "total_value",
        "contribution_source",
        "notes",
    ]
    asset_names = [r[1] for r in rows[1:]]
    # Investment trade is included…
    assert any(r[1] == "VWCE" and r[2] == "buy" and r[7] == "TFR" for r in rows[1:])
    # …but bank-account cashflow movements (cash_in / cash_out / adjustment)
    # are excluded from the standalone Investments export.
    assert "Main Bank" not in asset_names


def test_export_transactions_includes_owned_tx(client, etf_asset):
    AssetTransaction.objects.create(
        asset=etf_asset,
        owner=etf_asset.owner,
        shares=Decimal("1.000000"),
        price_per_share=Decimal("100.0000"),
        transaction_type=AssetTransaction.BUY,
        date=date(2026, 5, 3),
    )
    res = client.get("/api/export/?type=transactions")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert any(r[1] == "VWCE" and r[2] == "buy" for r in rows[1:])


def test_export_cashflow_returns_csv(client, lunch_expense):
    res = client.get("/api/export/?type=cashflow")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == [
        "id",
        "date",
        "description",
        "amount",
        "category",
        "category_type",
        "linked_asset",
    ]
    assert any(r[2] == "Lunch" and r[4] == "Food" for r in rows[1:])


def test_export_price_history_returns_csv(client, price_point):
    res = client.get("/api/export/?type=price_history")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == ["asset_name", "date", "close", "currency"]
    assert any(r[0] == "VWCE" for r in rows[1:])


def test_export_all_returns_zip_with_every_kind(
    client,
    bank_account,
    etf_asset,
    buy_tx,
    bank_cash_in_tx,
    lunch_expense,
    price_point,
):
    res = client.get("/api/export/?type=all")
    assert res.status_code == 200
    assert res["Content-Type"] == "application/zip"
    assert 'filename="fininzen_export_' in res["Content-Disposition"]
    assert "filename*=UTF-8''fininzen_export_" in res["Content-Disposition"]
    with zipfile.ZipFile(io.BytesIO(_response_body(res))) as zf:
        names = zf.namelist()
        for kind in ("accounts", "assets", "transactions", "cashflow", "price_history"):
            assert any(
                n.startswith(f"fininzen_{kind}_") and n.endswith(".csv") for n in names
            ), f"missing {kind} in zip: {names}"
        tx_name = next(n for n in names if n.startswith("fininzen_transactions_"))
        tx_rows = list(csv.reader(io.StringIO(zf.read(tx_name).decode("utf-8"))))
        # The ZIP keeps the full transactions stream — investment trades AND
        # bank-account cashflow movements — so Export All loses no data.
        assert any(r[1] == "VWCE" and r[2] == "buy" for r in tx_rows[1:])
        assert any(r[1] == "Main Bank" and r[2] == "cash_in" for r in tx_rows[1:])


# ── 4xx paths ────────────────────────────────────────────────────────────────


def test_export_missing_type_returns_400(client):
    res = client.get("/api/export/")
    assert res.status_code == 400
    assert res.json()["error"] == "missing_type"


def test_export_invalid_type_returns_400(client):
    res = client.get("/api/export/?type=bogus")
    assert res.status_code == 400
    assert res.json()["error"] == "invalid_type"


def test_export_unauthenticated_returns_401(db):
    res = Client().get("/api/export/?type=assets")
    # DRF returns 401 (or 403 depending on auth scheme); both prove the
    # endpoint is locked down. Accept either to stay implementation-neutral.
    assert res.status_code in (401, 403)


def test_export_demo_user_returns_403(db):
    demo = User.objects.create_user(username="demo@demo.com", password="demopw")
    c = Client()
    c.force_login(demo)
    res = c.get("/api/export/?type=assets")
    assert res.status_code == 403
    assert res.json()["error"] == "demo_export_disabled"


# ── Owner scoping ────────────────────────────────────────────────────────────


def test_export_blocked_under_viewas(db, test_user, itype_etf):
    """A grantee using X-View-As must not be able to bulk-export the
    owner's data — read grants don't include exfiltration rights."""
    from fininzen.models import DataAccessGrant

    grantee = User.objects.create_user(
        username="grantee@test.com", email="grantee@test.com", password="pw12345!"
    )
    Asset.objects.create(
        name="OwnerOnly",
        investment_type=itype_etf,
        currency="EUR",
        current_value=Decimal("777.00"),
        invested_capital=Decimal("777.00"),
        owner=test_user,
    )
    DataAccessGrant.objects.create(owner=test_user, grantee=grantee, permission="read")

    c = Client()
    c.force_login(grantee)
    res = c.get("/api/export/?type=assets", HTTP_X_VIEW_AS=str(test_user.id))
    assert res.status_code == 403
    assert res.json()["error"] == "export_viewas_disabled"


def test_export_does_not_leak_other_users_assets(
    client, test_user, etf_asset, itype_etf
):
    other = User.objects.create_user(username="other@test.com", password="otherpw123")
    Asset.objects.create(
        name="OtherUserAsset",
        investment_type=itype_etf,
        currency="EUR",
        current_value=Decimal("999.00"),
        invested_capital=Decimal("999.00"),
        owner=other,
    )
    res = client.get("/api/export/?type=assets")
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    names = [r[1] for r in rows[1:]]
    assert "OtherUserAsset" not in names
    assert "VWCE" in names


# ── CSV formula-injection regression (CWE-1236) ──────────────────────────────

DANGEROUS_PAYLOADS = [
    '=HYPERLINK("http://attacker","click")',
    "+cmd",
    "-10+20",
    "@SUM(1,2)",
    "\tformula",
    "\rformula",
    "\nformula",
    "\x1fformula",
]


def _assert_no_unescaped_formula(rows):
    """Every cell that originally started with a dangerous char must now be
    single-quote-prefixed. Header rows (column names) are static and never
    start with these chars, so this also guards against accidental over-escape."""
    for row in rows:
        for cell in row:
            if not cell:
                continue
            if cell[0] in ("=", "+", "-", "@", "\t", "\r", "\n"):
                raise AssertionError(
                    f"unescaped formula-prefix cell in export: {cell!r}"
                )


@pytest.fixture
def dangerous_bank(test_user, itype_bank):
    return Asset.objects.create(
        name='=HYPERLINK("http://attacker","click")',
        investment_type=itype_bank,
        currency="EUR",
        current_value=Decimal("100.00"),
        invested_capital=Decimal("100.00"),
        owner=test_user,
    )


@pytest.fixture
def dangerous_etf(test_user, itype_etf):
    return Asset.objects.create(
        name="+cmd",
        ticker="-10+20",
        isin="@SUM(1,2)",
        investment_type=itype_etf,
        currency="EUR",
        shares=Decimal("1.000000"),
        price_per_share=Decimal("1.0000"),
        current_value=Decimal("1.00"),
        invested_capital=Decimal("1.00"),
        owner=test_user,
    )


@pytest.fixture
def dangerous_tx(test_user, dangerous_etf, contribution_source):
    return AssetTransaction.objects.create(
        asset=dangerous_etf,
        transaction_type=AssetTransaction.BUY,
        date=date(2026, 5, 1),
        shares=Decimal("1.000000"),
        price_per_share=Decimal("1.0000"),
        contribution_source=contribution_source,
        notes="@SUM(1,2)",
        owner=test_user,
    )


@pytest.fixture
def dangerous_expense(test_user):
    cat = Category.objects.create(
        name="=evil", category_type=Category.EXPENSE, owner=test_user
    )
    return Expense.objects.create(
        description='=HYPERLINK("http://attacker","click")',
        amount=Decimal("1.00"),
        category=cat,
        date=date(2026, 5, 2),
        owner=test_user,
    )


@pytest.fixture
def dangerous_price_point(test_user, dangerous_etf):
    return AssetPriceHistory.objects.create(
        asset=dangerous_etf,
        date=date(2026, 5, 1),
        close=Decimal("1.0000"),
        owner=test_user,
    )


def test_export_accounts_sanitizes_formulas(client, dangerous_bank):
    res = client.get("/api/export/?type=accounts")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    _assert_no_unescaped_formula(rows[1:])
    # The original name should appear with a leading single-quote
    names = [r[1] for r in rows[1:]]
    assert any(n.startswith("'=") for n in names)


def test_export_assets_sanitizes_formulas(client, dangerous_etf):
    res = client.get("/api/export/?type=assets")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    _assert_no_unescaped_formula(rows[1:])


def test_export_transactions_sanitizes_formulas(client, dangerous_tx):
    res = client.get("/api/export/?type=transactions")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    _assert_no_unescaped_formula(rows[1:])
    # asset_name and notes columns must be sanitized
    assert any(r[1].startswith("'+") for r in rows[1:])
    assert any(r[8].startswith("'@") for r in rows[1:])


def test_export_cashflow_sanitizes_formulas(client, dangerous_expense):
    res = client.get("/api/export/?type=cashflow")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    _assert_no_unescaped_formula(rows[1:])
    # description and category must both be sanitized
    descriptions = [r[2] for r in rows[1:]]
    categories = [r[4] for r in rows[1:]]
    assert any(d.startswith("'=") for d in descriptions)
    assert any(c.startswith("'=") for c in categories)


def test_export_zip_sanitizes_every_kind(
    client,
    dangerous_bank,
    dangerous_etf,
    dangerous_tx,
    dangerous_expense,
    dangerous_price_point,
):
    res = client.get("/api/export/?type=all")
    assert res.status_code == 200
    with zipfile.ZipFile(io.BytesIO(_response_body(res))) as zf:
        for name in zf.namelist():
            with zf.open(name) as fp:
                text = fp.read().decode("utf-8")
            rows = list(csv.reader(io.StringIO(text)))
            _assert_no_unescaped_formula(rows[1:])


@pytest.mark.parametrize("payload", DANGEROUS_PAYLOADS)
def test_export_cashflow_sanitizes_every_dangerous_prefix(
    client, test_user, cat_food, payload
):
    Expense.objects.create(
        description=payload,
        amount=Decimal("1.00"),
        category=cat_food,
        date=date(2026, 5, 3),
        owner=test_user,
    )
    res = client.get("/api/export/?type=cashflow")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    _assert_no_unescaped_formula(rows[1:])
    descriptions = [r[2] for r in rows[1:]]
    # Sanitized version is the payload prefixed with a single quote
    assert ("'" + payload) in descriptions, descriptions


def test_export_all_returns_413_when_zip_exceeds_cap(
    client,
    bank_account,
    etf_asset,
    monkeypatch,
):
    monkeypatch.setattr(export_views, "_ZIP_MAX_BYTES", 1)

    res = client.get("/api/export/?type=all")

    assert res.status_code == 413
    assert res.json()["error"] == "export_too_large"
