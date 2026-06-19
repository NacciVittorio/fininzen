from django.db import migrations, models


def copy_ticker_to_source_symbol(apps, schema_editor):
    Asset = apps.get_model("portfolio", "Asset")
    for asset in Asset.objects.all().only("id", "ticker"):
        if asset.ticker:
            asset.price_source = "YAHOO"
            asset.source_symbol = asset.ticker
            asset.save(update_fields=["price_source", "source_symbol"])


class Migration(migrations.Migration):
    dependencies = [
        ("portfolio", "0026_fire_settings_v2_dual_mode"),
    ]

    operations = [
        migrations.AddField(
            model_name="asset",
            name="price_source",
            field=models.CharField(
                choices=[
                    ("YAHOO", "Yahoo Finance"),
                    ("BORSA_ITALIANA", "Borsa Italiana"),
                ],
                default="YAHOO",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="asset",
            name="source_symbol",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
        migrations.AddField(
            model_name="asset",
            name="source_url",
            field=models.URLField(blank=True, default="", max_length=500),
        ),
        migrations.RunPython(copy_ticker_to_source_symbol, migrations.RunPython.noop),
    ]
