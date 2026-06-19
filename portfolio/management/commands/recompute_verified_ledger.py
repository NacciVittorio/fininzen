from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from portfolio.models import Asset, DashboardSummary
from portfolio.services import (
    _recompute_asset_locked,
    _refresh_manual_asset_strict,
    invalidate_dashboard_summary,
)


class Command(BaseCommand):
    help = (
        "Recompute asset balances and manual history using only verified "
        "transactions. Dry-run by default."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Persist recomputed balances/history and invalidate dashboard cache",
        )
        parser.add_argument(
            "--user",
            type=int,
            default=None,
            help="Limit recompute to a single user id",
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        user_id = options["user"]

        qs = Asset.objects.select_related("owner", "investment_type").filter(
            is_archived=False
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
                f"Would recompute {len(assets)} assets "
                f"({manual_count} manual, {len(assets) - manual_count} auto) "
                f"and invalidate {len(owners)} dashboard summaries."
            )
            return

        recomputed = 0
        manual_rebuilt = 0
        for asset in assets:
            if asset.tracking_type == Asset.MANUAL:
                _refresh_manual_asset_strict(asset)
                manual_rebuilt += 1
            else:
                _recompute_asset_locked(asset)
            recomputed += 1

        for owner in owners:
            invalidate_dashboard_summary(
                DashboardSummary.REASON_TRANSACTION,
                user=owner,
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Recomputed {recomputed} assets, rebuilt {manual_rebuilt} "
                f"manual histories, invalidated {len(owners)} summaries."
            )
        )
