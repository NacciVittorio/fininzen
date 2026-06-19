"""
portfolio/services.py — Business logic pura per il portafoglio.

Queste funzioni non dipendono da request/Response — sono testabili senza Client().
I viewsets le chiamano come thin orchestrators.
"""

import calendar
import logging
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import date as date_cls, datetime, timedelta

from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from .models import (
    Asset,
    AssetContributionSource,
    AssetPriceHistory,
    AssetTransaction,
    ContributionSource,
    DashboardSummary,
    RecurringInvestmentPlan,
)
from .prices import (
    backfill_price_history,
    rebuild_manual_history,
    log_illiquid_value_snapshot,
)

logger = logging.getLogger(__name__)

_Q2 = Decimal("0.01")


IMPORT_DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%m/%d/%Y"]
DEFAULT_CONTRIBUTION_SOURCE_NAMES = [
    "Payroll withholding",
    "Employer contribution",
    "TFR",
    "Other non-account source",
]


class ArchivedAssetTransactionError(ValueError):
    """Raised when a transaction mutation targets an archived asset."""


def _q2(value):
    return Decimal(value or 0).quantize(_Q2, rounding=ROUND_HALF_UP)


def _ensure_transaction_asset_mutable(asset: Asset) -> None:
    if asset.is_archived:
        raise ArchivedAssetTransactionError("Archived asset transactions are read-only")


def asset_current_value_eur(asset):
    if not asset.currency or asset.currency == "EUR":
        return asset.current_value or Decimal("0")
    return asset.current_value_eur


def asset_invested_capital_eur(asset):
    if not asset.currency or asset.currency == "EUR":
        return asset.invested_capital or Decimal("0")
    return asset.invested_capital_eur


def parse_import_date(raw):
    """Multi-format date parser shared by every portfolio CSV importer so the
    UI's column-mapping contract stays identical across dataset types."""
    s = str(raw or "").strip()
    if not s:
        return None
    for fmt in IMPORT_DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def parse_import_decimal(raw):
    """Decimal parser tolerant of European/US thousand separators and stray
    whitespace, mirroring the cashflow importer's contract."""
    s = str(raw or "").strip()
    if not s:
        return None
    cleaned = s.replace("\xa0", "").replace(" ", "")
    # If both ',' and '.' present, assume the rightmost is the decimal sep.
    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    else:
        cleaned = cleaned.replace(",", ".")
    try:
        return Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return None


def ensure_default_contribution_sources(user):
    """Create editable default contribution sources for a newly provisioned user."""
    if not (user and getattr(user, "is_authenticated", True)):
        return []
    existing = list(
        ContributionSource.objects.filter(owner=user).order_by("sort_order", "name")
    )
    if existing:
        return existing
    created = []
    for idx, name in enumerate(DEFAULT_CONTRIBUTION_SOURCE_NAMES):
        source, _ = ContributionSource.objects.get_or_create(
            owner=user,
            name=name,
            defaults={"sort_order": idx, "is_active": True},
        )
        created.append(source)
    return created


def available_contribution_sources_for_asset(
    asset: Asset, *, owner=None, include_inactive=False
):
    """Return the source set allowed for an asset.

    Assets can either use all active user sources or a per-asset subset when
    AssetContributionSource links exist.
    """
    owner = owner or asset.owner
    if not owner:
        return ContributionSource.objects.none()
    if not asset.supports_contribution_source:
        return ContributionSource.objects.none()
    if (
        asset.investment_type and asset.investment_type.is_bank_account
    ) or asset.tracking_type == Asset.MANUAL:
        return ContributionSource.objects.none()

    base = ContributionSource.objects.filter(owner=owner)
    if not include_inactive:
        base = base.filter(is_active=True)

    links = AssetContributionSource.objects.filter(owner=owner, asset=asset)
    if links.exists():
        return (
            base.filter(asset_links__owner=owner, asset_links__asset=asset)
            .distinct()
            .order_by(
                "asset_links__sort_order",
                "sort_order",
                "name",
            )
        )
    return base.order_by("sort_order", "name")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _recompute_asset_locked(asset: Asset) -> None:
    """Recompute an asset from its transactions, holding a row-level lock.

    `select_for_update()` is a no-op on SQLite (current dev/prod backend) but
    keeps the code correct under PostgreSQL / future backends where two
    concurrent mutations of the same Asset could otherwise race on shares /
    invested_capital totals.
    """
    with transaction.atomic():
        locked = Asset.objects.select_for_update().get(pk=asset.pk)
        locked.recompute_from_transactions()
        # Mirror the locked copy back onto the caller's instance so subsequent
        # reads (e.g. `asset.current_value`) see the recomputed values without
        # an explicit refresh_from_db.
        asset.shares = locked.shares
        asset.price_per_share = locked.price_per_share
        asset.invested_capital = locked.invested_capital
        asset.current_value = locked.current_value
        asset.current_value_eur = locked.current_value_eur
        asset.invested_capital_eur = locked.invested_capital_eur
        asset.balance_as_of = locked.balance_as_of


def _refresh_manual_asset(asset: Asset) -> None:
    """Recompute + rebuild history su asset MANUAL (best-effort)."""
    _recompute_asset_locked(asset)
    try:
        asset.refresh_from_db()
        rebuild_manual_history(asset)
    except Exception:
        logger.exception("_refresh_manual_asset: errore su asset=%s", asset.pk)


def _refresh_manual_asset_strict(asset: Asset) -> None:
    """Like _refresh_manual_asset but lets exceptions bubble up.

    Used by callers (bulk operations) that need a failure here to abort the
    surrounding transaction. The legacy `_refresh_manual_asset` swallows errors
    so signal handlers and reconcile jobs stay best-effort.
    """
    _recompute_asset_locked(asset)
    asset.refresh_from_db()
    rebuild_manual_history(asset)


def reconcile_due_manual_assets(user) -> int:
    """Apply future-dated manual movements once their date becomes effective."""
    today = timezone.localdate()
    assets = (
        Asset.objects.filter(
            owner=user,
            tracking_type=Asset.MANUAL,
            transactions__date__lte=today,
        )
        .filter(
            Q(balance_as_of__isnull=True)
            | (
                Q(balance_as_of__lt=today)
                & Q(transactions__date__gt=F("balance_as_of"))
            )
        )
        .distinct()
    )
    count = 0
    for asset in assets:
        _refresh_manual_asset(asset)
        count += 1
    return count


def _post_asset_save(asset: Asset) -> None:
    """Hook post-save for manual asset snapshots."""
    try:
        if not asset.has_ticker:
            log_illiquid_value_snapshot(asset)
    except Exception:
        logger.exception("_post_asset_save: errore su asset=%s", asset.pk)


def _is_investment_cash_mirror(tx: AssetTransaction) -> bool:
    parent = getattr(tx, "derived_from", None)
    return bool(
        parent
        and parent.transaction_type in (AssetTransaction.BUY, AssetTransaction.SELL)
        and tx.transaction_type in (AssetTransaction.CASH_IN, AssetTransaction.CASH_OUT)
    )


def _principal_derived_qs(tx: AssetTransaction):
    return tx.derived_txs.filter(derived_kind=AssetTransaction.DERIVED_PRINCIPAL)


def _verified_tax_lot_transactions(
    asset: Asset,
    *,
    through_date=None,
    exclude_tx: AssetTransaction | None = None,
):
    txs = asset.transactions.filter(is_verified=True)
    if through_date is not None:
        txs = txs.filter(date__lte=through_date)
    if exclude_tx and exclude_tx.pk:
        txs = txs.exclude(pk=exclude_tx.pk)
    return txs.order_by("date", "created_at", "pk")


def _cmp_tax_lot_state_for_asset(
    asset: Asset,
    *,
    through_date=None,
    exclude_tx: AssetTransaction | None = None,
) -> tuple[Decimal, Decimal]:
    txs = _verified_tax_lot_transactions(
        asset,
        through_date=through_date,
        exclude_tx=exclude_tx,
    )
    running_shares = Decimal("0")
    running_tax_cost = Decimal("0")
    for prev in txs:
        if prev.transaction_type == AssetTransaction.BUY:
            running_shares += prev.shares
            running_tax_cost += prev.shares * prev.price_per_share
            running_tax_cost += Decimal(prev.fee or 0)
        elif prev.transaction_type == AssetTransaction.SELL and running_shares > 0:
            avg_tax_cost = running_tax_cost / running_shares
            sold = min(prev.shares, running_shares)
            running_tax_cost -= sold * avg_tax_cost
            running_shares -= sold
    return (
        max(running_shares, Decimal("0")),
        max(running_tax_cost, Decimal("0")),
    )


def _fifo_lots_for_asset(
    asset: Asset,
    *,
    through_date=None,
    exclude_tx: AssetTransaction | None = None,
) -> list[tuple[Decimal, Decimal]]:
    txs = _verified_tax_lot_transactions(
        asset,
        through_date=through_date,
        exclude_tx=exclude_tx,
    )
    lots: list[tuple[Decimal, Decimal]] = []
    for prev in txs:
        if prev.transaction_type == AssetTransaction.BUY:
            if prev.shares <= 0:
                continue
            gross_cost = prev.shares * prev.price_per_share + Decimal(prev.fee or 0)
            unit_cost = gross_cost / prev.shares
            lots.append((prev.shares, unit_cost))
            continue
        if prev.transaction_type != AssetTransaction.SELL:
            continue
        remaining_to_sell = prev.shares
        new_lots: list[tuple[Decimal, Decimal]] = []
        for lot_shares, lot_unit_cost in lots:
            if remaining_to_sell <= 0:
                new_lots.append((lot_shares, lot_unit_cost))
                continue
            consumed = min(lot_shares, remaining_to_sell)
            remaining_to_sell -= consumed
            residual = lot_shares - consumed
            if residual > 0:
                new_lots.append((residual, lot_unit_cost))
        lots = new_lots
    return lots


def _fifo_tax_lot_state_for_asset(
    asset: Asset,
    *,
    through_date=None,
    exclude_tx: AssetTransaction | None = None,
) -> tuple[Decimal, Decimal]:
    lots = _fifo_lots_for_asset(
        asset,
        through_date=through_date,
        exclude_tx=exclude_tx,
    )
    running_shares = sum((shares for shares, _ in lots), Decimal("0"))
    running_tax_cost = sum(
        (shares * unit_cost for shares, unit_cost in lots),
        Decimal("0"),
    )
    return (
        max(running_shares, Decimal("0")),
        max(running_tax_cost, Decimal("0")),
    )


def tax_lot_state_for_asset(
    asset: Asset,
    *,
    through_date=None,
    exclude_tx: AssetTransaction | None = None,
) -> tuple[Decimal, Decimal]:
    if asset.tax == Asset.TAX_CRYPTO:
        return _fifo_tax_lot_state_for_asset(
            asset,
            through_date=through_date,
            exclude_tx=exclude_tx,
        )
    return _cmp_tax_lot_state_for_asset(
        asset,
        through_date=through_date,
        exclude_tx=exclude_tx,
    )


def remaining_tax_cost_basis(asset: Asset) -> Decimal:
    _, tax_cost = tax_lot_state_for_asset(
        asset,
        through_date=timezone.localdate(),
    )
    return _q2(tax_cost)


def tax_cost_basis_for_sell(asset: Asset, sell_tx: AssetTransaction) -> Decimal:
    if sell_tx.transaction_type != AssetTransaction.SELL or not sell_tx.is_verified:
        return Decimal("0")
    if asset.tax == Asset.TAX_CRYPTO:
        cost_basis = Decimal("0")
        remaining_to_sell = sell_tx.shares
        for lot_shares, lot_unit_cost in _fifo_lots_for_asset(
            asset,
            through_date=sell_tx.date,
            exclude_tx=sell_tx,
        ):
            if remaining_to_sell <= 0:
                break
            consumed = min(lot_shares, remaining_to_sell)
            cost_basis += consumed * lot_unit_cost
            remaining_to_sell -= consumed
        return cost_basis
    running_shares, running_tax_cost = tax_lot_state_for_asset(
        asset,
        through_date=sell_tx.date,
        exclude_tx=sell_tx,
    )
    if running_shares <= 0:
        return Decimal("0")
    avg_tax_cost = running_tax_cost / running_shares
    sold = min(sell_tx.shares, running_shares)
    return sold * avg_tax_cost


def realized_gain_for_sell(asset: Asset, sell_tx: AssetTransaction) -> Decimal:
    if sell_tx.transaction_type != AssetTransaction.SELL or not sell_tx.is_verified:
        return Decimal("0")
    return sell_tx.shares * sell_tx.price_per_share - tax_cost_basis_for_sell(
        asset, sell_tx
    )


def realized_taxable_gain_for_sell(asset: Asset, sell_tx: AssetTransaction) -> Decimal:
    gain = realized_gain_for_sell(asset, sell_tx)
    return max(gain - Decimal(sell_tx.fee or 0), Decimal("0"))


def realized_tax_for_sell(asset: Asset, sell_tx: AssetTransaction) -> Decimal:
    return _q2(
        realized_taxable_gain_for_sell(asset, sell_tx)
        * Decimal(asset.effective_tax_rate or 0)
    )


def _effective_sell_tax(asset: Asset, tx: AssetTransaction) -> Decimal:
    if tx.tax_amount_is_manual:
        return _q2(Decimal(tx.tax_amount or 0))
    return realized_tax_for_sell(asset, tx)


def _sync_parent_tax_amount(asset: Asset, tx: AssetTransaction) -> None:
    if tx.transaction_type == AssetTransaction.SELL:
        tx.tax_amount = _effective_sell_tax(asset, tx)
        tx.save(update_fields=["tax_amount"])
        _sync_transaction_eur_snapshot(tx)
        return
    if tx.tax_amount or tx.tax_amount_is_manual:
        tx.tax_amount = Decimal("0")
        tx.tax_amount_is_manual = False
        tx.save(update_fields=["tax_amount", "tax_amount_is_manual"])
        _sync_transaction_eur_snapshot(tx)


def resync_asset_tax(asset: Asset) -> int:
    """Re-snapshot the realized tax of every auto (non-manual) SELL of `asset`
    using the asset's *current* effective rate, and re-sync the derived tax cash
    movement so the linked account balances follow. Manual overrides
    (tax_amount_is_manual=True) are left untouched.

    Called when the user opts to propagate a tax-rate change — on the asset's
    override or on its investment type — to transactions that already exist
    (tax_propagation="all"). Returns the number of sells whose tax changed.
    """
    owner = asset.owner
    touched_accounts: set[Asset] = set()
    changed = 0
    sells = asset.transactions.filter(
        transaction_type=AssetTransaction.SELL,
        tax_amount_is_manual=False,
    ).prefetch_related("derived_txs")
    for tx in sells:
        before = _q2(Decimal(tx.tax_amount or 0))
        _sync_parent_tax_amount(asset, tx)
        after = _q2(Decimal(tx.tax_amount or 0))
        if before == after:
            continue
        changed += 1
        # The destination account of a sell is the asset of its principal cash
        # mirror; charge/refund the tax delta there so the balance stays correct.
        principal = (
            tx.derived_txs.filter(derived_kind=AssetTransaction.DERIVED_PRINCIPAL)
            .select_related("asset")
            .first()
        )
        if principal is not None:
            touched_accounts |= _sync_derived_cash_movement(
                tx,
                kind=AssetTransaction.DERIVED_TAX,
                account=principal.asset,
                transaction_type=AssetTransaction.CASH_OUT,
                amount=tx.tax_amount,
                notes=f"Tasse plusvalenza {asset.name}",
                owner=owner,
            )
    for acc in touched_accounts:
        _refresh_manual_asset(acc)
    if changed:
        invalidate_dashboard_summary(DashboardSummary.REASON_TRANSACTION, user=owner)
    return changed


def _historical_fx_rate_for_transaction(tx: AssetTransaction) -> Decimal | None:
    currency = (tx.asset.currency or "EUR").upper()
    if currency == "EUR":
        return Decimal("1")
    owner = tx.owner or tx.asset.owner
    from .fx import fetch_historical_exchange_rate, get_historical_exchange_rate
    from .models import FXRateHistory

    rate = get_historical_exchange_rate(currency, tx.date, owner=owner)
    if rate is not None:
        return Decimal(rate)
    rate = fetch_historical_exchange_rate(currency, tx.date)
    if rate is None:
        return None
    if owner is not None:
        FXRateHistory.objects.update_or_create(
            owner=owner,
            from_currency=currency,
            to_currency="EUR",
            date=tx.date,
            defaults={"rate": rate},
        )
    return Decimal(rate)


def _sync_transaction_eur_snapshot(tx: AssetTransaction) -> None:
    rate = _historical_fx_rate_for_transaction(tx)
    if rate is None:
        if tx.is_verified:
            currency = (tx.asset.currency or "EUR").upper()
            raise ValueError(
                f"Historical FX rate unavailable for {currency}/EUR on {tx.date}"
            )
        tx.fx_rate_to_eur = None
        tx.gross_amount_eur = None
        tx.fee_eur = None
        tx.tax_amount_eur = None
    else:
        gross_native = tx.shares * tx.price_per_share
        tx.fx_rate_to_eur = rate
        tx.gross_amount_eur = _q2(gross_native * rate)
        tx.fee_eur = _q2(Decimal(tx.fee or 0) * rate)
        tx.tax_amount_eur = _q2(Decimal(tx.tax_amount or 0) * rate)
    tx.save(
        update_fields=[
            "fx_rate_to_eur",
            "gross_amount_eur",
            "fee_eur",
            "tax_amount_eur",
        ]
    )


def _sync_derived_cash_movement(
    parent: AssetTransaction,
    *,
    kind: str,
    account: Asset | None,
    transaction_type: str,
    amount: Decimal,
    notes: str,
    owner,
) -> set[Asset]:
    touched = set()
    existing = (
        parent.derived_txs.filter(derived_kind=kind).select_related("asset").first()
    )
    amount = _q2(amount)
    if account is None or amount <= 0:
        if existing:
            touched.add(existing.asset)
            existing.delete()
        return touched
    if existing:
        old_asset = existing.asset
        existing.asset = account
        existing.transaction_type = transaction_type
        existing.price_per_share = amount
        existing.date = parent.date
        existing.notes = notes
        existing.is_verified = parent.is_verified
        existing.owner = owner
        existing.save(
            update_fields=[
                "asset",
                "transaction_type",
                "price_per_share",
                "date",
                "notes",
                "is_verified",
                "owner",
            ]
        )
        _sync_transaction_eur_snapshot(existing)
        touched.add(old_asset)
        touched.add(account)
        return touched
    created = AssetTransaction.objects.create(
        asset=account,
        transaction_type=transaction_type,
        date=parent.date,
        shares=Decimal("1"),
        price_per_share=amount,
        notes=notes,
        derived_from=parent,
        derived_kind=kind,
        is_verified=parent.is_verified,
        owner=owner,
    )
    _sync_transaction_eur_snapshot(created)
    touched.add(account)
    return touched


def _is_plan_active_on(plan: RecurringInvestmentPlan, target_date: date_cls) -> bool:
    if plan.status != RecurringInvestmentPlan.STATUS_ACTIVE or not plan.is_active:
        return False
    if target_date < plan.start_date:
        return False
    if plan.end_date and target_date > plan.end_date:
        return False
    return True


def _month_anchor(plan: RecurringInvestmentPlan) -> int:
    return plan.anchor_month or plan.start_date.month


def _planned_investment_occurrences(
    plan: RecurringInvestmentPlan, year: int, month: int
) -> list[date_cls]:
    _, days_in_month = calendar.monthrange(year, month)
    if plan.frequency == RecurringInvestmentPlan.FREQUENCY_WEEKLY:
        weekday = plan.day_of_week or plan.start_date.isoweekday()
        days = []
        for day_num in range(1, days_in_month + 1):
            day = date_cls(year, month, day_num)
            if day.isoweekday() == weekday and _is_plan_active_on(plan, day):
                days.append(day)
        return days

    interval = {
        RecurringInvestmentPlan.FREQUENCY_MONTHLY: 1,
        RecurringInvestmentPlan.FREQUENCY_QUARTERLY: 3,
        RecurringInvestmentPlan.FREQUENCY_SEMIANNUAL: 6,
        RecurringInvestmentPlan.FREQUENCY_ANNUAL: 12,
    }.get(plan.frequency, 1)
    anchor = _month_anchor(plan)
    months_delta = (year - plan.start_date.year) * 12 + (month - anchor)
    if months_delta < 0 or months_delta % interval != 0:
        return []
    day = date_cls(year, month, min(plan.day_of_month, days_in_month))
    return [day] if _is_plan_active_on(plan, day) else []


def _market_open_price_for_plan(
    plan: RecurringInvestmentPlan, occurrence_date: date_cls, *, max_days=10
) -> tuple[date_cls | None, Decimal | None]:
    window_end = occurrence_date + timedelta(days=max_days)
    quote = (
        AssetPriceHistory.objects.filter(
            asset=plan.asset,
            date__gte=occurrence_date,
            date__lte=window_end,
            open__gt=0,
        )
        .order_by("date")
        .first()
    )
    if quote:
        return quote.date, quote.open
    if plan.asset.has_ticker:
        try:
            backfill_price_history(plan.asset, from_date=occurrence_date)
        except Exception:
            logger.exception(
                "PAC price backfill failed for asset=%s occurrence=%s",
                plan.asset_id,
                occurrence_date,
            )
        quote = (
            AssetPriceHistory.objects.filter(
                asset=plan.asset,
                date__gte=occurrence_date,
                date__lte=window_end,
                open__gt=0,
            )
            .order_by("date")
            .first()
        )
        if quote:
            return quote.date, quote.open
    return None, None


def _recurring_investment_already_generated(
    plan: RecurringInvestmentPlan, occurrence_date: date_cls
) -> bool:
    return AssetTransaction.objects.filter(
        owner=plan.owner,
        recurring_plan=plan,
        recurring_occurrence_date=occurrence_date,
        derived_from__isnull=True,
    ).exists()


def generate_recurring_investments(user, year: int, month: int) -> dict:
    """Generate due PAC transactions for a month."""
    plans = (
        RecurringInvestmentPlan.objects.filter(
            owner=user,
            status=RecurringInvestmentPlan.STATUS_ACTIVE,
            is_active=True,
        )
        .select_related("asset", "source_account", "asset__investment_type")
        .order_by("id")
    )
    created = 0
    skipped = 0
    missing_price = 0
    items = []
    for plan in plans:
        for occurrence_date in _planned_investment_occurrences(plan, year, month):
            if _recurring_investment_already_generated(plan, occurrence_date):
                skipped += 1
                items.append(
                    {
                        "id": plan.id,
                        "occurrence_date": occurrence_date.isoformat(),
                        "status": "skipped",
                    }
                )
                continue
            execution_date, open_price = _market_open_price_for_plan(
                plan, occurrence_date
            )
            if execution_date is None or open_price is None:
                missing_price += 1
                items.append(
                    {
                        "id": plan.id,
                        "occurrence_date": occurrence_date.isoformat(),
                        "status": "price_missing",
                    }
                )
                continue
            shares = (plan.amount / open_price).quantize(Decimal("0.000001"))
            with transaction.atomic():
                tx = AssetTransaction.objects.create(
                    asset=plan.asset,
                    transaction_type=AssetTransaction.BUY,
                    date=execution_date,
                    shares=shares,
                    price_per_share=open_price,
                    notes=f"PAC {plan.name}",
                    recurring_plan=plan,
                    recurring_occurrence_date=occurrence_date,
                    is_verified=plan.generated_transactions_verified,
                    owner=user,
                )
                _sync_transaction_eur_snapshot(tx)
                _recompute_asset_locked(plan.asset)
                cash_tx = AssetTransaction.objects.create(
                    asset=plan.source_account,
                    transaction_type=AssetTransaction.CASH_OUT,
                    date=execution_date,
                    shares=Decimal("1"),
                    price_per_share=plan.amount,
                    notes=f"PAC {plan.asset.name}",
                    derived_from=tx,
                    is_verified=plan.generated_transactions_verified,
                    owner=user,
                )
                _sync_transaction_eur_snapshot(cash_tx)
                _refresh_manual_asset(plan.source_account)
            created += 1
            items.append(
                {
                    "id": plan.id,
                    "occurrence_date": occurrence_date.isoformat(),
                    "execution_date": execution_date.isoformat(),
                    "status": "created",
                }
            )
    if created:
        invalidate_dashboard_summary(DashboardSummary.REASON_TRANSACTION, user=user)
    return {
        "created": created,
        "skipped": skipped,
        "price_missing": missing_price,
        "items": items,
    }


def recurring_investment_status(user, year: int, month: int) -> dict:
    plans = (
        RecurringInvestmentPlan.objects.filter(
            owner=user,
            status=RecurringInvestmentPlan.STATUS_ACTIVE,
            is_active=True,
        )
        .select_related("asset")
        .order_by("id")
    )
    items = []
    generated = 0
    pending = 0
    price_missing = 0
    for plan in plans:
        for occurrence_date in _planned_investment_occurrences(plan, year, month):
            is_generated = _recurring_investment_already_generated(
                plan, occurrence_date
            )
            execution_date, open_price = (None, None)
            if not is_generated:
                execution_date, open_price = _market_open_price_for_plan(
                    plan, occurrence_date
                )
            if is_generated:
                status = "generated"
                generated += 1
            elif open_price is None:
                status = "price_missing"
                price_missing += 1
            else:
                status = "pending"
                pending += 1
            items.append(
                {
                    "id": plan.id,
                    "name": plan.name,
                    "asset": plan.asset_id,
                    "asset_name": plan.asset.name,
                    "amount": str(plan.amount),
                    "frequency": plan.frequency,
                    "occurrence_date": occurrence_date.isoformat(),
                    "execution_date": (
                        execution_date.isoformat() if execution_date else None
                    ),
                    "open_price": str(open_price) if open_price is not None else None,
                    "status": status,
                }
            )
    return {
        "month": month,
        "year": year,
        "items": items,
        "summary": {
            "generated": generated,
            "pending": pending,
            "price_missing": price_missing,
            "total": len(items),
        },
    }


# ---------------------------------------------------------------------------
# Asset lifecycle
# ---------------------------------------------------------------------------


def create_asset_with_initial_balance(
    serializer, owner, initial_balance_raw=None
) -> Asset:
    """Salva atomicamente Asset e saldo iniziale manuale."""
    initial_balance = None
    tracking_type = serializer.validated_data.get("tracking_type", Asset.AUTO)
    if tracking_type == Asset.MANUAL and initial_balance_raw not in (None, "", 0, "0"):
        try:
            initial_balance = Decimal(str(initial_balance_raw))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise ValueError("initial_balance must be a positive decimal") from exc
        if initial_balance <= 0:
            raise ValueError("initial_balance must be greater than zero")

    with transaction.atomic():
        asset = serializer.save(owner=owner)
        logger.debug(
            "create_asset_with_initial_balance: asset=%s tracking=%s initial_balance=%s",
            asset.name,
            asset.tracking_type,
            initial_balance,
        )
        if asset.investment_type:
            asset.is_liquid = asset.investment_type.is_liquid_default
            asset.save(update_fields=["is_liquid"])
        if initial_balance is not None:
            tx = AssetTransaction.objects.create(
                asset=asset,
                transaction_type=AssetTransaction.CASH_IN,
                date=date_cls.today(),
                shares=Decimal("1"),
                price_per_share=initial_balance,
                notes="",
                is_verified=True,
                owner=owner,
            )
            _sync_transaction_eur_snapshot(tx)
            _refresh_manual_asset(asset)
    _post_asset_save(asset)
    return asset


def delete_asset_cascade(asset: Asset) -> dict:
    """Elimina un asset e ricalcola i conti collegati che avevano tx derivate."""
    logger.info("delete_asset_cascade: asset=%s id=%s", asset.name, asset.pk)
    owner = asset.owner
    affected_asset_ids = set(
        AssetTransaction.objects.filter(derived_from__asset=asset)
        .exclude(asset=asset)
        .values_list("asset_id", flat=True)
        .distinct()
    )
    with transaction.atomic():
        asset.delete()
        for aid in affected_asset_ids:
            try:
                a = Asset.objects.get(pk=aid)
                _refresh_manual_asset(a)
            except Asset.DoesNotExist:
                pass
    invalidate_dashboard_summary(DashboardSummary.REASON_ASSET_CHANGED, user=owner)
    return {"affected_accounts": list(affected_asset_ids)}


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------


def _get_bank_account(account_id, owner):
    if account_id in (None, ""):
        return None
    value = str(account_id).strip()
    if not value:
        return None
    qs = Asset.objects.filter(
        owner=owner,
        tracking_type=Asset.MANUAL,
        investment_type__is_bank_account=True,
    )
    if value.isdigit():
        try:
            return qs.get(pk=int(value))
        except Asset.DoesNotExist as exc:
            raise ValueError("Linked account is invalid") from exc
    else:
        try:
            return qs.get(name__iexact=value)
        except Asset.DoesNotExist as exc:
            raise ValueError(f"Linked account '{value}' not found") from exc


def validate_transaction(asset, data, *, exclude_tx=None, source_account_id=None):
    """Validate ledger invariants for create, patch and imports."""
    tx_type = data["transaction_type"]
    shares = Decimal(data["shares"])
    price = Decimal(data["price_per_share"])
    contribution_source = data.get("contribution_source")
    contribution_source_id = None
    if contribution_source:
        if isinstance(contribution_source, ContributionSource):
            contribution_source_id = contribution_source.pk
        else:
            try:
                contribution_source_id = int(str(contribution_source).strip())
            except (TypeError, ValueError) as exc:
                raise ValueError("Contribution source is invalid") from exc
    has_source_account = str(source_account_id or "").strip() != ""
    if shares <= 0:
        raise ValueError("Shares must be greater than zero")
    if tx_type == AssetTransaction.ADJUSTMENT:
        if price == 0:
            raise ValueError("Adjustment amount must be non-zero")
    elif price <= 0:
        raise ValueError("Amount must be greater than zero")
    fee = Decimal(data.get("fee", Decimal("0")) or 0)
    if fee < 0:
        raise ValueError("Fee must be greater than or equal to zero")

    if contribution_source_id:
        if tx_type != AssetTransaction.BUY:
            raise ValueError("Contribution source is allowed only on buy transactions")
        if has_source_account:
            raise ValueError("Contribution source cannot be used with a source account")
        if (
            asset.investment_type and asset.investment_type.is_bank_account
        ) or asset.tracking_type == Asset.MANUAL:
            raise ValueError("Contribution source is not allowed on bank accounts")
        if not asset.supports_contribution_source:
            raise ValueError("This asset does not support contribution sources")
        owner = asset.owner
        source = ContributionSource.objects.filter(pk=contribution_source_id).first()
        if not source or source.owner_id != getattr(owner, "id", None):
            raise ValueError("Contribution source is invalid")
        if not source.is_active:
            raise ValueError("Contribution source is inactive")
        allowed = available_contribution_sources_for_asset(asset, owner=owner)
        if not allowed.filter(pk=source.pk).exists():
            raise ValueError("Contribution source is not available for this asset")

    tx_is_verified = bool(
        data.get(
            "is_verified",
            getattr(exclude_tx, "is_verified", False)
            if exclude_tx is not None
            else False,
        )
    )
    if tx_type != AssetTransaction.SELL or not tx_is_verified:
        return
    tx_date = data["date"]
    qs = asset.transactions.filter(date__lte=tx_date, is_verified=True)
    if exclude_tx is not None:
        qs = qs.exclude(pk=exclude_tx.pk)
    owned = Decimal("0")
    for prev in qs.order_by("date", "created_at"):
        if prev.transaction_type == AssetTransaction.BUY:
            owned += prev.shares
        elif prev.transaction_type == AssetTransaction.SELL:
            owned -= prev.shares
    if shares > owned:
        raise ValueError(
            f"Cannot sell {shares} shares - only {owned} owned at {tx_date}"
        )


def create_transaction(
    asset: Asset,
    serializer,
    source_account_id=None,
    dest_account_id=None,
    owner=None,
) -> tuple[AssetTransaction, dict]:
    """Crea una transazione sull'asset con eventuali tx derivate su conti collegati.

    Ritorna (tx, response_extra) dove response_extra può contenere {"warning": "insufficient_balance"}.
    Lancia ValueError se SELL eccede le quote possedute.
    """
    response_extra = {}

    owner = owner or asset.owner
    _ensure_transaction_asset_mutable(asset)
    validate_transaction(
        asset,
        serializer.validated_data,
        source_account_id=source_account_id,
    )
    tx_type = serializer.validated_data["transaction_type"]
    src = (
        _get_bank_account(source_account_id, owner)
        if tx_type == AssetTransaction.BUY
        else None
    )
    dst = (
        _get_bank_account(dest_account_id, owner)
        if tx_type == AssetTransaction.SELL
        else None
    )

    with transaction.atomic():
        tx = serializer.save(asset=asset, owner=owner)
        _sync_transaction_eur_snapshot(tx)
        _recompute_asset_locked(asset)
        if asset.tracking_type == Asset.MANUAL:
            _refresh_manual_asset(asset)

        tx_type = tx.transaction_type
        fee = Decimal(tx.fee or 0)
        if tx_type == AssetTransaction.BUY and src:
            cost = _q2(tx.shares * tx.price_per_share)
            if src.current_value < cost + fee:
                response_extra["warning"] = "insufficient_balance"
            touched = _sync_derived_cash_movement(
                tx,
                kind=AssetTransaction.DERIVED_PRINCIPAL,
                account=src,
                transaction_type=AssetTransaction.CASH_OUT,
                amount=cost,
                notes=f"BUY {asset.name}",
                owner=owner,
            )
            touched |= _sync_derived_cash_movement(
                tx,
                kind=AssetTransaction.DERIVED_FEE,
                account=src,
                transaction_type=AssetTransaction.CASH_OUT,
                amount=fee,
                notes=f"Commissione BUY {asset.name}",
                owner=owner,
            )
            for touched_asset in touched:
                _refresh_manual_asset(touched_asset)

        elif tx_type == AssetTransaction.SELL:
            proceeds = _q2(tx.shares * tx.price_per_share)
            _sync_parent_tax_amount(asset, tx)
            if dst:
                touched = _sync_derived_cash_movement(
                    tx,
                    kind=AssetTransaction.DERIVED_PRINCIPAL,
                    account=dst,
                    transaction_type=AssetTransaction.CASH_IN,
                    amount=proceeds,
                    notes=f"SELL {asset.name}",
                    owner=owner,
                )
                touched |= _sync_derived_cash_movement(
                    tx,
                    kind=AssetTransaction.DERIVED_FEE,
                    account=dst,
                    transaction_type=AssetTransaction.CASH_OUT,
                    amount=fee,
                    notes=f"Commissione SELL {asset.name}",
                    owner=owner,
                )
                touched |= _sync_derived_cash_movement(
                    tx,
                    kind=AssetTransaction.DERIVED_TAX,
                    account=dst,
                    transaction_type=AssetTransaction.CASH_OUT,
                    amount=tx.tax_amount,
                    notes=f"Tasse plusvalenza {asset.name}",
                    owner=owner,
                )
                for touched_asset in touched:
                    _refresh_manual_asset(touched_asset)
        elif tx_type != AssetTransaction.SELL:
            _sync_parent_tax_amount(asset, tx)

    invalidate_dashboard_summary(DashboardSummary.REASON_TRANSACTION, user=owner)
    return tx, response_extra


def delete_transaction(tx: AssetTransaction) -> None:
    """Elimina una transazione e ricalcola l'asset e i conti derivati."""
    if _is_investment_cash_mirror(tx):
        raise ValueError(
            "Derived cash mirror must be edited from its parent transaction"
        )
    asset = tx.asset
    _ensure_transaction_asset_mutable(asset)
    owner = asset.owner
    derived_assets = list(
        {dt.asset for dt in tx.derived_txs.select_related("asset").all()}
    )
    with transaction.atomic():
        tx.delete()
        _recompute_asset_locked(asset)
        for da in derived_assets:
            _refresh_manual_asset(da)
        if asset.tracking_type == Asset.MANUAL:
            _refresh_manual_asset(asset)
    invalidate_dashboard_summary(DashboardSummary.REASON_TRANSACTION, user=owner)


def patch_transaction(
    tx: AssetTransaction,
    serializer,
    source_account_id=None,
    dest_account_id=None,
    owner=None,
) -> AssetTransaction:
    """Aggiorna una transazione e sincronizza le tx derivate."""
    if _is_investment_cash_mirror(tx):
        raise ValueError(
            "Derived cash mirror must be edited from its parent transaction"
        )
    asset = tx.asset
    _ensure_transaction_asset_mutable(asset)
    effective_owner = owner or asset.owner
    is_verified = serializer.validated_data.get("is_verified")
    source_account_provided = source_account_id is not None
    dest_account_provided = dest_account_id is not None
    source_account_id = str(source_account_id or "").strip()
    dest_account_id = str(dest_account_id or "").strip()

    def _normalize_account_id(raw):
        if not raw:
            return None
        try:
            return int(raw)
        except (TypeError, ValueError):
            return None

    source_account_pk = _normalize_account_id(source_account_id)
    dest_account_pk = _normalize_account_id(dest_account_id)
    existing_source_mirror = (
        _principal_derived_qs(tx)
        .filter(transaction_type=AssetTransaction.CASH_OUT)
        .select_related("asset")
        .first()
    )
    prospective = {
        "transaction_type": serializer.validated_data.get(
            "transaction_type", tx.transaction_type
        ),
        "date": serializer.validated_data.get("date", tx.date),
        "shares": serializer.validated_data.get("shares", tx.shares),
        "price_per_share": serializer.validated_data.get(
            "price_per_share", tx.price_per_share
        ),
        "contribution_source": serializer.validated_data.get(
            "contribution_source", tx.contribution_source
        ),
        "is_verified": serializer.validated_data.get("is_verified", tx.is_verified),
        "fee": serializer.validated_data.get("fee", tx.fee),
        "tax_amount": serializer.validated_data.get("tax_amount", tx.tax_amount),
        "tax_amount_is_manual": serializer.validated_data.get(
            "tax_amount_is_manual", tx.tax_amount_is_manual
        ),
    }
    effective_source_account_id = None
    if prospective["transaction_type"] == AssetTransaction.BUY:
        if source_account_provided:
            effective_source_account_id = source_account_id
        elif existing_source_mirror is not None:
            effective_source_account_id = str(existing_source_mirror.asset_id)
    validate_transaction(
        asset,
        prospective,
        exclude_tx=tx,
        source_account_id=effective_source_account_id,
    )
    if source_account_provided and source_account_pk is not None:
        _get_bank_account(source_account_pk, effective_owner)
    if dest_account_provided and dest_account_pk is not None:
        _get_bank_account(dest_account_pk, effective_owner)
    with transaction.atomic():
        updated_tx = serializer.save(owner=effective_owner)
        _sync_transaction_eur_snapshot(updated_tx)
        _recompute_asset_locked(asset)
        new_amount = _q2(updated_tx.shares * updated_tx.price_per_share)
        cash_types = {
            AssetTransaction.CASH_IN,
            AssetTransaction.CASH_OUT,
        }

        # Ensure linked account mirror tx is updated/created/removed on edit.
        if updated_tx.transaction_type == AssetTransaction.BUY:
            mirror = (
                _principal_derived_qs(updated_tx)
                .filter(transaction_type=AssetTransaction.CASH_OUT)
                .select_related("asset")
                .first()
            )
            touched = set()
            if source_account_provided and source_account_pk is None:
                src = None
            elif source_account_provided:
                try:
                    src = _get_bank_account(source_account_pk, effective_owner)
                except ValueError:
                    raise
            else:
                src = mirror.asset if mirror else None
            touched |= _sync_derived_cash_movement(
                updated_tx,
                kind=AssetTransaction.DERIVED_PRINCIPAL,
                account=src,
                transaction_type=AssetTransaction.CASH_OUT,
                amount=new_amount,
                notes=f"BUY {asset.name}",
                owner=effective_owner,
            )
            touched |= _sync_derived_cash_movement(
                updated_tx,
                kind=AssetTransaction.DERIVED_FEE,
                account=src,
                transaction_type=AssetTransaction.CASH_OUT,
                amount=updated_tx.fee,
                notes=f"Commissione BUY {asset.name}",
                owner=effective_owner,
            )
            touched |= _sync_derived_cash_movement(
                updated_tx,
                kind=AssetTransaction.DERIVED_TAX,
                account=None,
                transaction_type=AssetTransaction.CASH_OUT,
                amount=Decimal("0"),
                notes="",
                owner=effective_owner,
            )
            _sync_parent_tax_amount(asset, updated_tx)
            for touched_asset in touched:
                _refresh_manual_asset(touched_asset)
        elif updated_tx.transaction_type == AssetTransaction.SELL:
            mirror = (
                _principal_derived_qs(updated_tx)
                .filter(transaction_type=AssetTransaction.CASH_IN)
                .select_related("asset")
                .first()
            )
            touched = set()
            if dest_account_provided and dest_account_pk is None:
                dst = None
            elif dest_account_provided:
                try:
                    dst = _get_bank_account(dest_account_pk, effective_owner)
                except ValueError:
                    raise
            else:
                dst = mirror.asset if mirror else None
            _sync_parent_tax_amount(asset, updated_tx)
            touched |= _sync_derived_cash_movement(
                updated_tx,
                kind=AssetTransaction.DERIVED_PRINCIPAL,
                account=dst,
                transaction_type=AssetTransaction.CASH_IN,
                amount=new_amount,
                notes=f"SELL {asset.name}",
                owner=effective_owner,
            )
            touched |= _sync_derived_cash_movement(
                updated_tx,
                kind=AssetTransaction.DERIVED_FEE,
                account=dst,
                transaction_type=AssetTransaction.CASH_OUT,
                amount=updated_tx.fee,
                notes=f"Commissione SELL {asset.name}",
                owner=effective_owner,
            )
            touched |= _sync_derived_cash_movement(
                updated_tx,
                kind=AssetTransaction.DERIVED_TAX,
                account=dst,
                transaction_type=AssetTransaction.CASH_OUT,
                amount=updated_tx.tax_amount,
                notes=f"Tasse plusvalenza {asset.name}",
                owner=effective_owner,
            )
            for touched_asset in touched:
                _refresh_manual_asset(touched_asset)
        elif updated_tx.transaction_type in cash_types:
            _sync_parent_tax_amount(asset, updated_tx)
            if updated_tx.derived_from_id:
                # If this row is itself a derived cash movement, drop stale mirrors.
                try:
                    for mirror in updated_tx.derived_txs.select_related("asset").all():
                        old_asset = mirror.asset
                        mirror.delete()
                        _refresh_manual_asset(old_asset)
                except Exception:
                    logger.exception(
                        "patch_transaction: cleanup stale mirrors failed tx=%s",
                        updated_tx.pk,
                    )
            else:
                expected_derived_type = (
                    AssetTransaction.CASH_IN
                    if updated_tx.transaction_type == AssetTransaction.CASH_OUT
                    else AssetTransaction.CASH_OUT
                )
                for mirror in list(
                    updated_tx.derived_txs.select_related("asset").all()
                ):
                    if mirror.transaction_type != expected_derived_type:
                        old_asset = mirror.asset
                        mirror.delete()
                        _refresh_manual_asset(old_asset)
                        continue
                    mirror.price_per_share = new_amount
                    mirror.date = updated_tx.date
                    mirror.is_verified = updated_tx.is_verified
                    mirror.save(
                        update_fields=["price_per_share", "date", "is_verified"]
                    )
                    _refresh_manual_asset(mirror.asset)
        else:
            for mirror in updated_tx.derived_txs.select_related("asset").all():
                old_asset = mirror.asset
                mirror.delete()
                _refresh_manual_asset(old_asset)
            _sync_parent_tax_amount(asset, updated_tx)

        # Transfer pairs are represented as CASH_OUT -> derived CASH_IN; keep the
        # verification flag mirrored so the aggregated Cash Flow row stays coherent.
        if is_verified is not None:
            counterpart = None
            if (
                updated_tx.transaction_type in cash_types
                and updated_tx.derived_from_id
                and updated_tx.derived_from.transaction_type in cash_types
            ):
                counterpart = updated_tx.derived_from
            elif updated_tx.transaction_type in cash_types:
                counterpart = (
                    updated_tx.derived_txs.filter(transaction_type__in=cash_types)
                    .select_related("asset")
                    .first()
                )
            if counterpart is not None:
                counterpart.is_verified = is_verified
                counterpart.save(update_fields=["is_verified"])
                if counterpart.asset_id != asset.pk:
                    _refresh_manual_asset(counterpart.asset)
        if asset.tracking_type == Asset.MANUAL:
            _refresh_manual_asset(asset)
    invalidate_dashboard_summary(DashboardSummary.REASON_TRANSACTION, user=asset.owner)
    return updated_tx


def realize_manual_asset(
    asset: Asset,
    *,
    sale_price,
    dest_account_id,
    fee=Decimal("0"),
    owner=None,
) -> AssetTransaction:
    owner = owner or asset.owner
    _ensure_transaction_asset_mutable(asset)
    if asset.tracking_type != Asset.MANUAL:
        raise ValueError("Realize is available only for manual assets")
    if asset.investment_type and asset.investment_type.is_bank_account:
        raise ValueError("Bank accounts cannot be realized")
    try:
        sale_price = _q2(Decimal(str(sale_price)))
        fee = _q2(Decimal(str(fee or 0)))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("Invalid realization amount") from exc
    if sale_price <= 0:
        raise ValueError("Sale price must be greater than zero")
    if fee < 0:
        raise ValueError("Fee must be greater than or equal to zero")
    dst = _get_bank_account(dest_account_id, owner)
    if dst is None:
        raise ValueError("Destination account is required")

    cost_basis = Decimal(asset.invested_capital or 0)
    tax_amount = _q2(
        max(sale_price - cost_basis - fee, Decimal("0"))
        * Decimal(asset.effective_tax_rate or 0)
    )
    today = date_cls.today()

    with transaction.atomic():
        asset_locked = Asset.objects.select_for_update().get(pk=asset.pk)
        dst = Asset.objects.select_for_update().get(pk=dst.pk)
        value_delta = sale_price - Decimal(asset_locked.current_value or 0)
        if value_delta != 0:
            adjustment_tx = AssetTransaction.objects.create(
                asset=asset_locked,
                transaction_type=AssetTransaction.ADJUSTMENT,
                date=today,
                shares=Decimal("1"),
                price_per_share=value_delta,
                notes="Realization value adjustment",
                is_verified=True,
                owner=owner,
            )
            _sync_transaction_eur_snapshot(adjustment_tx)
        tx = AssetTransaction.objects.create(
            asset=asset_locked,
            transaction_type=AssetTransaction.CASH_OUT,
            date=today,
            shares=Decimal("1"),
            price_per_share=sale_price,
            fee=fee,
            tax_amount=tax_amount,
            notes="Realization",
            is_verified=True,
            owner=owner,
        )
        _sync_transaction_eur_snapshot(tx)
        touched = _sync_derived_cash_movement(
            tx,
            kind=AssetTransaction.DERIVED_PRINCIPAL,
            account=dst,
            transaction_type=AssetTransaction.CASH_IN,
            amount=sale_price,
            notes=f"Realizzazione {asset_locked.name}",
            owner=owner,
        )
        touched |= _sync_derived_cash_movement(
            tx,
            kind=AssetTransaction.DERIVED_FEE,
            account=dst,
            transaction_type=AssetTransaction.CASH_OUT,
            amount=fee,
            notes=f"Commissione vendita {asset_locked.name}",
            owner=owner,
        )
        touched |= _sync_derived_cash_movement(
            tx,
            kind=AssetTransaction.DERIVED_TAX,
            account=dst,
            transaction_type=AssetTransaction.CASH_OUT,
            amount=tax_amount,
            notes=f"Tasse plusvalenza {asset_locked.name}",
            owner=owner,
        )
        _refresh_manual_asset(asset_locked)
        for touched_asset in touched:
            _refresh_manual_asset(touched_asset)
        asset_locked.is_archived = True
        asset_locked.archived_at = timezone.now()
        asset_locked.invested_capital = Decimal("0")
        asset_locked.invested_capital_eur = Decimal("0")
        asset_locked.save(
            update_fields=[
                "is_archived",
                "archived_at",
                "invested_capital",
                "invested_capital_eur",
            ]
        )
    invalidate_dashboard_summary(DashboardSummary.REASON_TRANSACTION, user=owner)
    return tx


# ---------------------------------------------------------------------------
# Dashboard summary cache
# ---------------------------------------------------------------------------


def invalidate_dashboard_summary(reason: str, user=None, user_id=None) -> None:
    """Marca la cache come stale. Non ricalcola — il prossimo GET lo farà."""
    if user is None and user_id is not None:
        from django.contrib.auth import get_user_model

        user = get_user_model().objects.filter(pk=user_id).first()

    if not (user and getattr(user, "is_authenticated", False)):
        logger.warning(
            "invalidate_dashboard_summary: user mancante, skip — reason=%s", reason
        )
        return
    try:
        summary = DashboardSummary.get_singleton(user=user)
        summary.invalidated_at = timezone.now()
        summary.last_invalidation_reason = reason
        summary.save(update_fields=["invalidated_at", "last_invalidation_reason"])
        logger.debug("invalidate_dashboard_summary: reason=%s user=%s", reason, user)
    except Exception:
        logger.exception(
            "invalidate_dashboard_summary: errore reason=%s user=%s", reason, user
        )


def rebuild_dashboard_summary(user=None) -> DashboardSummary:
    """Ricalcola il payload completo e aggiorna il singleton per l'utente dato."""
    from expenses.models import Expense
    from django.db.models import Sum
    from django.db.models.functions import ExtractMonth
    from datetime import timedelta

    summary = DashboardSummary.get_singleton(user=user)

    asset_qs = Asset.objects.select_related("investment_type").filter(is_archived=False)
    if user and getattr(user, "is_authenticated", False):
        asset_qs = asset_qs.filter(owner=user)
    assets = list(asset_qs)

    total_invested = Decimal("0")
    total_current = Decimal("0")
    total_tax_liability = Decimal("0")
    liquid_invested = Decimal("0")
    liquid_current = Decimal("0")
    illiquid_invested = Decimal("0")
    illiquid_current = Decimal("0")
    by_type_map = {}

    for a in assets:
        inv = asset_invested_capital_eur(a)
        cur = asset_current_value_eur(a)
        if cur is None:
            continue
        gain = cur - inv if inv is not None else Decimal("0")
        tax_rate = (
            a.investment_type.tax_rate if a.investment_type else Decimal("0")
        ) or Decimal("0")
        tax = max(gain, Decimal("0")) * tax_rate

        if inv is not None:
            total_invested += inv
        total_current += cur
        total_tax_liability += tax

        if a.is_liquid:
            if inv is not None:
                liquid_invested += inv
            liquid_current += cur
        else:
            if inv is not None:
                illiquid_invested += inv
            illiquid_current += cur

        it = a.investment_type
        tid = it.id if it else None
        if tid not in by_type_map:
            by_type_map[tid] = {
                "type_id": tid,
                "type_name": it.name if it else "Other",
                "type_color": it.color if it else "#4f7fff",
                "type_icon": it.icon if it else "📈",
                "is_bank_account": bool(it.is_bank_account) if it else False,
                "total_invested": str(Decimal("0")),
                "total_current": str(Decimal("0")),
            }
        by_type_map[tid]["total_invested"] = str(
            Decimal(by_type_map[tid]["total_invested"]) + (inv or Decimal("0"))
        )
        by_type_map[tid]["total_current"] = str(
            Decimal(by_type_map[tid]["total_current"]) + cur
        )

    by_type = sorted(
        by_type_map.values(), key=lambda x: float(x["total_current"]), reverse=True
    )

    today = date_cls.today()
    last_30 = today - timedelta(days=30)
    top_expenses = list(
        Expense.objects.filter(owner=user, is_verified=True, date__gte=last_30)
        .select_related("category")
        .order_by("-amount")[:10]
        .values(
            "id", "description", "amount", "date", "category__name", "category__color"
        )
    )
    for e in top_expenses:
        e["amount"] = str(e["amount"])
        if e["date"]:
            e["date"] = str(e["date"])

    monthly_totals = (
        Expense.objects.filter(
            owner=user,
            is_verified=True,
            category__category_type="expense",
            date__year=today.year,
        )
        .annotate(month=ExtractMonth("date"))
        .values("month")
        .annotate(total=Sum("amount"))
        .order_by("month")
    )
    monthly_trend = [
        {"month": int(r["month"]), "total": str(r["total"] or 0)}
        for r in monthly_totals
    ]

    payload = {
        "total_invested": str(total_invested),
        "total_current": str(total_current),
        "total_gain": str(total_current - total_invested),
        "total_gain_percent": str(
            ((total_current - total_invested) / total_invested * 100)
            if total_invested
            else 0
        ),
        "total_tax_liability": str(total_tax_liability),
        "total_post_tax_value": str(total_current - total_tax_liability),
        "liquid": {
            "invested": str(liquid_invested),
            "current": str(liquid_current),
        },
        "illiquid": {
            "invested": str(illiquid_invested),
            "current": str(illiquid_current),
        },
        "by_type": by_type,
        "top_expenses_last_30d": top_expenses,
        "monthly_trend_ytd": monthly_trend,
    }

    summary.payload = payload
    summary.computed_at = timezone.now()
    summary.last_invalidation_reason = ""
    summary.save(update_fields=["payload", "computed_at", "last_invalidation_reason"])
    return summary


# ---------------------------------------------------------------------------
# Transfer
# ---------------------------------------------------------------------------


def transfer_between_accounts(
    from_account: Asset,
    to_account: Asset,
    amount: Decimal,
    tx_date: str,
    notes: str = "",
    is_verified: bool = False,
    owner=None,
) -> dict:
    """Crea atomicamente CASH_OUT su from + CASH_IN derivato su to.

    Ritorna {"from_balance", "to_balance"} + eventuale "warning: insufficient_balance".
    """
    owner = owner or from_account.owner
    if amount <= 0:
        raise ValueError("Transfer amount must be greater than zero")
    for account in (from_account, to_account):
        if (
            account.owner_id != getattr(owner, "id", None)
            or account.tracking_type != Asset.MANUAL
            or not account.investment_type
            or not account.investment_type.is_bank_account
        ):
            raise ValueError("Transfers require owned manual bank accounts")
    response_extra = {}
    if from_account.current_value < amount:
        response_extra["warning"] = "insufficient_balance"

    with transaction.atomic():
        cash_out = AssetTransaction.objects.create(
            asset=from_account,
            transaction_type=AssetTransaction.CASH_OUT,
            date=tx_date,
            shares=Decimal("1"),
            price_per_share=amount,
            notes=notes,
            is_verified=is_verified,
            owner=owner,
        )
        _sync_transaction_eur_snapshot(cash_out)
        cash_in = AssetTransaction.objects.create(
            asset=to_account,
            transaction_type=AssetTransaction.CASH_IN,
            date=tx_date,
            shares=Decimal("1"),
            price_per_share=amount,
            notes=notes,
            derived_from=cash_out,
            is_verified=is_verified,
            owner=owner,
        )
        _sync_transaction_eur_snapshot(cash_in)
        _refresh_manual_asset(from_account)
        _refresh_manual_asset(to_account)

    invalidate_dashboard_summary(DashboardSummary.REASON_TRANSACTION, user=owner)
    result = {
        "from_balance": str(from_account.current_value),
        "to_balance": str(to_account.current_value),
    }
    result.update(response_extra)
    return result


# ---------------------------------------------------------------------------
# Move position
# ---------------------------------------------------------------------------


def move_asset_position(asset: Asset, dest_account: Asset, owner=None) -> Asset:
    """Trasferimento in natura: sposta l'asset su un nuovo conto bancario.

    Aggiorna solo source_account sull'Asset — tutta la storia transazionale
    rimane intatta. Nessuna transazione sintetica, nessun archivio.
    """
    if asset.is_archived:
        raise ValueError("Impossibile spostare un asset già archiviato.")
    if not dest_account or dest_account.pk == asset.pk:
        raise ValueError("L'account destinazione deve essere diverso dall'asset.")

    with transaction.atomic():
        asset.previous_account = asset.source_account
        asset.source_account = dest_account
        asset.save(update_fields=["source_account", "previous_account"])

    invalidate_dashboard_summary(DashboardSummary.REASON_ASSET_CHANGED, user=owner)
    logger.info(
        "move_asset_position (trasferimento in natura): %s (id=%s) → %s",
        asset.name,
        asset.pk,
        dest_account.name,
    )
    return asset
