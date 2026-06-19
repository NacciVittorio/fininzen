import pytest
from expenses.models import Budget, Category, RecurringExpense


@pytest.fixture
def expense_cat(test_user):
    return Category.objects.create(
        name="Food", category_type=Category.EXPENSE, owner=test_user
    )


@pytest.fixture
def income_cat(test_user):
    return Category.objects.create(
        name="Salary", category_type=Category.INCOME, owner=test_user
    )


@pytest.fixture
def budget(expense_cat, test_user):
    return Budget.objects.create(category=expense_cat, amount="500.00", owner=test_user)


@pytest.fixture
def recurring(expense_cat, test_user):
    return RecurringExpense.objects.create(
        description="Netflix",
        amount="15.99",
        category=expense_cat,
        day_of_month=1,
        start_date="2026-01-01",
        is_active=True,
        status=RecurringExpense.STATUS_ACTIVE,
        owner=test_user,
    )
