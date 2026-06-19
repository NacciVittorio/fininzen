import re

from django.db import migrations, models


def promote_legacy_borsa_like_assets_to_auto(apps, schema_editor):
    Asset = apps.get_model("portfolio", "Asset")
    qs = Asset.objects.filter(price_source="YAHOO").only(
        "id", "ticker", "source_symbol", "source_url", "price_source"
    )
    for asset in qs:
        raw = asset.source_url or asset.source_symbol or asset.ticker or ""
        if _looks_like_borsa_fund_identifier(raw):
            asset.price_source = "AUTO"
            asset.save(update_fields=["price_source"])


def _looks_like_borsa_fund_identifier(value):
    raw = (value or "").strip()
    match = re.search(r"/borsa/fondi/dettaglio/([^/.?#]+)", raw, re.I)
    symbol = match.group(1).upper() if match else ""
    if not symbol:
        match = re.search(r"\b([A-Z0-9]{4,20})\b", raw.upper())
        symbol = match.group(1) if match else ""
    if not symbol:
        return False
    if re.search(r"/borsa/fondi/dettaglio/", raw, re.I):
        return True
    if "." in raw or "-" in raw:
        return False
    if re.fullmatch(r"[A-Z]{2}[A-Z0-9]{9}\d", symbol):
        return False
    return bool(
        4 <= len(symbol) <= 20
        and re.fullmatch(r"[A-Z0-9]+", symbol)
        and re.search(r"\d", symbol)
    )


class Migration(migrations.Migration):
    dependencies = [
        ("portfolio", "0027_asset_price_source"),
    ]

    operations = [
        migrations.AlterField(
            model_name="asset",
            name="price_source",
            field=models.CharField(
                choices=[
                    ("AUTO", "Auto"),
                    ("YAHOO", "Yahoo Finance"),
                    ("BORSA_ITALIANA", "Borsa Italiana"),
                ],
                default="AUTO",
                max_length=20,
            ),
        ),
        migrations.RunPython(
            promote_legacy_borsa_like_assets_to_auto, migrations.RunPython.noop
        ),
    ]
