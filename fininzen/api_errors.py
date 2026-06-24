"""Centralised, safe API error responses.

CodeQL flags ``str(exc)`` reaching an HTTP response (``py/stack-trace-exposure``).
Most of our sinks are intentional: the domain/service layer raises ``ValueError``
subclasses carrying *user-facing* validation messages (never tracebacks), so
reflecting them is safe. A few sinks, however, sat behind a broad ``except
Exception`` and could in principle leak SQL identifiers, file paths or stack
context.

This module is the single, audited place where an exception/message is turned
into a client payload. Every message passes through :func:`safe_client_message`,
which drops anything that looks like an internal detail (defence in depth) and
bounds the length. Views import these helpers instead of inlining ``str(exc)``.

Truly unhandled exceptions are intentionally *not* caught here: Django already
returns a generic 500 (no traceback) when ``DEBUG`` is off, and some views rely
on non-lock ``OperationalError`` propagating so the surrounding ``transaction``
rolls back and the failure surfaces loudly.
"""

import re

from rest_framework import status as drf_status
from rest_framework.response import Response

_MAX_LEN = 300

# Markers that must never reach a client. If a message contains any of these it
# almost certainly comes from an unexpected (non-validation) error, so we drop
# it in favour of a generic code and rely on the server-side log for detail.
_INTERNAL_MARKERS = re.compile(
    r'File "|Traceback|/Users/|/home/|site-packages|0x[0-9a-fA-F]{6,}|'
    r"\bSELECT\b|\bINSERT\b|\bUPDATE\b|psycopg|sqlite3|OperationalError"
)


def safe_client_message(message):
    """Return a client-safe error string, or a generic code if it looks internal."""
    text = str(message).strip()
    if not text or _INTERNAL_MARKERS.search(text):
        return "invalid_request"
    return text[:_MAX_LEN]


def client_error_response(
    message, *, status=drf_status.HTTP_400_BAD_REQUEST, extra=None
):
    """Build a 4xx ``Response`` carrying only a sanitized error message."""
    payload = {"error": safe_client_message(message)}
    if extra:
        payload.update(extra)
    return Response(payload, status=status)


def domain_error_response(exc):
    """Map a domain ``ValueError`` to a safe 4xx ``Response``.

    ``ArchivedAssetTransactionError`` -> 409 ``{"error":"asset_archived","detail":<msg>}``
    any other ``ValueError``          -> 400 ``{"error":<msg>}``
    """
    # Imported lazily: the project package must not import app code at load time.
    from portfolio.services import ArchivedAssetTransactionError

    if isinstance(exc, ArchivedAssetTransactionError):
        return Response(
            {"error": "asset_archived", "detail": safe_client_message(exc)},
            status=drf_status.HTTP_409_CONFLICT,
        )
    return client_error_response(exc)
