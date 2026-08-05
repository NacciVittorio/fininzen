"""
expenses/signals.py — Sincronizzazione spese/entrate con gli asset del portfolio.

Quando una spesa o entrata ha un linked_asset, crea/aggiorna/elimina una
AssetTransaction "ombra" corrispondente per mantenere il saldo dell'asset
aggiornato. Il plumbing di sync/cleanup/recompute (update_or_create,
cleanup della shadow stale, recompute sotto skip_recompute) è condiviso con
splitting/signals.py via portfolio.ledger_sync — qui resta solo la logica
di dominio specifica a Expense: il sign-flip per mappare l'importo (che può
essere negativo, es. un rimborso) su una direzione CASH_IN/CASH_OUT, e
l'invalidazione del dashboard summary che deve scattare ad ogni save/delete
di Expense a prescindere dal linked_asset.
"""

import logging
from decimal import Decimal

from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver

logger = logging.getLogger(__name__)


def _invalidate_expense_summary(owner, reason):
    from portfolio.services import invalidate_dashboard_summary

    invalidate_dashboard_summary(reason, user=owner)


@receiver(post_save, sender="expenses.Expense")
def sync_expense_to_asset(sender, instance, **kwargs):
    from portfolio.ledger_sync import ShadowTxSpec, sync_shadow_tx
    from portfolio.models import AssetTransaction, DashboardSummary

    reason = (
        DashboardSummary.REASON_EXPENSE_UPDATED
        if kwargs.get("created") is False
        else DashboardSummary.REASON_EXPENSE_CREATED
    )
    _invalidate_expense_summary(instance.owner, reason)

    if not instance.linked_asset_id:
        # Nessun asset collegato ora: sync_shadow_tx ripulisce comunque
        # un'eventuale shadow rimasta da un linked_asset precedente
        # (rimosso in questo save) e ritorna prima di calcolare l'importo.
        sync_shadow_tx(
            ShadowTxSpec(
                source_field="source_expense",
                source_instance=instance,
                asset_id=None,
                owner_id=instance.owner_id,
            )
        )
        return

    cat = instance.category
    is_expense = not cat or cat.category_type == "expense"
    # LOW-07: map the (possibly negative) expense amount to a cash direction.
    # An expense removes money, income adds it; a negative amount flips the
    # direction (a refunded expense returns money). The shadow tx must keep a
    # positive price_per_share (assettransaction_amount_valid), so the sign is
    # encoded in the transaction TYPE, not the amount.
    # instance.amount may still be the raw value assigned on create (e.g. a
    # str via Model.objects.create(amount="10.00")) — coerce before arithmetic.
    amount = Decimal(str(instance.amount))
    signed_inflow = -amount if is_expense else amount
    if signed_inflow >= 0:
        tx_type = AssetTransaction.CASH_IN
        shadow_amount = signed_inflow
    else:
        tx_type = AssetTransaction.CASH_OUT
        shadow_amount = -signed_inflow

    logger.debug(
        "sync_expense_to_asset: expense=%s amount=%s → %s %s on linked_asset=%s",
        instance.pk,
        instance.amount,
        tx_type,
        shadow_amount,
        instance.linked_asset_id,
    )
    # sync_shadow_tx risolve l'asset (owner=instance.owner, MANUAL,
    # is_bank_account) internamente e logga+ritorna se non lo trova —
    # comportamento invariato rispetto alla versione precedente, che faceva
    # la stessa Asset.objects.get() qui prima di costruire la shadow-tx.
    sync_shadow_tx(
        ShadowTxSpec(
            source_field="source_expense",
            source_instance=instance,
            asset_id=instance.linked_asset_id,
            owner_id=instance.owner_id,
            transaction_type=tx_type,
            date=instance.date,
            amount=shadow_amount,
            is_verified=instance.is_verified,
        )
    )


@receiver(pre_delete, sender="expenses.Expense")
def remove_expense_from_asset(sender, instance, **kwargs):
    from portfolio.ledger_sync import remove_shadow_tx
    from portfolio.models import DashboardSummary

    _invalidate_expense_summary(instance.owner, DashboardSummary.REASON_EXPENSE_DELETED)
    remove_shadow_tx("source_expense", instance)
