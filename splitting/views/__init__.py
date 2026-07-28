"""splitting/views/ — package facade per le view API di Split.

I viewset sono nei sottomoduli (contacts, partner_links, groups, expenses) e
ri-esportati qui per preservare la superficie di import
(`from splitting.views import X`), come in expenses/views/__init__.py.
"""

from .balances import SplitBalancesOverviewView
from .contacts import SplitContactViewSet
from .partner_links import SplitPartnerLinkViewSet
from .groups import SplitGroupViewSet
from .expenses import SplitExpenseViewSet
from .recurring import SplitRecurringExpenseViewSet
from .settlements import SplitSettlementViewSet

__all__ = [
    "SplitBalancesOverviewView",
    "SplitContactViewSet",
    "SplitPartnerLinkViewSet",
    "SplitGroupViewSet",
    "SplitExpenseViewSet",
    "SplitRecurringExpenseViewSet",
    "SplitSettlementViewSet",
]
