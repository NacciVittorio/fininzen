"""
splitting/allocations.py — Allocazione derivata SplitSettlement↔SplitExpenseShare
(piano Batch 3, modello A2): risponde a "questa spesa è saldata al Y%?".

Mirror di splitting/balances.py per struttura, ma con uno scopo diverso e
complementare: `compute_balances` resta l'UNICA fonte di verità sul saldo
netto aggregato tra due identità — un SplitSettlement salda quel debito
netto, non una spesa specifica (nessuna FK spesa↔settlement: vincolo
architetturale voluto, stile Splitwise). Questo modulo costruisce invece un
layer di REPORTING DERIVATO che stima, con un algoritmo FIFO per data spesa
(non proporzionale — più intuitivo, nessun arrotondamento distribuito,
deterministico), quali shares un dato settlement ha verosimilmente saldato —
mai riletto per calcolare un saldo, solo per mostrare "saldato al Y%" su una
spesa (SplitExpenseSerializer.settlement_progress).

`rebuild_allocations_for_directed_pair` è un FULL REBUILD idempotente:
cancella e ricrea sempre da zero tutte le allocazioni della coppia
direzionale (debtor_key → creditor_key) passata, mai un update incrementale —
più semplice da ragionare, insensibile all'ordine di chiamata (vedi
`backfill_split_allocations`, che si appoggia esattamente su questa proprietà
per essere idempotente per costruzione). È il trigger usato quando la
struttura sottostante cambia davvero (spesa modificata/cancellata, gruppo
cancellato, backfill).

`allocate_new_settlement` è invece un passo FIFO INCREMENTALE, usato solo
alla creazione di un nuovo SplitSettlement (vedi il suo docstring per la
deviazione accettata rispetto a un rebuild completo).

Scope in due passate, mirror di come compute_balances è già chiamato nei due
contesti esistenti (piano sez. 3.2 — group-scoped in
SplitGroupViewSet.balances/.simplify, cross-gruppo in
SplitBalancesOverviewView): (1) i settlement di ciascun gruppo dove la coppia
ha un settlement consumano SOLO le shares aperte di quel gruppo; (2) i
settlement cross-gruppo (group=None) consumano poi TUTTE le shares ancora
aperte per la coppia, in qualunque gruppo o spesa occasionale. Ogni passo
rilegge il residuo aperto di una share (e di un settlement) dal DB
(share_amount - sum(allocazioni esistenti)), mai da uno stato in-memory del
passo precedente — così le due passate, e dentro la stessa passata ogni
settlement, non possono mai allocare due volte la stessa share.
"""

from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum

from .balances import _identity_key
from .services import _q2


def _identity_filter(prefix, key):
    """Q(**{prefix+"user_id": id}) o Q(**{prefix+"contact_id": id}) a seconda
    del kind di `key` (vedi _identity_key) — stesso helper usato sia per
    SplitExpenseShare.participant__ sia per i campi payer_/payee_ diretti di
    SplitSettlement."""
    kind, ident_id = key
    field = "user_id" if kind == "user" else "contact_id"
    return Q(**{f"{prefix}{field}": ident_id})


def _identity_pairs_for_share(share):
    """Dato una share NON-payer, ritorna (debtor_key, creditor_key) dove il
    creditore è l'identità del pagatore della stessa spesa. None se la spesa
    non ha (più) un pagatore risolvibile — difensivo, non dovrebbe accadere
    dato il vincolo `uniq_split_expense_single_payer`."""
    payer_share = (
        share.expense.shares.filter(is_payer=True).select_related("participant").first()
    )
    if payer_share is None:
        return None
    debtor_key = _identity_key(share.participant.user_id, share.participant.contact_id)
    creditor_key = _identity_key(
        payer_share.participant.user_id, payer_share.participant.contact_id
    )
    return debtor_key, creditor_key


def _shares_owed_between(debtor_key, creditor_key):
    """Tutte le SplitExpenseShare (is_payer=False) dove `debtor_key` deve
    soldi a `creditor_key` — cioè le shares di `debtor_key` sulle spese il
    cui pagatore è `creditor_key`."""
    from .models import SplitExpenseShare

    creditor_expense_ids = (
        SplitExpenseShare.objects.filter(is_payer=True)
        .filter(_identity_filter("participant__", creditor_key))
        .values_list("expense_id", flat=True)
        .distinct()
    )
    return SplitExpenseShare.objects.filter(
        is_payer=False, expense_id__in=creditor_expense_ids
    ).filter(_identity_filter("participant__", debtor_key))


def _settlement_pair_q(debtor_key, creditor_key):
    """Settlement dove `debtor_key` è il payer e `creditor_key` il payee —
    compute_balances: payer.balance += amount (il suo debito si riduce), cioè
    `payer_*` è sempre chi DEVE soldi."""
    return _identity_filter("payer_", debtor_key) & _identity_filter(
        "payee_", creditor_key
    )


def _open_share_amount(share):
    allocated = share.allocations.aggregate(total=Sum("amount"))["total"] or Decimal(
        "0"
    )
    return _q2(share.share_amount - allocated)


def _remaining_settlement_amount(settlement):
    allocated = settlement.allocations.aggregate(total=Sum("amount"))[
        "total"
    ] or Decimal("0")
    return _q2(settlement.amount - allocated)


def _consume_fifo(settlements, shares):
    """Consuma, per ogni settlement (nell'ordine ricevuto), il proprio
    residuo (letto dal DB, non l'amount nominale — vedi
    `_remaining_settlement_amount`) sulle shares aperte (nell'ordine
    ricevuto) finché non si esaurisce l'uno o l'altro — un solo
    SplitSettlementAllocation per coppia (settlement, share), mai frazionato
    su più righe."""
    from .models import SplitSettlementAllocation

    shares = list(shares)
    for settlement in settlements:
        remaining = _remaining_settlement_amount(settlement)
        if remaining <= 0:
            continue
        for share in shares:
            if remaining <= 0:
                break
            open_amount = _open_share_amount(share)
            if open_amount <= 0:
                continue
            take = _q2(min(remaining, open_amount))
            if take <= 0:
                continue
            SplitSettlementAllocation.objects.create(
                settlement=settlement, share=share, amount=take
            )
            remaining -= take


def rebuild_allocations_for_directed_pair(debtor_key, creditor_key):
    """Full rebuild idempotente delle allocazioni tra `debtor_key` (chi deve)
    e `creditor_key` (chi riceve) — vedi docstring di modulo.

    Va richiamata dentro la transazione atomica del chiamante, MAI con un
    lock proprio: se chiamata da apply_split_shares (che ha già preso
    select_for_update() sulla spesa), un secondo select_for_update() qui
    rischierebbe un deadlock su PostgreSQL (SQLite lo ignora comunque). Le
    UniqueConstraint/CheckConstraint su SplitSettlementAllocation bastano a
    rendere sicura la sola INSERT concorrente nel caso raro di due rebuild
    sovrapposti sulla stessa coppia.
    """
    from .models import SplitSettlement, SplitSettlementAllocation

    settlement_q = _settlement_pair_q(debtor_key, creditor_key)

    with transaction.atomic():
        SplitSettlementAllocation.objects.filter(
            settlement__in=SplitSettlement.objects.filter(settlement_q)
        ).delete()

        share_qs = _shares_owed_between(debtor_key, creditor_key)

        # Passo 1: un settlement scoped a un gruppo consuma SOLO le shares
        # aperte di QUEL gruppo — mirror di come SplitGroupViewSet.balances
        # scopa share_qs/settlement_qs a un solo gruppo.
        group_ids = sorted(
            SplitSettlement.objects.filter(settlement_q, group__isnull=False)
            .values_list("group_id", flat=True)
            .distinct()
        )
        for group_id in group_ids:
            group_settlements = SplitSettlement.objects.filter(
                settlement_q, group_id=group_id
            ).order_by("date", "created_at", "id")
            group_shares = share_qs.filter(expense__group_id=group_id).order_by(
                "expense__date", "expense_id"
            )
            _consume_fifo(group_settlements, group_shares)

        # Passo 2: i settlement cross-gruppo (group=None) consumano poi TUTTE
        # le shares ancora aperte per la coppia — mirror di
        # SplitBalancesOverviewView, che non scopa a un solo gruppo.
        cross_settlements = SplitSettlement.objects.filter(
            settlement_q, group__isnull=True
        ).order_by("date", "created_at", "id")
        _consume_fifo(
            cross_settlements, share_qs.order_by("expense__date", "expense_id")
        )


def allocate_new_settlement(settlement):
    """Passo FIFO INCREMENTALE per un SINGOLO settlement appena creato (mai
    un full rebuild): consuma il residuo di `settlement` sulle shares aperte
    ATTUALI della coppia, nello scope giusto (solo il proprio gruppo se
    `settlement.group_id`, altrimenti tutte le shares ancora aperte per la
    coppia) — senza toccare le allocazioni già esistenti di altri settlement.
    Richiamata da SplitSettlementSerializer.create(), dentro la stessa
    transazione atomica della create.

    DEVIAZIONE volutamente accettata: essendo incrementale (non un rebuild da
    zero), è l'ordine di CREAZIONE dei settlement — non la loro `date` — a
    decidere quali shares un dato settlement trova ancora aperte quando più
    settlement della stessa coppia si contendono le stesse shares. Un
    `rebuild_allocations_for_directed_pair` esplicito (edit/cancellazione
    spesa, cancellazione gruppo, backfill) resta l'unico modo per riallineare
    tutto da zero in ordine di data quando serve davvero — qui l'obiettivo è
    solo evitare di ricostruire l'intera coppia a ogni singolo pagamento
    registrato.
    """
    debtor_key = _identity_key(settlement.payer_user_id, settlement.payer_contact_id)
    creditor_key = _identity_key(settlement.payee_user_id, settlement.payee_contact_id)

    share_qs = _shares_owed_between(debtor_key, creditor_key)
    if settlement.group_id:
        share_qs = share_qs.filter(expense__group_id=settlement.group_id)
    share_qs = share_qs.order_by("expense__date", "expense_id")

    with transaction.atomic():
        _consume_fifo([settlement], share_qs)
