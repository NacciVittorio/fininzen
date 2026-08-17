from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.utils import timezone

from expenses.models import Category, Expense, RecurringExpense
from expenses.services import generate_recurring_expenses
from portfolio.models import Asset, AssetTransaction, InvestmentType


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


def test_create_recurring_defaults_generation_lead_days(client, expense_cat):
    res = client.post(
        "/api/expenses/recurring/",
        data={
            "description": "Spotify",
            "amount": "9.99",
            "category": expense_cat.id,
            "day_of_month": 15,
            "start_date": timezone.localdate().isoformat(),
        },
        content_type="application/json",
    )
    assert res.status_code == 201
    assert res.json()["generation_lead_days"] == 2


def test_create_recurring_rejects_invalid_generation_lead_days(client, expense_cat):
    payload = {
        "description": "Spotify",
        "amount": "9.99",
        "category": expense_cat.id,
        "day_of_month": 15,
        "start_date": timezone.localdate().isoformat(),
    }
    for invalid in (-1, 32):
        res = client.post(
            "/api/expenses/recurring/",
            data={**payload, "generation_lead_days": invalid},
            content_type="application/json",
        )
        assert res.status_code == 400
        assert "generation_lead_days" in res.json()


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


def test_generate_idempotent_and_uses_recurrence_dedup(recurring):
    result1 = generate_recurring_expenses(recurring.owner, 2026, 3)
    result2 = generate_recurring_expenses(recurring.owner, 2026, 3)
    assert result1["created"] == 1
    assert result2["created"] == 0
    assert (
        Expense.objects.filter(
            recurring_source=recurring,
            recurring_occurrence_date=date(2026, 3, 1),
        ).count()
        == 1
    )


def test_yearly_recurring_generates_only_in_configured_month(expense_cat):
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

    may = generate_recurring_expenses(expense_cat.owner, 2026, 5)
    june = generate_recurring_expenses(expense_cat.owner, 2026, 6)
    june_again = generate_recurring_expenses(expense_cat.owner, 2026, 6)

    assert may["created"] == 0
    assert june["created"] == 1
    assert june_again["created"] == 0
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


def test_linked_account_is_propagated_on_generated_expense(test_user, expense_cat):
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
    result = generate_recurring_expenses(test_user, 2026, 4)
    assert result["created"] == 1
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

    assert generate_recurring_expenses(test_user, 2026, 8)["created"] == 1
    assert generate_recurring_expenses(other_user, 2026, 8)["created"] == 1
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


def test_manual_generate_endpoint_is_removed(client):
    res = client.post(
        "/api/expenses/recurring/generate/",
        data={"month": 8, "year": 2026},
        content_type="application/json",
    )
    assert res.status_code == 405


def test_generation_respects_lead_window_across_month_boundary(
    monkeypatch, test_user, expense_cat
):
    rec = RecurringExpense.objects.create(
        description="Rent",
        amount="900.00",
        category=expense_cat,
        day_of_month=1,
        start_date=date(2026, 1, 1),
        generation_lead_days=1,
        owner=test_user,
    )
    monkeypatch.setattr(
        "expenses.services.timezone.localdate", lambda: date(2026, 1, 30)
    )

    assert generate_recurring_expenses(test_user, 2026, 2)["created"] == 0
    rec.generation_lead_days = 2
    rec.save(update_fields=["generation_lead_days"])
    assert generate_recurring_expenses(test_user, 2026, 2)["created"] == 1


def test_changed_day_does_not_duplicate_an_existing_month(test_user, expense_cat):
    rec = RecurringExpense.objects.create(
        description="Rent",
        amount="900.00",
        category=expense_cat,
        day_of_month=5,
        start_date=date(2026, 1, 1),
        owner=test_user,
    )
    Expense.objects.create(
        description="Rent",
        amount="900.00",
        category=expense_cat,
        date=date(2026, 5, 5),
        recurring_source=rec,
        recurring_occurrence_date=date(2026, 5, 5),
        owner=test_user,
    )
    rec.day_of_month = 20
    rec.save(update_fields=["day_of_month"])

    assert generate_recurring_expenses(test_user, 2026, 5)["created"] == 0
    assert Expense.objects.filter(recurring_source=rec).count() == 1


def test_patch_can_leave_generated_expenses_unchanged(
    client, recurring, expense_cat, test_user
):
    generated = Expense.objects.create(
        description="Netflix",
        amount="15.99",
        category=expense_cat,
        date=date(2026, 5, 1),
        recurring_source=recurring,
        recurring_occurrence_date=date(2026, 5, 1),
        is_verified=True,
        owner=test_user,
    )

    res = client.patch(
        f"/api/expenses/recurring/{recurring.id}/",
        data={"amount": "19.99", "update_generated_expenses": False},
        content_type="application/json",
    )

    assert res.status_code == 200
    generated.refresh_from_db()
    assert generated.amount == Decimal("15.99")
    assert generated.date == date(2026, 5, 1)
    assert generated.is_verified is True


def test_patch_can_update_generated_data_but_preserves_dates_and_verification(
    client, recurring, expense_cat, test_user
):
    inv_type = InvestmentType.objects.create(
        name="Bank Account",
        owner=test_user,
        is_bank_account=True,
        supports_ticker=False,
        is_liquid_default=True,
    )
    old_account = Asset.objects.create(
        name="Old account",
        owner=test_user,
        tracking_type=Asset.MANUAL,
        investment_type=inv_type,
        is_liquid=True,
    )
    new_account = Asset.objects.create(
        name="New account",
        owner=test_user,
        tracking_type=Asset.MANUAL,
        investment_type=inv_type,
        is_liquid=True,
    )
    generated = Expense.objects.create(
        description="Netflix",
        amount="15.99",
        category=expense_cat,
        linked_asset=old_account,
        date=date(2026, 5, 1),
        recurring_source=recurring,
        recurring_occurrence_date=date(2026, 5, 1),
        is_verified=True,
        owner=test_user,
    )

    res = client.patch(
        f"/api/expenses/recurring/{recurring.id}/",
        data={
            "description": "Streaming",
            "amount": "19.99",
            "linked_asset": new_account.id,
            "day_of_month": 20,
            "update_generated_expenses": True,
        },
        content_type="application/json",
    )

    assert res.status_code == 200
    generated.refresh_from_db()
    assert generated.description == "Streaming"
    assert generated.amount == Decimal("19.99")
    assert generated.linked_asset == new_account
    assert generated.date == date(2026, 5, 1)
    assert generated.recurring_occurrence_date == date(2026, 5, 1)
    assert generated.is_verified is True
    shadow = AssetTransaction.objects.get(source_expense=generated)
    assert shadow.asset == new_account
    assert shadow.price_per_share == Decimal("19.99")
    assert shadow.date == date(2026, 5, 1)
    assert shadow.is_verified is True
