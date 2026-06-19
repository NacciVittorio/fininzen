from datetime import date, timedelta

from django.contrib.auth.models import User
from django.test import Client
from django.utils import timezone

from expenses.models import Category, Expense, RecurringExpense
from portfolio.models import Asset, InvestmentType


def test_create_recurring_requires_start_date(client, expense_cat):
    res = client.post(
        "/api/expenses/recurring/",
        data={
            "description": "Spotify",
            "amount": "9.99",
            "category": expense_cat.id,
            "day_of_month": 15,
            "is_active": True,
        },
        content_type="application/json",
    )
    assert res.status_code == 400
    assert "start_date" in res.json()


def test_create_recurring_accepts_future_start_date(client, expense_cat):
    future = (timezone.localdate() + timedelta(days=10)).isoformat()
    res = client.post(
        "/api/expenses/recurring/",
        data={
            "description": "Spotify",
            "amount": "9.99",
            "category": expense_cat.id,
            "day_of_month": 15,
            "start_date": future,
            "is_active": True,
        },
        content_type="application/json",
    )
    assert res.status_code == 201
    assert RecurringExpense.objects.filter(description="Spotify").exists()


def test_create_recurring_rejects_past_end_date(client, expense_cat):
    past = (timezone.localdate() - timedelta(days=1)).isoformat()
    res = client.post(
        "/api/expenses/recurring/",
        data={
            "description": "Spotify",
            "amount": "9.99",
            "category": expense_cat.id,
            "day_of_month": 15,
            "start_date": timezone.localdate().isoformat(),
            "end_date": past,
            "is_active": True,
        },
        content_type="application/json",
    )
    assert res.status_code == 400
    assert "end_date" in res.json()


def test_delete_recurring_is_soft_delete_and_keeps_history(
    client, recurring, test_user
):
    Expense.objects.create(
        description=recurring.description,
        amount=recurring.amount,
        category=recurring.category,
        date=date(2026, 5, 1),
        owner=test_user,
        recurring_source=recurring,
        recurring_occurrence_date=date(2026, 5, 1),
    )
    res = client.delete(f"/api/expenses/recurring/{recurring.id}/")
    assert res.status_code == 204
    recurring.refresh_from_db()
    assert recurring.status == RecurringExpense.STATUS_DELETED
    assert recurring.is_active is False
    assert Expense.objects.filter(recurring_source=recurring).count() == 1


def test_enable_disable_endpoints(client, recurring):
    res_disable = client.post(f"/api/expenses/recurring/{recurring.id}/disable/")
    assert res_disable.status_code == 200
    recurring.refresh_from_db()
    assert recurring.status == RecurringExpense.STATUS_DISABLED
    assert recurring.is_active is False

    res_enable = client.post(f"/api/expenses/recurring/{recurring.id}/enable/")
    assert res_enable.status_code == 200
    recurring.refresh_from_db()
    assert recurring.status == RecurringExpense.STATUS_ACTIVE
    assert recurring.is_active is True


def test_auto_disable_when_end_date_is_yesterday(client, recurring):
    recurring.end_date = timezone.localdate() - timedelta(days=1)
    recurring.save(update_fields=["end_date"])
    res = client.get("/api/expenses/recurring/")
    assert res.status_code == 200
    recurring.refresh_from_db()
    assert recurring.status == RecurringExpense.STATUS_DISABLED
    assert recurring.is_active is False


def test_generate_idempotent_and_uses_recurrence_dedup(client, recurring):
    res1 = client.post(
        "/api/expenses/recurring/generate/",
        data={"month": 3, "year": 2026},
        content_type="application/json",
    )
    res2 = client.post(
        "/api/expenses/recurring/generate/",
        data={"month": 3, "year": 2026},
        content_type="application/json",
    )
    assert res1.status_code == 200
    assert res2.status_code == 200
    assert res2.json()["created"] == 0
    assert (
        Expense.objects.filter(
            recurring_source=recurring,
            recurring_occurrence_date=date(2026, 3, 1),
        ).count()
        == 1
    )


def test_yearly_recurring_generates_only_in_configured_month(client, expense_cat):
    rec = RecurringExpense.objects.create(
        description="Insurance",
        amount="480.00",
        category=expense_cat,
        frequency=RecurringExpense.FREQUENCY_YEARLY,
        month_of_year=6,
        day_of_month=15,
        start_date="2026-01-01",
        is_active=True,
        status=RecurringExpense.STATUS_ACTIVE,
        owner=expense_cat.owner,
    )

    may = client.post(
        "/api/expenses/recurring/generate/",
        data={"month": 5, "year": 2026},
        content_type="application/json",
    )
    june = client.post(
        "/api/expenses/recurring/generate/",
        data={"month": 6, "year": 2026},
        content_type="application/json",
    )
    june_again = client.post(
        "/api/expenses/recurring/generate/",
        data={"month": 6, "year": 2026},
        content_type="application/json",
    )

    assert may.status_code == 200
    assert may.json()["created"] == 0
    assert june.status_code == 200
    assert june.json()["created"] == 1
    assert june_again.json()["created"] == 0
    assert (
        Expense.objects.filter(
            recurring_source=rec,
            recurring_occurrence_date=date(2026, 6, 15),
        ).count()
        == 1
    )


def test_backfill_creates_missing_past_months(client, test_user, expense_cat):
    res = client.post(
        "/api/expenses/recurring/",
        data={
            "description": "Rent",
            "amount": "1000.00",
            "category": expense_cat.id,
            "day_of_month": 10,
            "start_date": "2026-01-10",
            "is_active": True,
        },
        content_type="application/json",
    )
    assert res.status_code == 201
    rec = RecurringExpense.objects.get(id=res.json()["id"])
    assert Expense.objects.filter(
        recurring_source=rec, recurring_occurrence_date=date(2026, 1, 10)
    ).exists()


def test_linked_account_is_propagated_on_generated_expense(
    client, test_user, expense_cat
):
    inv_type = InvestmentType.objects.create(
        name="Bank Account",
        owner=test_user,
        is_bank_account=True,
        supports_ticker=False,
        is_liquid_default=True,
    )
    account = Asset.objects.create(
        name="Main account",
        owner=test_user,
        tracking_type=Asset.MANUAL,
        investment_type=inv_type,
        is_liquid=True,
    )
    rec = RecurringExpense.objects.create(
        description="Insurance",
        amount="90.00",
        category=expense_cat,
        day_of_month=5,
        start_date=date(2026, 1, 1),
        linked_asset=account,
        is_active=True,
        status=RecurringExpense.STATUS_ACTIVE,
        owner=test_user,
    )
    res = client.post(
        "/api/expenses/recurring/generate/",
        data={"month": 4, "year": 2026},
        content_type="application/json",
    )
    assert res.status_code == 200
    exp = Expense.objects.get(
        recurring_source=rec,
        recurring_occurrence_date=date(2026, 4, 5),
    )
    assert exp.linked_asset_id == account.id


def test_generate_dedup_is_scoped_per_owner(db, test_user, expense_cat):
    other_user = User.objects.create_user(
        username="other2", email="other2@test.com", password="otherpass"
    )
    other_cat = Category.objects.create(
        name="Food", category_type=Category.EXPENSE, owner=other_user
    )
    RecurringExpense.objects.create(
        description="Netflix",
        amount="15.99",
        category=expense_cat,
        day_of_month=1,
        start_date=date(2026, 1, 1),
        is_active=True,
        status=RecurringExpense.STATUS_ACTIVE,
        owner=test_user,
    )
    RecurringExpense.objects.create(
        description="Netflix",
        amount="15.99",
        category=other_cat,
        day_of_month=1,
        start_date=date(2026, 1, 1),
        is_active=True,
        status=RecurringExpense.STATUS_ACTIVE,
        owner=other_user,
    )

    c_a = Client()
    c_a.force_login(test_user)
    c_b = Client()
    c_b.force_login(other_user)
    assert (
        c_a.post(
            "/api/expenses/recurring/generate/",
            data={"month": 8, "year": 2026},
            content_type="application/json",
        ).status_code
        == 200
    )
    assert (
        c_b.post(
            "/api/expenses/recurring/generate/",
            data={"month": 8, "year": 2026},
            content_type="application/json",
        ).status_code
        == 200
    )
    assert (
        Expense.objects.filter(
            owner=test_user,
            recurring_occurrence_date=date(2026, 8, 1),
        ).count()
        == 1
    )
    assert (
        Expense.objects.filter(
            owner=other_user,
            recurring_occurrence_date=date(2026, 8, 1),
        ).count()
        == 1
    )
