from datetime import date, timedelta

from django.core.management.base import BaseCommand, CommandError

from portfolio.fx import fetch_historical_exchange_rate
from portfolio.models import Asset, AssetTransaction, FXRateHistory


class Command(BaseCommand):
    help = "Fetch and persist historical EUR rates required by portfolio transactions."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply", action="store_true", help="Persist fetched rates"
        )
        parser.add_argument("--from-date", type=date.fromisoformat, default=None)

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        from_date = options["from_date"]
        required = set()
        assets = Asset.objects.exclude(currency__in=("", "EUR")).exclude(
            currency__isnull=True
        )
        for asset in assets.select_related("owner"):
            if not asset.owner_id:
                continue
            currency = "GBP" if asset.currency in ("GBp", "GBX") else asset.currency
            tx_dates = AssetTransaction.objects.filter(asset=asset).values_list(
                "date", flat=True
            )
            for day in tx_dates:
                if from_date and day < from_date:
                    continue
                required.add((asset.owner_id, currency, day))

        failed = []
        created = 0
        for owner_id, currency, day in sorted(required):
            if FXRateHistory.objects.filter(
                owner_id=owner_id,
                from_currency=currency,
                to_currency="EUR",
                date__range=(day - timedelta(days=7), day),
            ).exists():
                continue
            rate = fetch_historical_exchange_rate(currency, day)
            if rate is None:
                failed.append(f"{currency}@{day}")
                continue
            if apply_changes:
                FXRateHistory.objects.update_or_create(
                    owner_id=owner_id,
                    from_currency=currency,
                    to_currency="EUR",
                    date=day,
                    defaults={"rate": rate},
                )
            created += 1
        verb = "Persisted" if apply_changes else "Would persist"
        self.stdout.write(f"{verb} {created} FX rates.")
        if failed:
            raise CommandError("Missing FX rates: " + ", ".join(failed[:20]))
