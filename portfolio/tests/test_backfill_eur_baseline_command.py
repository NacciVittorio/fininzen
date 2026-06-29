from datetime import date
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from portfolio.fx import _HIST_RATE_CACHE, _RATE_CACHE
from portfolio.models import (
    Asset,
    AssetTransaction,
    FXRateHistory,
    InvestmentType,
)


@pytest.fixture(autouse=True)
def fx_env():
    """Clear FX caches and stub the live rate so no test hits the network.

    The recompute signal fires on transaction creation too, so the live-rate
    stub must be active during setup, not just inside call_command. Historical
    rates still come from FXRateHistory in the DB (seeded per-test).
    """
    _RATE_CACHE.clear()
    _HIST_RATE_CACHE.clear()
    with patch("portfolio.fx.get_exchange_rate", return_value=Decimal("0.92")):
        yield
    _RATE_CACHE.clear()
    _HIST_RATE_CACHE.clear()


def _usd_auto_asset(test_user, *, with_fx_history=True):
    """A non-EUR AUTO asset with one BUY tx, optionally with historical FX seeded."""
    itype = InvestmentType.objects.create(name="ETF", owner=test_user)
    asset = Asset.objects.create(
        name="S&P500 ETF",
        ticker="",
        investment_type=itype,
        currency="USD",
        tracking_type=Asset.AUTO,
        price_per_share=Decimal("110.0000"),
        owner=test_user,
    )
    buy_day = date(2026, 1, 15)
    if with_fx_history:
        FXRateHistory.objects.create(
            from_currency="USD",
            to_currency="EUR",
            date=buy_day,
            rate=Decimal("0.900000"),
            owner=test_user,
        )
    AssetTransaction.objects.create(
        asset=asset,
        transaction_type=AssetTransaction.BUY,
        date=buy_day,
        shares=Decimal("10"),
        price_per_share=Decimal("100"),
        is_verified=True,
        owner=test_user,
    )
    return asset


def _null_eur_baseline(asset):
    """Simulate the post-0029 state: EUR baseline nulled, bypassing signals."""
    Asset.objects.filter(pk=asset.pk).update(
        current_value_eur=None, invested_capital_eur=None
    )


def test_apply_backfills_non_eur_asset(db, test_user):
    asset = _usd_auto_asset(test_user)
    _null_eur_baseline(asset)

    call_command("backfill_eur_baseline", apply=True)

    asset.refresh_from_db()
    # current_value = 10 shares * 110 stored price = 1100 USD; * 0.92 live = 1012
    assert asset.current_value_eur == Decimal("1012.00")
    # invested_capital = 10 * 100 = 1000 USD; * 0.90 historical = 900
    assert asset.invested_capital_eur == Decimal("900.00")


def test_dry_run_makes_no_changes(db, test_user):
    asset = _usd_auto_asset(test_user)
    _null_eur_baseline(asset)
    out = StringIO()

    call_command("backfill_eur_baseline", stdout=out)

    asset.refresh_from_db()
    assert asset.current_value_eur is None
    assert asset.invested_capital_eur is None
    assert "Would backfill 1 assets" in out.getvalue()


def test_missing_fx_history_leaves_invested_incomplete(db, test_user):
    asset = _usd_auto_asset(test_user, with_fx_history=False)
    _null_eur_baseline(asset)
    out = StringIO()

    call_command("backfill_eur_baseline", apply=True, stdout=out)

    asset.refresh_from_db()
    # live rate available → current_value_eur filled; historical missing → still NULL
    assert asset.current_value_eur == Decimal("1012.00")
    assert asset.invested_capital_eur is None
    assert "1 still incomplete" in out.getvalue()


def test_apply_is_idempotent(db, test_user):
    asset = _usd_auto_asset(test_user)
    _null_eur_baseline(asset)

    call_command("backfill_eur_baseline", apply=True)
    asset.refresh_from_db()
    first_current = asset.current_value_eur
    first_invested = asset.invested_capital_eur

    # Second run: asset now has a full baseline → out of the queryset.
    out = StringIO()
    call_command("backfill_eur_baseline", apply=True, stdout=out)

    asset.refresh_from_db()
    assert asset.current_value_eur == first_current
    assert asset.invested_capital_eur == first_invested
    assert "Backfilled 0 assets" in out.getvalue()


def test_unknown_user_raises(db, test_user):
    with pytest.raises(CommandError, match="user 999999 not found"):
        call_command("backfill_eur_baseline", user=999999)


def test_user_filter_scopes_backfill(db, test_user, django_user_model):
    other = django_user_model.objects.create_user(
        username="other", password="x", email="other@example.com"
    )
    asset = _usd_auto_asset(test_user)
    _null_eur_baseline(asset)
    other_asset = _usd_auto_asset(other)
    _null_eur_baseline(other_asset)

    call_command("backfill_eur_baseline", apply=True, user=test_user.pk)

    asset.refresh_from_db()
    other_asset.refresh_from_db()
    assert asset.invested_capital_eur == Decimal("900.00")
    assert other_asset.invested_capital_eur is None
