from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.db import migrations, models
import django.core.validators


Q2 = Decimal("0.01")


def _q2(value):
    return Decimal(value).quantize(Q2, rounding=ROUND_HALF_UP)


def backfill_cash_amount(apps, schema_editor):
    AssetTransaction = apps.get_model("portfolio", "AssetTransaction")
    rows = AssetTransaction.objects.filter(transaction_type__in=("buy", "sell"))
    changed = []
    for tx in rows.iterator(chunk_size=500):
        gross = Decimal(tx.shares or 0) * Decimal(tx.price_per_share or 0)
        fee = Decimal(tx.fee or 0)
        tax = Decimal(tx.tax_amount or 0)
        if tx.transaction_type == "buy":
            tx.cash_amount = _q2(gross + fee)
            trade_gross = tx.cash_amount - fee
        else:
            tx.cash_amount = _q2(gross - fee - tax)
            trade_gross = tx.cash_amount + fee + tax

        # Keep the historical EUR snapshot coherent with the new native cash
        # snapshot wherever a transaction already has a frozen FX rate.
        if tx.fx_rate_to_eur is not None:
            rate = Decimal(tx.fx_rate_to_eur)
            tx.gross_amount_eur = _q2(trade_gross * rate)
            tx.fee_eur = _q2(fee * rate)
            tx.tax_amount_eur = _q2(tax * rate)
        changed.append(tx)
        if len(changed) >= 500:
            AssetTransaction.objects.bulk_update(
                changed,
                [
                    "cash_amount",
                    "gross_amount_eur",
                    "fee_eur",
                    "tax_amount_eur",
                ],
            )
            changed = []
    if changed:
        AssetTransaction.objects.bulk_update(
            changed,
            ["cash_amount", "gross_amount_eur", "fee_eur", "tax_amount_eur"],
        )

    Asset = apps.get_model("portfolio", "Asset")
    for asset in Asset.objects.filter(tracking_type="AUTO").iterator(chunk_size=100):
        running_shares = Decimal("0")
        running_cost = Decimal("0")
        running_cost_eur = Decimal("0")
        eur_complete = True
        txs = AssetTransaction.objects.filter(
            asset_id=asset.pk,
            date__lte=date.today(),
            is_verified=True,
        ).order_by("date", "created_at", "pk")
        for tx in txs:
            if tx.transaction_type == "buy":
                running_shares += Decimal(tx.shares)
                running_cost += Decimal(tx.cash_amount or 0)
                if (asset.currency or "EUR").upper() == "EUR":
                    running_cost_eur += Decimal(tx.cash_amount or 0)
                elif tx.gross_amount_eur is None:
                    eur_complete = False
                elif eur_complete:
                    running_cost_eur += Decimal(tx.gross_amount_eur) + Decimal(
                        tx.fee_eur or 0
                    )
            elif tx.transaction_type == "sell" and running_shares > 0:
                sold = min(Decimal(tx.shares), running_shares)
                ratio = sold / running_shares
                running_cost -= running_cost * ratio
                if eur_complete:
                    running_cost_eur -= running_cost_eur * ratio
                running_shares -= sold
        asset.shares = max(running_shares, Decimal("0"))
        asset.invested_capital = _q2(max(running_cost, Decimal("0")))
        asset.invested_capital_eur = (
            _q2(max(running_cost_eur, Decimal("0"))) if eur_complete else None
        )
        if asset.price_per_share and asset.shares > 0:
            asset.current_value = _q2(asset.shares * asset.price_per_share)
        elif asset.shares == 0:
            asset.current_value = Decimal("0")
        else:
            asset.current_value = asset.invested_capital
        asset.save(
            update_fields=[
                "shares",
                "invested_capital",
                "invested_capital_eur",
                "current_value",
            ]
        )


class Migration(migrations.Migration):
    dependencies = [
        ("portfolio", "0049_assettransaction_source_split_settlement_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="assettransaction",
            name="cash_amount",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                max_digits=15,
                null=True,
                validators=[django.core.validators.MinValueValidator(Decimal("0"))],
            ),
        ),
        migrations.RunPython(backfill_cash_amount, migrations.RunPython.noop),
    ]
