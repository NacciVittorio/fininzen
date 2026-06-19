from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.db import OperationalError
from portfolio.models import Asset, PortfolioSnapshot


def test_summary_empty_portfolio(client, db):
    res = client.get("/api/portfolio/summary/")
    assert res.status_code == 200
    data = res.json()
    assert float(data["total_invested"]) == 0
    assert float(data["total_current"]) == 0
    assert float(data["total_gain"]) == 0
    assert data["by_type"] == []


def test_summary_totals(client, asset, illiquid_asset):
    # asset: invested=1000, current=1100
    # illiquid_asset: invested=200000, current=250000
    res = client.get("/api/portfolio/summary/")
    assert res.status_code == 200
    data = res.json()
    assert float(data["total_invested"]) == 201000.0
    assert float(data["total_current"]) == 251100.0
    assert float(data["total_gain"]) == 50100.0


def test_summary_liquid_illiquid_split(client, asset, illiquid_asset):
    res = client.get("/api/portfolio/summary/")
    data = res.json()
    assert float(data["liquid"]["current"]) == 1100.0
    assert float(data["illiquid"]["current"]) == 250000.0


def test_summary_by_type_breakdown(client, itype, itype_no_ticker, test_user):
    Asset.objects.create(
        name="A1",
        investment_type=itype,
        current_value=Decimal("500.00"),
        invested_capital=Decimal("400.00"),
        owner=test_user,
    )
    Asset.objects.create(
        name="A2",
        investment_type=itype_no_ticker,
        current_value=Decimal("300.00"),
        invested_capital=Decimal("250.00"),
        owner=test_user,
    )

    res = client.get("/api/portfolio/summary/")
    data = res.json()
    type_names = [t["type_name"] for t in data["by_type"]]
    assert "ETF" in type_names
    assert "Real Estate" in type_names


def test_summary_by_currency_breakdown(client, itype, test_user):
    """Feature E: summary must group current EUR value by asset currency,
    sorted descending, with a percent that sums to ~100."""
    Asset.objects.create(
        name="EUR pos",
        investment_type=itype,
        currency="EUR",
        current_value=Decimal("600.00"),
        current_value_eur=Decimal("600.00"),
        invested_capital=Decimal("500.00"),
        owner=test_user,
    )
    Asset.objects.create(
        name="USD pos",
        investment_type=itype,
        currency="USD",
        current_value=Decimal("450.00"),
        current_value_eur=Decimal("400.00"),
        invested_capital=Decimal("350.00"),
        owner=test_user,
    )

    res = client.get("/api/portfolio/summary/")
    assert res.status_code == 200
    data = res.json()
    by_currency = data["by_currency"]
    assert [r["currency"] for r in by_currency] == ["EUR", "USD"]
    assert float(by_currency[0]["total_eur"]) == 600.0
    assert float(by_currency[1]["total_eur"]) == 400.0
    assert round(sum(r["percent"] for r in by_currency), 2) == 100.0


def test_summary_by_currency_empty_portfolio(client, db):
    res = client.get("/api/portfolio/summary/")
    assert res.json()["by_currency"] == []


def test_summary_uses_current_value_eur_for_non_eur_assets(client, usd_asset):
    """Regression: summary must sum current_value_eur, not current_value (native currency)."""
    res = client.get("/api/portfolio/summary/")
    data = res.json()
    # current_value=1100 USD, current_value_eur=1012 → total_current must be 1012, not 1100
    assert float(data["total_current"]) == 1012.0


def test_summary_roi_zero_invested_capital_returns_zero_not_infinity(
    client, itype, test_user
):
    """Regression: ROI must be 0 when invested_capital=0, not 5959% or infinity."""
    Asset.objects.create(
        name="Ghost",
        ticker="",
        investment_type=itype,
        is_liquid=True,
        invested_capital=Decimal("0.00"),
        current_value=Decimal("100.00"),
        owner=test_user,
    )
    res = client.get("/api/portfolio/summary/")
    data = res.json()
    assert data["total_gain_percent"] == 0


def test_summary_tolerates_sqlite_lock_during_manual_reconcile(client, asset):
    """Regression: a transient "database is locked" during the manual-asset
    reconcile must not turn the summary GET into a 500 (observed 2026-06-11)."""
    with (
        patch(
            "portfolio.views.reconcile_due_manual_assets",
            side_effect=OperationalError("database is locked"),
        ),
        patch("portfolio.views.logger.warning") as warning,
    ):
        res = client.get("/api/portfolio/summary/")

    assert res.status_code == 200
    assert warning.called


def test_summary_reraises_non_lock_operational_error(client, asset):
    """Only lock contention is swallowed; real DB errors must still surface."""
    with patch(
        "portfolio.views.reconcile_due_manual_assets",
        side_effect=OperationalError(
            "no such column: portfolio_asset.invested_capital_eur"
        ),
    ):
        with pytest.raises(OperationalError, match="no such column"):
            client.get("/api/portfolio/summary/")


def test_summary_tolerates_sqlite_table_lock_during_manual_reconcile(client, asset):
    """MED-15: SQLite also reports contention as "database table is locked"
    (SQLITE_LOCKED); that variant must be swallowed on read endpoints too."""
    with (
        patch(
            "portfolio.views.reconcile_due_manual_assets",
            side_effect=OperationalError("database table is locked"),
        ),
        patch("portfolio.views.logger.warning") as warning,
    ):
        res = client.get("/api/portfolio/summary/")

    assert res.status_code == 200
    assert warning.called


def test_reset_also_clears_portfolio_snapshots(client, asset, test_user):
    snap_dt = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    PortfolioSnapshot.objects.create(
        owner=test_user,
        total_value=Decimal("1000.00"),
        liquid_value=Decimal("1000.00"),
        illiquid_value=Decimal("0"),
        snapshot_date=snap_dt,
    )
    assert PortfolioSnapshot.objects.filter(owner=test_user).count() >= 1

    res = client.post(
        "/api/portfolio/reset/",
        data={"confirm": True},
        content_type="application/json",
    )
    assert res.status_code == 200
    assert not Asset.objects.filter(owner=test_user).exists()
    assert not PortfolioSnapshot.objects.filter(owner=test_user).exists()
