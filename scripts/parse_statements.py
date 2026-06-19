#!/usr/bin/env python3
"""
Parse bank statements (CSV, XLSX, PDF) and generate fininzen-compatible import CSVs.
Categories are assigned by keyword matching.

Outputs:
  - import_traderepublic.csv
  - import_fineco.csv
  - import_buddybank.csv
"""

import argparse
import csv
import re
from datetime import datetime
from pathlib import Path
from decimal import Decimal

try:
    import openpyxl
except ImportError:
    print("ERROR: openpyxl not found. Install with: pip install openpyxl")
    exit(1)

try:
    import pdfplumber
except ImportError:
    print("ERROR: pdfplumber not found. Install with: pip install pdfplumber")
    exit(1)


# ─── CATEGORY MAPPING ────────────────────────────────────────────────────────
# Format: (keywords_tuple) -> "Category Name" (matched case-insensitively)
# Category names must match exactly what's in fininzen.

EXPENSE_KEYWORD_MAP = [
    # Food & Dining > Groceries
    (
        (
            "UNICOOP",
            "ESSELUNGA",
            "CARREFOUR",
            "BENNET",
            "PENNY MARKET",
            "FRANPRIX",
            "SUPERMERCATO",
            "ALIMENTARI",
            "POLI",
            "ALIPER",
            "SOCIETA AGRICOLA",
        ),
        "Groceries",
    ),
    # Food & Dining > Snacks & Café
    (("YOGORINO", "ASPIT", "BAR IL", "BAR "), "Snacks & Café"),
    # Food & Dining > Sweets
    (
        ("GOLOSERIA", "PASTICCERIA", "CORNETTERIA", "GELATERIA", "DOLCI", "YOGURTERIA"),
        "Sweets",
    ),
    # Food & Dining > Restaurants  (checked before Snacks to avoid false positives)
    (
        (
            "BURGER",
            "MCDONALD",
            "DONALD",
            "AUTOGRILL",
            "MEZZADRIA",
            "RISTOGEST",
            "LOWENGRUBE",
            "AI BANCHI",
            "GLOVO",
            "SCHIACCIAVINERIA",
            "NOXHOP",
            "RISTORAN",
            "PIZZA",
            "KEBAB",
            "ROMAGNOLI",
            "PANINOTECA",
            "TRATTORIA",
            "OSTERIA",
            "BIRRERIA",
            "MESCALINA",
            "TINAYA",
            "RAPHAELOISE",
            "LE BAIA",
            "VESPUCCI",
            "CHARLEE",
            "GLAMOUR CAFE",
            "BELLA EPOQUE",
            "SUMUP *LEMON",
            "SUMUP  *LEMON",
            "ON THE ROAD",
        ),
        "Restaurants",
    ),
    # Shopping > Clothes
    (
        (
            "VALENTINO",
            "ZARA",
            "H&M",
            "ALLSTAR",
            "SCARPE",
            "ABBIGLIAMENTO",
            "BOUTIQUE",
            "MODA",
        ),
        "Clothes",
    ),
    # Shopping > Electronics / general
    (("AMAZON", "AMZN", "MEDIAWORLD", "UNIEURO"), "Electronics"),
    # Shopping > Personal Care
    (("BOTRINI", "ACCONCIATURA", "PARRUCCHIERE", "BARBIERE"), "Personal Care"),
    # Transportation > Fuel
    (
        (
            "ENI",
            "AGIP",
            "BENZINA",
            "CARBURANTE",
            "SHELL",
            "ESSO",
            "TOTALERG",
            "DISTRIBUTORE",
            "Q8",
            "STATION CTNT",
            "STAZIONE DI SERVIZIO",
        ),
        "Fuel",
    ),
    # Transportation > Public Transport
    (
        (
            "TRENITALIA",
            "TRENORD",
            "TAXI",
            "UBER",
            "ITALO",
            "FLIXBUS",
            "HPY*TRAGHETTI",
            "TRAGHETTI",
            "FERRY",
        ),
        "Public Transport",
    ),
    # Transportation > Parking
    (
        ("PARKING", "PARCHEGGIO", "ZTL", "PARCHEGGI", "COLLESALVETTI", "ROSIGNANO"),
        "Parking",
    ),
    # Transportation > Maintenance
    (("GARAGE", "OFFICINA", "MECCANICO", "SHARK GARAGE"), "Maintenance"),
    # Health & Wellness > Medical Services
    (("GIULIA FREDIANI",), "Medical Services"),
    # Health & Wellness > Pharmacy
    (("FARMACIA", "PHARMACY"), "Pharmacy"),
    # Health & Wellness > Gym & Fitness
    (("CALISTHENICS", "PALESTRA", "GYM", "FITNESS"), "Gym & Fitness"),
    # Entertainment & Leisure > Games
    (("CRONOS MODENA",), "Games"),
    # Entertainment & Leisure > Concerts & Events
    (
        ("EVENTIM", "TICKETONE", "VIVATICKET", "LIVETICKET", "TEATRO", "CINEMA"),
        "Concerts & Events",
    ),
    # Entertainment & Leisure > Hobbies / general
    (("AIR JUMP", "PARCO AVVENTURA", "JUMP LIVE", "OBI", "HTTPSSYSTEMFALA"), "Hobbies"),
    # Vacations > Accommodation
    (("HOTEL", "AIRBNB", "HOSTEL", "B&B"), "Accommodation"),
    # Subscriptions > Digital Services
    (
        (
            "SPOTIFY",
            "APPLE.COM/BILL",
            "APPLE.COM",
            "NETFLIX",
            "PRIME",
            "DISNEY+",
            "YOUTUBE",
            "BREASY",
            "APP BR",
        ),
        "Digital Services",
    ),
    # Subscriptions (phone/internet)
    (
        ("WIND TRE", "VODAFONE", "TELECOM", "FASTWEB", "RICARICA TELEFONICA"),
        "Subscriptions",
    ),
    # Taxes & Fees > Bank Fees
    (
        (
            "CANONE MENSILE",
            "IMPOSTA",
            "BOLLO",
            "SPESE SPEDIZIONE",
            "RECUPERO SPESE",
            "COMMISSIONE",
        ),
        "Bank Fees",
    ),
    # Taxes & Fees > Government Fees
    (("TASSA", "TARI", "IMU"), "Government Fees"),
    # Gifts & Donations
    (("CELEBRAZIONE", "DONAZIONE"), "Gifts"),
    # Other (catch-all: PayPal direct debits, unclear transactions)
    (
        (
            "SEPA DIRECT DEBIT",
            "ADDEBITO SEPA DD",
            "ADDEBITO SDD",
            "SEPA DD",
            "PAYPAL",
            "EMANUELE CEROFOLINI",
            "TABACCHERIA",
            "NEW BUSINESS",
            "SBM ",
            "SUMUP",
        ),
        "Other",
    ),
]

INCOME_KEYWORD_MAP = [
    # Salary
    (
        ("ACCREDITO COMPETENZE", "CABEL INDUSTRY", "STIPENDIO", "SALARY", "PAYROLL"),
        "Salary",
    ),
    # Interests
    (("INTEREST PAYMENT", "INTEREST", "EURO OVERNIGHT RATE", "INTERESTS"), "Interests"),
    # Cashback
    (("SAVEBACK", "SCONTO CANONE", "CASHBACK", "BENEFITS_SAVEBACK"), "Cashback"),
    # Refunds (PayPal incoming, rimborsi)
    (("RIMBORSO", "REFUND", "RESTITUZIONE", "PAYPAL", "HPY*TRAGHETTI"), "Refunds"),
    # Family > Father
    (("NACCI MASSIMO",), "Father"),
    # Family > Brother
    (("NACCI LUCA",), "Brother"),
    # Gifts
    (("REGALO", "GIFT"), "Gifts"),
]


# ─── SKIP RULES ──────────────────────────────────────────────────────────────
# Transactions excluded entirely: investments tracked elsewhere,
# or self-transfers that belong in the Transfer module.

SKIP_PATTERNS = [
    # Fondo pensione AMUNDI → investimento gestito separatamente
    "AMUNDI",
    # ETF / titoli su Fineco → portfolio module
    "COMPRAVENDITA TITOLI",
    # Bonifici a se stesso → da gestire nel modulo Transfer di fininzen
    "NACCI VITTORIO",  # TR: "Outgoing/Incoming transfer for/from NACCI VITTORIO"
    "VITTORIO NACCI",  # Fineco: "Beneficiario: Vittorio Nacci"
]

# BuddyBank: descrizioni generiche perse durante il parsing PDF → self-transfers
BB_SKIP_DESC = {"Transfer"}


def should_skip(description):
    desc_upper = description.upper()
    return any(p.upper() in desc_upper for p in SKIP_PATTERNS)


def assign_category(description, category_type):
    """Return category_name matching the description, or '' if no match."""
    desc_upper = description.upper()
    keyword_map = (
        EXPENSE_KEYWORD_MAP if category_type == "expense" else INCOME_KEYWORD_MAP
    )

    for keywords, cat_name in keyword_map:
        for kw in keywords:
            if kw.upper() in desc_upper:
                return cat_name
    return ""


# ─── PARSERS ─────────────────────────────────────────────────────────────────


def parse_traderepublic(input_path):
    rows = []
    skipped = {"transfers": 0, "trading": 0, "zero": 0}
    input_path = Path(input_path)

    with open(input_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for raw_row in reader:
            # Skip TRADING rows (investimenti portfolio)
            if raw_row.get("category") != "CASH":
                skipped["trading"] += 1
                continue

            date_str = raw_row.get("date", "").strip()
            amount_str = raw_row.get("amount", "").strip()
            if not date_str or not amount_str:
                continue

            try:
                amount = Decimal(amount_str)
            except Exception:
                continue

            if amount == 0:
                skipped["zero"] += 1
                continue

            name = raw_row.get("name", "").strip()
            description = raw_row.get("description", "").strip()
            desc = name if name else description
            if not desc:
                desc = raw_row.get("type", "Transfer")

            # Skip self-transfers
            if should_skip(desc):
                skipped["transfers"] += 1
                continue

            category_type = "income" if amount > 0 else "expense"
            cat_name = assign_category(desc, category_type)

            rows.append(
                {
                    "date": date_str,
                    "description": desc,
                    "amount": f"{abs(amount):.2f}",
                    "category_type": category_type,
                    "category_name": cat_name,
                    "account": "Trade Republic",
                }
            )

    return rows, skipped


def parse_fineco(input_path):
    rows = []
    skipped = {"transfers": 0, "zero": 0}
    input_path = Path(input_path)

    wb = openpyxl.load_workbook(input_path, data_only=True)
    ws = wb.active
    row_list = list(ws.iter_rows(values_only=True))

    for row_values in row_list[13:]:  # header at index 12, data from 13
        date_op = row_values[0]  # Data_Operazione
        entrate = row_values[2]  # Entrate
        uscite = row_values[3]  # Uscite
        desc_completa = row_values[5]  # Descrizione_Completa

        entrate = entrate or 0
        uscite = uscite or 0
        if entrate == 0 and uscite == 0:
            skipped["zero"] += 1
            continue

        if not date_op:
            continue

        if isinstance(date_op, datetime):
            date_str = date_op.strftime("%Y-%m-%d")
        else:
            try:
                date_str = datetime.strptime(str(date_op), "%Y-%m-%d").strftime(
                    "%Y-%m-%d"
                )
            except ValueError:
                continue

        category_type = "income" if entrate > 0 else "expense"
        amount = Decimal(str(entrate if entrate > 0 else abs(uscite)))

        desc = str(desc_completa).strip() if desc_completa else ""

        if should_skip(desc):
            skipped["transfers"] += 1
            continue

        cat_name = assign_category(desc, category_type)

        rows.append(
            {
                "date": date_str,
                "description": desc,
                "amount": f"{amount:.2f}",
                "category_type": category_type,
                "category_name": cat_name,
                "account": "Fineco",
            }
        )

    return rows, skipped


def parse_buddybank(input_path):
    rows = []
    skipped = {"transfers": 0, "zero": 0, "no_amount": 0}
    input_path = Path(input_path)

    italian_months = {
        "gennaio": 1,
        "febbraio": 2,
        "marzo": 3,
        "aprile": 4,
        "maggio": 5,
        "giugno": 6,
        "luglio": 7,
        "agosto": 8,
        "settembre": 9,
        "ottobre": 10,
        "novembre": 11,
        "dicembre": 12,
    }

    transactions = []
    state = {"current_year": 2026, "last_month": None}

    with pdfplumber.open(input_path) as pdf:
        for page_num, page in enumerate(pdf.pages):
            words = page.extract_words()
            if not words:
                continue

            date_anchors = []
            for word in words:
                if 13.5 <= word["height"] <= 14.5 and word["x0"] < 100:
                    word_lower = word["text"].lower()
                    if word_lower in italian_months:
                        day_word = next(
                            (
                                w
                                for w in words
                                if w["top"] == word["top"]
                                and w["x1"] < word["x0"]
                                and w["text"].isdigit()
                            ),
                            None,
                        )
                        if day_word:
                            month = italian_months[word_lower]
                            if (
                                state["last_month"] is not None
                                and month > state["last_month"] + 1
                            ):
                                state["current_year"] -= 1
                            state["last_month"] = month

                            date_anchors.append(
                                {
                                    "day": int(day_word["text"]),
                                    "month": month,
                                    "year": state["current_year"],
                                    "top": word["top"],
                                }
                            )

            for i, anchor in enumerate(date_anchors):
                next_top = (
                    date_anchors[i + 1]["top"]
                    if i + 1 < len(date_anchors)
                    else float("inf")
                )
                section = [w for w in words if anchor["top"] < w["top"] < next_top]
                if not section:
                    continue

                amount_word = next(
                    (
                        w
                        for w in section
                        if w["x0"] > 500 and re.match(r"^-?\d+[,\.]\d{2}$", w["text"])
                    ),
                    None,
                )
                if not amount_word:
                    skipped["no_amount"] += 1
                    continue

                try:
                    amount = Decimal(amount_word["text"].replace(",", "."))
                except Exception:
                    continue

                if amount == 0:
                    skipped["zero"] += 1
                    continue

                desc_words = [
                    w["text"]
                    for w in section
                    if w["x0"] < 500 and w["top"] < amount_word["top"]
                ]
                description = " ".join(desc_words).strip() or "Transfer"

                # Skip generic "Transfer" (description lost in PDF) and self-transfers
                if description in BB_SKIP_DESC or should_skip(description):
                    skipped["transfers"] += 1
                    continue

                category_type = "income" if amount > 0 else "expense"
                cat_name = assign_category(description, category_type)

                transactions.append(
                    {
                        "date": f"{anchor['year']:04d}-{anchor['month']:02d}-{anchor['day']:02d}",
                        "description": description,
                        "amount": f"{abs(amount):.2f}",
                        "category_type": category_type,
                        "category_name": cat_name,
                        "account": "BuddyBank",
                    }
                )

    # Sort descending and deduplicate
    transactions.sort(key=lambda x: x["date"], reverse=True)
    seen = set()
    for tx in transactions:
        key = (tx["date"], tx["description"], tx["amount"])
        if key not in seen:
            seen.add(key)
            rows.append(tx)

    return rows, skipped


# ─── OUTPUT ───────────────────────────────────────────────────────────────────

FIELDNAMES = [
    "date",
    "description",
    "amount",
    "category_type",
    "category_name",
    "account",
]


def write_csv(rows, output_path, label, skipped):
    output_path = Path(output_path)
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    matched = sum(1 for r in rows if r.get("category_name"))
    pct = matched / len(rows) * 100 if rows else 0
    skip_info = "  ".join(f"{v} {k}" for k, v in skipped.items() if v)
    print(
        f"✓ {label:<15} {len(rows):>3} righe  "
        f"categorie: {matched}/{len(rows)} ({pct:.0f}%)  "
        f"{'skip: ' + skip_info if skip_info else ''}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Parse bank statements into fininzen-compatible import CSVs."
    )
    parser.add_argument(
        "--input-dir",
        default=".",
        help="Directory containing TradeRepublic.csv, Fineco.xlsx, and BuddyBank.pdf.",
    )
    parser.add_argument(
        "--output-dir",
        default=".",
        help="Directory where import_*.csv files will be written.",
    )
    args = parser.parse_args()
    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print("Parsing bank statements...\n")

    tr_rows, tr_skip = parse_traderepublic(input_dir / "TradeRepublic.csv")
    fin_rows, fin_skip = parse_fineco(input_dir / "Fineco.xlsx")
    bb_rows, bb_skip = parse_buddybank(input_dir / "BuddyBank.pdf")

    write_csv(
        tr_rows,
        output_dir / "import_traderepublic.csv",
        "TradeRepublic",
        tr_skip,
    )
    write_csv(fin_rows, output_dir / "import_fineco.csv", "Fineco", fin_skip)
    write_csv(bb_rows, output_dir / "import_buddybank.csv", "BuddyBank", bb_skip)

    total = len(tr_rows) + len(fin_rows) + len(bb_rows)
    matched = sum(1 for r in tr_rows + fin_rows + bb_rows if r.get("category_name"))
    print(
        f"\n✓ Totale: {total} transazioni  categorie: {matched}/{total} ({matched / total * 100:.0f}%)"
    )
    print(
        "\nNote: i 'transfer' esclusi vanno inseriti manualmente nel modulo Transfer di fininzen."
    )
