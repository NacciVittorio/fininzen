"""
fininzen/export_views.py — Feature F (Data Export).

Single endpoint `GET /api/export/?type=<kind>` that streams the user's data
as CSV (or all kinds bundled as a ZIP when `type=all`).

Kinds mirror the roadmap spec:
    accounts        Asset rows whose investment_type is a bank account
    assets          all Asset rows
    transactions    AssetTransaction rows
    cashflow        Expense rows
    price_history   AssetPriceHistory rows
    all             every kind above, zipped together

Auth: IsAuthenticated. Demo user is rejected with 403 — exports leak the
whole dataset and would defeat the demo sandboxing.

Scope: every query is filtered by the authenticated user. ViewAs exports are
explicitly rejected because browsing grants do not authorize bulk extraction.
"""

import csv
import io
import logging
import tempfile
import zipfile
from datetime import date
from urllib.parse import quote

from django.http import FileResponse, StreamingHttpResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from expenses.models import Expense
from fininzen.mixins import _effective_user, resolve_view_as
from fininzen.permissions import DEMO_USERNAME
from portfolio.models import Asset, AssetPriceHistory, AssetTransaction

logger = logging.getLogger(__name__)

_CSV_KINDS = ("accounts", "assets", "transactions", "cashflow", "price_history")
_ZIP_MAX_BYTES = 50 * 1024 * 1024


def _accounts_rows(user):
    yield ["id", "name", "investment_type", "currency", "current_balance"]
    qs = (
        Asset.objects.filter(owner=user, investment_type__is_bank_account=True)
        .select_related("investment_type")
        .order_by("name")
    )
    for a in qs:
        yield [
            a.id,
            a.name,
            a.investment_type.name if a.investment_type else "",
            a.currency,
            str(a.current_value if a.current_value is not None else "0"),
        ]


def _assets_rows(user):
    yield [
        "id",
        "name",
        "ticker",
        "isin",
        "investment_type",
        "tracking_type",
        "currency",
        "shares",
        "price_per_share",
        "current_value",
        "current_value_eur",
        "invested_capital",
        "invested_capital_eur",
        "contribution_source_mode",
    ]
    qs = (
        Asset.objects.filter(owner=user)
        .select_related("investment_type")
        .order_by("name")
    )
    for a in qs:
        yield [
            a.id,
            a.name,
            a.ticker,
            a.isin,
            a.investment_type.name if a.investment_type else "",
            a.tracking_type,
            a.currency,
            "" if a.shares is None else str(a.shares),
            "" if a.price_per_share is None else str(a.price_per_share),
            str(a.current_value if a.current_value is not None else "0"),
            "" if a.current_value_eur is None else str(a.current_value_eur),
            str(a.invested_capital if a.invested_capital is not None else "0"),
            "" if a.invested_capital_eur is None else str(a.invested_capital_eur),
            a.contribution_source_mode,
        ]


_TX_HEADER = [
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


def _tx_row(t):
    total = (t.shares or 0) * (t.price_per_share or 0)
    return [
        t.id,
        t.asset.name,
        t.transaction_type,
        t.date.isoformat(),
        str(t.shares),
        str(t.price_per_share),
        str(total),
        t.contribution_source.name if t.contribution_source_id else "",
        t.notes,
    ]


def _all_transactions_rows(user):
    yield _TX_HEADER
    qs = (
        AssetTransaction.objects.filter(asset__owner=user)
        .select_related("asset", "contribution_source")
        .order_by("-date", "-created_at")
    )
    for t in qs:
        yield _tx_row(t)


def _investment_transactions_rows(user):
    yield _TX_HEADER
    qs = (
        AssetTransaction.objects.filter(
            asset__owner=user,
            asset__investment_type__is_bank_account=False,
        )
        .select_related("asset", "asset__investment_type", "contribution_source")
        .order_by("-date", "-created_at")
    )
    for t in qs:
        yield _tx_row(t)


def _cashflow_rows(user):
    yield [
        "id",
        "date",
        "description",
        "amount",
        "category",
        "category_type",
        "linked_asset",
    ]
    qs = (
        Expense.objects.filter(owner=user)
        .select_related("category", "linked_asset")
        .order_by("-date", "-id")
    )
    for e in qs:
        yield [
            e.id,
            e.date.isoformat(),
            e.description,
            str(e.amount),
            e.category.name if e.category else "",
            e.category.category_type if e.category else "",
            e.linked_asset.name if e.linked_asset else "",
        ]


def _price_history_rows(user):
    yield ["asset_name", "date", "close", "currency"]
    qs = (
        AssetPriceHistory.objects.filter(asset__owner=user)
        .select_related("asset")
        .order_by("asset__name", "date")
    )
    for p in qs:
        yield [p.asset.name, p.date.isoformat(), str(p.close), p.asset.currency]


_ROW_PRODUCERS = {
    "accounts": _accounts_rows,
    "assets": _assets_rows,
    "transactions": _investment_transactions_rows,
    "cashflow": _cashflow_rows,
    "price_history": _price_history_rows,
}

# Export All (ZIP) keeps the full transactions stream — including bank-account
# cash_in/cash_out/adjustment rows — so users do not lose data when grabbing a
# full snapshot. The standalone /api/export/?type=transactions endpoint is
# scoped to investment trades only (see _ROW_PRODUCERS).
_ZIP_PRODUCERS = {**_ROW_PRODUCERS, "transactions": _all_transactions_rows}


# Cells beginning with any of these characters are interpreted as formulas
# by Excel / Google Sheets / LibreOffice when the CSV is opened. Prefixing a
# single quote forces literal-text interpretation (CWE-1236, "CSV injection").
_FORMULA_PREFIXES = ("=", "+", "-", "@")
_CONTROL_PREFIXES = tuple(chr(i) for i in range(32))


class ExportTooLarge(ValueError):
    pass


class _CappedFile:
    """File-like wrapper that enforces a hard byte cap while ZipFile writes."""

    def __init__(self, fileobj, max_bytes):
        self._fileobj = fileobj
        self._max_bytes = max_bytes

    def write(self, data):
        current = self._fileobj.tell()
        if current + len(data) > self._max_bytes:
            raise ExportTooLarge("export_zip_too_large")
        return self._fileobj.write(data)

    def __getattr__(self, name):
        return getattr(self._fileobj, name)


def _content_disposition(filename):
    return f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}"


def _sanitize_cell(value):
    if isinstance(value, str) and value.startswith(
        _FORMULA_PREFIXES + _CONTROL_PREFIXES
    ):
        return "'" + value
    return value


def _sanitize_row(row):
    return [_sanitize_cell(c) for c in row]


def _write_csv(producer, user, buffer):
    """Write rows from `producer(user)` as CSV into `buffer` (text-mode)."""
    writer = csv.writer(buffer)
    for row in producer(user):
        writer.writerow(_sanitize_row(row))


def _csv_response(producer, user, filename):
    class _Echo:
        def write(self, value):
            return value

    writer = csv.writer(_Echo())
    response = StreamingHttpResponse(
        (writer.writerow(_sanitize_row(row)) for row in producer(user)),
        content_type="text/csv; charset=utf-8",
    )
    response["Content-Disposition"] = _content_disposition(filename)
    return response


def _zip_response(user, today_str):
    raw_buffer = tempfile.SpooledTemporaryFile(max_size=2 * 1024 * 1024, mode="w+b")
    buffer = _CappedFile(raw_buffer, _ZIP_MAX_BYTES)
    try:
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for kind, producer in _ZIP_PRODUCERS.items():
                with zf.open(f"fininzen_{kind}_{today_str}.csv", "w") as raw_csv:
                    text_csv = io.TextIOWrapper(raw_csv, encoding="utf-8", newline="")
                    _write_csv(producer, user, text_csv)
                    text_csv.flush()
                    text_csv.detach()
    except ExportTooLarge:
        raw_buffer.close()
        return Response(
            {"error": "export_too_large"},
            status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )
    buffer.seek(0)
    response = FileResponse(buffer, content_type="application/zip")
    response["Content-Disposition"] = _content_disposition(
        f"fininzen_export_{today_str}.zip"
    )
    return response


class ExportView(APIView):
    """GET /api/export/?type=<kind> — see module docstring for the kinds."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        resolve_view_as(request)
        # Demo account ships shared data — exports would leak the whole
        # demo dataset and defeat sandboxing. Reject with 403 like other
        # demo-restricted endpoints.
        if (
            request.user
            and request.user.is_authenticated
            and request.user.username == DEMO_USERNAME
        ):
            return Response(
                {"error": "demo_export_disabled"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # ViewAs grants (read or write) let a grantee browse another user's
        # data inside the UI, but bulk-exporting it would let them walk away
        # with the full dataset. A read grant does NOT include the right to
        # exfiltrate — refuse the export and force the grantee to use their
        # own account.
        if getattr(request, "view_as_user", None) is not None:
            return Response(
                {"error": "export_viewas_disabled"},
                status=status.HTTP_403_FORBIDDEN,
            )

        export_type = (request.query_params.get("type") or "").strip().lower()
        if not export_type:
            return Response(
                {
                    "error": "missing_type",
                    "valid_types": list(_CSV_KINDS) + ["all"],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = _effective_user(request)
        today_str = date.today().isoformat()

        if export_type == "all":
            logger.info("export: user=%s type=all", user)
            return _zip_response(user, today_str)

        producer = _ROW_PRODUCERS.get(export_type)
        if producer is None:
            return Response(
                {
                    "error": "invalid_type",
                    "valid_types": list(_CSV_KINDS) + ["all"],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        logger.info("export: user=%s type=%s", user, export_type)
        filename = f"fininzen_{export_type}_{today_str}.csv"
        return _csv_response(producer, user, filename)
