"""
splitting/permissions.py — Autorizzazione basata su membership per Split.

`ViewAsMixin`/`_effective_user()` (fininzen/mixins.py) risolvono una delega
owner→grantee a senso unico ("View As"); qui la relazione è tra pari
(co-titolarità di dati condivisi), concettualmente diversa. Le view di Split
usano quindi sempre `request.user` reale, con questo layer dedicato invece
del mixin (vedi piano sez. 0.2).
"""

from .models import SplitParticipant


def user_can_access_group(user, group) -> bool:
    return (
        group.created_by_id == user.id
        or SplitParticipant.objects.filter(
            group=group, user=user, is_active=True
        ).exists()
    )


def user_can_access_expense(user, expense) -> bool:
    if expense.group_id:
        # Piano Batch 4.5: a GROUP expense's creator does NOT get an
        # unconditional created_by shortcut here — their edit/delete rights
        # over it end the moment they're no longer an active member of the
        # group, same as anyone else ("removed means removed", not
        # indefinite access to whatever they made before leaving). Access
        # is entirely governed by group membership.
        return user_can_access_group(user, expense.group)
    if expense.created_by_id == user.id:
        return True
    return SplitParticipant.objects.filter(
        standalone_expense=expense, user=user
    ).exists()


def user_can_access_settlement(user, settlement) -> bool:
    """Un settlement è visibile a chi ne è parte diretta (payer_user/
    payee_user — un fatto su di loro, indipendente dallo stato di
    membership), a chi ha accesso al gruppo a cui è agganciato, o
    (solo per un settlement cross-gruppo, mai per uno di gruppo — piano
    Batch 4.5) a chi l'ha creato."""
    if settlement.payer_user_id == user.id or settlement.payee_user_id == user.id:
        return True
    if settlement.group_id:
        return user_can_access_group(user, settlement.group)
    return settlement.created_by_id == user.id


def user_can_modify_expense(user, expense) -> bool:
    """Scrittura (update/partial_update/destroy) su una spesa collegata a un
    conto reale (piano A4b): ristretta al pagatore o a chi l'ha creata,
    NON più a qualunque membro attivo del gruppo come per la lettura — un
    membro non-pagatore non deve poter alterare il saldo tracciato del conto
    di qualcun altro. Nessuna restrizione aggiuntiva quando linked_asset è
    assente (comportamento identico a user_can_access_expense).

    Nota: un pagatore RIMOSSO dal gruppo (is_active=False) mantiene comunque
    il diritto di modificare le proprie spese passate con conto collegato —
    asimmetria voluta rispetto alla lettura, dove "removed means removed" è
    la regola (vedi user_can_access_group/il commento in
    user_can_access_expense). Qui il criterio è "di chi è il conto reale
    toccato", non lo stato di membership.
    """
    if not expense.linked_asset_id:
        return True
    payer_share = (
        expense.shares.filter(is_payer=True).select_related("participant").first()
    )
    payer_user_id = payer_share.participant.user_id if payer_share else None
    if payer_user_id is not None and payer_user_id == user.id:
        return True
    return expense.created_by_id == user.id


def user_can_modify_settlement(user, settlement) -> bool:
    """Scrittura (solo destroy: un settlement non ha update, vedi
    SplitSettlementViewSet) su un settlement collegato a un conto reale
    (piano A4b): ristretta a created_by, SOLO quando linked_asset è
    impostato — deliberatamente NON payer_user genericamente: created_by è
    garantito (validazione serializer) coincidere con payer_user O
    payee_user, ed è sempre l'identità il cui conto reale viene toccato
    dalla shadow-tx (vedi splitting/signals.py::_sync_shadow_for_settlement:
    la direzione CASH_OUT/CASH_IN dipende dal confronto created_by vs
    payer/payee_user).
    """
    if not settlement.linked_asset_id:
        return True
    if settlement.created_by_id is None:
        return True
    return settlement.created_by_id == user.id
