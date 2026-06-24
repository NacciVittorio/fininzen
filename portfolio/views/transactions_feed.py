import logging
from django.db import transaction
from django.db.models import F, Prefetch, Q
from django.db.models.functions import Abs
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import (
    AssetTransaction,
)
from ..serializers import (
    AssetTransactionSerializer,
)
from ..services import (
    ArchivedAssetTransactionError,
    patch_transaction,
    tax_cost_basis_for_sell,
)
from datetime import date as date_cls
from decimal import Decimal, ROUND_HALF_UP
from fininzen.api_errors import client_error_response, safe_client_message
from fininzen.mixins import _effective_user, require_view_as_full
from fininzen.permissions import IsNotDemoUser

from ._common import (
    PORTFOLIO_TX_VALID_ORDERINGS,
    PORTFOLIO_TX_MAX_FILTERED_BULK,
)

logger = logging.getLogger(__name__)


def _parse_portfolio_tx_filters(params):
    filters = {
        "include_bank": str(params.get("include_bank", "false")).lower()
        in ("true", "1"),
        "assets": [],
        "types": None,
        "date_from": None,
        "date_to": None,
        "verified": None,
        "search": str(params.get("search") or "").strip(),
        "ordering": params.get("ordering") or "-date",
    }
    if filters["ordering"] not in PORTFOLIO_TX_VALID_ORDERINGS:
        filters["ordering"] = "-date"

    asset_str = params.get("asset")
    if asset_str:
        try:
            filters["assets"] = [int(p) for p in str(asset_str).split(",") if p.strip()]
        except ValueError as exc:
            raise ValueError("invalid asset") from exc

    type_str = params.get("type")
    if type_str:
        requested = {t.strip() for t in str(type_str).split(",") if t.strip()}
        unknown = requested - TransactionsFeedView.VALID_TYPES
        if unknown:
            raise ValueError(f"unknown types: {sorted(unknown)}")
        filters["types"] = requested

    date_from_str = params.get("date_from")
    if date_from_str:
        try:
            filters["date_from"] = date_cls.fromisoformat(str(date_from_str))
        except ValueError as exc:
            raise ValueError("invalid date_from") from exc

    date_to_str = params.get("date_to")
    if date_to_str:
        try:
            filters["date_to"] = date_cls.fromisoformat(str(date_to_str))
        except ValueError as exc:
            raise ValueError("invalid date_to") from exc

    verified_str = params.get("verified")
    if verified_str is not None:
        if isinstance(verified_str, bool):
            filters["verified"] = verified_str
        else:
            filters["verified"] = str(verified_str).lower() in ("true", "1")
    return filters


def _portfolio_transactions_queryset(user, params):
    filters = _parse_portfolio_tx_filters(params)
    # Scope by the parent asset's owner: AssetTransaction.owner is nullable
    # and legacy rows may have owner=NULL even when the asset is owned.
    qs = (
        AssetTransaction.objects.filter(asset__owner=user)
        .select_related("asset", "asset__investment_type", "contribution_source")
        .prefetch_related(
            Prefetch(
                "derived_txs",
                queryset=AssetTransaction.objects.select_related("asset"),
                to_attr="_feed_derived",
            )
        )
    )

    if not filters["include_bank"]:
        qs = qs.filter(asset__investment_type__is_bank_account=False)
    if filters["assets"]:
        qs = qs.filter(asset_id__in=filters["assets"])
    if filters["types"]:
        qs = qs.filter(transaction_type__in=filters["types"])
    if filters["date_from"]:
        qs = qs.filter(date__gte=filters["date_from"])
    if filters["date_to"]:
        qs = qs.filter(date__lte=filters["date_to"])
    if filters["verified"] is not None:
        qs = qs.filter(is_verified=filters["verified"])

    if filters["search"]:
        search = filters["search"]
        qs = qs.filter(
            Q(asset__name__icontains=search)
            | Q(asset__ticker__icontains=search)
            | Q(asset__source_symbol__icontains=search)
            | Q(asset__isin__icontains=search)
            | Q(notes__icontains=search)
            | Q(contribution_source__name__icontains=search)
            | Q(derived_txs__asset__name__icontains=search)
        ).distinct()

    ordering = filters["ordering"]
    if ordering in ("-amount", "amount"):
        qs = qs.annotate(_amount=Abs(F("shares") * F("price_per_share")))
        qs = qs.order_by(
            "-_amount" if ordering == "-amount" else "_amount",
            "-date" if ordering == "-amount" else "date",
            "-id" if ordering == "-amount" else "id",
        )
    else:
        qs = (
            qs.order_by("-date", "-id")
            if ordering == "-date"
            else qs.order_by("date", "id")
        )
    return qs


def _portfolio_tx_total(tx):
    return (
        (tx.shares or Decimal("0")) * (tx.price_per_share or Decimal("0"))
    ).quantize(Decimal("0.01"))


def _portfolio_tx_realized_tax(tx):
    # The tax stored on the transaction is a SNAPSHOT taken at create/update time
    # (see services._sync_parent_tax_amount). We intentionally return it as-is and
    # do NOT recompute from the asset's current effective rate here, so changing the
    # tax rate later never silently rewrites the tax of past sells. Propagating a
    # rate change to existing sells is an explicit, opt-in action handled by
    # services.resync_asset_tax.
    return Decimal(tx.tax_amount or 0).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _portfolio_tx_cash_flow_value(tx):
    total = _portfolio_tx_total(tx)
    fee = Decimal(tx.fee or 0)
    tax = _portfolio_tx_realized_tax(tx)
    if tx.transaction_type == AssetTransaction.BUY:
        return (total + fee).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if tx.transaction_type == AssetTransaction.SELL:
        return (total - fee - tax).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return total


class TransactionsFeedView(APIView):
    """
    GET /api/portfolio/transactions/

    Global asset-transaction feed for the effective user, sorted by date desc.

    Query params:
      asset            — asset id (csv supported)
      type             — comma-separated subset of buy,sell,cash_in,cash_out,adjustment
      date_from        — YYYY-MM-DD
      date_to          — YYYY-MM-DD
      verified         — true|false
      search           — substring matched against asset, notes, source, linked account
      ordering         — -date|date|-amount|amount (default -date)
      include_bank     — true to include bank-account asset transactions (default false:
                         bank-account flows live in the Cash Flow feed instead)
      page             — page number (default 1)
      page_size        — items per page (default 50, maximum 200)

    Response: { count, next_page, results: [...] }
    """

    permission_classes = [IsAuthenticated]

    VALID_TYPES = {"buy", "sell", "cash_in", "cash_out", "adjustment"}

    def get(self, request):
        user = _effective_user(request)
        try:
            qs = _portfolio_transactions_queryset(user, request.query_params)
        except ValueError as exc:
            return client_error_response(exc)
        total = qs.count()

        page_size_str = request.query_params.get("page_size", "50")
        if page_size_str == "all":
            return Response(
                {"error": "page_size=all is not supported; use pagination"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            page_size = min(200, max(1, int(page_size_str)))
        except ValueError:
            page_size = 50
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except ValueError:
            page = 1
        start = (page - 1) * page_size
        end = start + page_size
        items = list(qs[start:end])
        next_page = page + 1 if end < total else None

        results = [self._serialize(tx) for tx in items]
        return Response({"count": total, "next_page": next_page, "results": results})

    @staticmethod
    def _serialize(tx):
        asset = tx.asset
        inv_type = asset.investment_type
        derived = getattr(tx, "_feed_derived", None)
        mirror = None
        if tx.transaction_type in (AssetTransaction.BUY, AssetTransaction.SELL):
            if derived is not None:
                mirror = next(
                    (
                        item
                        for item in derived
                        if item.derived_kind == AssetTransaction.DERIVED_PRINCIPAL
                    ),
                    None,
                )
            else:
                mirror = (
                    tx.derived_txs.filter(
                        derived_kind=AssetTransaction.DERIVED_PRINCIPAL
                    )
                    .select_related("asset")
                    .first()
                )
        linked_direction = (
            "source" if tx.transaction_type == AssetTransaction.BUY else "destination"
        )
        total = _portfolio_tx_total(tx)
        tax_amount = _portfolio_tx_realized_tax(tx)
        return {
            "id": tx.id,
            "asset": {
                "id": asset.id,
                "name": asset.name,
                "icon": inv_type.icon if inv_type else "📈",
                "currency": asset.currency or "EUR",
                "investment_type_id": inv_type.id if inv_type else None,
                "is_bank_account": bool(inv_type and inv_type.is_bank_account),
                "is_archived": bool(asset.is_archived),
                "supports_contribution_source": asset.supports_contribution_source,
                "effective_tax_rate": str(asset.effective_tax_rate),
            },
            "transaction_type": tx.transaction_type,
            "date": tx.date.isoformat() if tx.date else None,
            "shares": str(tx.shares) if tx.shares is not None else None,
            "price_per_share": str(tx.price_per_share)
            if tx.price_per_share is not None
            else None,
            "total_value": str(total),
            "cash_flow_value": str(_portfolio_tx_cash_flow_value(tx)),
            "fee": str(tx.fee or Decimal("0")),
            "tax_amount": str(tax_amount),
            "tax_amount_is_manual": tx.tax_amount_is_manual,
            "tax_cost_basis": str(
                tax_cost_basis_for_sell(asset, tx).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP
                )
                if tx.transaction_type == AssetTransaction.SELL
                else Decimal("0.00")
            ),
            "derived_kind": tx.derived_kind,
            "notes": tx.notes or "",
            "contribution_source": tx.contribution_source_id,
            "contribution_source_name": (
                tx.contribution_source.name if tx.contribution_source_id else ""
            ),
            "is_verified": tx.is_verified,
            "derived_from_id": tx.derived_from_id,
            "linked_account_id": mirror.asset_id if mirror else None,
            "linked_account_name": mirror.asset.name if mirror else None,
            "linked_account_direction": linked_direction if mirror else None,
        }


class TransactionsBulkView(APIView):
    """
    POST /api/portfolio/transactions/bulk/

    Body:
      {
        "selection": {
          "mode": "ids" | "filtered",
          "ids": [1, 2, ...],
          "filters": {...},
          "exclude_ids": [3, ...]
        },
        "action": "edit",
        "patch": {"is_verified": true|false},
        "dry_run": true|false
      }
    """

    permission_classes = [IsAuthenticated, IsNotDemoUser]

    def post(self, request):
        require_view_as_full(request)
        user = _effective_user(request)
        payload = request.data or {}
        try:
            selection, missing_ids = self._resolve_selection(user, payload)
            patch = payload.get("patch") or {}
            self._validate_payload(payload, patch)
        except ValueError as exc:
            return Response(
                {
                    "ok": False,
                    "errors": [safe_client_message(exc)],
                    "error_codes": ["invalid_bulk"],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        report = self._preview(selection, missing_ids, patch)
        if payload.get("dry_run"):
            return Response(report)

        is_verified = bool(patch["is_verified"])
        applied = 0
        errors = []
        archived_blocked = False
        with transaction.atomic():
            for tx in sorted(
                selection,
                key=lambda item: (item.date or date_cls.min, item.created_at, item.pk),
            ):
                serializer = AssetTransactionSerializer(
                    tx,
                    data={"is_verified": is_verified},
                    partial=True,
                    context={"request": request},
                )
                try:
                    serializer.is_valid(raise_exception=True)
                    patch_transaction(tx, serializer, owner=user)
                except ArchivedAssetTransactionError as exc:
                    errors.append(safe_client_message(exc))
                    archived_blocked = True
                    break
                except Exception as exc:
                    errors.append(safe_client_message(exc))
                    break
                applied += 1
            if errors:
                transaction.set_rollback(True)

        if errors:
            return Response(
                {
                    **report,
                    "ok": False,
                    "errors": errors,
                    "error_codes": [
                        "asset_archived" if archived_blocked else "bulk_apply_failed"
                    ],
                },
                status=(
                    status.HTTP_409_CONFLICT
                    if archived_blocked
                    else status.HTTP_400_BAD_REQUEST
                ),
            )
        return Response(
            {
                **report,
                "applied": {"transaction": applied, "total": applied},
            }
        )

    @staticmethod
    def _validate_payload(payload, patch):
        if payload.get("action") != "edit":
            raise ValueError("action must be 'edit'")
        if set(patch.keys()) != {"is_verified"} or not isinstance(
            patch.get("is_verified"), bool
        ):
            raise ValueError("patch must be {'is_verified': true|false}")

    @staticmethod
    def _coerce_ids(raw_ids):
        ids = []
        for raw in raw_ids or []:
            value = str(raw)
            if value.startswith("tx_"):
                value = value[3:]
            if value.isdigit():
                ids.append(int(value))
        return ids

    def _resolve_selection(self, user, payload):
        selection = payload.get("selection") or {}
        mode = selection.get("mode")
        if mode == "ids":
            ids = self._coerce_ids(selection.get("ids"))
            txs = list(
                _portfolio_transactions_queryset(
                    user,
                    {
                        "include_bank": "false",
                        "type": "buy,sell,adjustment",
                    },
                )
                .filter(pk__in=ids)
                .order_by("date", "created_at", "id")
            )
            found = {tx.pk for tx in txs}
            return txs, [pk for pk in ids if pk not in found]

        if mode == "filtered":
            filters = {**(selection.get("filters") or {})}
            filters.setdefault("type", "buy,sell,adjustment")
            qs = _portfolio_transactions_queryset(user, filters)
            exclude_ids = set(self._coerce_ids(selection.get("exclude_ids")))
            if exclude_ids:
                qs = qs.exclude(pk__in=exclude_ids)
            total = qs.count()
            if total > PORTFOLIO_TX_MAX_FILTERED_BULK:
                raise ValueError(
                    f"filtered selection exceeds {PORTFOLIO_TX_MAX_FILTERED_BULK} rows"
                )
            return list(qs.order_by("date", "created_at", "id")), []

        raise ValueError("selection.mode must be 'ids' or 'filtered'")

    @staticmethod
    def _preview(selection, missing_ids, patch):
        total_amount = sum((_portfolio_tx_total(tx) for tx in selection), Decimal("0"))
        return {
            "ok": True,
            "action": "edit",
            "kind": "transaction",
            "total_selected": len(selection),
            "total_amount": str(total_amount.quantize(Decimal("0.01"))),
            "by_type": {"transaction": len(selection)},
            "missing_ids": missing_ids,
            "patch_fields": sorted(patch.keys()),
            "errors": [],
            "error_codes": [],
            "rejected_rows": [],
            "warnings": ["selection is empty"] if not selection else [],
        }
