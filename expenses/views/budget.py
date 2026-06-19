import logging

from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.response import Response

from ..models import (
    Budget,
    Category,
)
from ..serializers import (
    BudgetSerializer,
)
from fininzen.mixins import (
    ViewAsMixin,
    _effective_user,
)

logger = logging.getLogger(__name__)


class BudgetViewSet(ViewAsMixin, viewsets.ModelViewSet):
    """CRUD per i budget mensili per categoria."""

    serializer_class = BudgetSerializer

    def get_queryset(self):
        return Budget.objects.select_related("category").filter(
            owner=self.get_effective_user()
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.get_effective_user())

    def create(self, request, *args, **kwargs):
        """Crea o aggiorna il budget per una categoria."""
        cat_id = request.data.get("category")
        amount = request.data.get("amount")
        if not cat_id or amount is None:
            return Response(
                {"error": "category e amount richiesti"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cat = get_object_or_404(Category, pk=cat_id, owner=_effective_user(request))
        serializer = self.get_serializer(data={"category": cat.pk, "amount": amount})
        serializer.is_valid(raise_exception=True)
        budget, created = Budget.objects.update_or_create(
            category=cat,
            owner=_effective_user(request),
            defaults={"amount": serializer.validated_data["amount"]},
        )
        return Response(
            BudgetSerializer(budget).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
