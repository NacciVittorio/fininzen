import logging

from django.db import transaction
from django.db.models import Count, Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.response import Response

from ..models import (
    Category,
)
from ..serializers import (
    CategorySerializer,
)
from fininzen.mixins import (
    ViewAsMixin,
    _effective_user,
)
from .helpers import _update_expense_categories

logger = logging.getLogger(__name__)


class CategoryViewSet(ViewAsMixin, viewsets.ModelViewSet):
    """CRUD completo per le categorie. Supporta filtro ?type=expense|income."""

    serializer_class = CategorySerializer

    def get_queryset(self):
        target = self.get_effective_user()
        # Subcategories: annotate own expense_count once via prefetch.
        # The parent's subcategory_expense_count is then computed in the
        # serializer by summing these — avoids a correlated Subquery per row.
        subcats_qs = Category.objects.filter(owner=target).annotate(
            expense_count=Count("expenses")
        )
        qs = (
            Category.objects.filter(owner=target)
            .prefetch_related(Prefetch("subcategories", queryset=subcats_qs))
            .annotate(expense_count=Count("expenses"))
        )
        cat_type = self.request.query_params.get("type")
        if cat_type in (Category.EXPENSE, Category.INCOME):
            qs = qs.filter(category_type=cat_type)
        return qs

    def perform_create(self, serializer):
        serializer.save(owner=self.get_effective_user())

    def perform_update(self, serializer):
        previous_type = serializer.instance.category_type
        category = serializer.save()
        if category.category_type != previous_type:
            _update_expense_categories(category.expenses.all(), category)

    def destroy(self, request, pk=None):
        """
        DELETE /api/expenses/categories/{id}/
        Body opzionale:
          subs_action:          "reassign" | "delete" | "null"
          reassign_subs_to:     <id>
          expenses_action:      "reassign" | "delete" | "null"
          reassign_expenses_to: <id>
        """
        cat = get_object_or_404(Category, pk=pk, owner=_effective_user(request))
        subs_action = request.data.get("subs_action", "null")
        reassign_subs_to = request.data.get("reassign_subs_to")
        expenses_action = request.data.get("expenses_action", "null")
        reassign_expenses_to = request.data.get("reassign_expenses_to")

        owner = _effective_user(request)
        with transaction.atomic():
            if not cat.parent:
                subs = cat.subcategories.all()
                if subs_action == "reassign" and reassign_subs_to:
                    target = Category.objects.filter(
                        pk=reassign_subs_to,
                        owner=owner,
                        category_type=cat.category_type,
                    ).first()
                    if not target:
                        return Response(
                            {"error": "category non valida"},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    subs.update(parent=target)
                elif subs_action == "delete":
                    for sub in subs:
                        sub.expenses.all().delete()
                    subs.delete()

            if expenses_action == "reassign" and reassign_expenses_to:
                target = Category.objects.filter(
                    pk=reassign_expenses_to,
                    owner=owner,
                    category_type=cat.category_type,
                ).first()
                if not target:
                    return Response(
                        {"error": "category non valida"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                _update_expense_categories(cat.expenses.all(), target)
            elif expenses_action == "delete":
                cat.expenses.all().delete()
            else:
                _update_expense_categories(cat.expenses.all(), None)

            cat.delete()

        logger.info(
            "Category %s deleted (subs_action=%s, expenses_action=%s)",
            pk,
            subs_action,
            expenses_action,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
