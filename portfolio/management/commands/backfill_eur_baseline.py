from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q

from portfolio.models import Asset, DashboardSummary
from portfolio.services import (
    _recompute_asset_locked,
    _refresh_manual_asset_strict,
    invalidate_dashboard_summary,
)


class Command(BaseCommand):
    help = (
        "Backfill the EUR baseline (current_value_eur / invested_capital_eur) for "
        "assets the 0029 migration nulled out — the non-EUR assets whose old values "
        "came from the removed 1:1 FX fallback. Recomputes each from its transactions "
        "(live rate for current_value_eur, historical FX for invested_capital_eur). "
        "Idempotent; dry-run by default. Run `repair_fx_history --apply` first so the "
        "historical rates needed for invested_capital_eur are present in FXRateHistory; "
        "without them invested_capital_eur stays NULL (eur_complete=False)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Persist recomputed EUR baselines and invalidate dashboard cache",
        )
        parser.add_argument(
            "--user",
            type=int,
            default=None,
            help="Limit the backfill to a single user id",
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        user_id = options["user"]

        qs = Asset.objects.select_related("owner", "investment_type").filter(
            Q(current_value_eur__isnull=True) | Q(invested_capital_eur__isnull=True)
        )
        if user_id is not None:
            User = get_user_model()
            if not User.objects.filter(pk=user_id).exists():
                raise CommandError(f"user {user_id} not found")
            qs = qs.filter(owner_id=user_id)

        assets = list(qs.order_by("owner_id", "id"))
        owners = {asset.owner for asset in assets if asset.owner_id}

        if not apply_changes:
            manual_count = sum(
                1 for asset in assets if asset.tracking_type == Asset.MANUAL
            )
            self.stdout.write(
                f"Would backfill {len(assets)} assets with a missing EUR baseline "
                f"({manual_count} manual, {len(assets) - manual_count} auto) "
                f"and invalidate {len(owners)} dashboard summaries."
            )
            return

        processed = 0
        manual_rebuilt = 0
        still_incomplete = 0
        for asset in assets:
            if asset.tracking_type == Asset.MANUAL:
                _refresh_manual_asset_strict(asset)
                manual_rebuilt += 1
            else:
                _recompute_asset_locked(asset)
            processed += 1

            asset.refresh_from_db(fields=["current_value_eur", "invested_capital_eur"])
            incomplete = (
                asset.current_value_eur is None or asset.invested_capital_eur is None
            )
            if incomplete:
                still_incomplete += 1
            self.stdout.write(
                f"asset {asset.pk} '{asset.name}' [{asset.currency or 'EUR'}]: "
                f"current_value_eur={asset.current_value_eur} "
                f"invested_capital_eur={asset.invested_capital_eur}"
                f"{' (still incomplete: missing FX history)' if incomplete else ''}"
            )

        for owner in owners:
            invalidate_dashboard_summary(
                DashboardSummary.REASON_TRANSACTION,
                user=owner,
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Backfilled {processed} assets "
                f"({manual_rebuilt} manual, {processed - manual_rebuilt} auto), "
                f"{still_incomplete} still incomplete (missing FX history), "
                f"invalidated {len(owners)} summaries."
            )
        )
