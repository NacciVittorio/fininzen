import logging
from django.utils import timezone as django_tz
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from ...models import (
    Asset,
    PortfolioSnapshot,
)
from ...serializers import (
    AssetSerializer,
)
from ...services import (
    delete_asset_cascade,
    move_asset_position,
)
from decimal import Decimal
from fininzen.mixins import require_view_as_full
from fininzen.throttles import ResetRateThrottle


logger = logging.getLogger(__name__)


class _AssetLifecycleMixin:
    def destroy(self, request, *args, **kwargs):
        asset = self.get_object()
        logger.info(
            "destroy asset: id=%s name=%s user=%s", asset.pk, asset.name, request.user
        )
        delete_asset_cascade(asset)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(
        detail=False,
        methods=["post"],
        url_path="reset",
        throttle_classes=[ResetRateThrottle],
    )
    def reset(self, request):
        """Cancella tutti gli asset dell'utente. Body required: {"confirm": true}."""
        require_view_as_full(request)
        if request.data.get("confirm") is not True:
            return Response(
                {
                    "error": "missing_confirmation",
                    "detail": 'Body must include {"confirm": true}.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        effective = self.get_effective_user()
        count, _ = Asset.objects.filter(owner=effective).delete()
        PortfolioSnapshot.objects.filter(owner=effective).delete()
        logger.warning("reset: deleted %d assets for user=%s", count, effective)
        return Response({"deleted": count})

    @action(detail=True, methods=["post"], url_path="archive")
    def archive(self, request, pk=None):
        """POST /api/portfolio/{id}/archive/

        Archivia un asset. Se è un conto bancario con investimenti aventi quote > 0,
        ritorna 409 con l'elenco degli asset bloccanti.
        """
        asset = self.get_object()
        if asset.is_archived:
            return Response(
                {"detail": "L'asset è già archiviato."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        is_bank = asset.investment_type and asset.investment_type.is_bank_account
        if is_bank:
            balance = asset.current_value or Decimal("0")
            if balance != Decimal("0"):
                return Response(
                    {
                        "error": "non_zero_balance",
                        "detail": (
                            f"Impossibile archiviare '{asset.name}': "
                            f"il saldo è {balance} {asset.currency}. "
                            "Porta il saldo a 0 prima di archiviare."
                        ),
                        "current_value": str(balance),
                        "currency": asset.currency,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            blocking = [
                a
                for a in asset.held_investments.select_related("investment_type").all()
                if not a.is_archived and (a.shares or Decimal("0")) > 0
            ]
            if blocking:
                return Response(
                    {
                        "error": "open_positions",
                        "detail": (
                            f"Impossibile archiviare '{asset.name}': "
                            + ", ".join(
                                f"{a.name} ({a.shares} quote)" for a in blocking
                            )
                            + " ha ancora quote nel portafoglio."
                        ),
                        "blocking_assets": [
                            {"id": a.id, "name": a.name, "shares": str(a.shares)}
                            for a in blocking
                        ],
                        "transaction_count": asset.transactions.count(),
                    },
                    status=status.HTTP_409_CONFLICT,
                )
        elif asset.tracking_type == Asset.AUTO:
            shares = asset.shares or Decimal("0")
            if shares != Decimal("0"):
                return Response(
                    {
                        "error": "non_zero_shares",
                        "detail": (
                            f"Impossibile archiviare '{asset.name}': "
                            f"la posizione ha {shares} quote. "
                            "Porta le quote a 0 prima di archiviare."
                        ),
                        "shares": str(shares),
                    },
                    status=status.HTTP_409_CONFLICT,
                )
        else:
            balance = asset.current_value or Decimal("0")
            if balance != Decimal("0"):
                return Response(
                    {
                        "error": "non_zero_balance",
                        "detail": (
                            f"Impossibile archiviare '{asset.name}': "
                            f"il saldo è {balance} {asset.currency}. "
                            "Porta il saldo a 0 prima di archiviare."
                        ),
                        "current_value": str(balance),
                        "currency": asset.currency,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
        asset.is_archived = True
        asset.archived_at = django_tz.now()
        asset.save(update_fields=["is_archived", "archived_at"])
        logger.info(
            "archive: asset=%s id=%s user=%s", asset.name, asset.pk, request.user
        )
        return Response(AssetSerializer(asset, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="unarchive")
    def unarchive(self, request, pk=None):
        """POST /api/portfolio/{id}/unarchive/"""
        qs = Asset.objects.select_related("investment_type").filter(
            owner=self.get_effective_user()
        )
        asset = get_object_or_404(qs, pk=pk)
        if not asset.is_archived:
            return Response(
                {"detail": "L'asset non è archiviato."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        asset.is_archived = False
        asset.archived_at = None
        asset.save(update_fields=["is_archived", "archived_at"])
        logger.info(
            "unarchive: asset=%s id=%s user=%s", asset.name, asset.pk, request.user
        )
        rollback_candidates = list(
            Asset.objects.filter(
                owner=asset.owner,
                previous_account=asset,
                is_archived=False,
            ).values("id", "name", "shares", "current_value")
        )
        return Response(
            {
                **AssetSerializer(asset, context={"request": request}).data,
                "rollback_candidates": rollback_candidates,
            }
        )

    @action(detail=True, methods=["post"], url_path="move")
    def move(self, request, pk=None):
        """POST /api/portfolio/{id}/move/ {"destination_account_id": <id>}

        Sposta la posizione corrente di un asset su un nuovo conto bancario:
        - Crea un nuovo Asset identico con source_account = destination
        - Aggiunge una transazione di apertura sintetica (BUY/CASH_IN) sul nuovo asset
        - Chiude la posizione originale con SELL/ADJUSTMENT sintetico
        - Archivia automaticamente l'asset originale
        """
        asset = self.get_object()
        dest_id = request.data.get("destination_account_id")
        if not dest_id:
            return Response(
                {"error": "destination_account_id è richiesto"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        owner = self.get_effective_user()
        dest_account = Asset.objects.filter(
            pk=dest_id,
            owner=owner,
            tracking_type=Asset.MANUAL,
            investment_type__is_bank_account=True,
            is_archived=False,
        ).first()
        if not dest_account:
            return Response(
                {"error": "destination_account_id non valido o archiviato"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if dest_account.pk == asset.pk:
            return Response(
                {"error": "L'account destinazione deve essere diverso dall'asset"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            move_asset_position(asset, dest_account, owner=owner)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            AssetSerializer(asset, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )
