"""Tests for portfolio/fx.py — FX rate lookups and caching."""

import pytest
from decimal import Decimal
from unittest.mock import patch, MagicMock
from datetime import date, datetime, timezone, timedelta

from portfolio.fx import get_exchange_rate, get_historical_exchange_rate, _RATE_CACHE
from portfolio.models import FXRateHistory


@pytest.fixture(autouse=True)
def clear_cache():
    _RATE_CACHE.clear()
    yield
    _RATE_CACHE.clear()


def test_eur_to_eur_short_circuit():
    """EUR→EUR must return 1 without any network call."""
    with patch("portfolio.fx.requests.get") as mock_get:
        rate = get_exchange_rate("EUR", "EUR")
        assert rate == Decimal("1")
        mock_get.assert_not_called()


def test_gbp_conversion():
    """GBp/GBX are normalised to GBP before the FX lookup."""
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"rates": {"EUR": 1.17}}
    mock_resp.raise_for_status.return_value = None
    with patch("portfolio.fx.requests.get", return_value=mock_resp) as mock_get:
        rate = get_exchange_rate("GBp")
        assert rate == Decimal("1.17")
        # URL should use GBP not GBp
        assert "GBP" in mock_get.call_args[0][0]


def test_successful_fetch_populates_cache():
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"rates": {"EUR": 0.92}}
    mock_resp.raise_for_status.return_value = None
    with patch("portfolio.fx.requests.get", return_value=mock_resp):
        rate = get_exchange_rate("USD")
    assert rate == Decimal("0.92")
    assert ("USD", "EUR") in _RATE_CACHE


def test_cache_hit_skips_network():
    _RATE_CACHE[("USD", "EUR")] = (Decimal("0.91"), datetime.now(timezone.utc))
    with patch("portfolio.fx.requests.get") as mock_get:
        rate = get_exchange_rate("USD")
        assert rate == Decimal("0.91")
        mock_get.assert_not_called()


def test_stale_cache_returned_on_network_failure():
    stale_time = datetime.now(timezone.utc) - timedelta(hours=30)
    _RATE_CACHE[("USD", "EUR")] = (Decimal("0.89"), stale_time)
    with patch("portfolio.fx.requests.get", side_effect=Exception("timeout")):
        rate = get_exchange_rate("USD")
    assert rate == Decimal("0.89")


def test_missing_rate_is_explicit_when_no_cache_and_failure():
    with patch("portfolio.fx.requests.get", side_effect=Exception("network error")):
        rate = get_exchange_rate("JPY")
    assert rate is None


def test_historical_rate_uses_recent_business_day(test_user):
    FXRateHistory.objects.create(
        owner=test_user,
        from_currency="USD",
        to_currency="EUR",
        date=date(2026, 1, 3),
        rate=Decimal("0.90"),
    )

    rate = get_historical_exchange_rate("USD", date(2026, 1, 10), owner=test_user)

    assert rate == Decimal("0.90")


def test_historical_rate_does_not_use_stale_old_rate(test_user):
    FXRateHistory.objects.create(
        owner=test_user,
        from_currency="USD",
        to_currency="EUR",
        date=date(2026, 1, 2),
        rate=Decimal("0.90"),
    )

    rate = get_historical_exchange_rate("USD", date(2026, 1, 10), owner=test_user)

    assert rate is None
