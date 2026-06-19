"""Repair cached price history for one tracked asset from its configured provider."""

from datetime import date as date_cls

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from portfolio.models import Asset, AssetPriceHistory
from portfolio.prices import fetch_price_history_points
from portfolio.price_providers import looks_like_borsa_fund_identifier


class Command(BaseCommand):
    help = (
        "Compare cached prices with validated provider history for one asset. "
        "Dry-run by default; pass --apply to write updates and missing rows."
    )

    def add_arguments(self, parser):
        target = parser.add_mutually_exclusive_group(required=True)
        target.add_argument("--asset-id", type=int)
        target.add_argument(
            "--all-borsa",
            action="store_true",
            help="Repair every explicit or auto-detected Borsa Italiana fund.",
        )
        target.add_argument(
            "--all-tracked",
            action="store_true",
            help="Repair every asset with a configured provider symbol.",
        )
        parser.add_argument(
            "--from",
            dest="from_date",
            help="First date to repair (YYYY-MM-DD). Defaults to first transaction or asset creation.",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Persist changed and missing rows. Without this flag the command is read-only.",
        )
        parser.add_argument(
            "--prune",
            action="store_true",
            help="Delete cached rows missing from validated provider history. Requires --apply to write.",
        )

    def handle(self, *args, **options):
        assets = self._resolve_assets(options)
        totals = {
            "assets": len(assets),
            "ok": 0,
            "errors": 0,
            "changed": 0,
            "missing": 0,
            "stale": 0,
            "removed": 0,
        }
        for asset in assets:
            try:
                result = self._repair_asset(asset, options)
            except CommandError as exc:
                if options["asset_id"]:
                    raise
                totals["errors"] += 1
                self.stderr.write(
                    self.style.ERROR(
                        f"ERROR: asset={asset.pk} symbol={asset.price_identifier}: {exc}"
                    )
                )
                continue
            totals["ok"] += 1
            for key in ("changed", "missing", "stale", "removed"):
                totals[key] += result[key]

        mode = "APPLY" if options["apply"] else "DRY-RUN"
        self.stdout.write(
            f"SUMMARY: mode={mode} assets={totals['assets']} ok={totals['ok']} "
            f"errors={totals['errors']} changed={totals['changed']} "
            f"missing={totals['missing']} stale={totals['stale']} "
            f"removed={totals['removed']}"
        )

    def _resolve_assets(self, options):
        if options["asset_id"]:
            try:
                return [Asset.objects.get(pk=options["asset_id"])]
            except Asset.DoesNotExist as exc:
                raise CommandError(f"Asset {options['asset_id']} not found") from exc

        if options["all_tracked"]:
            return [
                asset
                for asset in Asset.objects.all().order_by("pk")
                if asset.has_ticker
            ]

        return [
            asset
            for asset in Asset.objects.all().order_by("pk")
            if asset.price_source == Asset.PRICE_SOURCE_BORSA_ITALIANA
            or (
                asset.price_source == Asset.PRICE_SOURCE_AUTO
                and looks_like_borsa_fund_identifier(asset.price_identifier)
            )
        ]

    def _repair_asset(self, asset, options):
        try:
            has_ticker = asset.has_ticker
        except Exception as exc:
            raise CommandError("invalid provider symbol") from exc
        if not has_ticker:
            raise CommandError(f"Asset {asset.pk} has no provider symbol")

        from_date = self._resolve_from_date(asset, options["from_date"])
        try:
            points, meta = fetch_price_history_points(asset, from_date)
        except Exception as exc:
            raise CommandError(f"Provider history request failed: {exc}") from exc
        if meta["status"] != "ok":
            raise CommandError(meta["message"])

        existing = {
            row.date: row
            for row in AssetPriceHistory.objects.filter(
                asset=asset, date__gte=from_date
            )
        }
        missing = []
        changed = []
        for day, close in points:
            row = existing.get(day)
            if row is None:
                missing.append(
                    AssetPriceHistory(
                        asset=asset,
                        date=day,
                        close=close,
                        owner=asset.owner,
                    )
                )
            elif row.close != close:
                row.close = close
                row.owner = asset.owner
                changed.append(row)

        provider_dates = {day for day, _close in points}
        stale = [row for day, row in existing.items() if day not in provider_dates]
        mode = "APPLY" if options["apply"] else "DRY-RUN"
        self.stdout.write(
            f"{mode}: asset={asset.pk} symbol={asset.price_identifier} "
            f"provider_rows={len(points)} changed={len(changed)} "
            f"missing={len(missing)} stale={len(stale)}"
        )
        if not options["apply"]:
            self.stdout.write(
                "No rows written. Re-run with --apply to persist changes."
            )
            return {
                "changed": len(changed),
                "missing": len(missing),
                "stale": len(stale),
                "removed": 0,
            }

        removed = 0
        with transaction.atomic():
            if changed:
                AssetPriceHistory.objects.bulk_update(changed, ["close", "owner"])
            if missing:
                AssetPriceHistory.objects.bulk_create(missing, ignore_conflicts=True)
            if options["prune"] and stale:
                removed, _details = AssetPriceHistory.objects.filter(
                    pk__in=[row.pk for row in stale]
                ).delete()
        self.stdout.write(
            self.style.SUCCESS(
                f"Updated {len(changed)} rows, inserted {len(missing)} rows, "
                f"and removed {removed} stale rows."
            )
        )
        return {
            "changed": len(changed),
            "missing": len(missing),
            "stale": len(stale),
            "removed": removed,
        }

    def _resolve_from_date(self, asset, raw_value):
        if raw_value:
            try:
                return date_cls.fromisoformat(raw_value)
            except ValueError as exc:
                raise CommandError("--from must use YYYY-MM-DD") from exc
        first_tx = asset.transactions.order_by("date").first()
        if first_tx:
            return first_tx.date
        if asset.created_at:
            return asset.created_at.date()
        return date_cls.today()
