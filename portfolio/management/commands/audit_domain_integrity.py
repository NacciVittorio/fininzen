from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import OuterRef, Q, Subquery

from expenses.models import Category, Expense
from portfolio.integrity import (
    _derived_transaction_mismatches,
    _expected_derived_child,
    _shadow_transactions_qs,
    collect_integrity_issues,
)
from portfolio.models import Asset, AssetPriceHistory, AssetTransaction
from portfolio.services import _refresh_manual_asset_strict


class Command(BaseCommand):
    help = (
        "Report domain-integrity violations; optionally repair inferable owner fields."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Repair owner fields inferable from assets",
        )

    def handle(self, *args, **options):
        if options["apply"]:
            asset_owner = Asset.objects.filter(pk=OuterRef("asset_id")).values(
                "owner_id"
            )[:1]
            AssetTransaction.objects.filter(
                owner__isnull=True, asset__owner__isnull=False
            ).update(owner_id=Subquery(asset_owner))
            AssetPriceHistory.objects.filter(
                owner__isnull=True, asset__owner__isnull=False
            ).update(owner_id=Subquery(asset_owner))
            repaired_transactions, affected_assets = self._repair_linked_transactions()
            self.stdout.write(f"transaction_repairs_applied={repaired_transactions}")
            self.stdout.write(f"repair_assets_recomputed={affected_assets}")

        issues = collect_integrity_issues()
        for key, value in issues.items():
            self.stdout.write(f"{key}={value}")
        if any(issues.values()):
            raise CommandError("Domain-integrity violations found.")
        self.stdout.write(self.style.SUCCESS("Domain integrity OK."))

    def _repair_linked_transactions(self):
        affected_asset_ids = set()
        repaired = 0

        with transaction.atomic():
            stale_qs = (
                _shadow_transactions_qs()
                .filter(
                    Q(source_expense__linked_asset__isnull=True)
                    | ~Q(source_expense__linked_asset__tracking_type=Asset.MANUAL)
                    | ~Q(
                        source_expense__linked_asset__investment_type__is_bank_account=True
                    )
                )
                .select_related("asset")
            )
            stale_rows = list(stale_qs)
            affected_asset_ids.update(
                tx.asset_id for tx in stale_rows if tx.asset_id is not None
            )
            stale_deleted = 0
            if stale_rows:
                stale_deleted, _ = AssetTransaction.objects.filter(
                    pk__in=[tx.pk for tx in stale_rows]
                ).delete()
                repaired += stale_deleted

            expenses = (
                Expense.objects.filter(
                    linked_asset__isnull=False,
                    linked_asset__tracking_type=Asset.MANUAL,
                    linked_asset__investment_type__is_bank_account=True,
                )
                .select_related("category", "linked_asset", "owner")
                .order_by("owner_id", "id")
            )
            for expense in expenses.iterator():
                tx_type = (
                    AssetTransaction.CASH_IN
                    if expense.category
                    and expense.category.category_type == Category.INCOME
                    else AssetTransaction.CASH_OUT
                )
                defaults = {
                    "asset": expense.linked_asset,
                    "owner": expense.owner,
                    "transaction_type": tx_type,
                    "date": expense.date,
                    "shares": Decimal("1"),
                    "price_per_share": expense.amount,
                    "is_verified": expense.is_verified,
                }
                shadow = AssetTransaction.objects.filter(source_expense=expense).first()
                if shadow is None:
                    AssetTransaction.objects.create(
                        source_expense=expense,
                        **defaults,
                    )
                    affected_asset_ids.add(expense.linked_asset_id)
                    repaired += 1
                    continue

                changed = False
                old_asset_id = shadow.asset_id
                if shadow.asset_id != expense.linked_asset_id:
                    shadow.asset = expense.linked_asset
                    if old_asset_id:
                        affected_asset_ids.add(old_asset_id)
                    affected_asset_ids.add(expense.linked_asset_id)
                    changed = True
                if shadow.owner_id != expense.owner_id:
                    shadow.owner = expense.owner
                    changed = True
                if shadow.transaction_type != tx_type:
                    shadow.transaction_type = tx_type
                    changed = True
                if shadow.date != expense.date:
                    shadow.date = expense.date
                    changed = True
                if shadow.shares != Decimal("1"):
                    shadow.shares = Decimal("1")
                    changed = True
                if shadow.price_per_share != expense.amount:
                    shadow.price_per_share = expense.amount
                    changed = True
                if shadow.is_verified != expense.is_verified:
                    shadow.is_verified = expense.is_verified
                    changed = True
                if changed:
                    affected_asset_ids.add(shadow.asset_id)
                    shadow.save(
                        update_fields=[
                            "asset",
                            "owner",
                            "transaction_type",
                            "date",
                            "shares",
                            "price_per_share",
                            "is_verified",
                        ]
                    )
                    repaired += 1

            for child in _derived_transaction_mismatches():
                parent = child.derived_from
                expected_type, expected_amount = _expected_derived_child(
                    parent, child.derived_kind
                )
                if expected_type is None:
                    affected_asset_ids.add(child.asset_id)
                    child.delete()
                    repaired += 1
                    continue

                changed = False
                if child.transaction_type != expected_type:
                    child.transaction_type = expected_type
                    changed = True
                if child.owner_id != parent.owner_id:
                    child.owner = parent.owner
                    changed = True
                if child.date != parent.date:
                    child.date = parent.date
                    changed = True
                if child.shares != Decimal("1"):
                    child.shares = Decimal("1")
                    changed = True
                if child.price_per_share != expected_amount:
                    child.price_per_share = expected_amount
                    changed = True
                if child.is_verified != parent.is_verified:
                    child.is_verified = parent.is_verified
                    changed = True
                if changed:
                    affected_asset_ids.add(child.asset_id)
                    child.save(
                        update_fields=[
                            "transaction_type",
                            "owner",
                            "date",
                            "shares",
                            "price_per_share",
                            "is_verified",
                        ]
                    )
                    repaired += 1

        recomputed = 0
        for asset in Asset.objects.filter(pk__in=affected_asset_ids):
            _refresh_manual_asset_strict(asset)
            recomputed += 1
        return repaired, recomputed
