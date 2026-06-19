"""
Migration: crea InvestmentType, aggiunge FK su Asset, migra dati, rimuove asset_type.

Data migration: inserisce i 9 tipi di default con colori e icone che corrispondono
esattamente al vecchio TYPE_COLORS del frontend, poi aggiorna tutti gli asset esistenti.
"""

from django.db import migrations, models
import django.db.models.deletion

# Mappa: vecchio valore asset_type → dati InvestmentType da creare
INVESTMENT_TYPES = [
    {
        "old_key": "ETF",
        "name": "ETF",
        "color": "#4ade80",
        "icon": "📊",
        "supports_ticker": True,
        "is_liquid_default": True,
    },
    {
        "old_key": "STOCK",
        "name": "Stock",
        "color": "#60a5fa",
        "icon": "📈",
        "supports_ticker": True,
        "is_liquid_default": True,
    },
    {
        "old_key": "BOND",
        "name": "Bond",
        "color": "#a78bfa",
        "icon": "🏦",
        "supports_ticker": True,
        "is_liquid_default": True,
    },
    {
        "old_key": "FUND",
        "name": "Fund",
        "color": "#f97316",
        "icon": "💼",
        "supports_ticker": False,
        "is_liquid_default": True,
    },
    {
        "old_key": "REAL_ESTATE",
        "name": "Real Estate",
        "color": "#fb923c",
        "icon": "🏠",
        "supports_ticker": False,
        "is_liquid_default": False,
    },
    {
        "old_key": "PRIVATE_EQUITY",
        "name": "Private Equity",
        "color": "#f472b6",
        "icon": "🏛️",
        "supports_ticker": False,
        "is_liquid_default": False,
    },
    {
        "old_key": "ART",
        "name": "Art / Collectibles",
        "color": "#fbbf24",
        "icon": "🎨",
        "supports_ticker": False,
        "is_liquid_default": False,
    },
    {
        "old_key": "CRYPTO",
        "name": "Crypto",
        "color": "#34d399",
        "icon": "₿",
        "supports_ticker": True,
        "is_liquid_default": True,
    },
    {
        "old_key": "CASH",
        "name": "Cash",
        "color": "#94a3b8",
        "icon": "💶",
        "supports_ticker": False,
        "is_liquid_default": True,
    },
]


def create_types_and_migrate(apps, schema_editor):
    InvestmentType = apps.get_model("portfolio", "InvestmentType")
    Asset = apps.get_model("portfolio", "Asset")

    # Crea i tipi di default e costruisce la mappa old_key → istanza
    type_map = {}
    for t in INVESTMENT_TYPES:
        obj = InvestmentType.objects.create(
            name=t["name"],
            color=t["color"],
            icon=t["icon"],
            supports_ticker=t["supports_ticker"],
            is_liquid_default=t["is_liquid_default"],
        )
        type_map[t["old_key"]] = obj

    # Migra ogni asset al nuovo investment_type
    for asset in Asset.objects.all():
        old_type = asset.asset_type  # ancora presente in questa fase
        if old_type in type_map:
            asset.investment_type = type_map[old_type]
            asset.save(update_fields=["investment_type"])


def reverse_migrate(apps, schema_editor):
    # Ripristina asset_type dai nomi degli InvestmentType
    Asset = apps.get_model("portfolio", "Asset")
    name_to_key = {t["name"]: t["old_key"] for t in INVESTMENT_TYPES}
    for asset in Asset.objects.select_related("investment_type").all():
        if asset.investment_type:
            asset.asset_type = name_to_key.get(asset.investment_type.name, "ETF")
            asset.save(update_fields=["asset_type"])


class Migration(migrations.Migration):
    dependencies = [
        ("portfolio", "0001_initial"),
    ]

    operations = [
        # 1. Crea tabella InvestmentType
        migrations.CreateModel(
            name="InvestmentType",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=50)),
                ("color", models.CharField(default="#4f7fff", max_length=7)),
                ("icon", models.CharField(default="📈", max_length=10)),
                ("supports_ticker", models.BooleanField(default=True)),
                ("is_liquid_default", models.BooleanField(default=True)),
            ],
            options={
                "verbose_name": "Tipo investimento",
                "verbose_name_plural": "Tipi investimento",
                "ordering": ["name"],
            },
        ),
        # 2. Aggiunge FK investment_type su Asset (nullable per ora)
        migrations.AddField(
            model_name="asset",
            name="investment_type",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="assets",
                to="portfolio.investmenttype",
            ),
        ),
        # 3. Data migration: crea tipi + migra asset
        migrations.RunPython(create_types_and_migrate, reverse_migrate),
        # 4. Rimuove il vecchio campo asset_type
        migrations.RemoveField(
            model_name="asset",
            name="asset_type",
        ),
    ]
