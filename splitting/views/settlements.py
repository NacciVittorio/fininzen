import logging

from django.db.models import Q
from django.http import Http404
from rest_framework import mixins, viewsets
from rest_framework.permissions import IsAuthenticated

from fininzen.permissions import IsNotDemoUser

from ..models import SplitSettlement
from ..permissions import user_can_access_settlement
from ..serializers import SplitSettlementSerializer

logger = logging.getLogger(__name__)


class SplitSettlementViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """list/create/retrieve/delete per i settlement (piano sez. 6: "GET,
    POST, DELETE"). Niente update: un settlement è un evento immutabile una
    volta registrato — per correggerlo si cancella e se ne crea uno nuovo,
    così l'eventuale shadow-tx collegata viene sempre ricreata da zero
    invece che mutata in-place (stesso principio di apply_split_shares che
    riscrive sempre da zero, ma qui applicato cancellando la riga intera dato
    che un settlement non ha figli da riscrivere)."""

    permission_classes = [IsAuthenticated, IsNotDemoUser]
    serializer_class = SplitSettlementSerializer

    def get_queryset(self):
        user = self.request.user
        return (
            SplitSettlement.objects.filter(
                Q(created_by=user)
                | Q(payer_user=user)
                | Q(payee_user=user)
                | Q(group__created_by=user)
                | Q(
                    group__participants__user=user,
                    group__participants__is_active=True,
                )
            )
            .select_related(
                "group",
                "payer_user",
                "payer_contact",
                "payee_user",
                "payee_contact",
                "linked_asset",
            )
            .distinct()
            .order_by("-date", "-created_at", "id")
        )

    def get_object(self):
        obj = super().get_object()
        if not user_can_access_settlement(self.request.user, obj):
            raise Http404
        return obj
