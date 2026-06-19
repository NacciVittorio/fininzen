"""expenses/views/ — package facade per le view API di spese e cashflow.

I viewset sono nei sottomoduli (category, expense, budget, recurring,
cashflow_views) e ri-esportati qui per preservare la superficie di import
(`from expenses.views import X`). La logica di import CSV vive in
`expenses/import_csv.py`.
"""

from .helpers import _parse_import_amount, _update_expense_categories
from .category import CategoryViewSet
from .expense import ExpenseViewSet
from .budget import BudgetViewSet
from .recurring import RecurringExpenseViewSet
from .cashflow_views import CashFlowFeedView, CashFlowBulkView


__all__ = [
    "CategoryViewSet",
    "ExpenseViewSet",
    "BudgetViewSet",
    "RecurringExpenseViewSet",
    "CashFlowFeedView",
    "CashFlowBulkView",
    "_parse_import_amount",
    "_update_expense_categories",
]
