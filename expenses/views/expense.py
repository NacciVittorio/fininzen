import logging
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from ..models import (
    Category,
    Expense,
    ExpenseDescriptionSuggestion,
)
from ..serializers import (
    ExpenseSerializer,
)
from fininzen.mixins import (
    ViewAsMixin,
    _effective_user,
    require_view_as_full,
)
from fininzen.accounting import accounting_month_range, get_user_accounting_start_day
from fininzen.throttles import ResetRateThrottle
from ..services import (
    seed_demo_for_user,
    track_description_suggestion,
)
from .helpers import IMPORT_MAX_ROWS
from expenses.import_csv import run_csv_import

logger = logging.getLogger(__name__)


class ExpenseViewSet(ViewAsMixin, viewsets.ModelViewSet):
    """CRUD completo per le spese con filtri per periodo."""

    serializer_class = ExpenseSerializer

    def perform_create(self, serializer):
        # MED-11: the expense write and its post_save shadow-tx sync must share a
        # transaction so a failure in the sync rolls back the expense too (there
        # is no ATOMIC_REQUESTS; without this the row would commit on its own).
        with transaction.atomic():
            expense = serializer.save(owner=self.get_effective_user())
            # Track only user-entered descriptions tied to a concrete category.
            track_description_suggestion(expense)

    def perform_update(self, serializer):
        with transaction.atomic():
            expense = serializer.save()
            # Only edits touching description/category should influence autocomplete history.
            if {"description", "category"} & set(serializer.validated_data.keys()):
                track_description_suggestion(expense)

    def get_queryset(self):
        queryset = (
            Expense.objects.select_related("category")
            .prefetch_related("category__subcategories")
            .filter(owner=self.get_effective_user())
        )
        month = self.request.query_params.get("month")
        year = self.request.query_params.get("year")
        cat_type = self.request.query_params.get("type")
        if year and month:
            try:
                start, end = accounting_month_range(
                    int(year),
                    int(month),
                    get_user_accounting_start_day(self.get_effective_user()),
                )
            except (TypeError, ValueError):
                raise ValidationError({"month": "month/year must be integers"})
            queryset = queryset.filter(date__range=(start, end))
        else:
            if year:
                queryset = queryset.filter(date__year=year)
            if month:
                queryset = queryset.filter(date__month=month)
        if cat_type in (Category.EXPENSE, Category.INCOME):
            queryset = queryset.filter(category__category_type=cat_type)
        verified_param = self.request.query_params.get("is_verified")
        if verified_param is not None:
            # Strict parsing: accept only "true"/"false"/"1"/"0".
            # Anything else is a silent caller bug — fail loudly with 400
            # instead of treating unknown values as False.
            normalized = verified_param.strip().lower()
            if normalized not in ("true", "false", "1", "0"):
                raise ValidationError(
                    {"is_verified": f"invalid boolean value: {verified_param!r}"}
                )
            queryset = queryset.filter(is_verified=normalized in ("true", "1"))
        # LOW-11: id tiebreaker on top of the model's "-date, -created_at" order so
        # pagination boundaries are stable even when rows share date/created_at
        # (e.g. bulk-seeded expenses) — this is the list that can exceed one page.
        return queryset.order_by("-date", "-created_at", "id")

    @action(
        detail=False,
        methods=["post"],
        url_path="reset",
        throttle_classes=[ResetRateThrottle],
    )
    def reset(self, request):
        """POST /api/expenses/reset/ — Cancella tutte le spese.

        Body required: {"confirm": true}. Server-side guard against accidental
        or CSRF-style invocation (UI modal alone is not enough).
        """
        require_view_as_full(request)
        if request.data.get("confirm") is not True:
            return Response(
                {
                    "error": "missing_confirmation",
                    "detail": 'Body must include {"confirm": true}.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        count, _ = Expense.objects.filter(owner=_effective_user(request)).delete()
        logger.warning(
            "Reset: %d expenses deleted by user=%s",
            count,
            _effective_user(request),
        )
        return Response({"deleted": count})

    @action(detail=False, methods=["post"], url_path="seed-demo")
    def seed_demo(self, request):
        """
        POST /api/expenses/seed-demo/
        Cancella spese + asset esistenti e genera dati demo casuali:
        - 6 mesi di spese (8-15/mese) e entrate (1-3/mese)
        - 4-7 asset con valori realistici
        Crea categorie e tipi di investimento di default se non esistono.
        """
        from portfolio.models import Asset as PortfolioAsset, InvestmentType

        require_view_as_full(request)
        with transaction.atomic():
            return self._do_seed_demo(
                PortfolioAsset, InvestmentType, _effective_user(request)
            )

    def _do_seed_demo(self, asset_model, investment_type_model, user):
        result = seed_demo_for_user(user, asset_model, investment_type_model)
        return Response(result)

    @action(detail=False, methods=["post"], url_path="import-csv")
    def import_csv(self, request):
        """
        POST /api/expenses/import-csv/
        Body: { rows: [{date, description, amount, category_name?}] }
        Crea le spese corrispondenti. Match categoria per nome (case-insensitive).
        """
        rows = request.data.get("rows", [])
        if not isinstance(rows, list) or len(rows) > IMPORT_MAX_ROWS:
            return Response(
                {"error": f"rows must be a list with at most {IMPORT_MAX_ROWS} items"},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        user = _effective_user(request)
        result = run_csv_import(rows, user, request_user=request.user)
        return Response(result)

    @action(detail=False, methods=["get"], url_path="description-suggestions")
    def description_suggestions(self, request):
        """GET /api/expenses/description-suggestions/?category_id=<id>&q=<prefix>"""
        category_id = request.query_params.get("category_id")
        if not category_id:
            return Response([])
        q = request.query_params.get("q", "").strip()
        owner = self.get_effective_user()
        # `text` is encrypted, so the prefix match can't run in SQL. The model
        # caps suggestions to 10 per (owner, category), so we decrypt that small
        # set and filter the prefix in Python — same result, no false positives.
        texts = list(
            ExpenseDescriptionSuggestion.objects.filter(
                owner=owner,
                category_id=category_id,
            )
            .order_by("-last_used_at", "-use_count")
            .values_list("text", flat=True)[:20]
        )
        if q:
            ql = q.casefold()
            texts = [t for t in texts if t.casefold().startswith(ql)]
        return Response(texts[:10])

    @action(detail=False, methods=["get"], url_path="last-account")
    def last_account(self, request):
        """GET /api/expenses/last-account/?category=<id>

        Returns {"linked_asset": <id|null>}: the account (linked_asset) of the
        most recent expense the user filed under that category. Powers the
        cash-flow "autofill last account on category" preference.
        """
        category_id = request.query_params.get("category")
        if not category_id:
            return Response({"linked_asset": None})
        owner = self.get_effective_user()
        last_asset_id = (
            Expense.objects.filter(
                owner=owner,
                category_id=category_id,
                linked_asset__isnull=False,
            )
            .order_by("-date", "-created_at")
            .values_list("linked_asset_id", flat=True)
            .first()
        )
        return Response({"linked_asset": last_asset_id})

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        queryset = self.get_queryset().filter(is_verified=True)
        by_category = (
            queryset.values(
                "category__id",
                "category__name",
                "category__color",
                "category__icon",
                "category__category_type",
            )
            .annotate(total=Sum("amount"))
            .order_by("-total")
        )
        total = queryset.aggregate(total=Sum("amount"))["total"] or 0
        return Response({"total": total, "by_category": list(by_category)})

    @action(detail=False, methods=["get"], url_path="trends")
    def trends(self, request):
        """Daily income and expense totals for the trailing ten years."""
        today = timezone.localdate()
        try:
            start_date = today.replace(year=today.year - 10)
        except ValueError:
            # February 29 has no direct equivalent in a non-leap year.
            start_date = today.replace(year=today.year - 10, day=28)

        rows = (
            Expense.objects.filter(
                owner=self.get_effective_user(),
                is_verified=True,
                date__range=(start_date, today),
                category__category_type__in=(Category.EXPENSE, Category.INCOME),
            )
            .values("category__category_type", "date", "linked_asset")
            .annotate(amount=Sum("amount"))
            .order_by("date", "linked_asset")
        )
        result = {"expenses": [], "incomes": []}
        for row in rows:
            bucket = (
                "expenses"
                if row["category__category_type"] == Category.EXPENSE
                else "incomes"
            )
            result[bucket].append(
                {
                    "date": row["date"],
                    "amount": row["amount"],
                    "linked_asset": row["linked_asset"],
                }
            )
        return Response(result)

    @action(detail=False, methods=["get"], url_path="monthly")
    def monthly(self, request):
        try:
            year = int(request.query_params.get("year", date.today().year))
        except (TypeError, ValueError):
            return Response({"error": "year must be an integer"}, status=400)
        owner = _effective_user(request)
        start_day = get_user_accounting_start_day(owner)
        if start_day == 1:
            monthly_data = (
                Expense.objects.filter(owner=owner, date__year=year)
                .filter(is_verified=True)
                .annotate(month=TruncMonth("date"))
                .values("month")
                .annotate(total=Sum("amount"))
                .order_by("month")
            )
            return Response(list(monthly_data))

        rows = []
        expenses = list(
            Expense.objects.filter(
                owner=owner,
                is_verified=True,
                date__range=(
                    accounting_month_range(year, 1, start_day)[0],
                    accounting_month_range(year, 12, start_day)[1],
                ),
            ).only("date", "amount")
        )
        for month in range(1, 13):
            start, end = accounting_month_range(year, month, start_day)
            total = sum(
                (
                    expense.amount
                    for expense in expenses
                    if start <= expense.date <= end
                ),
                Decimal("0"),
            )
            if total:
                rows.append({"month": start, "total": total})
        return Response(rows)
