"""fininzen/crypto.py — Application-layer AES-256-GCM field encryption.

A handful of sensitive free-text fields are encrypted at the application layer so
their plaintext never lands in the database file, the WAL, a `pg_dump`, or an
off-site backup. Money amounts, dates, foreign keys and reporting fields stay in
clear (see the migration plan): encrypting them would break filters, aggregations,
ordering and constraints without a dedicated redesign.

Envelope format — versioned so we can change algorithm/keys without a data migration:

    fenc:v1:<base64( key_index(1) || nonce(12) || ciphertext+tag )>

- ``key_index``  which key in ``settings.FIELD_ENCRYPTION_KEYS`` produced this value,
  so key rotation only needs the *old* key kept around for reads.
- ``nonce``      random per encryption (AES-GCM must never reuse a nonce per key).
- ciphertext+tag AESGCM output, including the 16-byte authentication tag.

Blind index — a deterministic keyed HMAC-SHA256 over the normalized plaintext, used
*only* for exact-match lookups and uniqueness (``ExpenseDescriptionSuggestion``). It
leaks equality (same plaintext → same index) and nothing else, and it never takes
part in money math.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import unicodedata

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

ENVELOPE_PREFIX = "fenc:"
_VERSION = "v1"
_VERSION_TAG = f"{ENVELOPE_PREFIX}{_VERSION}:"
_NONCE_BYTES = 12
_KEY_BYTES = 32
_TAG_BYTES = 16

# Cache decoded keys keyed by the raw settings tuple so override_settings() in
# tests (a different tuple) transparently busts the cache.
_key_cache: dict[tuple, list[bytes]] = {}


class EncryptionError(Exception):
    """Raised when a value cannot be encrypted or decrypted (missing/rotated key,
    corrupt envelope). Surfaced rather than silently returning ciphertext."""


def _raw_keys() -> tuple:
    return tuple(getattr(settings, "FIELD_ENCRYPTION_KEYS", ()) or ())


def get_keys() -> list[bytes]:
    """Return the configured 32-byte keys (primary first). Empty when encryption
    is disabled (dev/test without a key configured)."""
    raw = _raw_keys()
    cached = _key_cache.get(raw)
    if cached is not None:
        return cached
    keys: list[bytes] = []
    for idx, item in enumerate(raw):
        if isinstance(item, (bytes, bytearray)):
            key = bytes(item)
        else:
            try:
                key = base64.b64decode(item, validate=True)
            except (ValueError, TypeError) as exc:
                raise ImproperlyConfigured(
                    f"FIELD_ENCRYPTION_KEYS[{idx}] is not valid base64."
                ) from exc
        if len(key) != _KEY_BYTES:
            raise ImproperlyConfigured(
                f"FIELD_ENCRYPTION_KEYS[{idx}] must decode to {_KEY_BYTES} bytes "
                f"(got {len(key)}). Generate one with:\n"
                '  python -c "import os,base64;'
                'print(base64.b64encode(os.urandom(32)).decode())"'
            )
        keys.append(key)
    _key_cache[raw] = keys
    return keys


def is_encryption_enabled() -> bool:
    return bool(get_keys())


def _aesgcm(key: bytes):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    return AESGCM(key)


def is_encrypted(value) -> bool:
    """True when ``value`` *looks like* one of our envelopes (prefix only).

    This is a cheap shape check, not a guarantee the value is a genuine,
    decryptable envelope — user free-text could coincidentally start with the
    prefix. Use :func:`is_valid_envelope` before treating a value as ciphertext
    that must round-trip."""
    return isinstance(value, str) and value.startswith(ENVELOPE_PREFIX)


def is_valid_envelope(value) -> bool:
    """True iff ``value`` is one of our envelopes AND decrypts with a configured
    key. Distinguishes a genuine ciphertext (pass through untouched on re-save)
    from user text that merely starts with the ``fenc:`` prefix (must be
    encrypted, not stored verbatim — otherwise it would be unreadable later)."""
    if not is_encrypted(value):
        return False
    try:
        decrypt(value)
        return True
    except EncryptionError:
        return False


def encrypt(plaintext: str) -> str:
    if plaintext is None:
        raise EncryptionError("Cannot encrypt None.")
    keys = get_keys()
    if not keys:
        raise EncryptionError("No FIELD_ENCRYPTION_KEYS configured; cannot encrypt.")
    key_index = 0
    nonce = os.urandom(_NONCE_BYTES)
    ct = _aesgcm(keys[key_index]).encrypt(nonce, plaintext.encode("utf-8"), None)
    blob = bytes([key_index]) + nonce + ct
    return _VERSION_TAG + base64.b64encode(blob).decode("ascii")


def decrypt(value: str) -> str:
    """Decrypt an envelope. Non-envelope strings (legacy/dev plaintext written
    before encryption was enabled) pass through unchanged."""
    if not is_encrypted(value):
        return value
    if not value.startswith(_VERSION_TAG):
        raise EncryptionError("Unsupported encryption envelope version.")
    keys = get_keys()
    if not keys:
        raise EncryptionError(
            "Encrypted value present but no FIELD_ENCRYPTION_KEYS configured."
        )
    try:
        blob = base64.b64decode(value[len(_VERSION_TAG) :], validate=True)
    except (ValueError, TypeError) as exc:
        raise EncryptionError("Corrupt encryption envelope (bad base64).") from exc
    if len(blob) < 1 + _NONCE_BYTES + _TAG_BYTES:
        raise EncryptionError("Corrupt encryption envelope (too short).")
    key_index = blob[0]
    nonce = blob[1 : 1 + _NONCE_BYTES]
    ct = blob[1 + _NONCE_BYTES :]
    # Try the stamped key first, then the others — AES-GCM's auth tag identifies
    # the right one, so this tolerates a rotated/reordered key list.
    from cryptography.exceptions import InvalidTag

    candidates = [keys[key_index]] if 0 <= key_index < len(keys) else []
    candidates += [k for i, k in enumerate(keys) if i != key_index]
    for key in candidates:
        try:
            return _aesgcm(key).decrypt(nonce, ct, None).decode("utf-8")
        except InvalidTag:
            continue
    raise EncryptionError(
        "Could not decrypt value with any configured key (wrong/rotated key?)."
    )


def blind_index(value: str) -> str:
    """Deterministic exact-match index over normalized plaintext.

    Keyed HMAC-SHA256 when an encryption key is configured; without keys (dev/test)
    it falls back to an unkeyed SHA-256 so uniqueness/equality still work. The value
    is NFC-normalized so callers and the field-level ``pre_save`` agree byte-for-byte.
    """
    norm = unicodedata.normalize("NFC", value or "").encode("utf-8")
    keys = get_keys()
    if keys:
        return hmac.new(keys[0], norm, hashlib.sha256).hexdigest()
    return hashlib.sha256(b"fininzen-bidx:" + norm).hexdigest()
