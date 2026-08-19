"""Centralised API responses that never reflect exception text.

Exception messages are server-side diagnostics. Even messages currently raised
by validation code can start carrying database, provider, or filesystem details
after a future refactor, so HTTP payloads use only stable application-defined
codes and messages.
"""

from rest_framework import status as drf_status
from rest_framework.response import Response


def invalid_request_response(*, status=drf_status.HTTP_400_BAD_REQUEST):
    """Return the generic response for rejected domain/service operations."""
    return Response({"error": "invalid_request"}, status=status)


def transaction_validation_response(exc):
    """Return an allow-listed transaction validation message.

    The exception text is used only to select a server-defined constant. It is
    never copied into the response, and unrecognised messages fall back to the
    generic error code.
    """
    message = str(exc)
    if message == "This asset does not support contribution sources":
        return Response(
            {"error": "This asset does not support contribution sources"},
            status=drf_status.HTTP_400_BAD_REQUEST,
        )
    if message == "Contribution source cannot be used with a source account":
        return Response(
            {"error": "Contribution source cannot be used with a source account"},
            status=drf_status.HTTP_400_BAD_REQUEST,
        )
    if message == "Contribution source is allowed only on buy transactions":
        return Response(
            {"error": "Contribution source is allowed only on buy transactions"},
            status=drf_status.HTTP_400_BAD_REQUEST,
        )
    if message == "Contribution source is not available for this asset":
        return Response(
            {"error": "Contribution source is not available for this asset"},
            status=drf_status.HTTP_400_BAD_REQUEST,
        )
    if message.startswith("Cannot sell "):
        return Response(
            {"error": "Cannot sell more shares than are owned"},
            status=drf_status.HTTP_400_BAD_REQUEST,
        )
    return invalid_request_response()


def archived_asset_response():
    """Return the stable response for attempts to mutate archived assets."""
    return Response(
        {
            "error": "asset_archived",
            "detail": "Archived asset transactions are read-only",
        },
        status=drf_status.HTTP_409_CONFLICT,
    )
