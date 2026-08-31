"""
splitting/views/recurring.py — CRUD + azioni per SplitRecurringExpense
(piano sez. 1.7/3.4/6), mirror di expenses/views/recurring.py.

Niente ViewAsMixin/get_effective_user (piano sez. 0.2): qui il gruppo è
sempre obbligatorio e l'autorizzazione passa da `user_can_access_group`,
mai da una delega owner→grantee.
"""

import logging
from datetime import date

from django.db.models import Q
from django.http import Http404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from fininzen.permissions import IsNotDemoUser

from ..models import SplitRecurringExpense
from ..permissions import user_can_access_group
from ..serializers import SplitRecurringExpenseSerializer
from ..services import (
    backfill_recurring_split_expense,
    disable_expired_split_recurrings,
    generate_split_recurring_expenses,
    split_recurring_status,
)

logger = logging.getLogger(__name__)


class SplitRecurringExpenseViewSet(viewsets.ModelViewSet):
    """CRUD per le spese ricorrenti di gruppo.

    `get_queryset` è volutamente più permissivo (creatore della ricorrenza
    OPPURE creatore del gruppo OPPURE membro attivo del gruppo) della
    scoping usata da generate/backfill/disable (solo membro attivo, piano
    sez. 3.4) — la prima è visibilità API, coerente con le altre ViewSet di
    Split (es. SplitExpenseViewSet); la seconda è il perimetro di business
    logic esplicitamente richiesto dal piano.
    """

    permission_classes = [IsAuthenticated, IsNotDemoUser]
    serializer_class = SplitRecurringExpenseSerializer

    def get_queryset(self):
        user = self.request.user
        disable_expired_split_recurrings(user)
        return (
            SplitRecurringExpense.objects.filter(
                Q(created_by=user)
                | Q(group__created_by=user)
                | Q(
                    group__participants__user=user,
                    group__participants__is_active=True,
                )
            )
            .exclude(status=SplitRecurringExpense.STATUS_DELETED)
            .select_related("group", "category", "linked_asset")
            .prefetch_related(
                "participant_templates__participant__user",
                "participant_templates__participant__contact",
            )
            .distinct()
            .order_by("-start_date", "id")
        )

    def get_object(self):
        obj = super().get_object()
        if not user_can_access_group(self.request.user, obj.group):
            raise Http404
        return obj

    def perform_create(self, serializer):
        # A differenza di RecurringExpenseViewSet (dove il serializer non
        # sovrascrive create() e quindi accetta owner=... da qui),
        # SplitRecurringExpenseSerializer.create() imposta già created_by
        # da request.context (stesso pattern di SplitExpenseSerializer) —
        # passarlo di nuovo qui darebbe un duplicate keyword argument.
        rec = serializer.save()
        backfill_recurring_split_expense(rec)

    def perform_update(self, serializer):
        rec = serializer.save()
        backfill_recurring_split_expense(rec)

    def destroy(self, request, *args, **kwargs):
        rec = self.get_object()
        rec.status = SplitRecurringExpense.STATUS_DELETED
        rec.is_active = False
        rec.deleted_at = timezone.now()
        rec.save(update_fields=["status", "is_active", "deleted_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="enable")
    def enable(self, request, pk=None):
        rec = self.get_object()
        rec.status = SplitRecurringExpense.STATUS_ACTIVE
        rec.is_active = True
        rec.disabled_at = None
        rec.save(update_fields=["status", "is_active", "disabled_at"])
        # backfill_recurring_split_expense() calls
        # _disable_split_recurring_if_expired(rec) first — for a template
        # whose end_date has already passed, that flips `rec` straight back
        # to DISABLED (mutating the same in-memory instance) before a single
        # occurrence is generated. Piano Batch 4.4: this used to always
        # return a blanket {"ok": True}, so the UI showed "enabled" even
        # when the row was, in the same request, immediately disabled again.
        # `status` here always reflects what actually stuck.
        result = backfill_recurring_split_expense(rec)
        return Response({"ok": True, "status": rec.status, **result})

    @action(detail=True, methods=["post"], url_path="disable")
    def disable(self, request, pk=None):
        rec = self.get_object()
        rec.status = SplitRecurringExpense.STATUS_DISABLED
        rec.is_active = False
        rec.disabled_at = timezone.now()
        rec.save(update_fields=["status", "is_active", "disabled_at"])
        return Response({"ok": True})

    @action(detail=False, methods=["post"], url_path="generate")
    def generate(self, request):
        """POST /api/split/recurring/generate/

        Genera le spese ricorrenti di gruppo per il mese/anno indicato, per
        tutti i gruppi dove l'utente è membro attivo. Body: {month, year}.
        """
        try:
            month = int(request.data.get("month", date.today().month))
            year = int(request.data.get("year", date.today().year))
        except (TypeError, ValueError):
            return Response({"error": "month/year must be integers"}, status=400)
        if not 1 <= month <= 12:
            return Response({"error": "month must be 1..12"}, status=400)
        result = generate_split_recurring_expenses(request.user, year, month)
        return Response(result)

    @action(detail=False, methods=["get"], url_path="status")
    def status(self, request):
        """GET /api/split/recurring/status/?month=M&year=Y

        Stato per il widget "Ricorrenti di gruppo del mese": per ogni
        recurring attiva indica se l'occorrenza del mese target è già
        generata o pending.
        """
        try:
            month = int(request.query_params.get("month", date.today().month))
            year = int(request.query_params.get("year", date.today().year))
        except (TypeError, ValueError):
            return Response({"error": "month/year must be integers"}, status=400)
        if not 1 <= month <= 12:
            return Response({"error": "month must be 1..12"}, status=400)
        return Response(split_recurring_status(request.user, year, month))
