#!/usr/bin/env python3
"""
Auto-assign categories to bank statement CSVs based on description keywords.
Uses category names by default; category IDs can be supplied with a JSON map.
"""

import csv
import argparse
import json
from pathlib import Path

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
    Returns category_name or None if not found.
    """
    desc_upper = str(description).upper()

    if category_type == "expense":
        keywords_dict = EXPENSE_KEYWORDS
    else:
        keywords_dict = INCOME_KEYWORDS

    # Search for keyword matches
    best_match = None
    for keyword_tuple, category_name in keywords_dict.items():
        for keyword in keyword_tuple:
            if keyword in desc_upper:
                best_match = category_name
                break
        if best_match:
            break

    return best_match


def process_csv(input_path, output_path, category_ids=None):
    """Add category_id and category_name columns to CSV."""
    rows = []
    category_ids = category_ids or {}

    with open(input_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            desc = row["description"]
            cat_type = row["category_type"]

            cat_name = infer_category(desc, cat_type)
            cat_id = category_ids.get(cat_type, {}).get(cat_name or "")

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
    matched = sum(1 for r in rows if r.get("category_name"))
    total = len(rows)
    pct = (matched / total * 100) if total > 0 else 0

    return matched, total, pct


def _output_path_for(input_path, output_dir):
    input_path = Path(input_path)
    parent = Path(output_dir) if output_dir else input_path.parent
    return parent / f"{input_path.stem}_categorized{input_path.suffix}"


def _load_category_map(path):
    if not path:
        return {}
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return {
        "expense": data.get("expense", {}),
        "income": data.get("income", {}),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Auto-assign fininzen category names to import CSVs."
    )
    parser.add_argument("inputs", nargs="+", help="Input import CSV files.")
    parser.add_argument(
        "--output-dir",
        help="Optional directory for categorized CSV files. Defaults to each input directory.",
    )
    parser.add_argument(
        "--category-map",
        help=(
            "Optional JSON map for category IDs, shaped as "
            '{"expense": {"Groceries": 12}, "income": {"Salary": 57}}.'
        ),
    )
    args = parser.parse_args()
    category_ids = _load_category_map(args.category_map)
    if args.output_dir:
        Path(args.output_dir).mkdir(parents=True, exist_ok=True)

    print("Auto-assigning categories to import CSVs...\n")

    total_all = 0
    matched_all = 0

    for input_path in args.inputs:
        output_path = _output_path_for(input_path, args.output_dir)
        matched, total, pct = process_csv(input_path, output_path, category_ids)
        total_all += total
        matched_all += matched

        label = Path(input_path).stem.replace("import_", "").title()
        print(
            f"✓ {label:25} {matched:3d}/{total:3d} ({pct:5.1f}%) → {Path(output_path).name}"
        )

    overall_pct = (matched_all / total_all * 100) if total_all > 0 else 0
    print(f"\n✓ Total: {matched_all}/{total_all} ({overall_pct:.1f}%) categorized")
