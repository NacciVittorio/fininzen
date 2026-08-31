from django.core.management.base import BaseCommand

from splitting.allocations import rebuild_allocations_for_directed_pair
from splitting.balances import _identity_key
from splitting.models import SplitSettlement


class Command(BaseCommand):
    help = (
        "Backfill SplitSettlementAllocation (piano Batch 3, modello A2) per ogni "
        "coppia debtor/creditor che ha almeno un SplitSettlement esistente. "
        "rebuild_allocations_for_directed_pair fa sempre un full rebuild da zero "
        "per la coppia, quindi il comando è idempotente per costruzione — "
        "rieseguirlo non cambia nulla se non c'è stato nel frattempo un nuovo "
        "settlement/una nuova spesa. Dry-run di default."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Esegue davvero il rebuild (senza, elenca solo le coppie trovate)",
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]

        pairs = set()
        rows = SplitSettlement.objects.values_list(
            "payer_user_id", "payer_contact_id", "payee_user_id", "payee_contact_id"
        ).distinct()
        for payer_user_id, payer_contact_id, payee_user_id, payee_contact_id in rows:
            debtor_key = _identity_key(payer_user_id, payer_contact_id)
            creditor_key = _identity_key(payee_user_id, payee_contact_id)
            pairs.add((debtor_key, creditor_key))

        ordered_pairs = sorted(pairs)

        if not apply_changes:
            self.stdout.write(
                f"Would rebuild allocations for {len(ordered_pairs)} coppie "
                "debtor/creditor:"
            )
            for debtor_key, creditor_key in ordered_pairs:
                self.stdout.write(f"  {debtor_key} -> {creditor_key}")
            return

        for debtor_key, creditor_key in ordered_pairs:
            rebuild_allocations_for_directed_pair(debtor_key, creditor_key)
            self.stdout.write(f"rebuilt {debtor_key} -> {creditor_key}")

        self.stdout.write(
            self.style.SUCCESS(
                f"Backfilled allocations for {len(ordered_pairs)} coppie debtor/creditor."
            )
        )
