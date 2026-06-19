"""
Regression tests for security hardening fixes.

#43 — IDOR: BudgetViewSet.create category lookup without owner check
#40 — IDOR: CategoryViewSet.destroy reassign targets not validated
AUDIT-2026-05-21 H7 — reset endpoint requires server-side confirm body
"""

import pytest
from django.contrib.auth.models import User
from expenses.models import Category, Expense


@pytest.fixture
def other_user(db):
    return User.objects.create_user(
        username="other@test.com", email="other@test.com", password="Pass!123abc"
    )


@pytest.fixture
def other_cat(other_user):
    return Category.objects.create(
        name="OtherFood", category_type=Category.EXPENSE, owner=other_user
    )


@pytest.fixture
def own_cat(test_user):
    return Category.objects.create(
        name="MyFood", category_type=Category.EXPENSE, owner=test_user
    )


@pytest.fixture
def own_sub(own_cat, test_user):
    return Category.objects.create(
        name="MySub", category_type=Category.EXPENSE, owner=test_user, parent=own_cat
    )


@pytest.fixture
def own_expense(own_cat, test_user):
    return Expense.objects.create(
        description="Lunch",
        amount="10.00",
        category=own_cat,
        date="2025-01-01",
        owner=test_user,
    )


# ── #43 IDOR budget category ──────────────────────────────────────────────────


def test_budget_create_rejects_other_users_category(client, other_cat):
    """Budget creation must 404 when category belongs to another user."""
    res = client.post(
        "/api/expenses/budgets/",
        data={"category": other_cat.id, "amount": "100.00"},
        content_type="application/json",
    )
    assert res.status_code == 404


def test_budget_create_accepts_own_category(client, own_cat):
    """Budget creation succeeds for own category."""
    res = client.post(
        "/api/expenses/budgets/",
        data={"category": own_cat.id, "amount": "100.00"},
        content_type="application/json",
    )
    assert res.status_code == 201


def test_expense_create_rejects_other_users_category(client, other_cat):
    res = client.post(
        "/api/expenses/",
        data={
            "description": "Cross tenant",
            "category": other_cat.id,
            "amount": "10.00",
            "date": "2026-01-01",
        },
        content_type="application/json",
    )
    assert res.status_code == 400


def test_expense_create_rejects_non_positive_amount(client, own_cat):
    res = client.post(
        "/api/expenses/",
        data={
            "description": "Invalid amount",
            "category": own_cat.id,
            "amount": "-10.00",
            "date": "2026-01-01",
        },
        content_type="application/json",
    )
    assert res.status_code == 400


# ── #40 IDOR category reassign ────────────────────────────────────────────────


def test_category_destroy_rejects_reassign_subs_to_other(
    client, own_cat, own_sub, other_cat
):
    """Reassigning subcategories to another user's category must return 400."""
    res = client.delete(
        f"/api/expenses/categories/{own_cat.id}/",
        data={
            "subs_action": "reassign",
            "reassign_subs_to": other_cat.id,
            "expenses_action": "delete",
        },
        content_type="application/json",
    )
    assert res.status_code == 400
    # category must still exist (transaction rolled back / guard triggered)
    assert Category.objects.filter(pk=own_cat.id).exists()


def test_category_destroy_rejects_reassign_expenses_to_other(
    client, own_cat, own_expense, other_cat
):
    """Reassigning expenses to another user's category must return 400."""
    res = client.delete(
        f"/api/expenses/categories/{own_cat.id}/",
        data={
            "subs_action": "null",
            "expenses_action": "reassign",
            "reassign_expenses_to": other_cat.id,
        },
        content_type="application/json",
    )
    assert res.status_code == 400
    assert Category.objects.filter(pk=own_cat.id).exists()


# ── AUDIT H7 — reset confirmation guard ───────────────────────────────────────


def test_expenses_reset_without_confirm_returns_400(client, own_expense):
    """POST /api/expenses/reset/ without {"confirm": true} must 400 and keep data."""
    res = client.post("/api/expenses/reset/")
    assert res.status_code == 400
    assert res.json().get("error") == "missing_confirmation"
    assert Expense.objects.filter(pk=own_expense.id).exists()


def test_expenses_reset_with_wrong_confirm_value_returns_400(client, own_expense):
    """confirm must be the literal boolean true, not "true" string or 1."""
    for bad in ("true", 1, "yes", False, None):
        res = client.post(
            "/api/expenses/reset/",
            data={"confirm": bad},
            content_type="application/json",
        )
        assert res.status_code == 400, f"confirm={bad!r} should be rejected"
    assert Expense.objects.filter(pk=own_expense.id).exists()


def test_expenses_reset_with_confirm_true_deletes(client, own_expense):
    res = client.post(
        "/api/expenses/reset/",
        data={"confirm": True},
        content_type="application/json",
    )
    assert res.status_code == 200
    assert not Expense.objects.filter(pk=own_expense.id).exists()


def test_expenses_reset_is_rate_limited(client, own_expense):
    for _ in range(5):
        res = client.post("/api/expenses/reset/")
        assert res.status_code == 400

    res = client.post("/api/expenses/reset/")
    assert res.status_code == 429
    assert Expense.objects.filter(pk=own_expense.id).exists()


def test_category_destroy_reassign_to_own_category_succeeds(
    client, own_cat, own_sub, own_expense
):
    """Reassigning to own category must succeed."""
    target = Category.objects.create(
        name="Target", category_type=Category.EXPENSE, owner=own_cat.owner
    )
    res = client.delete(
        f"/api/expenses/categories/{own_cat.id}/",
        data={
            "subs_action": "reassign",
            "reassign_subs_to": target.id,
            "expenses_action": "reassign",
            "reassign_expenses_to": target.id,
        },
        content_type="application/json",
    )
    assert res.status_code == 204
    assert not Category.objects.filter(pk=own_cat.id).exists()
    own_sub.refresh_from_db()
    assert own_sub.parent_id == target.id
