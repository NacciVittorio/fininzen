"""
portfolio/fx.py — FX rate lookups via Frankfurter API with in-memory cache.

Frankfurter (https://api.frankfurter.app) is an open-source, no-auth FX API backed by ECB data.
Rates update once per business day.

Cache: in-memory dict {(from_ccy, to_ccy): (rate, fetched_at)} with 24h TTL.
Fallback: if the network call fails, returns the stale cached rate when available.
Unknown rates are represented as None: financial totals must never invent a 1:1 rate.
"""

import logging
import threading
import requests
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal

logger = logging.getLogger(__name__)

_RATE_CACHE: dict[tuple[str, str], tuple[Decimal, datetime]] = {}
# Guards _RATE_CACHE under multi-threaded request handling (gunicorn worker may
# serve concurrent reads + a single writer); without the lock a reader can see a
# half-written entry or the fallback path can race with a fresh write.
_RATE_CACHE_LOCK = threading.Lock()
_CACHE_TTL = timedelta(hours=24)
_FRANKFURTER_BASE = "https://api.frankfurter.app"
_REQUEST_TIMEOUT = 5  # seconds
_HISTORICAL_LOOKBACK_DAYS = 7


def _normalize_currency(currency: str) -> str:
    return "GBP" if currency in ("GBp", "GBX") else currency


def get_exchange_rate(from_ccy: str, to_ccy: str = "EUR") -> Decimal | None:
    """Return the exchange rate from_ccy → to_ccy.

    GBp (pence) is normalised to GBP before the FX lookup, so callers do not need to
    handle the pence/pound distinction separately.

    Returns None when no trustworthy rate is available.
    """
    # Normalise GBp → GBP (pence are handled in prices.py; FX only knows GBP)
    from_ccy = _normalize_currency(from_ccy)

    if from_ccy == to_ccy:
        return Decimal("1")

    cache_key = (from_ccy, to_ccy)
    now = datetime.now(timezone.utc)

    # Return cached rate if still fresh
    with _RATE_CACHE_LOCK:
        cached = _RATE_CACHE.get(cache_key)
    if cached and (now - cached[1]) < _CACHE_TTL:
        logger.debug("FX %s→%s: %s (cache hit)", from_ccy, to_ccy, cached[0])
        return cached[0]

    try:
        url = f"{_FRANKFURTER_BASE}/latest?from={from_ccy}&to={to_ccy}"
        resp = requests.get(url, timeout=_REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        rate = Decimal(str(data["rates"][to_ccy]))
        if rate <= 0:
            raise ValueError("rate must be positive")
        with _RATE_CACHE_LOCK:
            _RATE_CACHE[cache_key] = (rate, now)
        logger.debug(f"FX {from_ccy}→{to_ccy}: {rate} (fresh)")
        return rate
    except Exception as e:
        if cached:
            logger.warning(
                f"FX {from_ccy}→{to_ccy}: Frankfurter failed ({e}), using stale cache ({cached[0]})"
            )
            return cached[0]
        logger.warning(f"FX {from_ccy}→{to_ccy}: Frankfurter failed ({e}), no cache")
        return None


def get_historical_exchange_rate(
    from_ccy: str, day: date, *, owner=None, to_ccy: str = "EUR"
) -> Decimal | None:
    """Return a persisted historical rate near day, without using stale old rates."""
    from_ccy = _normalize_currency(from_ccy)
    if from_ccy == to_ccy:
        return Decimal("1")
    from .models import FXRateHistory

    qs = FXRateHistory.objects.filter(
        from_currency=from_ccy,
        to_currency=to_ccy,
        date__gte=day - timedelta(days=_HISTORICAL_LOOKBACK_DAYS),
        date__lte=day,
    )
    if owner is not None:
        qs = qs.filter(owner=owner)
    row = qs.order_by("-date").only("rate").first()
    return Decimal(row.rate) if row else None


def fetch_historical_exchange_rate(
    from_ccy: str, day: date, to_ccy: str = "EUR"
) -> Decimal | None:
    """Fetch an ECB-backed historical rate without substituting today's value."""
    from_ccy = _normalize_currency(from_ccy)
    if from_ccy == to_ccy:
        return Decimal("1")
    try:
        url = f"{_FRANKFURTER_BASE}/{day.isoformat()}?from={from_ccy}&to={to_ccy}"
        resp = requests.get(url, timeout=_REQUEST_TIMEOUT)
        resp.raise_for_status()
        rate = Decimal(str(resp.json()["rates"][to_ccy]))
        return rate if rate > 0 else None
    except Exception as exc:
        logger.warning(
            "Historical FX %s→%s @ %s failed: %s", from_ccy, to_ccy, day, exc
        )
        return None
