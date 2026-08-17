from datetime import date, timedelta
from io import StringIO

from django.core.management import call_command
from django.utils import timezone

from expenses.models import Expense, RecurringExpense


def _active_recurring(expense_cat, test_user, *, today, days_ago=40):
    return RecurringExpense.objects.create(
        description="Netflix",
        amount="15.99",
        category=expense_cat,
        day_of_month=today.day,
        start_date=today - timedelta(days=days_ago),
        is_active=True,
        status=RecurringExpense.STATUS_ACTIVE,
        owner=test_user,
    )


def test_command_generates_missing_occurrence_for_active_recurring(
    db, test_user, expense_cat
):
    today = timezone.localdate()
    rec = _active_recurring(expense_cat, test_user, today=today)

    call_command("generate_recurring_expenses")

    assert Expense.objects.filter(
        recurring_source=rec, recurring_occurrence_date=today
    ).exists()


def test_command_is_idempotent(db, test_user, expense_cat):
    today = timezone.localdate()
    rec = _active_recurring(expense_cat, test_user, today=today)

    call_command("generate_recurring_expenses")
    out = StringIO()
    call_command("generate_recurring_expenses", stdout=out)

    assert (
        Expense.objects.filter(
            recurring_source=rec, recurring_occurrence_date=today
        ).count()
        == 1
    )
    assert '"created": 0' in out.getvalue()


def test_command_skips_disabled_recurring(db, test_user, expense_cat):
    today = timezone.localdate()
    rec = RecurringExpense.objects.create(
        description="Gym",
        amount="30.00",
        category=expense_cat,
        day_of_month=today.day,
        start_date=today - timedelta(days=40),
        is_active=False,
        status=RecurringExpense.STATUS_DISABLED,
        owner=test_user,
    )

    call_command("generate_recurring_expenses")

    assert not Expense.objects.filter(recurring_source=rec).exists()


def test_command_respects_each_recurring_lead_window(
    monkeypatch, db, test_user, expense_cat
):
    rec = RecurringExpense.objects.create(
        description="Rent",
        amount="900.00",
        category=expense_cat,
        day_of_month=1,
        start_date=date(2026, 1, 1),
        generation_lead_days=1,
        is_active=True,
        status=RecurringExpense.STATUS_ACTIVE,
        owner=test_user,
    )
    monkeypatch.setattr(
        "expenses.services.timezone.localdate", lambda: date(2026, 1, 30)
    )

    call_command("generate_recurring_expenses")
    assert not Expense.objects.filter(
        recurring_source=rec,
        recurring_occurrence_date=date(2026, 2, 1),
    ).exists()

    rec.generation_lead_days = 2
    rec.save(update_fields=["generation_lead_days"])
    call_command("generate_recurring_expenses")
    assert Expense.objects.filter(
        recurring_source=rec,
        recurring_occurrence_date=date(2026, 2, 1),
    ).exists()
