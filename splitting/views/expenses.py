import logging

from django.db.models import Q
from django.http import Http404
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from fininzen.permissions import IsNotDemoUser

from ..models import SplitExpense
from ..permissions import user_can_access_expense
from ..serializers import SplitExpenseSerializer

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
                "shares__participant__user", "shares__participant__contact"
            )
            .distinct()
            .order_by("-date", "-created_at", "id")
        )

    def get_object(self):
        obj = super().get_object()
        if not user_can_access_expense(self.request.user, obj):
            raise Http404
        return obj
