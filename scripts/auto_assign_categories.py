#!/usr/bin/env python3
"""
Auto-assign categories to bank statement CSVs based on description keywords.
Uses the category mapping from the finnet database.
"""

import csv
from pathlib import Path

# Categoria ID mapping (dal database)
EXPENSE_CATEGORIES = {
    "Groceries": 12,  # Food & Dining > Groceries
    "Restaurants": 13,  # Food & Dining > Restaurants
    "Food": 11,  # Food & Dining (parent)
    "Transport": 23,  # Transportation (parent)
    "Fuel": 24,  # Transportation > Fuel
    "Public Transport": 26,  # Transportation > Public Transport
    "Entertainment": 40,  # Entertainment & Leisure (parent)
    "Shopping": 18,  # Shopping (parent)
    "Clothes": 19,  # Shopping > Clothes
    "Subscriptions": 29,  # Subscriptions (parent)
    "Digital Services": 30,  # Subscriptions > Digital Services
    "Health": 33,  # Health & Wellness (parent)
    "Other": 14,  # Food & Dining > Other
    "Taxes": 53,  # Taxes & Fees (parent)
}

INCOME_CATEGORIES = {
    "Salary": 57,  # Salary
    "Interests": 28,  # Interests
    "Gifts": 58,  # Gifts
    "Refunds": 59,  # Refunds
    "Cashback": 61,  # Cashback
}

# Mapping dei keyword alle categorie
EXPENSE_KEYWORDS = {
    # Grocery/Food
    (
        "UNICOOP",
        "COOP",
        "CARREFOUR",
        "ESSELUNGA",
        "POLI",
        "DECATHLON",
        "BENNET",
        "ASPIT",
        "YOGORINO",
    ): "Groceries",
    (
        "RISTORAN",
        "BURGER",
        "PIZZA",
        "MEZZADRI",
        "RISTOGEST",
        "MCDONALD",
        "MESCALINA",
    ): "Restaurants",
    ("SUPERMERCA", "ALIMENTARI"): "Groceries",
    ("CAFE", "COFFEE", "BAR", "GELATERIA", "PANETTERIA"): "Restaurants",
    # Shopping/Clothes
    ("VALENTINO", "ABBIGLIAMENTO", "ZARA", "H&M", "MODA", "BOUTIQUE"): "Clothes",
    ("SCARPE", "NIKE", "ADIDAS", "PUMA"): "Clothes",
    ("NEGOZI", "SHOPPING", "SHOP"): "Shopping",
    # Transport
    ("BENZINA", "CARBURANTE", "STAZIONE DI SERVIZIO", "ESSO", "SHELL", "IP"): "Fuel",
    ("TRENITALIA", "FERROVIE", "TAXI", "UBER", "BUS", "AUTOBUS", "TRAM"): "Transport",
    ("PARCHEGGIO", "PARKING", "ZTL"): "Transport",
    # Entertainment
    ("EVENTIM", "TICKETONE", "CINEMA", "CONCERTO", "TEATRO", "MUSICA"): "Entertainment",
    (
        "SPOTIFY",
        "APPLE.COM",
        "NETFLIX",
        "AMAZON PRIME",
        "DISNEY",
        "MUSIC",
    ): "Digital Services",
    ("HOTEL", "AIRBNB", "BOOKING", "ALBERGO"): "Entertainment",
    # Health
    ("FARMACIA", "PHARMACY", "MEDICO", "OSPEDALE", "DENTISTA", "VETERINARIO"): "Health",
    # Utilities/Services
    (
        "WIND TRE",
        "VODAFONE",
        "TELECOM",
        "FASTWEB",
        "LUCE",
        "GAS",
        "ACQUA",
        "ENERGIA",
    ): "Subscriptions",
    ("INTERNET", "SERVIZIO INTERNET"): "Digital Services",
    # Banks/Fees
    ("CANONE", "IMPOSTA", "BOLLO", "COMMISSIONE", "SPESE", "FEE"): "Taxes",
    ("PRELEVAMENTO", "ATM", "VERSAMENTO"): "Other",
    # Other
    ("PAGAMENTO", "ADDEBITO", "BONIFICO", "TRASFERIMENTO"): "Other",
}

INCOME_KEYWORDS = {
    ("STIPENDIO", "ACCREDITO COMPETENZE", "SALARIO", "PAYROLL", "SALARY"): "Salary",
    ("INTERESSE", "INTEREST", "RENDITA", "DIVIDEND", "BONUS"): "Interests",
    ("RIMBORSO", "REFUND", "RESTITUZIONE"): "Refunds",
    ("CASHBACK", "SAVEBACK", "SCONTO"): "Cashback",
    ("REGALO", "GIFT", "DONAZIONE"): "Gifts",
    ("ACCREDITO", "TRANSFER", "BONIFICO"): "Salary",  # Default for income transfers
}


def infer_category(description, category_type):
    """
    Infer category from description.
    Returns (category_name, category_id) or (None, None) if not found.
    """
    desc_upper = str(description).upper()

    if category_type == "expense":
        keywords_dict = EXPENSE_KEYWORDS
        categories = EXPENSE_CATEGORIES
    else:
        keywords_dict = INCOME_KEYWORDS
        categories = INCOME_CATEGORIES

    # Search for keyword matches
    best_match = None
    for keyword_tuple, category_name in keywords_dict.items():
        for keyword in keyword_tuple:
            if keyword in desc_upper:
                best_match = category_name
                break
        if best_match:
            break

    if best_match:
        return best_match, categories.get(best_match)

    return None, None


def process_csv(input_path, output_path):
    """Add category_id and category_name columns to CSV."""
    rows = []

    with open(input_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            desc = row["description"]
            cat_type = row["category_type"]

            # Infer category
            cat_name, cat_id = infer_category(desc, cat_type)

            row["category_name"] = cat_name or ""
            row["category_id"] = cat_id or ""

            rows.append(row)

    # Write new CSV
    fieldnames = [
        "date",
        "description",
        "amount",
        "category_type",
        "account",
        "category_name",
        "category_id",
    ]

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            # Only write relevant fields
            writer.writerow({k: row.get(k, "") for k in fieldnames})

    # Stats
    matched = sum(1 for r in rows if r.get("category_id"))
    total = len(rows)
    pct = (matched / total * 100) if total > 0 else 0

    return matched, total, pct


if __name__ == "__main__":
    print("Auto-assigning categories to import CSVs...\n")

    files = [
        (
            "EstrattiConto/import_traderepublic.csv",
            "EstrattiConto/import_traderepublic_categorized.csv",
        ),
        (
            "EstrattiConto/import_fineco.csv",
            "EstrattiConto/import_fineco_categorized.csv",
        ),
        (
            "EstrattiConto/import_buddybank.csv",
            "EstrattiConto/import_buddybank_categorized.csv",
        ),
    ]

    total_all = 0
    matched_all = 0

    for input_path, output_path in files:
        matched, total, pct = process_csv(input_path, output_path)
        total_all += total
        matched_all += matched

        label = Path(input_path).stem.replace("import_", "").title()
        print(
            f"✓ {label:25} {matched:3d}/{total:3d} ({pct:5.1f}%) → {Path(output_path).name}"
        )

    overall_pct = (matched_all / total_all * 100) if total_all > 0 else 0
    print(f"\n✓ Total: {matched_all}/{total_all} ({overall_pct:.1f}%) categorized")
    print("\nFile categorizzati disponibili in EstrattiConto/import_*_categorized.csv")
