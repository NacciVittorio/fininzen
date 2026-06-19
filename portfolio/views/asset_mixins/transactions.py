import logging
from django.db import transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from ...models import (
    Asset,
    AssetTransaction,
)
from ...serializers import (
    AssetSerializer,
    AssetTransactionSerializer,
)
from ...services import (
    ArchivedAssetTransactionError,
    create_transaction,
    delete_transaction,
    patch_transaction,
    realize_manual_asset,
    transfer_between_accounts,
    _refresh_manual_asset,
)
from datetime import date as date_cls
from decimal import Decimal
from fininzen.utils import parse_optional_bool

from .._common import (
    _ensure_history_covers_transactions,
)

logger = logging.getLogger(__name__)


class _AssetTransactionsMixin:
    @action(detail=True, methods=["get", "post"], url_path="transactions")
    def transactions(self, request, pk=None):
        """GET/POST /api/portfolio/{id}/transactions/

        POST accepts optional `source_account_id` (BUY) or `dest_account_id` (SELL)
        to mirror the cash movement on a bank-account asset via a derived CASH_OUT/CASH_IN.
        """
        asset = self.get_object()
        if request.method == "GET":
            serializer = AssetTransactionSerializer(
                asset.transactions.select_related("contribution_source")
                .prefetch_related(
                    Prefetch(
                        "derived_txs",
                        queryset=AssetTransaction.objects.select_related("asset"),
                        to_attr="_linked_account_derived",
                    )
                )
                .all(),
                many=True,
                context={"request": request},
            )
            return Response(serializer.data)

        # Extract linked account ids before passing to serializer
        data = (
            request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        )
        source_account_id = data.pop("source_account_id", None)
        dest_account_id = data.pop("dest_account_id", None)
        if isinstance(source_account_id, list):
            source_account_id = source_account_id[0]
        if isinstance(dest_account_id, list):
            dest_account_id = dest_account_id[0]

        serializer = AssetTransactionSerializer(data=data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        logger.debug(
            "transactions POST: asset=%s type=%s shares=%s price=%s source_account=%s dest_account=%s user=%s",
            asset.name,
            data.get("transaction_type"),
            data.get("shares"),
            data.get("price_per_share"),
            source_account_id,
            dest_account_id,
            self.request.user,
        )
        try:
            tx, response_extra = create_transaction(
                asset,
                serializer,
                source_account_id=source_account_id,
                dest_account_id=dest_account_id,
                owner=self.get_effective_user(),
            )
        except ValueError as exc:
            status_code = (
                status.HTTP_409_CONFLICT
                if isinstance(exc, ArchivedAssetTransactionError)
                else status.HTTP_400_BAD_REQUEST
            )
            logger.warning(
                "transactions POST: rejected — %s (asset=%s user=%s)",
                exc,
                asset.name,
                self.request.user,
            )
            if isinstance(exc, ArchivedAssetTransactionError):
                payload = {"error": "asset_archived", "detail": str(exc)}
            else:
                payload = {"error": str(exc)}
            return Response(payload, status=status_code)

        _ensure_history_covers_transactions(asset)
        resp_data = dict(
            AssetTransactionSerializer(tx, context={"request": request}).data
        )
        resp_data.update(response_extra)
        return Response(resp_data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["delete", "patch"],
        url_path=r"transactions/(?P<tx_id>[^/.]+)",
    )
    def modify_transaction(self, request, pk=None, tx_id=None):
        """DELETE / PATCH /api/portfolio/{id}/transactions/{tx_id}/"""
        asset = self.get_object()
        tx = get_object_or_404(AssetTransaction, pk=tx_id, asset=asset)
        if request.method == "DELETE":
            logger.debug(
                "modify_transaction DELETE: tx_id=%s asset=%s user=%s",
                tx_id,
                asset.name,
                request.user,
            )
            try:
                delete_transaction(tx)
            except ValueError as exc:
                status_code = (
                    status.HTTP_409_CONFLICT
                    if isinstance(exc, ArchivedAssetTransactionError)
                    else status.HTTP_400_BAD_REQUEST
                )
                if isinstance(exc, ArchivedAssetTransactionError):
                    payload = {"error": "asset_archived", "detail": str(exc)}
                else:
                    payload = {"error": str(exc)}
                return Response(payload, status=status_code)
            return Response(status=status.HTTP_204_NO_CONTENT)
        # PATCH
        source_account_id = request.data.get("source_account_id")
        dest_account_id = request.data.get("dest_account_id")
        if isinstance(source_account_id, list):
            source_account_id = source_account_id[0]
        if isinstance(dest_account_id, list):
            dest_account_id = dest_account_id[0]

        serializer = AssetTransactionSerializer(
            tx,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        try:
            updated_tx = patch_transaction(
                tx,
                serializer,
                source_account_id=source_account_id,
                dest_account_id=dest_account_id,
                owner=self.get_effective_user(),
            )
        except ValueError as exc:
            status_code = (
                status.HTTP_409_CONFLICT
                if isinstance(exc, ArchivedAssetTransactionError)
                else status.HTTP_400_BAD_REQUEST
            )
            if isinstance(exc, ArchivedAssetTransactionError):
                payload = {"error": "asset_archived", "detail": str(exc)}
            else:
                payload = {"error": str(exc)}
            return Response(payload, status=status_code)
        _ensure_history_covers_transactions(asset)
        return Response(
            AssetTransactionSerializer(updated_tx, context={"request": request}).data
        )

    @action(detail=False, methods=["post"], url_path="transfer")
    def transfer(self, request):
        """POST /api/portfolio/transfer/

        Body: { from_account_id, to_account_id, amount, date, notes }
        Atomically creates a CASH_OUT on `from` and a derived CASH_IN on `to`.
        Returns balances and an optional `warning` if `from` has insufficient funds.
        """
        try:
            from_id = int(request.data.get("from_account_id", 0))
            to_id = int(request.data.get("to_account_id", 0))
            amount = Decimal(str(request.data.get("amount", "0")))
            tx_date = request.data.get("date") or date_cls.today().isoformat()
            tx_date = date_cls.fromisoformat(str(tx_date))
            notes = request.data.get("notes", "")
            is_verified = parse_optional_bool(request.data.get("is_verified"))
            if is_verified is None:
                is_verified = False
        except Exception:
            logger.exception("transfer: invalid parameters payload=%s", request.data)
            return Response(
                {"error": "Parametri non validi"}, status=status.HTTP_400_BAD_REQUEST
            )

        if from_id == to_id:
            return Response(
                {"error": "from e to devono essere account diversi"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if amount <= 0:
            return Response(
                {"error": "amount deve essere > 0"}, status=status.HTTP_400_BAD_REQUEST
            )

        from_account = get_object_or_404(
            Asset,
            pk=from_id,
            owner=self.get_effective_user(),
            tracking_type=Asset.MANUAL,
            investment_type__is_bank_account=True,
        )
        to_account = get_object_or_404(
            Asset,
            pk=to_id,
            owner=self.get_effective_user(),
            tracking_type=Asset.MANUAL,
            investment_type__is_bank_account=True,
        )

        logger.info(
            "transfer: from=%s to=%s amount=%s date=%s user=%s",
            from_account.name,
            to_account.name,
            amount,
            tx_date,
            request.user,
        )
        try:
            result = transfer_between_accounts(
                from_account,
                to_account,
                amount,
                tx_date,
                notes,
                is_verified=is_verified,
                owner=self.get_effective_user(),
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        if result.get("warning"):
            logger.warning(
                "transfer: insufficient balance — from=%s balance=%s amount=%s",
                from_account.name,
                from_account.current_value,
                amount,
            )
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="adjust-balance")
    def adjust_balance(self, request, pk=None):
        """POST /api/portfolio/{id}/adjust-balance/ {"new_balance": 1050.00}

        Rettifica manuale del saldo per asset con tracking_type=MANUAL.
        Calcola la differenza rispetto al saldo attuale e crea una transazione ADJUSTMENT.
        """
        asset = self.get_object()
        if asset.tracking_type != Asset.MANUAL:
            return Response(
                {"error": "adjust-balance è disponibile solo per asset manuali"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            new_balance = Decimal(str(request.data.get("new_balance", "0")))
        except Exception:
            logger.exception(
                "adjust_balance: invalid new_balance payload=%s", request.data
            )
            return Response(
                {"error": "new_balance non valido"}, status=status.HTTP_400_BAD_REQUEST
            )

        diff = new_balance - asset.current_value
        if diff == 0:
            return Response(AssetSerializer(asset).data)
        logger.info(
            "adjust_balance: asset=%s current=%s new=%s diff=%s user=%s",
            asset.name,
            asset.current_value,
            new_balance,
            diff,
            request.user,
        )
        with transaction.atomic():
            AssetTransaction.objects.create(
                asset=asset,
                transaction_type=AssetTransaction.ADJUSTMENT,
                date=date_cls.today(),
                shares=Decimal("1"),
                price_per_share=diff,
                notes="",
                is_verified=True,
                owner=self.get_effective_user(),
            )
            asset.refresh_from_db()
            _refresh_manual_asset(asset)
        return Response(AssetSerializer(asset).data)

    @action(detail=True, methods=["post"], url_path="realize")
    def realize(self, request, pk=None):
        asset = self.get_object()
        try:
            tx = realize_manual_asset(
                asset,
                sale_price=request.data.get("sale_price"),
                dest_account_id=request.data.get("dest_account_id"),
                fee=request.data.get("fee", "0"),
                owner=self.get_effective_user(),
            )
        except ValueError as exc:
            status_code = (
                status.HTTP_409_CONFLICT
                if isinstance(exc, ArchivedAssetTransactionError)
                else status.HTTP_400_BAD_REQUEST
            )
            if isinstance(exc, ArchivedAssetTransactionError):
                payload = {"error": "asset_archived", "detail": str(exc)}
            else:
                payload = {"error": str(exc)}
            return Response(payload, status=status_code)
        asset.refresh_from_db()
        return Response(
            {
                "asset": AssetSerializer(asset, context={"request": request}).data,
                "transaction": AssetTransactionSerializer(
                    tx, context={"request": request}
                ).data,
            },
            status=status.HTTP_200_OK,
        )
