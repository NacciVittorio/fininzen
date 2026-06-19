import pytest
from datetime import date
from decimal import Decimal
from portfolio.models import (
    Asset,
    AssetPriceHistory,
    AssetTransaction,
    FXRateHistory,
)


def test_history_empty_returns_empty_list(client, db):
    res = client.get(
        "/api/portfolio/history/?start_date=2026-01-01&end_date=2026-01-01"
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert float(data[0]["total_value"]) == 0.0


def test_history_illiquid_asset_constant_fallback(client, illiquid_asset):
    # No price history → falls back to current_value=250000 for any queried range,
    # including dates in the past (the created_at restriction was removed as a bug fix).
    res = client.get(
        "/api/portfolio/history/?start_date=2026-04-01&end_date=2026-04-03"
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 3
    for point in data:
        assert float(point["total_value"]) == 250000.0


def test_history_illiquid_with_price_history(client, illiquid_asset):
    AssetPriceHistory.objects.create(
        asset=illiquid_asset, date=date(2026, 4, 1), close=Decimal("240000.0000")
    )
    AssetPriceHistory.objects.create(
        asset=illiquid_asset, date=date(2026, 4, 3), close=Decimal("260000.0000")
    )

    res = client.get(
        "/api/portfolio/history/?start_date=2026-04-01&end_date=2026-04-03"
    )
    data = res.json()
    # Day 1: exact match → 240000
    assert float(data[0]["total_value"]) == 240000.0
    # Day 3: exact match → 260000
    assert float(data[2]["total_value"]) == 260000.0
    # Day 2: step function (not interpolated) → holds last known value 240000
    assert float(data[1]["total_value"]) == 240000.0


def test_history_liquid_asset_with_price_history(client, itype, test_user):
    # Liquid asset with ticker for price-based history
    a = Asset.objects.create(
        name="VWCE",
        ticker="VWCE.DE",
        investment_type=itype,
        is_liquid=True,
        invested_capital=Decimal("1000.00"),
        current_value=Decimal("1000.00"),
        price_per_share=Decimal("100.0000"),
        shares=Decimal("10.000000"),
        owner=test_user,
    )
    # Add transaction directly via ORM (bypasses _ensure_history_covers_transactions yfinance call)
    AssetTransaction.objects.create(
        asset=a,
        transaction_type=AssetTransaction.BUY,
        date=date(2026, 4, 1),
        shares=Decimal("10.000000"),
        price_per_share=Decimal("100.0000"),
        is_verified=True,
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=a, date=date(2026, 4, 1), close=Decimal("100.0000")
    )

    res = client.get(
        "/api/portfolio/history/?start_date=2026-04-01&end_date=2026-04-01"
    )
    data = res.json()
    assert len(data) == 1
    assert float(data[0]["total_value"]) == 1000.0


def test_history_respects_date_range(client, illiquid_asset):
    AssetPriceHistory.objects.create(
        asset=illiquid_asset, date=date(2026, 1, 1), close=Decimal("200000.0000")
    )
    AssetPriceHistory.objects.create(
        asset=illiquid_asset, date=date(2026, 3, 1), close=Decimal("300000.0000")
    )

    # Request only Feb
    res = client.get(
        "/api/portfolio/history/?start_date=2026-02-01&end_date=2026-02-28"
    )
    data = res.json()
    assert len(data) == 28
    # All dates should be in February 2026
    for point in data:
        assert "2026-02" in point["snapshot_date"]


def test_history_applies_fx_conversion_for_non_eur_asset(client, usd_asset, test_user):
    """Regression: history values must be converted to EUR via FXRateHistory, not returned in native currency."""
    FXRateHistory.objects.create(
        from_currency="USD",
        to_currency="EUR",
        date=date(2026, 4, 1),
        rate=Decimal("0.92"),
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=usd_asset, date=date(2026, 4, 1), close=Decimal("1100.0000")
    )

    res = client.get(
        "/api/portfolio/history/?start_date=2026-04-01&end_date=2026-04-01"
    )
    data = res.json()
    assert len(data) == 1
    # 1100 USD × 0.92 = 1012 EUR, not 1100
    assert float(data[0]["total_value"]) == pytest.approx(1012.0, rel=0.01)


def test_history_swaps_inverted_dates(client, db):
    # start_date > end_date → should swap and return valid data
    res = client.get(
        "/api/portfolio/history/?start_date=2026-04-03&end_date=2026-04-01"
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 3  # 3 days after swap


# ── Regression: wrong starting value ─────────────────────────────────────────


def test_history_manual_asset_zero_before_first_price_history(client, illiquid_asset):
    """Regression: a MANUAL asset must show 0 for dates before its first price-history point.
    Previously _price_at() would forward-extrapolate from the first known price, inflating
    the chart for the entire queried range even before the asset existed."""
    AssetPriceHistory.objects.create(
        asset=illiquid_asset, date=date(2026, 4, 1), close=Decimal("250000.0000")
    )

    # Query a range that starts BEFORE the first price-history point
    res = client.get(
        "/api/portfolio/history/?start_date=2026-01-01&end_date=2026-04-02"
    )
    assert res.status_code == 200
    data = res.json()

    # Days before 2026-04-01 must be 0 (asset didn't exist yet)
    before = [p for p in data if p["snapshot_date"] < "2026-04-01"]
    for p in before:
        assert float(p["total_value"]) == 0.0, (
            f"Expected 0 on {p['snapshot_date']}, got {p['total_value']}"
        )

    # 2026-04-01 must show the value
    on_date = next(p for p in data if p["snapshot_date"].startswith("2026-04-01"))
    assert float(on_date["total_value"]) == 250000.0


def test_history_ticker_asset_zero_before_first_buy(client, itype, test_user):
    """Regression: a ticker asset must show 0 for dates before the first BUY transaction."""
    a = Asset.objects.create(
        name="VWCE",
        ticker="VWCE.DE",
        investment_type=itype,
        is_liquid=True,
        invested_capital=Decimal("1000.00"),
        current_value=Decimal("1000.00"),
        price_per_share=Decimal("100.0000"),
        shares=Decimal("10.000000"),
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=a,
        transaction_type=AssetTransaction.BUY,
        date=date(2026, 4, 1),
        shares=Decimal("10.000000"),
        price_per_share=Decimal("100.0000"),
        is_verified=True,
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=a, date=date(2026, 4, 1), close=Decimal("100.0000")
    )

    # Query from 3 months before the BUY
    res = client.get(
        "/api/portfolio/history/?start_date=2026-01-01&end_date=2026-04-02"
    )
    assert res.status_code == 200
    data = res.json()

    # Jan, Feb, Mar must be 0
    before = [p for p in data if p["snapshot_date"] < "2026-04-01"]
    for p in before:
        assert float(p["total_value"]) == 0.0, (
            f"Expected 0 on {p['snapshot_date']}, got {p['total_value']}"
        )

    # 2026-04-01 must be 10 × 100 = 1000
    on_date = next(p for p in data if p["snapshot_date"].startswith("2026-04-01"))
    assert float(on_date["total_value"]) == pytest.approx(1000.0)


# ── Regression: MANUAL asset step function (no interpolation) ─────────────────


def test_history_manual_step_function_no_interpolation(
    client, itype_no_ticker, test_user
):
    """Regression: spesa di 885€ su Fineco mostrava ~200€ nel grafico 1M.

    _price_at() interpolava linearmente tra CASH_IN (gen) e CASH_OUT (mag),
    distribuendo la spesa su 102 giorni. Il saldo deve rimanere flat al valore
    pre-spesa fino al giorno della transazione, poi droppare in un cliff."""
    asset = Asset.objects.create(
        name="Fineco",
        ticker="",
        investment_type=itype_no_ticker,
        is_liquid=True,
        invested_capital=Decimal("749.40"),
        current_value=Decimal("749.40"),
        owner=test_user,
    )
    # Simula rebuild_manual_history: CASH_IN jan, CASH_OUT mag
    AssetPriceHistory.objects.create(
        asset=asset, date=date(2026, 1, 27), close=Decimal("1635.00")
    )
    AssetPriceHistory.objects.create(
        asset=asset, date=date(2026, 5, 9), close=Decimal("749.40")
    )

    res = client.get(
        "/api/portfolio/history/?start_date=2026-04-11&end_date=2026-05-11"
    )
    assert res.status_code == 200
    data = res.json()

    def value_on(d):
        point = next(p for p in data if p["snapshot_date"].startswith(d))
        return float(point["total_value"])

    # Saldo pieno fino al giorno prima della spesa (step function, non interpolazione)
    assert value_on("2026-04-11") == pytest.approx(1635.0), (
        "saldo deve essere flat pre-spesa"
    )
    assert value_on("2026-05-08") == pytest.approx(1635.0), (
        "saldo deve essere flat il giorno prima"
    )
    # Cliff il giorno della spesa
    assert value_on("2026-05-09") == pytest.approx(749.40), (
        "cliff il giorno della transazione"
    )
    # Flat dopo
    assert value_on("2026-05-11") == pytest.approx(749.40), "saldo flat dopo la spesa"


def test_history_auto_asset_uses_last_known_close(client, itype, test_user):
    """Gli asset AUTO non usano quotazioni future tra due close disponibili."""
    a = Asset.objects.create(
        name="VWCE",
        ticker="VWCE.DE",
        investment_type=itype,
        is_liquid=True,
        invested_capital=Decimal("1000.00"),
        current_value=Decimal("1100.00"),
        price_per_share=Decimal("110.0000"),
        shares=Decimal("10.000000"),
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=a,
        transaction_type=AssetTransaction.BUY,
        date=date(2026, 4, 1),
        shares=Decimal("10.000000"),
        price_per_share=Decimal("100.0000"),
        is_verified=True,
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=a, date=date(2026, 4, 1), close=Decimal("100.0000")
    )
    AssetPriceHistory.objects.create(
        asset=a, date=date(2026, 4, 3), close=Decimal("120.0000")
    )

    res = client.get(
        "/api/portfolio/history/?start_date=2026-04-01&end_date=2026-04-03"
    )
    data = res.json()
    # AUTO asset: day 2 conserva il close precedente: 100 × 10 quote = 1000
    assert float(data[1]["total_value"]) == pytest.approx(1000.0)


def test_history_auto_asset_ignores_non_positive_close(client, itype, test_user):
    a = Asset.objects.create(
        name="VWCE",
        ticker="VWCE.DE",
        investment_type=itype,
        is_liquid=True,
        shares=Decimal("10.000000"),
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=a,
        transaction_type=AssetTransaction.BUY,
        date=date(2026, 4, 1),
        shares=Decimal("10.000000"),
        price_per_share=Decimal("100.0000"),
        is_verified=True,
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=a, date=date(2026, 4, 1), close=Decimal("100.0000")
    )
    AssetPriceHistory.objects.create(
        asset=a, date=date(2026, 4, 2), close=Decimal("0.0000")
    )

    res = client.get(
        "/api/portfolio/history/?start_date=2026-04-01&end_date=2026-04-02"
    )

    assert res.status_code == 200
    assert float(res.json()[1]["total_value"]) == pytest.approx(1000.0)
