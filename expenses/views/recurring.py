import logging
from datetime import date

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import (
    RecurringExpense,
)
from ..serializers import (
    RecurringExpenseSerializer,
)
from finnet.mixins import (
    ViewAsMixin,
    _effective_user,
)
from ..services import (
    backfill_recurring_expense,
    disable_expired_recurrings,
)

logger = logging.getLogger(__name__)


class RecurringExpenseViewSet(ViewAsMixin, viewsets.ModelViewSet):
    """CRUD per le spese ricorrenti mensili."""

    serializer_class = RecurringExpenseSerializer

    def get_queryset(self):
        disable_expired_recurrings(self.get_effective_user())
        return (
            RecurringExpense.objects.select_related("category", "linked_asset")
            .filter(owner=self.get_effective_user())
            .exclude(status=RecurringExpense.STATUS_DELETED)
        )

    def perform_create(self, serializer):
        rec = serializer.save(owner=self.get_effective_user())
        backfill_recurring_expense(rec)

    def perform_update(self, serializer):
        rec = serializer.save()
        backfill_recurring_expense(rec)

    def destroy(self, request, *args, **kwargs):
        rec = self.get_object()
        rec.status = RecurringExpense.STATUS_DELETED
        rec.is_active = False
        rec.deleted_at = timezone.now()
        rec.save(update_fields=["status", "is_active", "deleted_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="enable")
    def enable(self, request, pk=None):
        rec = self.get_object()
        rec.status = RecurringExpense.STATUS_ACTIVE
        rec.is_active = True
        rec.disabled_at = None
        rec.save(update_fields=["status", "is_active", "disabled_at"])
        result = backfill_recurring_expense(rec)
        return Response({"ok": True, **result})

    @action(detail=True, methods=["post"], url_path="disable")
    def disable(self, request, pk=None):
        rec = self.get_object()
        rec.status = RecurringExpense.STATUS_DISABLED
        rec.is_active = False
        rec.disabled_at = timezone.now()
        rec.save(update_fields=["status", "is_active", "disabled_at"])
        return Response({"ok": True})

    @action(detail=False, methods=["post"], url_path="generate")
    def generate(self, request):
        """POST /api/expenses/recurring/generate/

        Genera le spese ricorrenti per il mese/anno indicato.
        Body: {month: 1-12, year: 2026}
        """
        from ..services import generate_recurring_expenses

        try:
            month = int(request.data.get("month", date.today().month))
            year = int(request.data.get("year", date.today().year))
        except (TypeError, ValueError):
            return Response({"error": "month/year must be integers"}, status=400)
        if not 1 <= month <= 12:
            return Response({"error": "month must be 1..12"}, status=400)
        result = generate_recurring_expenses(_effective_user(request), year, month)
        return Response(result)

    @action(detail=False, methods=["get"], url_path="status")
    def status(self, request):
        """GET /api/expenses/recurring/status/?month=M&year=Y

        Stato per il widget Dashboard "Ricorrenti del mese": per ogni recurring
        attiva indica se la Expense del mese target è già generata o pending.
        """
        from ..services import recurring_status

        try:
            month = int(request.query_params.get("month", date.today().month))
            year = int(request.query_params.get("year", date.today().year))
        except (TypeError, ValueError):
            return Response(
                {"error": "month/year must be integers"},
                status=400,
            )
        if not 1 <= month <= 12:
            return Response({"error": "month must be 1..12"}, status=400)
        return Response(recurring_status(_effective_user(request), year, month))
