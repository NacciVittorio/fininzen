import logging
from bisect import bisect_right

from ..models import (
    AssetPriceHistory,
    ContributionSource,
    FXRateHistory,
)
from ..prices import (
    backfill_price_history,
)
from datetime import timedelta
from decimal import Decimal

logger = logging.getLogger(__name__)


IMPORT_PRICE_QUANT = Decimal("0.01")

IMPORT_SHARES_QUANT = Decimal("0.000001")

IMPORT_MAX_ROWS = 5000

PORTFOLIO_TX_VALID_ORDERINGS = {"-date", "date", "-amount", "amount"}

PORTFOLIO_TX_MAX_FILTERED_BULK = 5000


def _resolve_contribution_source(owner, raw):
    value = str(raw or "").strip()
    if not value:
        return None
    qs = ContributionSource.objects.filter(owner=owner, is_active=True)
    if value.isdigit():
        source = qs.filter(pk=int(value)).first()
        if source:
            return source
    source = qs.filter(name__iexact=value).first()
    if source:
        return source
    raise ValueError(f"contribution_source '{value}' not found")


def _build_fx_lookup(user, start_date, end_date):
    """Load FXRateHistory for the date range and return a {(currency, date): rate} dict.

    For each day we search up to 7 days back (weekends/holidays). Missing
    historical rates remain missing rather than being replaced with live data.
    """

    rows = FXRateHistory.objects.filter(
        owner=user,
        to_currency="EUR",
        date__range=(start_date - timedelta(days=7), end_date),
    ).values_list("from_currency", "date", "rate")
    lookup: dict[tuple[str, object], Decimal] = {(r[0], r[1]): r[2] for r in rows}
    return lookup


def _fx_at(lookup, currency: str, day, fallback_cache: dict) -> Decimal | None:
    """Return EUR rate for currency on day, searching up to 7 days back for missing rates."""
    if not currency or currency in ("EUR", ""):
        return Decimal("1")
    if currency in ("GBp", "GBX"):
        currency = "GBP"
    for delta in range(8):
        rate = lookup.get((currency, day - timedelta(days=delta)))
        if rate:
            return Decimal(rate)
    logger.warning("FX history unavailable: %s→EUR near %s", currency, day)
    return None


def _price_at(points, target):
    """Restituisce l'ultimo close noto <= target, senza usare prezzi futuri."""
    if not points:
        return None
    idx = bisect_right(points, (target, Decimal("Infinity"))) - 1
    return points[idx][1] if idx >= 0 else None


def _step_at(points, target):
    """Lookup a gradino: restituisce l'ultimo close ≤ target, senza interpolazione.
    Corretto per asset MANUAL il cui saldo cambia solo alle date di transazione."""
    return _price_at(points, target)


def _ensure_history_covers_transactions(asset):
    """Best-effort: estende la cache prezzi se la prima tx è più vecchia del primo punto cachato."""
    if not asset.has_ticker:
        return
    try:
        first_tx = asset.transactions.order_by("date").first()
        if not first_tx:
            return
        earliest_cache = (
            AssetPriceHistory.objects.filter(asset=asset).order_by("date").first()
        )
        if earliest_cache is None or first_tx.date < earliest_cache.date:
            backfill_price_history(asset, from_date=first_tx.date)
    except Exception:
        logger.exception(
            "_ensure_history_covers_transactions: errore su asset=%s", asset.pk
        )
