"""Generation/hashing helpers for ApiToken. Plain SHA-256, not
fininzen.crypto.blind_index — see ApiToken's docstring for why."""

import hashlib
import secrets

TOKEN_PREFIX = "fnz_"


def generate_token() -> str:
    return TOKEN_PREFIX + secrets.token_urlsafe(32)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def token_prefix(raw: str) -> str:
    return raw[:12]
