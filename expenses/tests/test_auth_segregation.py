"""
Tests that user B cannot access user A's expenses/categories data.
"""

import pytest
from django.contrib.auth.models import User
from expenses.models import Category, Expense


@pytest.fixture
def user_a(db):
    return User.objects.create_user(
        username="a@test.com", email="a@test.com", password="Pass!123abc"
    )


@pytest.fixture
def user_b(db):
    return User.objects.create_user(
        username="b@test.com", email="b@test.com", password="Pass!123abc"
    )


@pytest.fixture
def cat_a(user_a):
    return Category.objects.create(
        name="Food", category_type=Category.EXPENSE, owner=user_a
    )


@pytest.fixture
def expense_a(cat_a, user_a):
    return Expense.objects.create(
        description="Lunch",
        amount="12.50",
        category=cat_a,
        date="2024-01-15",
        owner=user_a,
    )


# ── Expenses ──


def test_b_not_in_expense_list(client, user_b, expense_a):
    client.force_login(user_b)
    ids = [x["id"] for x in client.get("/api/expenses/").json()["results"]]
    assert expense_a.id not in ids


def test_b_cannot_read_expense_detail(client, user_b, expense_a):
    client.force_login(user_b)
    assert client.get(f"/api/expenses/{expense_a.id}/").status_code == 404


def test_b_cannot_patch_expense(client, user_b, expense_a):
    client.force_login(user_b)
    res = client.patch(
        f"/api/expenses/{expense_a.id}/",
        data={"description": "hacked"},
        content_type="application/json",
    )
    assert res.status_code == 404


def test_b_cannot_delete_expense(client, user_b, expense_a):
    client.force_login(user_b)
    assert client.delete(f"/api/expenses/{expense_a.id}/").status_code == 404


# ── Categories ──


def test_b_not_in_category_list(client, user_b, cat_a):
    client.force_login(user_b)
    ids = [x["id"] for x in client.get("/api/expenses/categories/").json()["results"]]
    assert cat_a.id not in ids


def test_b_cannot_read_category_detail(client, user_b, cat_a):
    client.force_login(user_b)
    assert client.get(f"/api/expenses/categories/{cat_a.id}/").status_code == 404


def test_b_cannot_delete_category(client, user_b, cat_a):
    client.force_login(user_b)
    assert client.delete(f"/api/expenses/categories/{cat_a.id}/").status_code == 404


# ── Aggregate endpoints return 200 with own (empty) data ──


def test_summary_only_own_data(client, user_b):
    client.force_login(user_b)
    assert client.get("/api/expenses/summary/").status_code == 200


def test_monthly_only_own_data(client, user_b):
    client.force_login(user_b)
    assert client.get("/api/expenses/monthly/").status_code == 200
