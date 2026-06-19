from decimal import Decimal

from django.db import migrations, models, transaction


OPENING_BALANCE_NOTE_PREFIX = "Opening balance correction"


def populate_opening_balances(apps, schema_editor):
    from portfolio.models import Asset as CurrentAsset
    from portfolio.prices import rebuild_manual_history

    AssetTransaction = apps.get_model("portfolio", "AssetTransaction")

    manual_assets = (
        CurrentAsset.objects.filter(
            tracking_type=CurrentAsset.MANUAL,
            investment_type__is_bank_account=True,
            is_archived=False,
        )
        .only(
            "id",
            "tracking_type",
            "investment_type",
            "is_archived",
            "opening_balance",
            "opening_balance_date",
        )
        .order_by("id")
    )

    with transaction.atomic():
        for asset in manual_assets:
            corrections = list(
                AssetTransaction.objects.filter(
                    asset_id=asset.id,
                    transaction_type="adjustment",
                    notes__startswith=OPENING_BALANCE_NOTE_PREFIX,
                ).order_by("date", "created_at")
            )
            if corrections:
                opening_balance = sum(
                    (tx.price_per_share for tx in corrections), Decimal("0")
                )
                opening_balance_date = min(tx.date for tx in corrections)
                asset.opening_balance = opening_balance
                asset.opening_balance_date = opening_balance_date
                asset.save(update_fields=["opening_balance", "opening_balance_date"])

        for asset in manual_assets:
            asset.recompute_from_transactions()
            rebuild_manual_history(asset)


class Migration(migrations.Migration):
    dependencies = [
        ("portfolio", "0038_add_unique_constraint_source_expense"),
    ]

    operations = [
        migrations.AddField(
            model_name="asset",
            name="opening_balance",
            field=models.DecimalField(
                decimal_places=2, default=Decimal("0"), max_digits=15
            ),
        ),
        migrations.AddField(
            model_name="asset",
            name="opening_balance_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.RunPython(populate_opening_balances, migrations.RunPython.noop),
    ]
