import json

from django.core.management.base import BaseCommand

from ...models import SplitRecurringExpense
from ...services import backfill_recurring_split_expense


class Command(BaseCommand):
    help = "Generate missing SplitExpense occurrences for active SplitRecurringExpenses. Intended for cron/systemd timers."

    def handle(self, *args, **options):
        created_total = 0
        skipped_total = 0
        recurrings = SplitRecurringExpense.objects.filter(
            status=SplitRecurringExpense.STATUS_ACTIVE,
            is_active=True,
        )
        for rec in recurrings:
            result = backfill_recurring_split_expense(rec)
            created_total += result["created"]
            skipped_total += result["skipped"]

        self.stdout.write(
            json.dumps(
                {"created": created_total, "skipped": skipped_total},
                sort_keys=True,
            )
        )
