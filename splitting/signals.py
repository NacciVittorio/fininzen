"""
splitting/signals.py — Sincronizzazione SplitExpense/SplitSettlement con gli
asset del portfolio.

Mirror di expenses/signals.py: quando una SplitExpense ha un `linked_asset`,
crea/aggiorna/elimina una AssetTransaction "ombra" corrispondente per
riflettere sul saldo del conto l'INTERO importo della spesa (mai la quota
netta) — è l'intero importo che è realmente uscito dal conto del pagatore
(piano sez. 4, decisione utente #3: saldo conto vs. categorizzazione budget
sono deliberatamente disaccoppiati; la quota netta va invece nel feed
CashFlow, sez. 5 del piano — non qui).

Stesso meccanismo per SplitSettlement (piano sez. 1.6/4, in fondo al file):
se il settlement ha un `linked_asset`, crea una shadow-tx CASH_IN (l'utente
collegato riceve il pagamento) o CASH_OUT (lo effettua) — direzione
determinata confrontando `created_by` con `payer_user`/`payee_user`.

La transazione ombra è ancorata all'asset/owner del PARTECIPANTE PAGATORE
(`SplitExpenseShare.is_payer=True`), non a un campo `owner` diretto su
SplitExpense — che non esiste: l'appartenenza qui è multi-persona esplicita,
non owner singolo (piano sez. 0.1).

DEVIAZIONE MINORE DAL PIANO: il piano (sez. 4) descrive solo un
@receiver(post_save) su splitting.SplitExpense, mirror letterale di
sync_expense_to_asset. Ma a differenza di Expense (dove category/amount/owner
vivono tutti sul modello stesso), "chi è il pagatore" per una SplitExpense
vive sulla riga figlia SplitExpenseShare(is_payer=True), scritta da
services.apply_split_shares() SEMPRE *dopo* che SplitExpense.objects.create()
ha già fatto scattare il post_save iniziale (nessuna share esiste ancora a
quel punto — bulk_create() delle share, inoltre, non emette segnali propri).
Un post_save-only sarebbe quindi silenziosamente un no-op alla creazione via
API (mai nessuna AssetTransaction creata). Fix minimo: la logica di sync vive
in `_sync_shadow_for_expense()`, richiamata sia dal signal post_save (utile
per un futuro `expense.save()` diretto che non tocchi le shares, es. modifica
di importo/data/linked_asset via admin) sia esplicitamente da
`apply_split_shares()` a shares scritte — quest'ultima chiamata è quella che
garantisce sempre il payer corretto, sia in creazione che in update.
"""

import logging
from decimal import Decimal

from django.db import transaction
from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver

logger = logging.getLogger(__name__)


def _recompute_and_rebuild_asset(asset):
    """Mirror di expenses/signals.py::_recompute_and_rebuild_asset."""
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


def _invalidate_dashboard_for_user(user_id, reason):
    if not user_id:
        return
    from portfolio.services import invalidate_dashboard_summary

    invalidate_dashboard_summary(reason, user_id=user_id)


def _cleanup_old_shadow_split_tx(expense, AssetTransaction):
    """Mirror di expenses/signals.py::_cleanup_old_shadow_tx.

    Rimuove transazioni ombra della spesa che hanno asset diverso
    dall'attuale linked_asset — necessario quando l'utente cambia il
    linked_asset (o lo rimuove) di una SplitExpense esistente.
    """
    wrong_txs = AssetTransaction.objects.filter(source_split_expense=expense).exclude(
        asset_id=expense.linked_asset_id
    )
    affected_ids = list(wrong_txs.values_list("asset_id", flat=True).distinct())
    wrong_txs.delete()

    if not affected_ids:
        return
    _refresh_assets_by_id(affected_ids)


def _sync_shadow_for_expense(expense):
    """Crea/aggiorna/rimuove la AssetTransaction ombra di `expense`.

    Richiamata sia dal post_save di SplitExpense (sotto) sia esplicitamente
    da services.apply_split_shares() una volta che le shares (e quindi il
    pagatore) sono note — vedi DEVIAZIONE nel docstring di modulo.
    """
    from portfolio.models import Asset, AssetTransaction, DashboardSummary

    with transaction.atomic():
        _cleanup_old_shadow_split_tx(expense, AssetTransaction)

        if not expense.linked_asset_id:
            return

        payer_share = (
            expense.shares.filter(is_payer=True).select_related("participant").first()
        )
        payer_user_id = payer_share.participant.user_id if payer_share else None
        if not payer_user_id:
            # O le shares non sono ancora state scritte (subito dopo
            # SplitExpense.objects.create(), prima di apply_split_shares), o
            # il pagatore è un contatto locale senza account fininzen: in
            # entrambi i casi non c'è un asset reale da toccare qui.
            # apply_split_shares richiamerà di nuovo questa funzione una
            # volta risolto il pagatore.
            return

        try:
            asset = Asset.objects.get(
                pk=expense.linked_asset_id,
                owner_id=payer_user_id,
                tracking_type=Asset.MANUAL,
                investment_type__is_bank_account=True,
            )
        except Asset.DoesNotExist:
            logger.warning(
                "_sync_shadow_for_expense: linked_asset_id=%s non trovato per payer=%s split_expense=%s",
                expense.linked_asset_id,
                payer_user_id,
                expense.pk,
            )
            return

        # L'intero importo (non la quota netta) è ciò che è realmente uscito
        # dal conto del pagatore — vedi docstring di modulo.
        amount = Decimal(str(expense.amount))
        logger.debug(
            "_sync_shadow_for_expense: split_expense=%s amount=%s CASH_OUT su asset=%s (payer=%s)",
            expense.pk,
            amount,
            asset.name,
            payer_user_id,
        )
        AssetTransaction.objects.update_or_create(
            source_split_expense=expense,
            defaults={
                "asset": asset,
                "transaction_type": AssetTransaction.CASH_OUT,
                "date": expense.date,
                "shares": Decimal("1"),
                "price_per_share": amount,
                "owner_id": payer_user_id,
                # A differenza di Expense.is_verified (riconciliazione
                # estratto conto, può restare False in sospeso — vedi
                # expenses/tests/test_expenses_api.py::
                # test_unverified_expense_linked_account_does_not_affect_balance),
                # una SplitExpense non ha un concetto di "in sospeso": è
                # sempre una spesa già avvenuta, quindi la shadow-tx deve
                # essere verified fin da subito, altrimenti
                # recompute_from_transactions() (che filtra is_verified=True)
                # la ignorerebbe e il saldo non calerebbe mai.
                "is_verified": True,
            },
        )
        asset.refresh_from_db()
        _recompute_and_rebuild_asset(asset)
        _invalidate_dashboard_for_user(
            payer_user_id, DashboardSummary.REASON_TRANSACTION
        )


@receiver(post_save, sender="splitting.SplitExpense")
def sync_split_expense_to_asset(sender, instance, **kwargs):
    _sync_shadow_for_expense(instance)


@receiver(pre_delete, sender="splitting.SplitExpense")
def remove_split_expense_from_asset(sender, instance, **kwargs):
    """Mirror di expenses/signals.py::remove_expense_from_asset."""
    from portfolio.models import AssetTransaction, DashboardSummary

    shadow_qs = AssetTransaction.objects.filter(source_split_expense=instance)
    asset_ids = list(shadow_qs.values_list("asset_id", flat=True).distinct())
    payer_user_ids = list(
        shadow_qs.values_list("owner_id", flat=True).distinct()
    )
    deleted_count = shadow_qs.count()
    shadow_qs.delete()
    logger.debug(
        "remove_split_expense_from_asset: split_expense=%s → eliminate %d shadow tx su assets=%s",
        instance.pk,
        deleted_count,
        asset_ids,
    )

    _refresh_assets_by_id(asset_ids)
    for payer_user_id in payer_user_ids:
        _invalidate_dashboard_for_user(
            payer_user_id, DashboardSummary.REASON_TRANSACTION
        )


# ── SplitSettlement → shadow-tx (piano sez. 1.6/4) ──────────────────────────
#
# A differenza di SplitExpense, un settlement non ha una fase "shares scritte
# dopo" da attendere: payer/payee/amount/linked_asset vivono tutti sulla riga
# stessa, nota fin dal primo post_save — un semplice @receiver(post_save)
# basta, nessuna chiamata esplicita analoga a apply_split_shares() è
# necessaria qui.


def _cleanup_old_shadow_split_settlement_tx(settlement, AssetTransaction):
    """Mirror di _cleanup_old_shadow_split_tx, per SplitSettlement."""
    wrong_txs = AssetTransaction.objects.filter(
        source_split_settlement=settlement
    ).exclude(asset_id=settlement.linked_asset_id)
    affected_ids = list(wrong_txs.values_list("asset_id", flat=True).distinct())
    wrong_txs.delete()

    if not affected_ids:
        return
    _refresh_assets_by_id(affected_ids)


def _sync_shadow_for_settlement(settlement):
    """Crea/aggiorna/rimuove la AssetTransaction ombra di `settlement`
    (mirror di `_sync_shadow_for_expense`, piano sez. 4).

    Direzione: CASH_OUT se il conto collegato appartiene a chi sta
    effettuando il pagamento (`created_by == payer_user`), CASH_IN se
    appartiene a chi lo sta ricevendo (`created_by == payee_user`).
    `created_by` è validato a livello serializer per coincidere sempre con
    una delle due identità "user" del settlement (piano sez. 1.6) — qui
    basta confrontarlo per stabilire sia la direzione sia il proprietario
    dell'asset da toccare.
    """
    from portfolio.models import Asset, AssetTransaction, DashboardSummary

    with transaction.atomic():
        _cleanup_old_shadow_split_settlement_tx(settlement, AssetTransaction)

        if not settlement.linked_asset_id:
            return

        if settlement.created_by_id == settlement.payer_user_id:
            direction = AssetTransaction.CASH_OUT
            acting_user_id = settlement.payer_user_id
        elif settlement.created_by_id == settlement.payee_user_id:
            direction = AssetTransaction.CASH_IN
            acting_user_id = settlement.payee_user_id
        else:
            # Difensivo: la validazione serializer impedisce già questo caso
            # (created_by deve coincidere con payer_user o payee_user), ma
            # una riga scritta altrove (admin, fixture, migrazione dati)
            # potrebbe non rispettarla — niente shadow-tx senza una
            # direzione certa piuttosto che indovinarla.
            logger.warning(
                "_sync_shadow_for_settlement: settlement=%s created_by=%s non "
                "coincide né con payer_user né con payee_user, nessuna shadow-tx",
                settlement.pk,
                settlement.created_by_id,
            )
            return

        try:
            asset = Asset.objects.get(
                pk=settlement.linked_asset_id,
                owner_id=acting_user_id,
                tracking_type=Asset.MANUAL,
                investment_type__is_bank_account=True,
            )
        except Asset.DoesNotExist:
            logger.warning(
                "_sync_shadow_for_settlement: linked_asset_id=%s non trovato per "
                "acting_user=%s settlement=%s",
                settlement.linked_asset_id,
                acting_user_id,
                settlement.pk,
            )
            return

        amount = Decimal(str(settlement.amount))
        logger.debug(
            "_sync_shadow_for_settlement: settlement=%s amount=%s → %s su asset=%s "
            "(acting_user=%s)",
            settlement.pk,
            amount,
            direction,
            asset.name,
            acting_user_id,
        )
        AssetTransaction.objects.update_or_create(
            source_split_settlement=settlement,
            defaults={
                "asset": asset,
                "transaction_type": direction,
                "date": settlement.date,
                "shares": Decimal("1"),
                "price_per_share": amount,
                "owner_id": acting_user_id,
                # Come per SplitExpense: un settlement non ha un concetto di
                # "in sospeso", va sempre verified fin da subito altrimenti
                # recompute_from_transactions() (is_verified=True) lo ignora.
                "is_verified": True,
            },
        )
        asset.refresh_from_db()
        _recompute_and_rebuild_asset(asset)
        _invalidate_dashboard_for_user(
            acting_user_id, DashboardSummary.REASON_TRANSACTION
        )


@receiver(post_save, sender="splitting.SplitSettlement")
def sync_split_settlement_to_asset(sender, instance, **kwargs):
    _sync_shadow_for_settlement(instance)


@receiver(pre_delete, sender="splitting.SplitSettlement")
def remove_split_settlement_from_asset(sender, instance, **kwargs):
    """Mirror di remove_split_expense_from_asset, per SplitSettlement."""
    from portfolio.models import AssetTransaction, DashboardSummary

    shadow_qs = AssetTransaction.objects.filter(source_split_settlement=instance)
    asset_ids = list(shadow_qs.values_list("asset_id", flat=True).distinct())
    acting_user_ids = list(shadow_qs.values_list("owner_id", flat=True).distinct())
    deleted_count = shadow_qs.count()
    shadow_qs.delete()
    logger.debug(
        "remove_split_settlement_from_asset: settlement=%s → eliminate %d shadow tx su assets=%s",
        instance.pk,
        deleted_count,
        asset_ids,
    )

    _refresh_assets_by_id(asset_ids)
    for acting_user_id in acting_user_ids:
        _invalidate_dashboard_for_user(
            acting_user_id, DashboardSummary.REASON_TRANSACTION
        )
