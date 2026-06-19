"""
expenses/management/commands/seed_data.py — Comando per popolare il DB con dati di esempio.

Usiamo un management command Django invece di uno script standalone perché:
- Si esegue con `python manage.py seed_data`
- Ha accesso all'ORM Django già configurato
- Può usare get_or_create per evitare duplicati se eseguito più volte

Esegui con: python manage.py seed_data
"""

import logging
import random
from datetime import date, timedelta
from django.core.management.base import BaseCommand
from decimal import Decimal
from expenses.models import Category, Expense
from portfolio.models import Asset, InvestmentType

logger = logging.getLogger(__name__)

CATEGORIE_DEFAULT = [
    # (name, color, icon, category_type)
    ("Food & Groceries", "#e8845a", "🛒", "expense"),
    ("Transport", "#5a8ee8", "🚌", "expense"),
    ("Entertainment", "#8e5ae8", "🎬", "expense"),
    ("Health", "#5ae898", "💊", "expense"),
    ("Home", "#e8c85a", "🏠", "expense"),
    ("Shopping", "#e85a8e", "👗", "expense"),
    ("Utilities", "#5ae8e8", "⚡", "expense"),
    ("Other", "#8e8e8e", "📦", "expense"),
    ("Salary", "#4ade80", "💼", "income"),
    ("Investments", "#60a5fa", "📈", "income"),
]

INV_TYPES_DEFAULT = [
    # (name, color, icon, supports_ticker, is_liquid_default)
    ("ETF", "#4f7fff", "📊", True, True),
    ("Stock", "#60a5fa", "📈", True, True),
    ("Crypto", "#f59e0b", "₿", True, True),
    ("Bond", "#34d399", "🏛️", True, True),
    ("Real Estate", "#a78bfa", "🏠", False, False),
    ("Fund", "#6ee7b7", "💼", False, False),
]


class Command(BaseCommand):
    help = "Popola il database con categorie default e dati di esempio"

    def handle(self, *args, **options):
        self.stdout.write("Creazione categorie...")
        categorie = {}
        for nome, colore, icona, tipo in CATEGORIE_DEFAULT:
            cat, created = Category.objects.get_or_create(
                name=nome,
                parent=None,
                defaults={"color": colore, "icon": icona, "category_type": tipo},
            )
            categorie[nome] = cat
            if created:
                self.stdout.write(f"  ✓ Categoria: {nome}")

        self.stdout.write("Creazione tipi investimento...")
        inv_types = {}
        for (
            nome,
            colore,
            icona,
            supports_ticker,
            is_liquid_default,
        ) in INV_TYPES_DEFAULT:
            t, created = InvestmentType.objects.get_or_create(
                name=nome,
                defaults={
                    "color": colore,
                    "icon": icona,
                    "supports_ticker": supports_ticker,
                    "is_liquid_default": is_liquid_default,
                },
            )
            inv_types[nome] = t
            if created:
                self.stdout.write(f"  ✓ Tipo: {nome}")

        self.stdout.write("Creazione spese di esempio (ultimi 3 mesi)...")
        spese_esempio = [
            ("Supermarket", 74, "Food & Groceries"),
            ("Monthly metro pass", 35, "Transport"),
            ("Cinema", 12, "Entertainment"),
            ("Pharmacy", 28, "Health"),
            ("Restaurant dinner", 52, "Food & Groceries"),
            ("Electricity bill", 89, "Utilities"),
            ("New shoes", 120, "Shopping"),
            ("Coffee & croissants", 8, "Food & Groceries"),
            ("Gym membership", 45, "Health"),
            ("Uber", 18, "Transport"),
        ]

        for i in range(30):
            desc, importo, categoria = random.choice(spese_esempio)
            giorni_fa = random.randint(0, 90)
            Expense.objects.get_or_create(
                description=desc,
                date=date.today() - timedelta(days=giorni_fa),
                defaults={
                    "amount": Decimal(str(importo))
                    + Decimal(str(random.randint(-10, 10))),
                    "category": categorie.get(categoria),
                },
            )

        self.stdout.write("Creazione asset di esempio...")
        asset_esempio = [
            {
                "name": "iShares Core MSCI World UCITS ETF",
                "ticker": "IWDA.AS",
                "investment_type": inv_types.get("ETF"),
                "is_liquid": True,
                "shares": Decimal("120"),
                "price_per_share": Decimal("95.50"),
                "currency": "USD",
                "invested_capital": Decimal("10000"),
                "current_value": Decimal("11460"),
                "notes": "ETF globale principale, acquistato su Degiro. ISIN: IE00B4L5Y983",
            },
            {
                "name": "Vanguard S&P 500 UCITS ETF",
                "ticker": "VUSA.L",
                "investment_type": inv_types.get("ETF"),
                "is_liquid": True,
                "shares": Decimal("80"),
                "price_per_share": Decimal("102.30"),
                "currency": "GBP",
                "invested_capital": Decimal("7000"),
                "current_value": Decimal("8184"),
                "notes": "Quotato a Londra in GBP. Attenzione al cambio EUR/GBP.",
            },
            {
                "name": "Fondo Pensione Integrativo",
                "ticker": "",
                "investment_type": inv_types.get("Fund"),
                "is_liquid": False,
                "shares": None,
                "price_per_share": None,
                "currency": "EUR",
                "invested_capital": Decimal("15000"),
                "current_value": Decimal("17200"),
                "notes": "Aggiornare manualmente ogni trimestre dal sito della compagnia.",
            },
            {
                "name": "Appartamento Milano - Via Montenapoleone",
                "ticker": "",
                "investment_type": inv_types.get("Real Estate"),
                "is_liquid": False,
                "shares": None,
                "price_per_share": None,
                "currency": "EUR",
                "invested_capital": Decimal("180000"),
                "current_value": Decimal("210000"),
                "notes": "Stima rivalutazione basata su comparabili zona Q3 2025.",
            },
            {
                "name": "Bitcoin",
                "ticker": "BTC-USD",
                "investment_type": inv_types.get("Crypto"),
                "is_liquid": True,
                "shares": Decimal("0.25"),
                "price_per_share": Decimal("42000"),
                "currency": "USD",
                "invested_capital": Decimal("8000"),
                "current_value": Decimal("10500"),
                "notes": "Conservato su hardware wallet. Aggiornamento prezzi in USD.",
            },
        ]

        for dati in asset_esempio:
            Asset.objects.get_or_create(name=dati["name"], defaults=dati)
            self.stdout.write(f"  ✓ Asset: {dati['name']}")

        self.stdout.write(
            self.style.SUCCESS(
                "\n✅ Seed completato! Avvia il server con: python manage.py runserver"
            )
        )
