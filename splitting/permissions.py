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
