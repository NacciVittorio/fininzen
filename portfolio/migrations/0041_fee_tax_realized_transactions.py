from decimal import Decimal

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("portfolio", "0040_assetpricehistory_open_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="asset",
            name="tax_rate_override",
            field=models.DecimalField(
                blank=True,
                decimal_places=4,
                max_digits=5,
                null=True,
                validators=[django.core.validators.MinValueValidator(Decimal("0"))],
            ),
        ),
        migrations.AddField(
            model_name="assettransaction",
            name="derived_kind",
            field=models.CharField(
                choices=[
                    ("principal", "Principal"),
                    ("fee", "Fee"),
                    ("tax", "Tax"),
                ],
                default="principal",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="assettransaction",
            name="fee",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("0"),
                max_digits=15,
                validators=[django.core.validators.MinValueValidator(Decimal("0"))],
            ),
        ),
        migrations.AddField(
            model_name="assettransaction",
            name="tax_amount",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("0"),
                max_digits=15,
                validators=[django.core.validators.MinValueValidator(Decimal("0"))],
            ),
        ),
        migrations.AddIndex(
            model_name="assettransaction",
            index=models.Index(
                fields=["derived_from", "derived_kind"],
                name="portfolio_a_derkind_idx",
            ),
        ),
    ]
