from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("portfolio", "0025_alter_asset_current_value_eur"),
    ]

    operations = [
        migrations.AddField(
            model_name="firesettings",
            name="annual_contribution",
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=15, null=True
            ),
        ),
        migrations.AddField(
            model_name="firesettings",
            name="annual_expenses_retirement",
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=15, null=True
            ),
        ),
        migrations.AddField(
            model_name="firesettings",
            name="annual_passive_income_retirement",
            field=models.DecimalField(
                decimal_places=2, default=Decimal("0"), max_digits=15
            ),
        ),
        migrations.AddField(
            model_name="firesettings",
            name="expected_nominal_return",
            field=models.DecimalField(
                decimal_places=4, default=Decimal("0.05"), max_digits=5
            ),
        ),
        migrations.AddField(
            model_name="firesettings",
            name="expected_real_return",
            field=models.DecimalField(
                decimal_places=4, default=Decimal("0.03"), max_digits=5
            ),
        ),
        migrations.AddField(
            model_name="firesettings",
            name="life_expectancy",
            field=models.PositiveSmallIntegerField(default=95),
        ),
        migrations.AddField(
            model_name="firesettings",
            name="model_mode",
            field=models.CharField(default="dual", max_length=10),
        ),
        migrations.AddField(
            model_name="firesettings",
            name="portfolio_equity_pct",
            field=models.DecimalField(
                decimal_places=2, default=Decimal("60.00"), max_digits=5
            ),
        ),
        migrations.AddField(
            model_name="firesettings",
            name="swr_base",
            field=models.DecimalField(
                decimal_places=4, default=Decimal("0.04"), max_digits=5
            ),
        ),
        migrations.AddField(
            model_name="firesettings",
            name="swr_max",
            field=models.DecimalField(
                decimal_places=4, default=Decimal("0.05"), max_digits=5
            ),
        ),
        migrations.AddField(
            model_name="firesettings",
            name="swr_min",
            field=models.DecimalField(
                decimal_places=4, default=Decimal("0.03"), max_digits=5
            ),
        ),
        migrations.AddField(
            model_name="firesettings",
            name="target_retirement_age",
            field=models.PositiveSmallIntegerField(default=65),
        ),
        migrations.AddField(
            model_name="firesettings",
            name="tax_drag_rate",
            field=models.DecimalField(
                decimal_places=4, default=Decimal("0"), max_digits=5
            ),
        ),
    ]
