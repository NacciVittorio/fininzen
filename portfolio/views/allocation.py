import logging
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.response import Response

from ..models import (
    AllocationTarget,
    Asset,
    InvestmentType,
)
from ..serializers import (
    AllocationTargetSerializer,
)
from ..services import (
    asset_current_value_eur,
)
from decimal import Decimal
from finnet.mixins import ViewAsMixin, _effective_user


logger = logging.getLogger(__name__)


class AllocationTargetViewSet(ViewAsMixin, viewsets.ViewSet):
    """CRUD per i target di allocazione per tipo di investimento.

    GET  /api/portfolio/allocation-targets/   — lista target + allocazione corrente
    POST /api/portfolio/allocation-targets/   — crea o aggiorna un target
    DELETE /api/portfolio/allocation-targets/{id}/ — elimina target
    """

    def list(self, request):
        """Ritorna i target + l'allocazione corrente per ogni tipo di investimento."""
        inv_types = InvestmentType.objects.filter(owner=_effective_user(request))
        assets = list(
            Asset.objects.filter(owner=_effective_user(request), is_archived=False)
        )
        current_by_type = {}
        for asset in assets:
            value = asset_current_value_eur(asset)
            if value is not None:
                current_by_type[asset.investment_type_id] = (
                    current_by_type.get(asset.investment_type_id, Decimal("0")) + value
                )
        grand_total = float(sum(current_by_type.values(), Decimal("0")))

        targets_qs = AllocationTarget.objects.filter(owner=_effective_user(request))
        targets_map = {t.investment_type_id: t for t in targets_qs}

        result = []
        for it in inv_types:
            current_val = float(current_by_type.get(it.id, Decimal("0")))
            current_pct = (current_val / grand_total * 100) if grand_total > 0 else 0
            target = targets_map.get(it.id)
            target_pct = float(target.target_percent) if target else None
            diff = (current_pct - target_pct) if target_pct is not None else None

            action_rec = None
            if diff is not None:
                if diff < -2:
                    action_rec = "buy"
                elif diff > 2:
                    action_rec = "sell"
                else:
                    action_rec = "ok"

            result.append(
                {
                    "id": it.id,
                    "name": it.name,
                    "color": it.color,
                    "icon": it.icon,
                    "is_bank_account": it.is_bank_account,
                    "current_value": current_val,
                    "current_pct": round(current_pct, 2),
                    "target_pct": target_pct,
                    "diff": round(diff, 2) if diff is not None else None,
                    "action": action_rec,
                    "target_id": target.id if target else None,
                }
            )

        return Response(result)

    def create(self, request):
        """Crea o aggiorna il target per un tipo di investimento."""
        inv_type_id = request.data.get("investment_type")
        target_pct = request.data.get("target_percent")
        if not inv_type_id or target_pct is None:
            return Response(
                {"error": "investment_type e target_percent richiesti"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        inv_type = get_object_or_404(
            InvestmentType, pk=inv_type_id, owner=_effective_user(request)
        )
        target, created = AllocationTarget.objects.update_or_create(
            investment_type=inv_type,
            owner=_effective_user(request),
            defaults={"target_percent": Decimal(str(target_pct))},
        )
        return Response(
            AllocationTargetSerializer(target).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def destroy(self, request, pk=None):
        target = get_object_or_404(
            AllocationTarget, pk=pk, owner=_effective_user(request)
        )
        target.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
