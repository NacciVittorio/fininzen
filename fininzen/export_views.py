"""
fininzen/export_views.py — Feature F (Data Export).

Single endpoint `GET /api/export/?type=<kind>` that streams the user's data
as CSV (or all kinds bundled as a ZIP when `type=all`).

Kinds mirror the roadmap spec:
    accounts                    Asset rows whose investment_type is a bank account
    assets                      all Asset rows
    transactions                AssetTransaction rows
    cashflow                    Expense rows
    price_history               AssetPriceHistory rows
    categories                  Category rows
    budgets                     Budget rows
    recurring_expenses          RecurringExpense rows
    recurring_investment_plans  RecurringInvestmentPlan rows
    allocation_targets          AllocationTarget rows
    fire_settings               FireSettings (singleton, header + at most one row)
    investment_types            InvestmentType rows
    contribution_sources        ContributionSource rows
    profile                     UserProfile preferences (singleton, non-sensitive fields only)
    sharing                     DataAccessGrant rows the user created (owner=user)
    all                         every kind above, zipped together

Auth: IsAuthenticated. Demo user is rejected with 403 — exports leak the
whole dataset and would defeat the demo sandboxing.

Scope: every query is filtered by the authenticated user. ViewAs exports are
explicitly rejected because browsing grants do not authorize bulk extraction.
"""

import csv
import io
import json
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

from expenses.models import Budget, Category, Expense, RecurringExpense
from fininzen.mixins import _effective_user, resolve_view_as
from fininzen.models import DataAccessGrant, UserProfile
from fininzen.permissions import DEMO_USERNAME
from portfolio.models import (
    AllocationTarget,
    Asset,
    AssetPriceHistory,
    AssetTransaction,
    ContributionSource,
    FireSettings,
    InvestmentType,
    RecurringInvestmentPlan,
)

logger = logging.getLogger(__name__)

_CSV_KINDS = (
    "accounts",
    "assets",
    "transactions",
    "cashflow",
    "price_history",
    "categories",
    "budgets",
    "recurring_expenses",
    "recurring_investment_plans",
    "allocation_targets",
    "fire_settings",
    "investment_types",
    "contribution_sources",
    "profile",
    "sharing",
)
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
        "notes",
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
            a.notes,
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
    "fee",
    "tax_amount",
    "fx_rate_to_eur",
    "gross_amount_eur",
    "fee_eur",
    "tax_amount_eur",
    "is_verified",
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
        str(t.fee),
        str(t.tax_amount),
        "" if t.fx_rate_to_eur is None else str(t.fx_rate_to_eur),
        "" if t.gross_amount_eur is None else str(t.gross_amount_eur),
        "" if t.fee_eur is None else str(t.fee_eur),
        "" if t.tax_amount_eur is None else str(t.tax_amount_eur),
        t.is_verified,
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
    yield ["asset_name", "date", "close", "currency", "open"]
    qs = (
        AssetPriceHistory.objects.filter(asset__owner=user)
        .select_related("asset")
        .order_by("asset__name", "date")
    )
    for p in qs:
        yield [
            p.asset.name,
            p.date.isoformat(),
            str(p.close),
            p.asset.currency,
            "" if p.open is None else str(p.open),
        ]


def _categories_rows(user):
    yield ["id", "name", "category_type", "color", "icon", "parent"]
    qs = (
        Category.objects.filter(owner=user)
        .select_related("parent")
        .order_by("category_type", "name")
    )
    for c in qs:
        yield [
            c.id,
            c.name,
            c.category_type,
            c.color,
            c.icon,
            c.parent.name if c.parent_id else "",
        ]


def _budgets_rows(user):
    yield ["id", "category", "amount"]
    qs = (
        Budget.objects.filter(owner=user)
        .select_related("category")
        .order_by("category__name")
    )
    for b in qs:
        yield [b.id, b.category.name, str(b.amount)]


def _recurring_expenses_rows(user):
    yield [
        "id",
        "description",
        "amount",
        "category",
        "linked_asset",
        "frequency",
        "day_of_month",
        "month_of_year",
        "start_date",
        "end_date",
        "status",
    ]
    qs = (
        RecurringExpense.objects.filter(owner=user)
        .select_related("category", "linked_asset")
        .order_by("-start_date", "id")
    )
    for r in qs:
        yield [
            r.id,
            r.description,
            str(r.amount),
            r.category.name if r.category_id else "",
            r.linked_asset.name if r.linked_asset_id else "",
            r.frequency,
            r.day_of_month,
            "" if r.month_of_year is None else r.month_of_year,
            r.start_date.isoformat(),
            r.end_date.isoformat() if r.end_date else "",
            r.status,
        ]


def _recurring_investment_plans_rows(user):
    yield [
        "id",
        "name",
        "asset",
        "source_account",
        "amount",
        "frequency",
        "day_of_week",
        "day_of_month",
        "anchor_month",
        "start_date",
        "end_date",
        "status",
    ]
    qs = (
        RecurringInvestmentPlan.objects.filter(owner=user)
        .select_related("asset", "source_account")
        .order_by("name", "id")
    )
    for p in qs:
        yield [
            p.id,
            p.name,
            p.asset.name,
            p.source_account.name,
            str(p.amount),
            p.frequency,
            "" if p.day_of_week is None else p.day_of_week,
            p.day_of_month,
            "" if p.anchor_month is None else p.anchor_month,
            p.start_date.isoformat(),
            p.end_date.isoformat() if p.end_date else "",
            p.status,
        ]


def _allocation_targets_rows(user):
    yield ["id", "investment_type", "target_percent"]
    qs = (
        AllocationTarget.objects.filter(owner=user)
        .select_related("investment_type")
        .order_by("investment_type__name")
    )
    for t in qs:
        yield [t.id, t.investment_type.name, str(t.target_percent)]


_FIRE_SETTINGS_HEADER = [
    "user_age",
    "retirement_age",
    "withdrawal_rate",
    "annual_expenses_override",
    "growth_rate_bear",
    "growth_rate_base",
    "growth_rate_bull",
    "inflation_rate",
    "net_worth_goal",
    "model_mode",
    "swr_base",
    "swr_min",
    "swr_max",
    "annual_expenses_retirement",
    "annual_passive_income_retirement",
    "expected_real_return",
    "expected_nominal_return",
    "annual_contribution",
    "tax_drag_rate",
    "target_retirement_age",
    "life_expectancy",
    "portfolio_equity_pct",
]


def _fire_settings_rows(user):
    yield _FIRE_SETTINGS_HEADER
    # Read directly rather than FireSettings.get_singleton(), which creates a
    # row on first access — a GET export request must not have write side effects.
    fs = FireSettings.objects.filter(owner=user).first()
    if fs is None:
        return
    yield [
        fs.user_age,
        fs.retirement_age,
        str(fs.withdrawal_rate),
        "" if fs.annual_expenses_override is None else str(fs.annual_expenses_override),
        str(fs.growth_rate_bear),
        str(fs.growth_rate_base),
        str(fs.growth_rate_bull),
        str(fs.inflation_rate),
        "" if fs.net_worth_goal is None else str(fs.net_worth_goal),
        fs.model_mode,
        str(fs.swr_base),
        str(fs.swr_min),
        str(fs.swr_max),
        ""
        if fs.annual_expenses_retirement is None
        else str(fs.annual_expenses_retirement),
        str(fs.annual_passive_income_retirement),
        str(fs.expected_real_return),
        str(fs.expected_nominal_return),
        "" if fs.annual_contribution is None else str(fs.annual_contribution),
        str(fs.tax_drag_rate),
        fs.target_retirement_age,
        fs.life_expectancy,
        str(fs.portfolio_equity_pct),
    ]


def _investment_types_rows(user):
    yield [
        "id",
        "name",
        "color",
        "icon",
        "is_bank_account",
        "supports_ticker",
        "is_liquid_default",
        "supports_contribution_source",
        "tax_rate",
    ]
    qs = InvestmentType.objects.filter(owner=user).order_by("name")
    for t in qs:
        yield [
            t.id,
            t.name,
            t.color,
            t.icon,
            t.is_bank_account,
            t.supports_ticker,
            t.is_liquid_default,
            t.supports_contribution_source,
            str(t.tax_rate),
        ]


def _contribution_sources_rows(user):
    yield ["id", "name", "sort_order", "is_active"]
    qs = ContributionSource.objects.filter(owner=user).order_by("sort_order", "name")
    for s in qs:
        yield [s.id, s.name, s.sort_order, s.is_active]


_PROFILE_HEADER = [
    "decimal_separator",
    "name",
    "dashboard_config",
    "dashboard_preferences",
    "transaction_preferences",
    "enabled_features",
    "accounting_month_start_day",
    "privacy_preferences",
    "last_seen_release",
    "terms_accepted_at",
]


def _profile_rows(user):
    yield _PROFILE_HEADER
    profile = UserProfile.objects.filter(user=user).first()
    if profile is None:
        return
    yield [
        profile.decimal_separator,
        profile.name,
        json.dumps(profile.dashboard_config),
        json.dumps(profile.dashboard_preferences),
        json.dumps(profile.transaction_preferences),
        json.dumps(profile.enabled_features),
        profile.accounting_month_start_day,
        json.dumps(profile.privacy_preferences),
        profile.last_seen_release,
        profile.terms_accepted_at.isoformat() if profile.terms_accepted_at else "",
    ]


def _sharing_rows(user):
    yield ["id", "grantee", "permission", "created_at"]
    qs = (
        DataAccessGrant.objects.filter(owner=user)
        .select_related("grantee")
        .order_by("-created_at")
    )
    for g in qs:
        yield [g.id, g.grantee.username, g.permission, g.created_at.isoformat()]


_ROW_PRODUCERS = {
    "accounts": _accounts_rows,
    "assets": _assets_rows,
    "transactions": _investment_transactions_rows,
    "cashflow": _cashflow_rows,
    "price_history": _price_history_rows,
    "categories": _categories_rows,
    "budgets": _budgets_rows,
    "recurring_expenses": _recurring_expenses_rows,
    "recurring_investment_plans": _recurring_investment_plans_rows,
    "allocation_targets": _allocation_targets_rows,
    "fire_settings": _fire_settings_rows,
    "investment_types": _investment_types_rows,
    "contribution_sources": _contribution_sources_rows,
    "profile": _profile_rows,
    "sharing": _sharing_rows,
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
            logger.info("export: user=%s type=all", user.id)
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

        logger.info("export: user=%s type=%s", user.id, export_type)
        filename = f"fininzen_{export_type}_{today_str}.csv"
        return _csv_response(producer, user, filename)
