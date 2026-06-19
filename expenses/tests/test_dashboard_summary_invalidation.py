"""Regression tests per l'invalidazione di DashboardSummary dai signal di expenses.

Bug originale: i signal post_save / pre_delete su Expense chiamavano
invalidate_dashboard_summary(reason) senza `user`. Risultato: un ERROR + traceback
in log per ogni mutazione di Expense, e DashboardSummary che restava stale.
"""

from datetime import date
from decimal import Decimal

from expenses.models import Expense
from portfolio.models import DashboardSummary


def _summary(user):
    return DashboardSummary.objects.filter(owner=user).first()


class TestExpenseSignalInvalidatesSummary:
    def test_create_expense_invalidates(self, expense_cat, test_user):
        Expense.objects.create(
            description="Pizza",
            amount=Decimal("12.50"),
            category=expense_cat,
            date=date.today(),
            owner=test_user,
        )
        s = _summary(test_user)
        assert s is not None
        assert s.invalidated_at is not None
        assert s.last_invalidation_reason == DashboardSummary.REASON_EXPENSE_CREATED

    def test_update_expense_invalidates(self, expense_cat, test_user):
        e = Expense.objects.create(
            description="Pizza",
            amount=Decimal("12.50"),
            category=expense_cat,
            date=date.today(),
            owner=test_user,
        )
        DashboardSummary.objects.filter(owner=test_user).update(
            invalidated_at=None, last_invalidation_reason=""
        )
        e.amount = Decimal("15.00")
        e.save()
        s = _summary(test_user)
        assert s is not None
        assert s.invalidated_at is not None
        assert s.last_invalidation_reason == DashboardSummary.REASON_EXPENSE_UPDATED

    def test_delete_expense_invalidates(self, expense_cat, test_user):
        e = Expense.objects.create(
            description="Pizza",
            amount=Decimal("12.50"),
            category=expense_cat,
            date=date.today(),
            owner=test_user,
        )
        DashboardSummary.objects.filter(owner=test_user).update(
            invalidated_at=None, last_invalidation_reason=""
        )
        e.delete()
        s = _summary(test_user)
        assert s is not None
        assert s.invalidated_at is not None
        assert s.last_invalidation_reason == DashboardSummary.REASON_EXPENSE_DELETED
