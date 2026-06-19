from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("portfolio", "0042_recompute_realized_sell_taxes"),
    ]

    operations = [
        migrations.AddField(
            model_name="assettransaction",
            name="tax_amount_is_manual",
            field=models.BooleanField(default=False),
        ),
    ]
