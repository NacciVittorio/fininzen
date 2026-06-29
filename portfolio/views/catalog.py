import logging
from django.db import transaction
from django.db.models import Count
from django.utils import timezone as django_tz
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from ..models import (
    AssetContributionSource,
    AssetTransaction,
    ContributionSource,
    InvestmentType,
    RecurringInvestmentPlan,
)
from ..serializers import (
    ContributionSourceSerializer,
    InvestmentTypeSerializer,
    RecurringInvestmentPlanSerializer,
)
from ..services import (
    delete_transaction,
    generate_recurring_investments,
    recurring_investment_status,
)
from datetime import date as date_cls
from fininzen.mixins import ViewAsMixin


logger = logging.getLogger(__name__)


class InvestmentTypeViewSet(ViewAsMixin, viewsets.ModelViewSet):
    """CRUD per i tipi di investimento personalizzabili."""

    serializer_class = InvestmentTypeSerializer

    def get_queryset(self):
        # LOW-11: annotate() adds a GROUP BY, which makes Django drop the model's
        # Meta.ordering for pagination — order explicitly so paging is deterministic.
        return (
            InvestmentType.objects.filter(owner=self.get_effective_user())
            .annotate(asset_count=Count("assets"))
            .order_by("name", "id")
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.get_effective_user())

    def perform_update(self, serializer):
        from ..services import resync_asset_tax

        old_rate = serializer.instance.tax_rate
        inv_type = serializer.save()
        # When the type's tax rate changes and the user opts in, propagate it to
        # existing sells of every asset of this type that doesn't pin its own
        # override (an asset-level override wins over the type, so it's unaffected).
        if (
            inv_type.tax_rate != old_rate
            and self.request.data.get("tax_propagation") == "all"
        ):
            with transaction.atomic():
                for asset in inv_type.assets.filter(tax_rate_override__isnull=True):
                    resync_asset_tax(asset)

    def destroy(self, request, pk=None):
        inv_type = get_object_or_404(
            InvestmentType, pk=pk, owner=self.get_effective_user()
        )
        assets_action = request.data.get("assets_action", "null")
        reassign_to = request.data.get("reassign_to")

        with transaction.atomic():
            if assets_action == "reassign" and reassign_to:
                target = get_object_or_404(
                    InvestmentType, pk=reassign_to, owner=self.get_effective_user()
                )
                inv_type.assets.update(investment_type=target)
            elif assets_action == "delete":
                inv_type.assets.all().delete()
            inv_type.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


class ContributionSourceViewSet(ViewAsMixin, viewsets.ModelViewSet):
    """CRUD per le fonti contributo usate da fondi pensione e asset compatibili."""

    serializer_class = ContributionSourceSerializer

    def get_queryset(self):
        return (
            ContributionSource.objects.filter(owner=self.get_effective_user())
            .annotate(
                transaction_count=Count("transactions", distinct=True),
                asset_count=Count("asset_links", distinct=True),
            )
            .order_by("sort_order", "name", "id")
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.get_effective_user())

    def destroy(self, request, pk=None):
        source = get_object_or_404(
            ContributionSource,
            pk=pk,
            owner=self.get_effective_user(),
        )
        action = request.data.get("transactions_action", "null")
        reassign_to = request.data.get("reassign_to")
        if action not in {"delete", "reassign", "null"}:
            return Response(
                {"error": "invalid transactions_action"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target = None
        if action == "reassign":
            if not reassign_to:
                return Response(
                    {"error": "reassign_to is required"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            target = ContributionSource.objects.filter(
                pk=reassign_to,
                owner=self.get_effective_user(),
                is_active=True,
            ).first()
            if not target or target.pk == source.pk:
                return Response(
                    {"error": "reassign_to is invalid"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        txs = list(
            AssetTransaction.objects.filter(
                asset__owner=self.get_effective_user(),
                contribution_source=source,
            ).select_related("asset")
        )

        if action == "delete":
            for tx in txs:
                delete_transaction(tx)
            source.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        with transaction.atomic():
            if action == "reassign" and target:
                AssetTransaction.objects.filter(pk__in=[tx.pk for tx in txs]).update(
                    contribution_source=target
                )
                for link in AssetContributionSource.objects.filter(
                    owner=self.get_effective_user(),
                    contribution_source=source,
                ).select_related("asset"):
                    AssetContributionSource.objects.get_or_create(
                        owner=self.get_effective_user(),
                        asset=link.asset,
                        contribution_source=target,
                        defaults={"sort_order": link.sort_order},
                    )
            else:
                AssetTransaction.objects.filter(pk__in=[tx.pk for tx in txs]).update(
                    contribution_source=None
                )
            source.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RecurringInvestmentPlanViewSet(ViewAsMixin, viewsets.ModelViewSet):
    """CRUD and generation for PAC plans."""

    serializer_class = RecurringInvestmentPlanSerializer

    def get_queryset(self):
        return (
            RecurringInvestmentPlan.objects.select_related("asset", "source_account")
            .filter(owner=self.get_effective_user())
            .exclude(status=RecurringInvestmentPlan.STATUS_DELETED)
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.get_effective_user())

    def destroy(self, request, *args, **kwargs):
        plan = self.get_object()
        plan.status = RecurringInvestmentPlan.STATUS_DELETED
        plan.is_active = False
        plan.deleted_at = django_tz.now()
        plan.save(update_fields=["status", "is_active", "deleted_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="enable")
    def enable(self, request, pk=None):
        plan = self.get_object()
        plan.status = RecurringInvestmentPlan.STATUS_ACTIVE
        plan.is_active = True
        plan.disabled_at = None
        plan.save(update_fields=["status", "is_active", "disabled_at"])
        return Response({"ok": True})

    @action(detail=True, methods=["post"], url_path="disable")
    def disable(self, request, pk=None):
        plan = self.get_object()
        plan.status = RecurringInvestmentPlan.STATUS_DISABLED
        plan.is_active = False
        plan.disabled_at = django_tz.now()
        plan.save(update_fields=["status", "is_active", "disabled_at"])
        return Response({"ok": True})

    @action(detail=False, methods=["post"], url_path="generate")
    def generate(self, request):
        try:
            month = int(request.data.get("month", date_cls.today().month))
            year = int(request.data.get("year", date_cls.today().year))
        except (TypeError, ValueError):
            return Response({"error": "month/year must be integers"}, status=400)
        if not 1 <= month <= 12:
            return Response({"error": "month must be 1..12"}, status=400)
        result = generate_recurring_investments(self.get_effective_user(), year, month)
        return Response(result)

    @action(detail=False, methods=["get"], url_path="status")
    def status(self, request):
        try:
            month = int(request.query_params.get("month", date_cls.today().month))
            year = int(request.query_params.get("year", date_cls.today().year))
        except (TypeError, ValueError):
            return Response({"error": "month/year must be integers"}, status=400)
        if not 1 <= month <= 12:
            return Response({"error": "month must be 1..12"}, status=400)
        return Response(
            recurring_investment_status(self.get_effective_user(), year, month)
        )
