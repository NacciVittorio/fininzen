from decimal import Decimal, ROUND_HALF_UP

from django.db import migrations


Q2 = Decimal("0.01")


def q2(value):
    return Decimal(value or 0).quantize(Q2, rounding=ROUND_HALF_UP)


def asset_tax_rate(asset):
    if asset.tax_rate_override is not None:
        return Decimal(asset.tax_rate_override or 0)
    inv_type = getattr(asset, "investment_type", None)
    return Decimal(getattr(inv_type, "tax_rate", 0) or 0)


def tax_cost_basis_for_sell(AssetTransaction, asset, sell_tx):
    previous = (
        AssetTransaction.objects.filter(
            asset_id=asset.pk,
            date__lte=sell_tx.date,
            is_verified=True,
        )
        .exclude(pk=sell_tx.pk)
        .order_by("date", "created_at", "pk")
    )
    running_shares = Decimal("0")
    running_tax_cost = Decimal("0")
    for tx in previous:
        if tx.transaction_type == "buy":
            running_shares += Decimal(tx.shares or 0)
            running_tax_cost += Decimal(tx.shares or 0) * Decimal(
                tx.price_per_share or 0
            )
            running_tax_cost += Decimal(tx.fee or 0)
        elif tx.transaction_type == "sell" and running_shares > 0:
            avg_tax_cost = running_tax_cost / running_shares
            sold = min(Decimal(tx.shares or 0), running_shares)
            running_tax_cost -= sold * avg_tax_cost
            running_shares -= sold
    if running_shares <= 0:
        return Decimal("0")
    sold = min(Decimal(sell_tx.shares or 0), running_shares)
    return sold * (running_tax_cost / running_shares)


def recompute_realized_sell_taxes(apps, schema_editor):
    AssetTransaction = apps.get_model("portfolio", "AssetTransaction")
    sells = (
        AssetTransaction.objects.filter(
            transaction_type="sell",
            is_verified=True,
        )
        .select_related("asset", "asset__investment_type")
        .order_by("asset_id", "date", "created_at", "pk")
    )
    for sell_tx in sells.iterator():
        gross = Decimal(sell_tx.shares or 0) * Decimal(sell_tx.price_per_share or 0)
        cost_basis = tax_cost_basis_for_sell(AssetTransaction, sell_tx.asset, sell_tx)
        taxable = max(gross - cost_basis - Decimal(sell_tx.fee or 0), Decimal("0"))
        tax_amount = q2(taxable * asset_tax_rate(sell_tx.asset))
        if q2(sell_tx.tax_amount) != tax_amount:
            sell_tx.tax_amount = tax_amount
            sell_tx.save(update_fields=["tax_amount"])
        tax_child = AssetTransaction.objects.filter(
            derived_from_id=sell_tx.pk,
            derived_kind="tax",
        ).first()
        if tax_child:
            tax_child.transaction_type = "cash_out"
            tax_child.shares = Decimal("1")
            tax_child.price_per_share = tax_amount
            tax_child.date = sell_tx.date
            tax_child.is_verified = sell_tx.is_verified
            tax_child.owner_id = sell_tx.owner_id
            tax_child.save(
                update_fields=[
                    "transaction_type",
                    "shares",
                    "price_per_share",
                    "date",
                    "is_verified",
                    "owner",
                ]
            )


class Migration(migrations.Migration):
    dependencies = [
        ("portfolio", "0041_fee_tax_realized_transactions"),
    ]

    operations = [
        migrations.RunPython(recompute_realized_sell_taxes, migrations.RunPython.noop),
    ]
