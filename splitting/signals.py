"""
splitting/signals.py — Sincronizzazione SplitExpense/SplitSettlement con gli
asset del portfolio.

Quando una SplitExpense ha un `linked_asset`, crea/aggiorna/elimina una
AssetTransaction "ombra" corrispondente per riflettere sul saldo del conto
l'INTERO importo della spesa (mai la quota netta) — è l'intero importo che è
realmente uscito dal conto del pagatore (piano sez. 4, decisione utente #3:
saldo conto vs. categorizzazione budget sono deliberatamente disaccoppiati;
la quota netta va invece nel feed CashFlow, sez. 5 del piano — non qui).

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

Il plumbing di sync/cleanup/recompute (update_or_create, cleanup della
shadow stale, recompute sotto skip_recompute) è condiviso con
expenses/signals.py via portfolio.ledger_sync — qui resta solo la logica di
dominio specifica a Split: la ricerca della payer-share, il confronto
payer/payee per il settlement, e il fatto che Split non ha un concetto di
"in sospeso" (sempre `is_verified=True`, vedi `splitting.models.SplitExpense
.is_verified`/`SplitSettlement.is_verified`).
"""

import logging
from decimal import Decimal

from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver

logger = logging.getLogger(__name__)


def _sync_shadow_for_expense(expense):
    """Crea/aggiorna/rimuove la AssetTransaction ombra di `expense`.

    Richiamata sia dal post_save di SplitExpense (sotto) sia esplicitamente
    da services.apply_split_shares() una volta che le shares (e quindi il
    pagatore) sono note — vedi DEVIAZIONE nel docstring di modulo.
    """
    from portfolio.ledger_sync import (
        ShadowTxSpec,
        _cleanup_stale_shadow_tx,
        _refresh_assets_by_id,
        sync_shadow_tx,
    )
    from portfolio.models import AssetTransaction, DashboardSummary

    # Cleanup della shadow stale sempre per primo, indipendentemente dal
    # payer — mirror dell'ordine originale (_cleanup_old_shadow_split_tx
    # girava incondizionatamente prima di ogni altro controllo).
    affected_ids = _cleanup_stale_shadow_tx(
        "source_split_expense", expense, expense.linked_asset_id
    )
    if affected_ids:
        _refresh_assets_by_id(affected_ids)

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

    # L'intero importo (non la quota netta) è ciò che è realmente uscito
    # dal conto del pagatore — vedi docstring di modulo.
    amount = Decimal(str(expense.amount))
    logger.debug(
        "_sync_shadow_for_expense: split_expense=%s amount=%s CASH_OUT su linked_asset=%s (payer=%s)",
        expense.pk,
        amount,
        expense.linked_asset_id,
        payer_user_id,
    )
    sync_shadow_tx(
        ShadowTxSpec(
            source_field="source_split_expense",
            source_instance=expense,
            asset_id=expense.linked_asset_id,
            owner_id=payer_user_id,
            transaction_type=AssetTransaction.CASH_OUT,
            date=expense.date,
            amount=amount,
            # A differenza di Expense.is_verified (riconciliazione estratto
            # conto, può restare False in sospeso — vedi
            # expenses/tests/test_expenses_api.py::
            # test_unverified_expense_linked_account_does_not_affect_balance),
            # SplitExpense.is_verified (property, splitting/models.py) è
            # sempre True: nessun concetto di "in sospeso" in Split. Deve
            # restare così, altrimenti recompute_from_transactions() (che
            # filtra is_verified=True) ignorerebbe la shadow-tx e il saldo
            # non calerebbe mai.
            is_verified=expense.is_verified,
            dashboard_user_id=payer_user_id,
            dashboard_reason=DashboardSummary.REASON_TRANSACTION,
        )
    )


@receiver(post_save, sender="splitting.SplitExpense")
def sync_split_expense_to_asset(sender, instance, **kwargs):
    _sync_shadow_for_expense(instance)


@receiver(pre_delete, sender="splitting.SplitExpense")
def remove_split_expense_from_asset(sender, instance, **kwargs):
    from portfolio.ledger_sync import remove_shadow_tx
    from portfolio.models import DashboardSummary

    remove_shadow_tx(
        "source_split_expense",
        instance,
        dashboard_reason=DashboardSummary.REASON_TRANSACTION,
    )


# ── SplitSettlement → shadow-tx (piano sez. 1.6/4) ──────────────────────────
#
# A differenza di SplitExpense, un settlement non ha una fase "shares scritte
# dopo" da attendere: payer/payee/amount/linked_asset vivono tutti sulla riga
# stessa, nota fin dal primo post_save — un semplice @receiver(post_save)
# basta, nessuna chiamata esplicita analoga a apply_split_shares() è
# necessaria qui.


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
    from portfolio.ledger_sync import (
        ShadowTxSpec,
        _cleanup_stale_shadow_tx,
        _refresh_assets_by_id,
        sync_shadow_tx,
    )
    from portfolio.models import AssetTransaction, DashboardSummary

    # Cleanup della shadow stale sempre per primo — mirror dell'ordine
    # originale (_cleanup_old_shadow_split_settlement_tx girava
    # incondizionatamente prima di ogni altro controllo).
    affected_ids = _cleanup_stale_shadow_tx(
        "source_split_settlement", settlement, settlement.linked_asset_id
    )
    if affected_ids:
        _refresh_assets_by_id(affected_ids)

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

    amount = Decimal(str(settlement.amount))
    logger.debug(
        "_sync_shadow_for_settlement: settlement=%s amount=%s → %s su linked_asset=%s "
        "(acting_user=%s)",
        settlement.pk,
        amount,
        direction,
        settlement.linked_asset_id,
        acting_user_id,
    )
    sync_shadow_tx(
        ShadowTxSpec(
            source_field="source_split_settlement",
            source_instance=settlement,
            asset_id=settlement.linked_asset_id,
            owner_id=acting_user_id,
            transaction_type=direction,
            date=settlement.date,
            amount=amount,
            # Come per SplitExpense: un settlement non ha un concetto di
            # "in sospeso", va sempre verified fin da subito (vedi
            # SplitSettlement.is_verified, splitting/models.py).
            is_verified=settlement.is_verified,
            dashboard_user_id=acting_user_id,
            dashboard_reason=DashboardSummary.REASON_TRANSACTION,
        )
    )


@receiver(post_save, sender="splitting.SplitSettlement")
def sync_split_settlement_to_asset(sender, instance, **kwargs):
    _sync_shadow_for_settlement(instance)


@receiver(pre_delete, sender="splitting.SplitSettlement")
def remove_split_settlement_from_asset(sender, instance, **kwargs):
    """Mirror di remove_split_expense_from_asset, per SplitSettlement."""
    from portfolio.ledger_sync import remove_shadow_tx
    from portfolio.models import DashboardSummary

    remove_shadow_tx(
        "source_split_settlement",
        instance,
        dashboard_reason=DashboardSummary.REASON_TRANSACTION,
    )
