# Generated for SaaS tenant hardening and transaction accounting snapshots.

from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import migrations, models


OWNER_REQUIRED_MODELS = [
    "InvestmentType",
    "ContributionSource",
    "Asset",
    "AssetContributionSource",
    "AssetTransaction",
    "AssetPriceHistory",
    "RecurringInvestmentPlan",
    "PortfolioSnapshot",
    "FXRateHistory",
    "AllocationTarget",
    "DashboardSummary",
    "FireSettings",
]


def purge_orphan_investment_types(apps, schema_editor):
    investment_type = apps.get_model("portfolio", "InvestmentType")
    investment_type.objects.filter(
        owner__isnull=True,
        assets__isnull=True,
        allocation_targets__isnull=True,
    ).delete()


def assert_no_ownerless_rows(apps, schema_editor):
    offenders = []
    for model_name in OWNER_REQUIRED_MODELS:
        model = apps.get_model("portfolio", model_name)
        count = model.objects.filter(owner__isnull=True).count()
        if count:
            offenders.append(f"{model_name}={count}")
    if offenders:
        raise RuntimeError(
            "Cannot require portfolio tenant ownership while ownerless rows exist: "
            + ", ".join(offenders)
            + ". Assign or purge these rows before applying this migration."
        )


def backfill_asset_tax(apps, schema_editor):
    asset = apps.get_model("portfolio", "Asset")
    crypto_names = ("crypto", "bitcoin", "btc", "ethereum", "eth")
    for row in asset.objects.select_related("investment_type").all():
        type_name = (row.investment_type.name if row.investment_type_id else "") or ""
        asset_name = row.name or ""
        haystack = f"{type_name} {asset_name}".lower()
        row.tax = (
            "CRYPTO" if any(token in haystack for token in crypto_names) else "CMP"
        )
        row.save(update_fields=["tax"])


class Migration(migrations.Migration):
    dependencies = [
        ("portfolio", "0045_asset_asset_active_by_owner_idx_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RunPython(purge_orphan_investment_types, migrations.RunPython.noop),
        migrations.RunPython(assert_no_ownerless_rows, migrations.RunPython.noop),
        migrations.AddField(
            model_name="asset",
            name="tax",
            field=models.CharField(
                choices=[
                    ("CMP", "Costo medio ponderato"),
                    ("CRYPTO", "Crypto FIFO"),
                ],
                default="CMP",
                max_length=12,
            ),
        ),
        migrations.RunPython(backfill_asset_tax, migrations.RunPython.noop),
        migrations.AddField(
            model_name="assettransaction",
            name="fee_eur",
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=15, null=True
            ),
        ),
        migrations.AddField(
            model_name="assettransaction",
            name="fx_rate_to_eur",
            field=models.DecimalField(
                blank=True,
                decimal_places=8,
                max_digits=18,
                null=True,
                validators=[MinValueValidator(Decimal("0"))],
            ),
        ),
        migrations.AddField(
            model_name="assettransaction",
            name="gross_amount_eur",
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=15, null=True
            ),
        ),
        migrations.AddField(
            model_name="assettransaction",
            name="tax_amount_eur",
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=15, null=True
            ),
        ),
        # NOTE: the owner FK CASCADE ALTERs that previously lived here moved to
        # 0047. Deleting orphan InvestmentType rows above queues deferred FK
        # trigger events on portfolio_investmenttype; PostgreSQL then rejects
        # ALTER TABLE on that table in the same transaction. A separate migration
        # commits the purge first, clearing the trigger queue.
    ]
