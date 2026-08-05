"""
portfolio/ledger_sync.py — Motore condiviso di sincronizzazione shadow-ledger.

Astrae il pattern comune a expenses/signals.py e splitting/signals.py: creare,
aggiornare o rimuovere una AssetTransaction "ombra" che riflette sul saldo di
un conto (Asset MANUAL con investment_type.is_bank_account) l'effetto di una
spesa/entrata, di una spesa condivisa o di un settlement. Resta nei due
signals.py di dominio solo ciò che non si può generalizzare: come derivare
importo/direzione/proprietario dal modello sorgente (sign-flip sui rimborsi
per Expense, ricerca della payer-share per SplitExpense, confronto
payer/payee per SplitSettlement) — vedi i rispettivi moduli per il perché di
quelle scelte.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date as date_cls
from decimal import Decimal
from typing import Optional

from django.db import transaction

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ShadowTxSpec:
    source_field: (
        str  # "source_expense" | "source_split_expense" | "source_split_settlement"
    )
    source_instance: object
    asset_id: Optional[int]
    owner_id: int
    # transaction_type/date/amount/is_verified sono irrilevanti (e possono
    # restare None) quando asset_id è None: sync_shadow_tx ripulisce
    # un'eventuale shadow stale e ritorna prima di usarli.
    transaction_type: Optional[str] = None  # AssetTransaction.CASH_IN / CASH_OUT
    date: Optional[date_cls] = None
    amount: Optional[Decimal] = (
        None  # sempre positivo, la direzione vive in transaction_type
    )
    is_verified: Optional[bool] = None
    dashboard_user_id: Optional[int] = None
    dashboard_reason: Optional[str] = None


def _recompute_and_rebuild_asset(asset):
    """Recompute l'asset sotto row lock, poi ricostruisce lo storico manuale.

    Delega a portfolio.services._refresh_manual_asset e ingoia i fallimenti
    di recompute per non avvelenare il save del modello sorgente — il
    sync della shadow-ledger deve restare best-effort.
    """
    from portfolio.services import _refresh_manual_asset

    try:
        _refresh_manual_asset(asset)
    except Exception:
        logger.exception(
            "_recompute_and_rebuild_asset: asset=%s refresh failed",
            getattr(asset, "pk", "?"),
        )


def _refresh_assets_by_id(asset_ids):
    from portfolio.models import Asset

    for asset_id in asset_ids:
        try:
            asset = Asset.objects.get(pk=asset_id)
            _recompute_and_rebuild_asset(asset)
        except Asset.DoesNotExist:
            pass


def _cleanup_stale_shadow_tx(source_field, source_instance, expected_asset_id):
    """Rimuove la shadow-tx della sorgente se punta a un asset diverso da
    quello attualmente collegato (linked_asset cambiato o rimosso).
    Ritorna gli asset_id interessati, da ricalcolare.
    """
    from portfolio.models import AssetTransaction

    wrong_txs = AssetTransaction.objects.filter(
        **{source_field: source_instance}
    ).exclude(asset_id=expected_asset_id)
    affected_ids = list(wrong_txs.values_list("asset_id", flat=True).distinct())
    wrong_txs.delete()
    return affected_ids


def sync_shadow_tx(spec: ShadowTxSpec) -> None:
    """Crea/aggiorna la AssetTransaction ombra descritta da `spec`.

    MED-11: cleanup della shadow stale e upsert della nuova nello stesso
    blocco atomico — altrimenti cambiare il linked_asset di una sorgente
    potrebbe cancellare la shadow del vecchio conto e poi fallire a scrivere
    quella nuova, gonfiando silenziosamente il saldo del vecchio conto.
    """
    from portfolio.models import Asset, AssetTransaction
    from portfolio.services import invalidate_dashboard_summary
    from portfolio.signals import _bulk_state

    with transaction.atomic():
        affected_ids = _cleanup_stale_shadow_tx(
            spec.source_field, spec.source_instance, spec.asset_id
        )
        if affected_ids:
            _refresh_assets_by_id(affected_ids)

        if not spec.asset_id:
            return

        try:
            asset = Asset.objects.get(
                pk=spec.asset_id,
                owner_id=spec.owner_id,
                tracking_type=Asset.MANUAL,
                investment_type__is_bank_account=True,
            )
        except Asset.DoesNotExist:
            logger.warning(
                "sync_shadow_tx: asset_id=%s non trovato per owner=%s source=%s(%s)",
                spec.asset_id,
                spec.owner_id,
                spec.source_field,
                getattr(spec.source_instance, "pk", "?"),
            )
            return

        logger.debug(
            "sync_shadow_tx: source=%s(%s) amount=%s → %s su asset=%s",
            spec.source_field,
            getattr(spec.source_instance, "pk", "?"),
            spec.amount,
            spec.transaction_type,
            asset.name,
        )
        AssetTransaction.objects.update_or_create(
            **{spec.source_field: spec.source_instance},
            defaults={
                "asset": asset,
                "transaction_type": spec.transaction_type,
                "date": spec.date,
                "shares": Decimal("1"),
                "price_per_share": spec.amount,
                "owner_id": spec.owner_id,
                "is_verified": spec.is_verified,
            },
        )

        # skip_recompute (bulk EDIT): differisce il recompute a un'unica pass
        # finale _refresh_assets_strict. Controllato qui una volta sola per
        # entrambe le sorgenti — prima era rispettato solo da Expense.
        if not getattr(_bulk_state, "skip_recompute", False):
            asset.refresh_from_db()
            _recompute_and_rebuild_asset(asset)

        if spec.dashboard_reason:
            invalidate_dashboard_summary(
                spec.dashboard_reason,
                user_id=spec.dashboard_user_id or spec.owner_id,
            )


def remove_shadow_tx(
    source_field: str,
    source_instance,
    *,
    dashboard_user_ids: Optional[list] = None,
    dashboard_reason: Optional[str] = None,
) -> None:
    """Rimuove la AssetTransaction ombra collegata a `source_instance` e
    ricalcola gli asset coinvolti (a meno di skip_recompute)."""
    from portfolio.models import AssetTransaction
    from portfolio.services import invalidate_dashboard_summary
    from portfolio.signals import _bulk_state

    shadow_qs = AssetTransaction.objects.filter(**{source_field: source_instance})
    asset_ids = list(shadow_qs.values_list("asset_id", flat=True).distinct())
    owner_ids = list(shadow_qs.values_list("owner_id", flat=True).distinct())
    deleted_count = shadow_qs.count()
    shadow_qs.delete()
    logger.debug(
        "remove_shadow_tx: source=%s(%s) → eliminate %d shadow tx su assets=%s",
        source_field,
        getattr(source_instance, "pk", "?"),
        deleted_count,
        asset_ids,
    )

    # skip_recompute (bulk DELETE): refresh differito a _refresh_assets_strict.
    if not getattr(_bulk_state, "skip_recompute", False):
        _refresh_assets_by_id(asset_ids)

    if dashboard_reason:
        for owner_id in (
            dashboard_user_ids if dashboard_user_ids is not None else owner_ids
        ):
            invalidate_dashboard_summary(dashboard_reason, user_id=owner_id)
