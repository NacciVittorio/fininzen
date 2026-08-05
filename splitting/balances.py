"""
splitting/balances.py — Calcolo saldi e semplificazione debiti Split (piano
sez. 3.2/3.3).

`compute_balances` è puro: nessuna query implicita oltre a quelle sui
queryset passati dal chiamante. Usata per il saldo di UN gruppo
(`splitting/views/groups.py::SplitGroupViewSet.balances`/`.simplify`) — un
libro mastro condiviso dove ogni membro vede lo stesso saldo assoluto altrui,
esattamente come la pagina di un gruppo su Splitwise.

`compute_relative_balances` calcola invece il saldo *pairwise*, relativo a
UNA identità (positivo = l'altra persona deve soldi a lei; negativo = lei
deve soldi all'altra persona) — usata solo dal saldo complessivo cross-gruppo
di una persona (`splitting/views/balances.py::SplitBalancesOverviewView`),
dove sommare i saldi assoluti di `compute_balances` darebbe sempre zero (è un
libro mastro a somma zero) e il segno di ciascuna riga non sarebbe comunque
interpretabile "rispetto a me".
"""

from collections import defaultdict
from decimal import Decimal

from .services import _display_name_for, _q2


def _identity_key(user_id, contact_id):
    """Chiave di correlazione per i saldi: ("user", id) per un partecipante
    registrato (identità globale, coerente cross-gruppo), ("contact", id) per
    un contatto locale (rubrica del suo creatore) — vedi piano sez. 1.4."""
    if user_id:
        return ("user", user_id)
    return ("contact", contact_id)


def compute_balances(share_qs, settlement_qs=None):
    """Calcola il saldo netto per identità a partire da `share_qs` e,
    opzionalmente, `settlement_qs` (piano sez. 3.2).

    Positivo = ti devono soldi; negativo = devi soldi. Chiave di ogni riga
    del dict ritornato: `_identity_key(...)`.

    Ogni share aggiunge (expense.amount - share_amount) al pagatore (ha
    anticipato l'intero importo, gli spetta indietro il resto) e sottrae
    share_amount a ciascun altro partecipante (deve la propria quota). Ogni
    settlement sposta `amount` dal pagatore (il suo debito si riduce, quindi
    balances[payer] += amount) al beneficiario (il suo credito si riduce,
    balances[payee] -= amount) — un settlement che salda esattamente il
    debito residuo riporta entrambe le identità a zero.

    `settlement_qs=None` (o un iterable vuoto) salta il blocco settlement
    senza errori — utile per i chiamanti che vogliono il saldo "lordo" (solo
    spese, nessun pagamento già registrato).
    """
    balances = defaultdict(Decimal)
    for share in share_qs.select_related("participant", "expense"):
        key = _identity_key(share.participant.user_id, share.participant.contact_id)
        balances[key] += (
            (share.expense.amount - share.share_amount)
            if share.is_payer
            else -share.share_amount
        )
    if settlement_qs is not None:
        for settlement in settlement_qs:
            balances[
                _identity_key(settlement.payer_user_id, settlement.payer_contact_id)
            ] += settlement.amount
            balances[
                _identity_key(settlement.payee_user_id, settlement.payee_contact_id)
            ] -= settlement.amount
    return {k: _q2(v) for k, v in balances.items() if v != 0}


def compute_relative_balances(me_user_id, share_qs, settlement_qs=None):
    """Calcola il saldo pairwise di ogni identità rispetto a `me_user_id`
    (piano "fix overview cross-gruppo"): positivo = l'altra identità deve
    soldi a me, negativo = io devo soldi a lei.

    A differenza di `compute_balances` (saldo assoluto per identità, valido
    per un libro mastro condiviso come un singolo gruppo), qui contano solo
    le relazioni dirette pagatore↔non-pagatore che coinvolgono `me_user_id`:
    se il pagatore di una spesa sono io, ogni altro partecipante mi deve la
    propria quota; se il pagatore è un altro e io ho una quota in quella
    spesa, devo la mia quota a lui. Due partecipanti entrambi non-pagatori
    nella stessa spesa (un terzo ha pagato) non hanno alcuna relazione
    diretta tra loro da quella spesa — stessa logica dei saldi "per amico" di
    Splitwise. Per questo `share_qs` va raggruppato per spesa invece che
    processato riga per riga come in `compute_balances`.

    I settlement contano solo se `me_user_id` è payer o payee diretto:
    `settlement_qs` può includere (per via dello scope "gruppi a cui ho
    accesso" dei chiamanti) settlement tra due ALTRE identità, che qui
    vengono ignorati perché non toccano il mio saldo con nessuno.
    """
    me_key = ("user", me_user_id)
    balances = defaultdict(Decimal)

    shares_by_expense = defaultdict(list)
    for share in share_qs.select_related("participant", "expense"):
        shares_by_expense[share.expense_id].append(share)

    for shares in shares_by_expense.values():
        payer_share = next((s for s in shares if s.is_payer), None)
        if payer_share is None:
            continue
        payer_key = _identity_key(
            payer_share.participant.user_id, payer_share.participant.contact_id
        )
        if payer_key == me_key:
            for share in shares:
                if share.is_payer:
                    continue
                other_key = _identity_key(
                    share.participant.user_id, share.participant.contact_id
                )
                balances[other_key] += share.share_amount
        else:
            my_share = next(
                (
                    s
                    for s in shares
                    if not s.is_payer
                    and _identity_key(s.participant.user_id, s.participant.contact_id)
                    == me_key
                ),
                None,
            )
            if my_share is not None:
                balances[payer_key] -= my_share.share_amount

    if settlement_qs is not None:
        for settlement in settlement_qs:
            payer_key = _identity_key(
                settlement.payer_user_id, settlement.payer_contact_id
            )
            payee_key = _identity_key(
                settlement.payee_user_id, settlement.payee_contact_id
            )
            if payer_key == me_key:
                balances[payee_key] += settlement.amount
            elif payee_key == me_key:
                balances[payer_key] -= settlement.amount

    return {k: _q2(v) for k, v in balances.items() if v != 0}


def simplify_debts(balances):
    """Semplificazione debiti greedy debtor/creditor (piano sez. 3.3).

    Ordina creditori e debitori per importo decrescente e appaia sempre il
    debitore più esposto con il creditore più esposto, così ogni transazione
    azzera almeno uno dei due lati — al massimo n-1 transazioni per n
    identità con saldo non nullo (mai di più: ogni passo del ciclo fa
    avanzare almeno uno dei due indici `i`/`j`).
    """
    creditors = sorted(
        ([k, v] for k, v in balances.items() if v > 0), key=lambda x: -x[1]
    )
    debtors = sorted(
        ([k, -v] for k, v in balances.items() if v < 0), key=lambda x: -x[1]
    )
    transactions = []
    i = j = 0
    while i < len(debtors) and j < len(creditors):
        pay = _q2(min(debtors[i][1], creditors[j][1]))
        if pay > 0:
            transactions.append(
                {"from": debtors[i][0], "to": creditors[j][0], "amount": pay}
            )
        debtors[i][1] -= pay
        creditors[j][1] -= pay
        if debtors[i][1] <= 0:
            i += 1
        if creditors[j][1] <= 0:
            j += 1
    return transactions


def _resolve_identities(identity_keys):
    """Risolve un iterable di `("user"|"contact", id)` in un dict
    `key -> info` JSON-friendly (nome/email/colore), con lookup in bulk
    (niente N+1) — helper condiviso da `serialize_balances` e
    `serialize_simplified_transactions`."""
    from django.contrib.auth.models import User

    from .models import SplitContact

    keys = list(identity_keys)
    user_ids = [ident_id for kind, ident_id in keys if kind == "user"]
    contact_ids = [ident_id for kind, ident_id in keys if kind == "contact"]
    users_by_id = User.objects.in_bulk(user_ids)
    contacts_by_id = SplitContact.objects.in_bulk(contact_ids)

    resolved = {}
    for kind, ident_id in keys:
        if kind == "user":
            user = users_by_id.get(ident_id)
            resolved[(kind, ident_id)] = {
                "user_id": ident_id,
                "contact_id": None,
                "display_name": _display_name_for(user) if user else None,
                "email": user.email if user else None,
                "color": None,
            }
        else:
            contact = contacts_by_id.get(ident_id)
            resolved[(kind, ident_id)] = {
                "user_id": None,
                "contact_id": ident_id,
                "display_name": contact.display_name if contact else None,
                "email": None,
                "color": contact.color if contact else "#8e8e8e",
            }
    return resolved


def serialize_balances(balances):
    """Risolve {("user"|"contact", id): Decimal} in una lista di dict
    JSON-friendly con informazioni identificative leggibili (nome/email).
    Ordinata creditori-prima (stesso criterio di `simplify_debts`: chi deve
    ricevere di più in cima)."""
    identities = _resolve_identities(balances.keys())
    entries = [
        {**identities[key], "balance": str(amount)} for key, amount in balances.items()
    ]
    entries.sort(key=lambda e: Decimal(e["balance"]), reverse=True)
    return entries


def serialize_simplified_transactions(transactions):
    """Risolve l'output di `simplify_debts` (chiavi `("user"|"contact", id)`
    per `from`/`to`) in dict JSON-friendly con le stesse info identificative
    di `serialize_balances`, per l'endpoint GET .../simplify/ (piano sez. 6)."""
    keys = set()
    for tx in transactions:
        keys.add(tx["from"])
        keys.add(tx["to"])
    identities = _resolve_identities(keys)
    return [
        {
            "from": identities[tx["from"]],
            "to": identities[tx["to"]],
            "amount": str(tx["amount"]),
        }
        for tx in transactions
    ]
