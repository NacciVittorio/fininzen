import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from ..models import (
    Asset,
)
from ..serializers import (
    AssetSerializer,
)
from ..prices import (
    aggiorna_prezzo_singolo,
    refresh_prices_for_user,
)
from ..services import (
    create_asset_with_initial_balance,
)
from fininzen.api_errors import safe_client_message
from fininzen.mixins import ViewAsMixin


from .asset_mixins import (
    _AssetImportMixin,
    _AssetTransactionsMixin,
    _AssetAnalyticsMixin,
    _AssetLifecycleMixin,
)

from portfolio import views as _pv

logger = logging.getLogger(__name__)


class SearchTickerThrottle(ScopedRateThrottle):
    scope = "search_ticker"


class AssetViewSet(
    _AssetImportMixin,
    _AssetTransactionsMixin,
    _AssetAnalyticsMixin,
    _AssetLifecycleMixin,
    ViewAsMixin,
    viewsets.ModelViewSet,
):
    """CRUD completo per gli asset del portafoglio."""

    serializer_class = AssetSerializer

    def get_queryset(self):
        effective_user = self.get_effective_user()
        _pv._reconcile_due_manual_assets_safe(effective_user)
        # HIGH-18: source_account is dereferenced per-row by the serializer
        # (get_source_account_name) — select_related it to avoid an N+1 on list.
        qs = Asset.objects.select_related("investment_type", "source_account").filter(
            owner=effective_user
        )
        include_archived = (
            self.request.query_params.get("include_archived", "").lower() == "true"
        )
        safe_archived_actions = {
            "retrieve",
            "transactions",
            "modify_transaction",
            "historical_price",
            "price_history",
        }
        if getattr(self, "action", None) in safe_archived_actions:
            include_archived = True
        if not include_archived:
            qs = qs.filter(is_archived=False)
        # LOW-11: a unique tiebreaker keeps page boundaries stable when paginating
        # (the model's "-current_value" order alone can tie across the page split).
        return qs.order_by("-current_value", "id")

    @action(detail=False, methods=["post"], url_path="refresh-prices")
    def refresh_prices(self, request):
        user = self.get_effective_user()
        logger.info("refresh_prices: user=%s", user)
        risultato = refresh_prices_for_user(user)
        risultato.update(
            {
                "successi": risultato["updated"],
                "errori": risultato["errors"],
                "dettagli": risultato["details"],
            }
        )
        logger.info("refresh_prices: done — %s", risultato)
        return Response(risultato)

    @action(detail=True, methods=["post"], url_path="refresh-price")
    def refresh_single_price(self, request, pk=None):
        asset = self.get_object()
        logger.info(
            "refresh_single_price: asset=%s ticker=%s user=%s",
            asset.name,
            asset.ticker,
            request.user,
        )
        ok = aggiorna_prezzo_singolo(asset)
        if ok:
            serializer = self.get_serializer(asset)
            return Response(serializer.data)
        logger.warning(
            "refresh_single_price: failed for asset=%s ticker=%s",
            asset.name,
            asset.ticker,
        )
        return Response(
            {"error": f"Impossibile aggiornare il prezzo per '{asset.name}'"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    @action(
        detail=False,
        methods=["get"],
        url_path="search-ticker",
        throttle_classes=[SearchTickerThrottle],
    )
    def search_ticker(self, request):
        q = request.query_params.get("q", "").strip()[:50]
        fallback_name = request.query_params.get("name", "").strip()[:200]
        if len(q) < 2:
            return Response([])
        try:
            return Response(
                _pv.search_price_sources(q, limit=8, fallback_query=fallback_name)
            )
        except Exception as e:
            logger.warning("search_ticker: q=%s error=%s", q, e)
            return Response([])

    def perform_create(self, serializer):
        try:
            asset = create_asset_with_initial_balance(
                serializer,
                owner=self.get_effective_user(),
                initial_balance_raw=self.request.data.get("initial_balance"),
            )
        except ValueError as exc:
            raise ValidationError(
                {"initial_balance": safe_client_message(exc)}
            ) from exc
        logger.info(
            "asset created: id=%s name=%s type=%s user=%s",
            asset.pk if asset else None,
            asset.name if asset else None,
            asset.investment_type if asset else None,
            self.request.user,
        )

    def perform_update(self, serializer):
        from ..services import _post_asset_save, resync_asset_tax

        # Capture the effective tax rate before the write so we can detect an
        # override change and, if asked, propagate it to existing sells.
        old_rate = serializer.instance.effective_tax_rate
        asset = serializer.save()
        if asset.investment_type:
            asset.is_liquid = asset.investment_type.is_liquid_default
            asset.save(update_fields=["is_liquid"])
        _post_asset_save(asset)
        if (
            asset.effective_tax_rate != old_rate
            and self.request.data.get("tax_propagation") == "all"
        ):
            resync_asset_tax(asset)
