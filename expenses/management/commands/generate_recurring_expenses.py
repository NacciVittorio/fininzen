import json

from django.core.management.base import BaseCommand

from ...models import RecurringExpense
from ...services import backfill_recurring_expense


class Command(BaseCommand):
    help = "Generate missing Expense occurrences for active RecurringExpenses. Intended for cron/systemd timers."

    def handle(self, *args, **options):
        created_total = 0
        skipped_total = 0
        recurrings = RecurringExpense.objects.filter(
            status=RecurringExpense.STATUS_ACTIVE,
            is_active=True,
        )
        for rec in recurrings:
            result = backfill_recurring_expense(rec)
            created_total += result["created"]
            skipped_total += result["skipped"]

        self.stdout.write(
            json.dumps(
                {"created": created_total, "skipped": skipped_total},
                sort_keys=True,
            )
        )
