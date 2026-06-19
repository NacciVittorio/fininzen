"""Management command: recompute by_asset_class and by_asset on existing PortfolioSnapshots.

Walks all snapshots ordered by date and reconstructs the breakdown from AssetPriceHistory
and Asset data. Useful after data imports or migrations.

Usage:
    python manage.py recompute_snapshots_breakdown                # dry run
    python manage.py recompute_snapshots_breakdown --apply
"""

import logging
from django.core.management.base import BaseCommand
from django.db import transaction
from decimal import Decimal

from portfolio.models import (
    Asset,
    AssetTransaction,
    PortfolioSnapshot,
)
from portfolio.fx import get_historical_exchange_rate

logger = logging.getLogger(__name__)


def _price_at(price_points, target_date):
    """Return the last known price at or before target_date."""
    before = None
    for d, close in price_points:
        if d <= target_date:
            before = (d, close)
        else:
            break
    return before[1] if before else None


class Command(BaseCommand):
    help = "Backfill by_asset_class and by_asset on existing PortfolioSnapshot records"

    def add_arguments(self, parser):
        parser.add_argument(
            "--limit", type=int, default=None, help="Process only latest N snapshots"
        )
        parser.add_argument(
            "--apply", action="store_true", help="Persist the reconstructed breakdown"
        )

    def handle(self, *args, **options):
        limit = options["limit"]
        apply_changes = options["apply"]
        qs = PortfolioSnapshot.objects.order_by("-snapshot_date")
        if limit:
            qs = qs[:limit]

        snapshots = list(qs)
        if not snapshots:
            self.stdout.write("No snapshots found.")
            return

        assets = list(
            Asset.objects.select_related("investment_type")
            .prefetch_related("transactions", "price_history")
            .all()
        )

        # Pre-build per-asset tx events and price history
        per_asset_tx: dict[int, list] = {}
        per_asset_prices: dict[int, list] = {}
        for a in assets:
            txs = sorted(
                (t for t in a.transactions.all() if t.is_verified),
                key=lambda t: (t.date, t.created_at),
            )
            events = []
            for tx in txs:
                if tx.transaction_type in (AssetTransaction.BUY, AssetTransaction.SELL):
                    delta = (
                        tx.shares
                        if tx.transaction_type == AssetTransaction.BUY
                        else -tx.shares
                    )
                    events.append((tx.date, delta))
            per_asset_tx[a.id] = events
            history = a.price_history.all()
            if a.has_ticker:
                history = history.filter(close__gt=0)
            per_asset_prices[a.id] = list(
                history.order_by("date").values_list("date", "close")
            )

        updated = 0
        for snap in snapshots:
            snap_date = snap.snapshot_date.date()
            by_class: dict[str, float] = {}
            by_asset_list = []

            for a in assets:
                if a.owner_id != snap.owner_id:
                    continue
                if a.has_ticker:
                    shares = Decimal("0")
                    for tx_date, delta in per_asset_tx[a.id]:
                        if tx_date <= snap_date:
                            shares += delta
                    if shares <= 0:
                        continue
                    price = _price_at(per_asset_prices[a.id], snap_date)
                    if price is None:
                        continue
                    value = (shares * price).quantize(Decimal("0.01"))
                else:
                    val = _price_at(per_asset_prices[a.id], snap_date)
                    if val is None:
                        value = (
                            Decimal(a.current_value)
                            if a.current_value
                            else Decimal("0")
                        )
                    else:
                        value = Decimal(val).quantize(Decimal("0.01"))

                rate = get_historical_exchange_rate(
                    a.currency or "EUR", snap_date, owner=snap.owner
                )
                if rate is None:
                    logger.warning(
                        "Skipping asset=%s snapshot=%s: FX unavailable for %s",
                        a.pk,
                        snap.pk,
                        a.currency,
                    )
                    continue
                value = (value * rate).quantize(Decimal("0.01"))
                type_id = str(a.investment_type_id) if a.investment_type_id else "null"
                by_class[type_id] = round(by_class.get(type_id, 0.0) + float(value), 2)
                by_asset_list.append(
                    {
                        "asset_id": a.id,
                        "name": a.name,
                        "type_id": a.investment_type_id,
                        "value": float(value),
                    }
                )

            snap.by_asset_class = by_class
            snap.by_asset = by_asset_list
            updated += 1

        if apply_changes:
            with transaction.atomic():
                PortfolioSnapshot.objects.bulk_update(
                    snapshots, ["by_asset_class", "by_asset"]
                )

        verb = "Updated" if apply_changes else "Would update"
        self.stdout.write(self.style.SUCCESS(f"{verb} {updated} snapshots."))
