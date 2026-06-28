"""
expenses/signals.py — Sincronizzazione spese/entrate con gli asset del portfolio.

Quando una spesa o entrata ha un linked_asset, crea/aggiorna/elimina una
AssetTransaction "ombra" corrispondente per mantenere il saldo dell'asset aggiornato.
"""

import logging
from decimal import Decimal

from django.db import transaction
from django.db.models.signals import pre_delete, post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


def _recompute_and_rebuild_asset(asset):
    """Recompute the asset under a row lock, then rebuild its manual history.

    NEW-LOW-02: delegates to ``portfolio.services._refresh_manual_asset`` (the
    canonical recompute-locked + rebuild-history helper, CRIT-01) instead of
    re-implementing it. ``_refresh_manual_asset`` already swallows rebuild
    failures; we keep an outer guard so that a failure in the *recompute* step
    (which it lets propagate) still never poisons the surrounding Expense save —
    the signal must stay best-effort.
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


def _invalidate_expense_summary(owner, reason):
    from portfolio.services import invalidate_dashboard_summary

    invalidate_dashboard_summary(reason, user=owner)


@receiver(post_save, sender="expenses.Expense")
def sync_expense_to_asset(sender, instance, **kwargs):
    from portfolio.models import Asset, AssetTransaction
    from portfolio.models import DashboardSummary
    from portfolio.signals import _bulk_state

    reason = (
        DashboardSummary.REASON_EXPENSE_UPDATED
        if kwargs.get("created") is False
        else DashboardSummary.REASON_EXPENSE_CREATED
    )
    _invalidate_expense_summary(instance.owner, reason)

    # MED-11: the old-shadow cleanup (delete + refresh) and the new-shadow upsert
    # must commit or roll back together. Otherwise changing an expense's
    # linked_asset would delete the previous account's shadow tx and could then
    # fail to write the replacement, silently inflating the old account's balance.
    with transaction.atomic():
        _cleanup_old_shadow_tx(instance, AssetTransaction)

        if not instance.linked_asset_id:
            return

        try:
            asset = Asset.objects.get(
                pk=instance.linked_asset_id,
                owner=instance.owner,
                tracking_type=Asset.MANUAL,
                investment_type__is_bank_account=True,
            )
        except Asset.DoesNotExist:
            logger.warning(
                "sync_expense_to_asset: linked_asset_id=%s not found for expense=%s",
                instance.linked_asset_id,
                instance.pk,
            )
            return

        cat = instance.category
        tx_type = (
            AssetTransaction.CASH_OUT
            if not cat or cat.category_type == "expense"
            else AssetTransaction.CASH_IN
        )

        logger.debug(
            "sync_expense_to_asset: expense=%s amount=%s → %s on asset=%s",
            instance.pk,
            instance.amount,
            tx_type,
            asset.name,
        )
        AssetTransaction.objects.update_or_create(
            source_expense=instance,
            defaults={
                "asset": asset,
                "transaction_type": tx_type,
                "date": instance.date,
                "shares": Decimal("1"),
                "price_per_share": instance.amount,
                "is_verified": instance.is_verified,
                "owner": instance.owner,
            },
        )
        # skip_recompute (bulk EDIT): difference il recompute a un'unica pass
        # finale _refresh_assets_strict. CRIT-01/02: quando il recompute parte,
        # è atomico via _recompute_asset_locked (select_for_update) dentro
        # _recompute_and_rebuild_asset, nello stesso atomic block del save.
        if not getattr(_bulk_state, "skip_recompute", False):
            asset.refresh_from_db()
            _recompute_and_rebuild_asset(asset)


@receiver(pre_delete, sender="expenses.Expense")
def remove_expense_from_asset(sender, instance, **kwargs):
    from portfolio.models import DashboardSummary
    from portfolio.signals import _bulk_state

    _invalidate_expense_summary(instance.owner, DashboardSummary.REASON_EXPENSE_DELETED)
    from portfolio.models import AssetTransaction

    shadow_qs = AssetTransaction.objects.filter(source_expense=instance)
    asset_ids = list(shadow_qs.values_list("asset_id", flat=True).distinct())
    deleted_count = shadow_qs.count()
    shadow_qs.delete()
    logger.debug(
        "remove_expense_from_asset: expense=%s → deleted %d shadow tx on assets=%s",
        instance.pk,
        deleted_count,
        asset_ids,
    )

    # skip_recompute (bulk DELETE): refresh differito a _refresh_assets_strict.
    if getattr(_bulk_state, "skip_recompute", False):
        return

    # Recompute sotto select_for_update (CRIT-01/02) via _refresh_assets_by_id →
    # _recompute_and_rebuild_asset; l'atomic del caller annulla anche il save
    # dell'asset se il delete viene rollbackato.
    _refresh_assets_by_id(asset_ids)


def _cleanup_old_shadow_tx(expense, AssetTransaction):
    """Rimuove transazioni ombra di una spesa che hanno asset diverso dall'attuale linked_asset.
    Necessario quando l'utente cambia il linked_asset di una spesa esistente.
    """
    wrong_txs = AssetTransaction.objects.filter(source_expense=expense).exclude(
        asset_id=expense.linked_asset_id
    )
    affected_ids = list(wrong_txs.values_list("asset_id", flat=True).distinct())
    wrong_txs.delete()

    if not affected_ids:
        return

    _refresh_assets_by_id(affected_ids)
