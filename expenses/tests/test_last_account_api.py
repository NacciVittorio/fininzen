import pytest

from expenses.models import Category, Expense
from portfolio.models import Asset, InvestmentType


@pytest.fixture
def bank_accounts(test_user):
    bank_type = InvestmentType.objects.create(
        name="Bank",
        supports_ticker=False,
        is_bank_account=True,
        owner=test_user,
    )
    a = Asset.objects.create(
        name="Account A",
        tracking_type=Asset.MANUAL,
        investment_type=bank_type,
        owner=test_user,
    )
    b = Asset.objects.create(
        name="Account B",
        tracking_type=Asset.MANUAL,
        investment_type=bank_type,
        owner=test_user,
    )
    return a, b


def test_last_account_returns_most_recent_account_for_category(
    client, test_user, bank_accounts
):
    a, b = bank_accounts
    cat = Category.objects.create(
        name="Food", category_type=Category.EXPENSE, owner=test_user
    )
    Expense.objects.create(
        description="old",
        amount="10.00",
        category=cat,
        date="2026-01-01",
        linked_asset=a,
        owner=test_user,
    )
    Expense.objects.create(
        description="recent",
        amount="20.00",
        category=cat,
        date="2026-02-01",
        linked_asset=b,
        owner=test_user,
    )

    res = client.get(f"/api/expenses/last-account/?category={cat.id}")

    assert res.status_code == 200
    assert res.json() == {"linked_asset": b.id}


def test_last_account_null_when_no_history(client, test_user):
    cat = Category.objects.create(
        name="Travel", category_type=Category.EXPENSE, owner=test_user
    )
    res = client.get(f"/api/expenses/last-account/?category={cat.id}")

    assert res.status_code == 200
    assert res.json() == {"linked_asset": None}


def test_last_account_ignores_expenses_without_account(
    client, test_user, bank_accounts
):
    a, _ = bank_accounts
    cat = Category.objects.create(
        name="Bills", category_type=Category.EXPENSE, owner=test_user
    )
    # Most recent has no account → should fall back to the older one that does.
    Expense.objects.create(
        description="with account",
        amount="10.00",
        category=cat,
        date="2026-01-01",
        linked_asset=a,
        owner=test_user,
    )
    Expense.objects.create(
        description="no account",
        amount="20.00",
        category=cat,
        date="2026-02-01",
        owner=test_user,
    )

    res = client.get(f"/api/expenses/last-account/?category={cat.id}")

    assert res.status_code == 200
    assert res.json() == {"linked_asset": a.id}


def test_last_account_requires_category_param(client, test_user):
    res = client.get("/api/expenses/last-account/")

    assert res.status_code == 200
    assert res.json() == {"linked_asset": None}
