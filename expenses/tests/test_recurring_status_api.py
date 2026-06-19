"""Feature H — Recurring Overview Widget.

GET /api/expenses/recurring/status/ returns, for every active recurring
template, whether the target month's Expense has already been generated or is
still pending. Mirrors the skip-logic of generate_recurring_expenses() so the
status row and the eventual `Generate` POST never disagree.
"""

import pytest
from datetime import date

from django.test import Client

from expenses.models import Category, Expense, RecurringExpense


@pytest.fixture
def client(test_user):
    c = Client()
    c.force_login(test_user)
    return c


@pytest.fixture
def cat(test_user):
    return Category.objects.create(name="Rent", owner=test_user)


def _make_recurring(test_user, cat, **overrides):
    payload = {
        "description": "Rent",
        "amount": "900.00",
        "category": cat,
        "day_of_month": 5,
        "start_date": date(2026, 1, 1),
        "is_active": True,
        "status": RecurringExpense.STATUS_ACTIVE,
        "owner": test_user,
    }
    payload.update(overrides)
    return RecurringExpense.objects.create(**payload)


def test_status_empty_returns_zero_items(client):
    res = client.get("/api/expenses/recurring/status/?month=5&year=2026")
    assert res.status_code == 200
    data = res.json()
    assert data["items"] == []
    assert data["summary"] == {"generated": 0, "pending": 0, "total": 0}


def test_status_pending_when_no_expense_yet(client, test_user, cat):
    _make_recurring(test_user, cat)
    res = client.get("/api/expenses/recurring/status/?month=5&year=2026")
    data = res.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["status"] == "pending"
    assert data["summary"] == {"generated": 0, "pending": 1, "total": 1}


def test_status_generated_when_matching_expense_exists(client, test_user, cat):
    rec = _make_recurring(test_user, cat)
    Expense.objects.create(
        description=rec.description,
        amount=rec.amount,
        category=cat,
        date=date(2026, 5, rec.day_of_month),
        owner=test_user,
        recurring_source=rec,
        recurring_occurrence_date=date(2026, 5, rec.day_of_month),
    )
    res = client.get("/api/expenses/recurring/status/?month=5&year=2026")
    data = res.json()
    assert data["items"][0]["status"] == "generated"
    assert data["summary"] == {"generated": 1, "pending": 0, "total": 1}


def test_status_mixed_counts(client, test_user, cat):
    rec_paid = _make_recurring(test_user, cat, description="Rent")
    _make_recurring(test_user, cat, description="Gym", amount="40.00", day_of_month=10)
    Expense.objects.create(
        description=rec_paid.description,
        amount=rec_paid.amount,
        category=cat,
        date=date(2026, 5, rec_paid.day_of_month),
        owner=test_user,
        recurring_source=rec_paid,
        recurring_occurrence_date=date(2026, 5, rec_paid.day_of_month),
    )
    res = client.get("/api/expenses/recurring/status/?month=5&year=2026")
    data = res.json()
    assert data["summary"] == {"generated": 1, "pending": 1, "total": 2}


def test_status_ignores_inactive_recurring(client, test_user, cat):
    _make_recurring(test_user, cat, is_active=False)
    res = client.get("/api/expenses/recurring/status/?month=5&year=2026")
    assert res.json()["summary"]["total"] == 0


def test_status_owner_scoped(client, test_user, cat, django_user_model):
    other = django_user_model.objects.create_user(username="other", password="x")
    other_cat = Category.objects.create(name="Other rent", owner=other)
    _make_recurring(other, other_cat, description="Other rent")
    res = client.get("/api/expenses/recurring/status/?month=5&year=2026")
    assert res.json()["summary"]["total"] == 0


def test_status_rejects_invalid_month(client):
    res = client.get("/api/expenses/recurring/status/?month=13&year=2026")
    assert res.status_code == 400
