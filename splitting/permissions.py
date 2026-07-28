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
    return group.created_by_id == user.id or SplitParticipant.objects.filter(
        group=group, user=user, is_active=True
    ).exists()


def user_can_access_expense(user, expense) -> bool:
    if expense.created_by_id == user.id:
        return True
    if expense.group_id:
        return user_can_access_group(user, expense.group)
    return SplitParticipant.objects.filter(
        standalone_expense=expense, user=user
    ).exists()


def user_can_access_settlement(user, settlement) -> bool:
    """Un settlement è visibile a chi l'ha creato, a chi ne è parte
    (payer_user/payee_user) o a chi ha accesso al gruppo a cui è agganciato —
    stesso perimetro di user_can_access_expense (piano sez. 0.2/6)."""
    if settlement.created_by_id == user.id:
        return True
    if settlement.payer_user_id == user.id or settlement.payee_user_id == user.id:
        return True
    if settlement.group_id:
        return user_can_access_group(user, settlement.group)
    return False
