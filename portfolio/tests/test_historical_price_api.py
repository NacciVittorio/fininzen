import pytest
from datetime import date
from decimal import Decimal
from unittest.mock import patch
from portfolio.models import Asset, AssetPriceHistory


@pytest.fixture
def asset_with_ticker(itype, test_user):
    return Asset.objects.create(
        name="VWCE",
        ticker="VWCE.DE",
        investment_type=itype,
        is_liquid=True,
        invested_capital=Decimal("1000.00"),
        current_value=Decimal("1000.00"),
        owner=test_user,
    )


def test_no_ticker_returns_400(client, asset):
    # asset fixture has ticker=""
    res = client.get(f"/api/portfolio/{asset.id}/historical-price/?date=2026-01-10")
    assert res.status_code == 400
    assert "ticker" in res.json()["error"].lower()


def test_missing_date_param_returns_400(client, asset_with_ticker):
    res = client.get(f"/api/portfolio/{asset_with_ticker.id}/historical-price/")
    assert res.status_code == 400
    assert "date" in res.json()["error"].lower()


def test_invalid_date_format_returns_400(client, asset_with_ticker):
    res = client.get(
        f"/api/portfolio/{asset_with_ticker.id}/historical-price/?date=not-a-date"
    )
    assert res.status_code == 400


def test_exact_match_in_cache(client, asset_with_ticker):
    AssetPriceHistory.objects.create(
        asset=asset_with_ticker, date=date(2026, 1, 10), close=Decimal("100.0000")
    )

    res = client.get(
        f"/api/portfolio/{asset_with_ticker.id}/historical-price/?date=2026-01-10"
    )
    assert res.status_code == 200
    data = res.json()
    assert float(data["close"]) == 100.0
    assert data["date"] == "2026-01-10"


def test_uses_latest_known_price_without_interpolation(client, asset_with_ticker):
    AssetPriceHistory.objects.create(
        asset=asset_with_ticker, date=date(2026, 1, 1), close=Decimal("100.0000")
    )
    AssetPriceHistory.objects.create(
        asset=asset_with_ticker, date=date(2026, 1, 11), close=Decimal("110.0000")
    )

    # Day 6 keeps the latest known NAV instead of using the future quote.
    res = client.get(
        f"/api/portfolio/{asset_with_ticker.id}/historical-price/?date=2026-01-06"
    )
    assert res.status_code == 200
    assert float(res.json()["close"]) == 100.0


def test_date_before_first_quote_returns_404(client, asset_with_ticker):
    AssetPriceHistory.objects.create(
        asset=asset_with_ticker, date=date(2026, 1, 11), close=Decimal("110.0000")
    )

    with patch("portfolio.prices.backfill_price_history", return_value=0):
        res = client.get(
            f"/api/portfolio/{asset_with_ticker.id}/historical-price/?date=2026-01-06"
        )

    assert res.status_code == 404


def test_no_cache_returns_404(client, itype):
    # Asset with ticker but empty price history; mock backfill to avoid network call
    a = Asset.objects.create(
        name="Fake",
        ticker="FAKE.NOTICKER",
        investment_type=itype,
        is_liquid=True,
        invested_capital=Decimal("100.00"),
        current_value=Decimal("100.00"),
    )
    with patch("portfolio.prices.backfill_price_history", return_value=None):
        res = client.get(f"/api/portfolio/{a.id}/historical-price/?date=2026-01-10")
    assert res.status_code == 404
