from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.auth.models import User
from django.test import Client
from django.utils import timezone

from expenses.models import Category, Expense
from fininzen.models import DataAccessGrant
from portfolio.models import Asset


def _ten_years_ago(today):
    try:
        return today.replace(year=today.year - 10)
    except ValueError:
        return today.replace(year=today.year - 10, day=28)


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
def account(test_user):
    return Asset.objects.create(
        name="Bank account",
        tracking_type=Asset.MANUAL,
        owner=test_user,
    )


def test_trends_aggregate_daily_totals_by_direction_and_account(
    client, test_user, expense_cat, income_cat, account
):
    day = timezone.localdate() - timedelta(days=1)
    Expense.objects.create(
        description="Lunch",
        amount="10.00",
        category=expense_cat,
        linked_asset=account,
        date=day,
        is_verified=True,
        owner=test_user,
    )
    Expense.objects.create(
        description="Dinner",
        amount="2.50",
        category=expense_cat,
        linked_asset=account,
        date=day,
        is_verified=True,
        owner=test_user,
    )
    Expense.objects.create(
        description="Cash",
        amount="3.00",
        category=expense_cat,
        date=day,
        is_verified=True,
        owner=test_user,
    )
    Expense.objects.create(
        description="Salary",
        amount="2500.00",
        category=income_cat,
        linked_asset=account,
        date=day,
        is_verified=True,
        owner=test_user,
    )

    res = client.get("/api/expenses/trends/")

    assert res.status_code == 200
    data = res.json()
    expenses = {
        (row["date"], row["linked_asset"]): Decimal(str(row["amount"]))
        for row in data["expenses"]
    }
    incomes = {
        (row["date"], row["linked_asset"]): Decimal(str(row["amount"]))
        for row in data["incomes"]
    }
    assert expenses == {
        (day.isoformat(), account.id): Decimal("12.50"),
        (day.isoformat(), None): Decimal("3.00"),
    }
    assert incomes == {(day.isoformat(), account.id): Decimal("2500.00")}


def test_trends_only_return_authenticated_users_data(client, test_user, expense_cat):
    other = User.objects.create_user(username="other", password="testpass123")
    other_cat = Category.objects.create(
        name="Other food", category_type=Category.EXPENSE, owner=other
    )
    day = timezone.localdate()
    Expense.objects.create(
        description="Mine",
        amount="11.00",
        category=expense_cat,
        date=day,
        is_verified=True,
        owner=test_user,
    )
    Expense.objects.create(
        description="Other",
        amount="99.00",
        category=other_cat,
        date=day,
        is_verified=True,
        owner=other,
    )

    rows = client.get("/api/expenses/trends/").json()["expenses"]

    assert [Decimal(str(row["amount"])) for row in rows] == [Decimal("11.00")]


def test_trends_honor_view_as(test_user, expense_cat):
    viewer = User.objects.create_user(username="viewer", password="testpass123")
    viewer_cat = Category.objects.create(
        name="Viewer food", category_type=Category.EXPENSE, owner=viewer
    )
    DataAccessGrant.objects.create(owner=test_user, grantee=viewer, permission="read")
    day = timezone.localdate()
    Expense.objects.create(
        description="Owner",
        amount="21.00",
        category=expense_cat,
        date=day,
        is_verified=True,
        owner=test_user,
    )
    Expense.objects.create(
        description="Viewer",
        amount="88.00",
        category=viewer_cat,
        date=day,
        is_verified=True,
        owner=viewer,
    )
    client = Client()
    client.force_login(viewer)

    rows = client.get("/api/expenses/trends/", HTTP_X_VIEW_AS=str(test_user.id)).json()[
        "expenses"
    ]

    assert [Decimal(str(row["amount"])) for row in rows] == [Decimal("21.00")]


def test_trends_use_trailing_ten_year_window(client, test_user, expense_cat):
    today = timezone.localdate()
    boundary = _ten_years_ago(today)
    for description, amount, day in (
        ("Boundary", "1.00", boundary),
        ("Too old", "2.00", boundary - timedelta(days=1)),
        ("Future", "4.00", today + timedelta(days=1)),
    ):
        Expense.objects.create(
            description=description,
            amount=amount,
            category=expense_cat,
            date=day,
            is_verified=True,
            owner=test_user,
        )

    rows = client.get("/api/expenses/trends/").json()["expenses"]

    assert rows == [{"date": boundary.isoformat(), "amount": 1.0, "linked_asset": None}]
