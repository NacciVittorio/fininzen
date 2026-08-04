import logging

from django.db.models import Q
from django.http import Http404
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated

from fininzen.permissions import IsNotDemoUser

from ..models import SplitExpense
from ..permissions import user_can_access_expense, user_can_modify_expense
from ..serializers import SplitExpenseSerializer
from ..services import delete_split_expense

logger = logging.getLogger(__name__)


class SplitExpenseViewSet(viewsets.ModelViewSet):
    """CRUD spese condivise.

    Ogni create/update riscrive le shares dentro transaction.atomic() (vedi
    serializers.SplitExpenseSerializer + services.apply_split_shares).
    """

    permission_classes = [IsAuthenticated, IsNotDemoUser]
    serializer_class = SplitExpenseSerializer

    def get_queryset(self):
        user = self.request.user
        return (
            SplitExpense.objects.filter(
                Q(created_by=user)
                | Q(
                    group__participants__user=user,
                    group__participants__is_active=True,
                )
                | Q(adhoc_participants__user=user)
            )
            .select_related("group", "category", "linked_asset")
            .prefetch_related(
                "shares__participant__user",
                "shares__participant__contact",
                # Piano Batch 3 (modello A2): evita N+1 su
                # SplitExpenseSerializer.settlement_progress, che itera le
                # allocazioni di ogni share non-payer.
                "shares__allocations",
            )
            .distinct()
            .order_by("-date", "-created_at", "id")
        )

    def get_object(self):
        obj = super().get_object()
        if not user_can_access_expense(self.request.user, obj):
            raise Http404
        # Piano A4b: la scrittura (a differenza della lettura) su una spesa
        # con conto collegato è ristretta a pagatore/creatore — vedi
        # user_can_modify_expense per il perché.
        if self.action in (
            "update",
            "partial_update",
            "destroy",
        ) and not user_can_modify_expense(self.request.user, obj):
            raise PermissionDenied(
                {
                    "detail": (
                        "Solo il pagatore o il creatore possono modificare "
                        "una spesa collegata a un conto."
                    ),
                    "code": "linked_expense_modify_restricted",
                }
            )
        return obj

    def perform_destroy(self, instance):
        # delete_split_expense (non instance.delete() nudo) cattura le
        # coppie direzionali coinvolte e ricostruisce le loro allocazioni A2
        # dopo la cancellazione — vedi splitting/services.py.
        delete_split_expense(instance)
