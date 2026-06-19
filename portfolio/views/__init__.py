"""
portfolio/views/ — package facade per le view API del portafoglio.

I viewset sono suddivisi nei sottomoduli (assets, catalog, allocation,
transactions_feed, fire) e ri-esportati qui per preservare la superficie di
import pubblica (`from portfolio.views import X`). Questo modulo mantiene anche
i nomi monkeypatchati dai test e l'helper di reconcile.

Endpoint:
  GET/POST/PATCH/DELETE  /api/portfolio/
  POST                   /api/portfolio/refresh-prices/
  POST                   /api/portfolio/{id}/refresh-price/
  GET                    /api/portfolio/summary/
  POST                   /api/portfolio/reset/
  GET                    /api/portfolio/search-ticker/?q=...
  GET/POST/PATCH/DELETE  /api/portfolio/investment-types/
  GET/POST               /api/portfolio/{id}/transactions/
  DELETE                 /api/portfolio/{id}/transactions/{tx_id}/
  GET/POST/PUT           /api/portfolio/allocation-targets/
  POST                   /api/portfolio/transfer/
"""

import logging
from django.core.cache import cache
from django.db import OperationalError

# Patch-target names: the test suite monkeypatches `portfolio.views.<name>`, so
# these must stay real attributes of the package and the call sites that moved
# into submodules reach them via `from portfolio import views as _pv`.
from ..price_providers import search_price_sources
from ..services import reconcile_due_manual_assets

# Submodule re-exports (see module docstring). They follow the patch-target
# imports above; submodules reference those names through the package namespace
# (`from portfolio import views as _pv`) only at call time, so import order is
# safe and there is no circular-import hazard at load time.
from ._common import (
    _resolve_contribution_source,
    _build_fx_lookup,
    _fx_at,
    _price_at,
    _step_at,
    _ensure_history_covers_transactions,
    IMPORT_PRICE_QUANT,
    IMPORT_SHARES_QUANT,
    IMPORT_MAX_ROWS,
    PORTFOLIO_TX_VALID_ORDERINGS,
    PORTFOLIO_TX_MAX_FILTERED_BULK,
)
from .catalog import (
    InvestmentTypeViewSet,
    ContributionSourceViewSet,
    RecurringInvestmentPlanViewSet,
)
from .allocation import AllocationTargetViewSet
from .transactions_feed import (
    _parse_portfolio_tx_filters,
    _portfolio_transactions_queryset,
    _portfolio_tx_total,
    TransactionsFeedView,
    TransactionsBulkView,
)
from .fire import FireViewSet
from .assets import (
    SearchTickerThrottle,
    AssetViewSet,
)


logger = logging.getLogger(__name__)


def _is_database_locked_error(exc):
    # SQLite signals transient write contention as either "database is locked"
    # (SQLITE_BUSY) or "database table is locked" (SQLITE_LOCKED). Match both so a
    # brief concurrent writer doesn't bubble up as a 500 on read endpoints.
    msg = str(exc).lower()
    return "database is locked" in msg or "database table is locked" in msg


# HIGH-17: read endpoints (asset list, summary, fire) call the reconcile on
# every GET. Even when nothing is due the selective query runs per request.
# Manual movements become effective on a *date* boundary, so a short per-user
# TTL guard collapses bursts of reads (dashboard mounts firing several list/
# summary calls at once) into at most one reconcile attempt per window without
# meaningfully delaying when a future-dated movement lands.
_RECONCILE_TTL_SECONDS = 90


def _reconcile_cache_key(user) -> str:
    return f"reconcile_due_manual:{getattr(user, 'pk', user)}"


def _reconcile_due_manual_assets_safe(user):
    """Reconcile due manual assets, swallowing only transient SQLite write locks.

    `reconcile_due_manual_assets` issues writes (recompute + save). On SQLite a
    concurrent writer (e.g. demo seeding) can hold the lock long enough to raise
    "database is locked". Read endpoints that call this merely to stay fresh
    (asset list, summary, fire) must not 500 on that transient contention — skip
    the reconcile and serve slightly stale data instead. Non-lock
    OperationalErrors still propagate.

    A per-user TTL guard (HIGH-17) skips the work when it already ran within the
    last `_RECONCILE_TTL_SECONDS`, so a single page load issuing several read
    requests triggers one reconcile instead of one per endpoint.
    """
    cache_key = _reconcile_cache_key(user)
    if cache.get(cache_key):
        return
    try:
        reconcile_due_manual_assets(user)
    except OperationalError as exc:
        if not _is_database_locked_error(exc):
            raise
        logger.warning(
            "reconcile_due_manual_assets skipped: database is locked user=%s",
            user,
        )
        # Don't arm the TTL on a transient skip — retry on the next read.
        return
    cache.set(cache_key, True, _RECONCILE_TTL_SECONDS)


__all__ = [
    "reconcile_due_manual_assets",
    "search_price_sources",
    "logger",
    "_reconcile_due_manual_assets_safe",
    "_resolve_contribution_source",
    "_build_fx_lookup",
    "_fx_at",
    "_price_at",
    "_step_at",
    "_ensure_history_covers_transactions",
    "IMPORT_PRICE_QUANT",
    "IMPORT_SHARES_QUANT",
    "IMPORT_MAX_ROWS",
    "PORTFOLIO_TX_VALID_ORDERINGS",
    "PORTFOLIO_TX_MAX_FILTERED_BULK",
    "InvestmentTypeViewSet",
    "ContributionSourceViewSet",
    "RecurringInvestmentPlanViewSet",
    "AllocationTargetViewSet",
    "_parse_portfolio_tx_filters",
    "_portfolio_transactions_queryset",
    "_portfolio_tx_total",
    "TransactionsFeedView",
    "TransactionsBulkView",
    "FireViewSet",
    "SearchTickerThrottle",
    "AssetViewSet",
]
