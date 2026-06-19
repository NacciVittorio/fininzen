"""Tests for GET /api/portfolio/{id}/price-history/ — auto-backfill on miss + new response shape."""

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest

from portfolio.models import Asset, AssetPriceHistory


@pytest.fixture
def auto_asset(itype, test_user):
    return Asset.objects.create(
        name="VWCE",
        ticker="VWCE.DE",
        investment_type=itype,
        is_liquid=True,
        invested_capital=Decimal("1000"),
        current_value=Decimal("1100"),
        currency="EUR",
        owner=test_user,
    )


def _seed_history(asset, points):
    AssetPriceHistory.objects.bulk_create(
        [
            AssetPriceHistory(
                asset=asset, date=d, close=Decimal(str(c)), owner=asset.owner
            )
            for d, c in points
        ]
    )


def test_returns_envelope_shape(client, auto_asset):
    today = date.today()
    _seed_history(auto_asset, [(today, 100), (today - timedelta(days=10), 95)])
    with patch(
        "portfolio.prices._backfill_price_history_with_meta",
        return_value=(0, {"status": "ok", "message": None}),
    ):
        res = client.get(f"/api/portfolio/{auto_asset.id}/price-history/?days=30")
    assert res.status_code == 200
    data = res.json()
    assert "points" in data
    assert "earliest_available" in data
    assert "requested_since" in data
    assert "status" in data
    assert len(data["points"]) == 2


def test_auto_backfill_called_when_cache_misses_range(client, auto_asset):
    today = date.today()
    # cache earliest is 5 days ago, user asks for 365 days
    _seed_history(auto_asset, [(today - timedelta(days=5), 100)])
    with patch(
        "portfolio.prices._backfill_price_history_with_meta",
        return_value=(0, {"status": "ok", "message": None}),
    ) as bf:
        res = client.get(f"/api/portfolio/{auto_asset.id}/price-history/?days=365")
    assert res.status_code == 200
    assert bf.called
    # passed from_date must be approximately today-365
    call_kwargs = bf.call_args.kwargs
    assert call_kwargs["from_date"] <= today - timedelta(days=360)


def test_no_backfill_when_cache_covers_range(client, auto_asset):
    today = date.today()
    _seed_history(auto_asset, [(today - timedelta(days=400), 90)])
    with patch(
        "portfolio.prices._backfill_price_history_with_meta",
        return_value=(0, {"status": "ok", "message": None}),
    ) as bf:
        res = client.get(f"/api/portfolio/{auto_asset.id}/price-history/?days=30")
    assert res.status_code == 200
    assert not bf.called


def test_status_partial_when_cache_starts_later_than_requested(client, auto_asset):
    today = date.today()
    _seed_history(auto_asset, [(today - timedelta(days=10), 100)])
    # backfill returns ok but doesn't add anything (no_data simulated by adding none)
    with patch(
        "portfolio.prices._backfill_price_history_with_meta",
        return_value=(0, {"status": "ok", "message": None}),
    ):
        res = client.get(f"/api/portfolio/{auto_asset.id}/price-history/?days=365")
    data = res.json()
    assert data["status"] == "partial"
    assert "data starts at" in data["message"]


def test_status_propagates_backfill_error(client, auto_asset):
    today = date.today()
    _seed_history(auto_asset, [(today, 100)])
    with patch(
        "portfolio.prices._backfill_price_history_with_meta",
        return_value=(0, {"status": "error", "message": "rate limit"}),
    ):
        res = client.get(f"/api/portfolio/{auto_asset.id}/price-history/?days=365")
    data = res.json()
    assert data["status"] == "error"
    assert "rate limit" in data["message"]


def test_status_partial_when_provider_has_only_cached_current_quote(client, auto_asset):
    today = date.today()
    _seed_history(auto_asset, [(today, 100)])
    with patch(
        "portfolio.prices._backfill_price_history_with_meta",
        return_value=(0, {"status": "no_data", "message": "no validated history"}),
    ):
        res = client.get(f"/api/portfolio/{auto_asset.id}/price-history/?days=365")

    data = res.json()
    assert data["status"] == "partial"
    assert data["message"] == "no validated history"
    assert len(data["points"]) == 1


def test_days_clamped_to_3650(client, auto_asset):
    with patch(
        "portfolio.prices._backfill_price_history_with_meta",
        return_value=(0, {"status": "ok", "message": None}),
    ):
        res = client.get(f"/api/portfolio/{auto_asset.id}/price-history/?days=99999")
    data = res.json()
    earliest_request = date.fromisoformat(data["requested_since"])
    assert earliest_request >= date.today() - timedelta(days=3651)


def test_days_clamped_min_30(client, auto_asset):
    with patch(
        "portfolio.prices._backfill_price_history_with_meta",
        return_value=(0, {"status": "ok", "message": None}),
    ):
        res = client.get(f"/api/portfolio/{auto_asset.id}/price-history/?days=1")
    data = res.json()
    earliest_request = date.fromisoformat(data["requested_since"])
    assert earliest_request <= date.today() - timedelta(days=29)


def test_manual_asset_no_backfill(client, illiquid_asset):
    res = client.get(f"/api/portfolio/{illiquid_asset.id}/price-history/?days=365")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["points"] == []


def test_tracked_asset_history_omits_cached_non_positive_close(client, auto_asset):
    today = date.today()
    _seed_history(
        auto_asset,
        [(today - timedelta(days=10), 7.50), (today, 0)],
    )
    with patch(
        "portfolio.prices._backfill_price_history_with_meta",
        return_value=(0, {"status": "ok", "message": None}),
    ):
        res = client.get(f"/api/portfolio/{auto_asset.id}/price-history/?days=30")

    assert res.status_code == 200
    assert res.json()["points"] == [
        {"date": (today - timedelta(days=10)).isoformat(), "close": 7.5}
    ]
