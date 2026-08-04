from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.utils import timezone

from splitting.models import (
    SplitExpense,
    SplitRecurringExpense,
    SplitRecurringExpenseParticipant,
)


def _active_recurring(group, payer_participant, test_user, *, today, days_ago=40):
    rec = SplitRecurringExpense.objects.create(
        group=group,
        description="Affitto",
        amount="900.00",
        split_method=SplitRecurringExpense.EQUAL,
        day_of_month=today.day,
        start_date=today - timedelta(days=days_ago),
        is_active=True,
        status=SplitRecurringExpense.STATUS_ACTIVE,
        created_by=test_user,
    )
    SplitRecurringExpenseParticipant.objects.create(
        recurring=rec, participant=payer_participant, is_payer=True
    )
    return rec


def test_command_generates_missing_occurrence_for_active_recurring(
    client, split_group_with_two_users, test_user
):
    group, owner_p, _member_p = split_group_with_two_users
    today = timezone.localdate()
    rec = _active_recurring(group, owner_p, test_user, today=today)

    call_command("generate_split_recurring_expenses")

    assert SplitExpense.objects.filter(
        recurring_source=rec, recurring_occurrence_date=today
    ).exists()


def test_command_is_idempotent(client, split_group_with_two_users, test_user):
    group, owner_p, _member_p = split_group_with_two_users
    today = timezone.localdate()
    rec = _active_recurring(group, owner_p, test_user, today=today)

    call_command("generate_split_recurring_expenses")
    out = StringIO()
    call_command("generate_split_recurring_expenses", stdout=out)

    assert (
        SplitExpense.objects.filter(
            recurring_source=rec, recurring_occurrence_date=today
        ).count()
        == 1
    )
    assert '"created": 0' in out.getvalue()


def test_command_skips_disabled_recurring(
    client, split_group_with_two_users, test_user
):
    group, owner_p, _member_p = split_group_with_two_users
    today = timezone.localdate()
    rec = SplitRecurringExpense.objects.create(
        group=group,
        description="Palestra",
        amount="30.00",
        split_method=SplitRecurringExpense.EQUAL,
        day_of_month=today.day,
        start_date=today - timedelta(days=40),
        is_active=False,
        status=SplitRecurringExpense.STATUS_DISABLED,
        created_by=test_user,
    )
    SplitRecurringExpenseParticipant.objects.create(
        recurring=rec, participant=owner_p, is_payer=True
    )

    call_command("generate_split_recurring_expenses")

    assert not SplitExpense.objects.filter(recurring_source=rec).exists()
