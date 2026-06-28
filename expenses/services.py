"""
expenses/services.py — Business logic pura per le spese.

Queste funzioni non dipendono da request/Response — sono testabili senza Client().
"""

import calendar
import logging
import random
from datetime import date as date_cls

from django.db import IntegrityError
from django.db.models import F
from django.utils import timezone

from fininzen import crypto

from .models import (
    Budget,
    Category,
    Expense,
    ExpenseDescriptionSuggestion,
    RecurringExpense,
)

logger = logging.getLogger(__name__)


def _is_recurring_active_on(rec: RecurringExpense, target_date: date_cls) -> bool:
    if rec.status != RecurringExpense.STATUS_ACTIVE or not rec.is_active:
        return False
    if target_date < rec.start_date:
        return False
    if rec.end_date and target_date > rec.end_date:
        return False
    return True


def _occurrence_date(rec: RecurringExpense, year: int, month: int) -> date_cls | None:
    if rec.frequency == RecurringExpense.FREQUENCY_YEARLY:
        due_month = rec.month_of_year or rec.start_date.month
        if month != due_month:
            return None
    day = min(rec.day_of_month, calendar.monthrange(year, month)[1])
    return date_cls(year, month, day)


def _recurring_already_generated(
    rec: RecurringExpense, occurrence_date: date_cls
) -> bool:
    return Expense.objects.filter(
        owner=rec.owner,
        recurring_source=rec,
        recurring_occurrence_date=occurrence_date,
    ).exists()


def disable_expired_recurrings(user) -> int:
    """Disable active recurrings whose end_date is before today."""
    today = timezone.localdate()
    now = timezone.now()
    updated = RecurringExpense.objects.filter(
        owner=user,
        status=RecurringExpense.STATUS_ACTIVE,
        is_active=True,
        end_date__isnull=False,
        end_date__lt=today,
    ).update(
        status=RecurringExpense.STATUS_DISABLED,
        is_active=False,
        disabled_at=now,
    )
    return updated


def _create_occurrence_if_missing(
    rec: RecurringExpense, occurrence_date: date_cls
) -> bool:
    try:
        _, created = Expense.objects.get_or_create(
            owner=rec.owner,
            recurring_source=rec,
            recurring_occurrence_date=occurrence_date,
            defaults={
                "description": rec.description,
                "amount": rec.amount,
                "category": rec.category,
                "linked_asset": rec.linked_asset,
                "date": occurrence_date,
            },
        )
        return created
    except IntegrityError:
        # Concurrent generators can race between lookup and insert.
        return False


def generate_recurring_expenses(user, year: int, month: int) -> dict:
    """Genera le Expense per le RecurringExpense attive dell'utente nel mese/anno indicato.

    Salta le spese già esistenti per quel mese. Ritorna {"created", "skipped"}.
    """
    logger.info(
        "generate_recurring_expenses: user=%s year=%s month=%s", user, year, month
    )
    disable_expired_recurrings(user)
    recurrings = RecurringExpense.objects.filter(
        owner=user,
        status=RecurringExpense.STATUS_ACTIVE,
        is_active=True,
    ).select_related("category", "linked_asset")
    created_count = 0
    skipped_count = 0

    for rec in recurrings:
        exp_date = _occurrence_date(rec, year, month)
        if exp_date is None:
            skipped_count += 1
            continue
        if not _is_recurring_active_on(rec, exp_date):
            skipped_count += 1
            continue
        if _create_occurrence_if_missing(rec, exp_date):
            created_count += 1
        else:
            skipped_count += 1

    logger.info(
        "generate_recurring_expenses: done — created=%s skipped=%s",
        created_count,
        skipped_count,
    )
    return {"created": created_count, "skipped": skipped_count}


def backfill_recurring_expense(rec: RecurringExpense) -> dict:
    """Create missing recurring expenses from start_date to current month."""
    disable_expired_recurrings(rec.owner)
    today = timezone.localdate()
    if rec.status != RecurringExpense.STATUS_ACTIVE or not rec.is_active:
        return {"created": 0, "skipped": 0}

    start_month = date_cls(rec.start_date.year, rec.start_date.month, 1)
    end_cap = rec.end_date if rec.end_date else today
    end_month = date_cls(end_cap.year, end_cap.month, 1)
    if start_month > end_month:
        return {"created": 0, "skipped": 0}

    created = 0
    skipped = 0
    current = start_month
    while current <= end_month:
        occurrence_date = _occurrence_date(rec, current.year, current.month)
        if occurrence_date is None:
            skipped += 1
            current = _next_month(current)
            continue
        if _is_recurring_active_on(rec, occurrence_date):
            if _create_occurrence_if_missing(rec, occurrence_date):
                created += 1
            else:
                skipped += 1
        else:
            skipped += 1
        current = _next_month(current)
    return {"created": created, "skipped": skipped}


def recurring_status(user, year: int, month: int) -> dict:
    """Stato per il widget dashboard: per ogni ricorrente attiva indica se la
    Expense per il mese target è già stata generata o è in attesa."""
    disable_expired_recurrings(user)
    recurrings = (
        RecurringExpense.objects.filter(
            owner=user,
            status=RecurringExpense.STATUS_ACTIVE,
            is_active=True,
        )
        .select_related("category")
        .order_by("day_of_month", "id")
    )
    items = []
    generated = 0
    for rec in recurrings:
        occurrence_date = _occurrence_date(rec, year, month)
        if occurrence_date is None:
            continue
        if not _is_recurring_active_on(rec, occurrence_date):
            continue
        is_generated = _recurring_already_generated(rec, occurrence_date)
        if is_generated:
            generated += 1
        items.append(
            {
                "id": rec.id,
                "description": rec.description,
                "amount": str(rec.amount),
                "frequency": rec.frequency,
                "day_of_month": rec.day_of_month,
                "month_of_year": rec.month_of_year,
                "start_date": rec.start_date.isoformat(),
                "end_date": rec.end_date.isoformat() if rec.end_date else None,
                "category": (
                    {
                        "id": rec.category_id,
                        "name": rec.category.name,
                        "color": rec.category.color,
                        "icon": rec.category.icon,
                    }
                    if rec.category
                    else None
                ),
                "status": "generated" if is_generated else "pending",
            }
        )
    total = len(items)
    return {
        "month": month,
        "year": year,
        "items": items,
        "summary": {
            "generated": generated,
            "pending": total - generated,
            "total": total,
        },
    }


def _next_month(current: date_cls) -> date_cls:
    if current.month == 12:
        return date_cls(current.year + 1, 1, 1)
    return date_cls(current.year, current.month + 1, 1)


def track_description_suggestion(expense: Expense) -> None:
    """Aggiorna la suggestion per category/description e mantiene solo le 10 più recenti."""
    text = (expense.description or "").strip()
    if not (expense.owner_id and expense.category_id and text):
        logger.debug(
            "track_description_suggestion: skip expense=%s owner=%s category=%s text=%r",
            expense.pk,
            expense.owner_id,
            expense.category_id,
            text,
        )
        return

    logger.info(
        "track_description_suggestion: expense=%s owner=%s category=%s text=%r",
        expense.pk,
        expense.owner_id,
        expense.category_id,
        text,
    )
    # `text` is encrypted (randomized), so we match on its deterministic blind
    # index. The unique constraint is on (owner, category, text_bidx), so
    # get_or_create keeps its atomic race-safety.
    suggestion, created = ExpenseDescriptionSuggestion.objects.get_or_create(
        owner=expense.owner,
        category=expense.category,
        text_bidx=crypto.blind_index(text),
        defaults={"text": text, "use_count": 1},
    )
    if not created:
        ExpenseDescriptionSuggestion.objects.filter(pk=suggestion.pk).update(
            use_count=F("use_count") + 1,
            last_used_at=timezone.now(),
        )

    keep_ids = list(
        ExpenseDescriptionSuggestion.objects.filter(
            owner=expense.owner,
            category=expense.category,
        )
        .order_by("-last_used_at", "-use_count", "-pk")
        .values_list("id", flat=True)[:10]
    )
    deleted, _ = (
        ExpenseDescriptionSuggestion.objects.filter(
            owner=expense.owner,
            category=expense.category,
        )
        .exclude(pk__in=keep_ids)
        .delete()
    )
    logger.debug(
        "track_description_suggestion: created=%s pruned=%s owner=%s category=%s",
        created,
        deleted,
        expense.owner_id,
        expense.category_id,
    )


# --- Dati campione per il seed demo ---
_EXPENSE_SAMPLES = [
    ("Grocery shopping", 40, 130),
    ("Restaurant dinner", 25, 90),
    ("Coffee", 2, 8),
    ("Supermarket run", 50, 160),
    ("Netflix", 13, 18),
    ("Spotify", 10, 15),
    ("Gym membership", 30, 65),
    ("Fuel", 45, 110),
    ("Pharmacy", 12, 50),
    ("Electricity bill", 70, 190),
    ("Internet bill", 28, 55),
    ("Clothing", 35, 220),
    ("Books", 12, 45),
    ("Movie tickets", 14, 32),
    ("Public transport", 18, 65),
    ("Haircut", 18, 55),
    ("Online shopping", 25, 160),
    ("Lunch", 8, 22),
    ("Parking", 4, 18),
    ("Medical visit", 50, 180),
    ("Home maintenance", 80, 300),
    ("Insurance", 100, 250),
]

_INCOME_SAMPLES = [
    ("Monthly salary", 2500, 5000),
    ("Freelance payment", 400, 1800),
    ("Consulting fee", 300, 1200),
    ("Dividend payment", 50, 400),
    ("Bonus", 500, 2500),
    ("Rental income", 700, 1600),
    ("Tax refund", 200, 800),
]

_ASSET_SAMPLES = [
    ("iShares Core MSCI World", "IWDA.AS", 12000, 28000, True, "ETF"),
    ("Vanguard FTSE All-World", "VWCE.DE", 8000, 22000, True, "ETF"),
    ("Apple Inc.", "AAPL", 3000, 14000, True, "Stock"),
    ("Bitcoin", "BTC-USD", 2000, 15000, True, "Crypto"),
    ("Apartment — Milan", "", 200000, 380000, False, "Real Estate"),
    ("BTP Italia 2030", "", 8000, 35000, True, "Bond"),
    ("European Growth Fund", "", 6000, 22000, True, "Fund"),
    ("Gold ETF", "GOLD.L", 3000, 10000, True, "ETF"),
]


def _seed_clear_demo_data(user, Asset, InvestmentType, FireSettings, RecurringExpense):
    """Wipe the demo user's data before re-seeding (current user only)."""
    Expense.objects.filter(owner=user).delete()
    Budget.objects.filter(owner=user).delete()
    RecurringExpense.objects.filter(owner=user).delete()
    Asset.objects.filter(owner=user).delete()
    FireSettings.objects.filter(owner=user).delete()


def _seed_default_categories(user):
    """Create the demo user's default expense/income categories (idempotent)."""
    defaults = [
        ("Food & Groceries", "#e8845a", "🛒", Category.EXPENSE),
        ("Transport", "#5a8ee8", "🚌", Category.EXPENSE),
        ("Entertainment", "#8e5ae8", "🎬", Category.EXPENSE),
        ("Health", "#5ae898", "💊", Category.EXPENSE),
        ("Home", "#e8c85a", "🏠", Category.EXPENSE),
        ("Shopping", "#e85a8e", "👗", Category.EXPENSE),
        ("Utilities", "#5ae8e8", "⚡", Category.EXPENSE),
        ("Other", "#8e8e8e", "📦", Category.EXPENSE),
        ("Salary", "#4ade80", "💼", Category.INCOME),
        ("Investments", "#60a5fa", "📈", Category.INCOME),
    ]
    for name, color, icon, cat_type in defaults:
        Category.objects.get_or_create(
            name=name,
            owner=user,
            parent=None,
            defaults={"color": color, "icon": icon, "category_type": cat_type},
        )


def _seed_default_investment_types(user, InvestmentType):
    """Create the demo user's default investment types (idempotent)."""
    # (name, color, icon, supports_ticker, is_liquid_default, is_bank_account)
    defaults = [
        ("Bank Account", "#22d3ee", "🏦", False, True, True),
        ("ETF", "#4f7fff", "📊", True, True, False),
        ("Stock", "#60a5fa", "📈", True, True, False),
        ("Crypto", "#f59e0b", "₿", True, True, False),
        ("Bond", "#34d399", "🏛️", True, True, False),
        ("Real Estate", "#a78bfa", "🏠", False, False, False),
        ("Fund", "#6ee7b7", "💼", False, False, False),
    ]
    for (
        name,
        color,
        icon,
        supports_ticker,
        is_liquid_default,
        is_bank_account,
    ) in defaults:
        InvestmentType.objects.get_or_create(
            name=name,
            owner=user,
            defaults={
                "color": color,
                "icon": icon,
                "supports_ticker": supports_ticker,
                "is_liquid_default": is_liquid_default,
                "is_bank_account": is_bank_account,
            },
        )


def _demo_monthly_frames(today):
    """The six month-start dates (oldest→newest) the demo data spans."""
    frames = []
    cursor = date_cls(today.year, today.month, 1)
    for _ in range(6):
        frames.append(cursor)
        if cursor.month == 1:
            cursor = date_cls(cursor.year - 1, 12, 1)
        else:
            cursor = date_cls(cursor.year, cursor.month - 1, 1)
    frames.reverse()
    return frames


def _seed_demo_budgets(user):
    """Create sample monthly budgets for the demo user (idempotent)."""
    demo_budgets = [
        ("Food & Groceries", 400),
        ("Transport", 150),
        ("Entertainment", 100),
        ("Home", 200),
        ("Shopping", 150),
        ("Utilities", 120),
    ]
    for cat_name, amount in demo_budgets:
        cat = Category.objects.filter(name=cat_name, owner=user).first()
        if cat:
            Budget.objects.get_or_create(
                category=cat,
                owner=user,
                defaults={"amount": amount},
            )


def seed_demo_for_user(user, Asset, InvestmentType, *, month_key=None):
    from portfolio.models import AssetTransaction
    from decimal import Decimal as _D
    from portfolio.prices import rebuild_manual_history
    from portfolio.services import (
        ensure_default_contribution_sources,
        transfer_between_accounts,
    )
    from fininzen.models import DemoSeedState
    from portfolio.models import FireSettings
    from expenses.models import RecurringExpense

    def _recompute_and_rebuild(account):
        account.recompute_from_transactions()
        account.refresh_from_db()
        rebuild_manual_history(account)

    seed_key = month_key or timezone.localdate().strftime("%Y-%m")
    rng = random.Random(f"demo-seed:{seed_key}")
    today = timezone.localdate()

    # Pulizia + scaffolding di default (solo i dati dell'utente corrente)
    _seed_clear_demo_data(user, Asset, InvestmentType, FireSettings, RecurringExpense)
    _seed_default_categories(user)
    _seed_default_investment_types(user, InvestmentType)
    ensure_default_contribution_sources(user)

    expense_cats = list(
        Category.objects.filter(owner=user, category_type=Category.EXPENSE)
    )
    income_cats = list(
        Category.objects.filter(owner=user, category_type=Category.INCOME)
    )
    inv_types = list(InvestmentType.objects.filter(owner=user))

    # ── Bank accounts — creati PRIMA delle spese per poterli linkare ──────────
    bank_account_type = InvestmentType.objects.filter(
        owner=user, is_bank_account=True
    ).first()
    _BANK_ACCOUNT_SAMPLES = [
        ("Checking Account", round(rng.uniform(6000, 12000), 2)),
        ("Savings Account", round(rng.uniform(15000, 30000), 2)),
    ]
    assets_created = 0
    checking_account = None
    savings_account = None
    one_year_ago = date_cls(today.year - 1, today.month, 1)
    for i, (name, balance) in enumerate(_BANK_ACCOUNT_SAMPLES):
        if not bank_account_type:
            continue
        acct = Asset.objects.create(
            name=name,
            tracking_type=Asset.MANUAL,
            investment_type=bank_account_type,
            is_liquid=True,
            owner=user,
        )
        AssetTransaction.objects.create(
            asset=acct,
            transaction_type=AssetTransaction.CASH_IN,
            date=one_year_ago,
            shares=_D("1"),
            price_per_share=_D(str(balance)),
            is_verified=True,
            owner=user,
        )
        _recompute_and_rebuild(acct)
        if i == 0:
            checking_account = acct
        else:
            savings_account = acct
        assets_created += 1

    # ── Spese ed entrate — 1 spesa per mese linkata al checking account ───────
    expenses_created = 0
    monthly_frames = _demo_monthly_frames(today)

    for frame in monthly_frames:
        ref = frame
        year, month = ref.year, ref.month
        _, days_in_month = calendar.monthrange(year, month)

        linked_count = 0
        for _ in range(rng.randint(8, 15)):
            desc, lo, hi = rng.choice(_EXPENSE_SAMPLES)
            cat = rng.choice(expense_cats) if expense_cats else None
            linked = (
                checking_account if (checking_account and linked_count < 3) else None
            )
            if linked:
                linked_count += 1
            Expense.objects.create(
                description=desc,
                amount=round(rng.uniform(lo, hi), 2),
                category=cat,
                date=date_cls(year, month, rng.randint(1, days_in_month)),
                linked_asset=linked,
                is_verified=True,
                owner=user,
            )
            expenses_created += 1

        for _ in range(rng.randint(1, 3)):
            desc, lo, hi = rng.choice(_INCOME_SAMPLES)
            cat = rng.choice(income_cats) if income_cats else None
            Expense.objects.create(
                description=desc,
                amount=round(rng.uniform(lo, hi), 2),
                category=cat,
                date=date_cls(year, month, rng.randint(1, days_in_month)),
                is_verified=True,
                owner=user,
            )
            expenses_created += 1

    # Ricalcola il checking account dopo i shadow CASH_OUT creati dal signal
    if checking_account:
        checking_account.refresh_from_db()
        _recompute_and_rebuild(checking_account)

    # ── Ricorrenze: current month always has cashflow rows ────────────────────
    salary_cat = next(
        (cat for cat in income_cats if cat.name == "Salary"),
        income_cats[0] if income_cats else None,
    )
    invest_cat = next(
        (cat for cat in income_cats if cat.name == "Investments"),
        income_cats[0] if income_cats else None,
    )
    default_expense_cat = expense_cats[0] if expense_cats else salary_cat

    def pick_expense_cat(index: int):
        if index < len(expense_cats):
            return expense_cats[index]
        return default_expense_cat

    recurring_specs = [
        {
            "description": "Monthly Salary",
            "amount": round(rng.uniform(3200, 4800), 2),
            "category": salary_cat,
            "linked_asset": checking_account,
            "day_of_month": 25,
            "months_back": 6,
        },
        {
            "description": "Rent",
            "amount": round(rng.uniform(1050, 1650), 2),
            "category": pick_expense_cat(1),
            "linked_asset": checking_account,
            "day_of_month": 5,
            "months_back": 6,
        },
        {
            "description": "Streaming bundle",
            "amount": round(rng.uniform(18, 42), 2),
            "category": pick_expense_cat(2),
            "linked_asset": checking_account,
            "day_of_month": 12,
            "months_back": 6,
        },
        {
            "description": "Investment contributions",
            "amount": round(rng.uniform(250, 650), 2),
            "category": invest_cat,
            "linked_asset": None,
            "day_of_month": 20,
            "months_back": 6,
        },
    ]
    for spec in recurring_specs:
        if not spec["category"]:
            continue
        rec = RecurringExpense.objects.create(
            owner=user,
            description=spec["description"],
            amount=spec["amount"],
            category=spec["category"],
            linked_asset=spec["linked_asset"],
            day_of_month=spec["day_of_month"],
            start_date=date_cls(monthly_frames[0].year, monthly_frames[0].month, 1),
            is_active=True,
            status=RecurringExpense.STATUS_ACTIVE,
        )
        backfill_recurring_expense(rec)

    # ── Budget mensili di esempio ─────────────────────────────────────────────
    _seed_demo_budgets(user)

    # Asset di investimento — tutti MANUAL con ticker="" per garantire la costruzione
    # della price history tramite rebuild_manual_history (no-op se has_ticker=True).
    inv_type_by_name = {t.name: t for t in inv_types}
    sample_assets = rng.sample(
        _ASSET_SAMPLES, k=rng.randint(4, min(7, len(_ASSET_SAMPLES)))
    )
    for name, _ticker, lo, hi, liquid, type_name in sample_assets:
        invested = round(rng.uniform(lo, hi), 2)
        current = round(invested * rng.uniform(0.92, 1.30), 2)
        inv_type = inv_type_by_name.get(type_name)
        asset = Asset.objects.create(
            name=name,
            ticker="",
            tracking_type=Asset.MANUAL,
            investment_type=inv_type,
            is_liquid=liquid,
            invested_capital=_D(str(invested)),
            current_value=_D(str(current)),
            owner=user,
        )
        AssetTransaction.objects.create(
            asset=asset,
            transaction_type=AssetTransaction.CASH_IN,
            date=monthly_frames[0],
            shares=_D("1"),
            price_per_share=_D(str(invested)),
            is_verified=True,
            owner=user,
        )
        value = _D(str(invested))
        for idx, frame in enumerate(monthly_frames[1:], start=1):
            growth = _D(str(rng.uniform(-0.04, 0.09)))
            value = max(_D("0"), (value * (1 + growth)).quantize(_D("0.01")))
            delta = (value - asset.current_value).quantize(_D("0.01"))
            AssetTransaction.objects.create(
                asset=asset,
                transaction_type=AssetTransaction.ADJUSTMENT,
                date=date_cls(frame.year, frame.month, min(28, 28 + idx % 2)),
                shares=_D("1"),
                price_per_share=delta,
                is_verified=True,
                owner=user,
            )
        _recompute_and_rebuild(asset)
        assets_created += 1

    # One more coherent transfer story so cash flow and balance views have depth.
    if checking_account and savings_account:
        for frame in monthly_frames[-3:]:
            transfer_between_accounts(
                checking_account,
                savings_account,
                amount=_D(str(rng.uniform(120, 420))),
                tx_date=date_cls(frame.year, frame.month, min(27, 28)),
                notes="Monthly savings transfer",
                is_verified=True,
                owner=user,
            )

    fire_settings = FireSettings.get_singleton(user=user)
    fire_settings.user_age = 31
    fire_settings.retirement_age = 65
    fire_settings.target_retirement_age = 62
    fire_settings.life_expectancy = 92
    fire_settings.net_worth_goal = _D(str(round(rng.uniform(650000, 1250000), 2)))
    fire_settings.annual_expenses_override = _D(
        str(round(rng.uniform(32000, 52000), 2))
    )
    fire_settings.annual_contribution = _D(str(round(rng.uniform(12000, 38000), 2)))
    fire_settings.save()

    DemoSeedState.get_singleton()

    logger.info(
        "Demo seed: %d expenses + %d assets created",
        expenses_created,
        assets_created,
    )
    return {
        "expenses_created": expenses_created,
        "assets_created": assets_created,
    }
