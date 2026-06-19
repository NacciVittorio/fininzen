"""Regression tests for GET /api/portfolio/monthly-overview/?year=YYYY"""

import pytest
from decimal import Decimal
from datetime import date

from expenses.models import Category, Expense
from finnet.models import UserProfile
from portfolio.models import (
    Asset,
    AssetPriceHistory,
    AssetTransaction,
    FXRateHistory,
    InvestmentType,
)


@pytest.fixture
def bank_itype(test_user):
    return InvestmentType.objects.create(
        name="Cash",
        supports_ticker=False,
        is_liquid_default=True,
        is_bank_account=True,
        owner=test_user,
    )


@pytest.fixture
def bank_asset(bank_itype, test_user):
    return Asset.objects.create(
        name="BuddyBank",
        ticker="",
        investment_type=bank_itype,
        tracking_type=Asset.MANUAL,
        is_liquid=True,
        currency="EUR",
        invested_capital=Decimal("5000.00"),
        current_value=Decimal("5000.00"),
        owner=test_user,
    )


def test_monthly_overview_empty_year(client, db):
    """Year with no data returns all-null arrays."""
    res = client.get("/api/portfolio/monthly-overview/?year=2000")
    assert res.status_code == 200
    data = res.json()
    assert data["year"] == 2000
    assert data["assets"] == []
    assert all(v is None for v in data["summary"]["nw"])
    assert all(v is None for v in data["summary"]["balance"])


def test_monthly_overview_manual_eur_asset(client, bank_asset, test_user):
    """MANUAL EUR asset: monthly_values taken from AssetPriceHistory."""
    AssetPriceHistory.objects.create(
        asset=bank_asset,
        date=date(2025, 1, 31),
        close=Decimal("3000.00"),
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=bank_asset,
        date=date(2025, 2, 28),
        close=Decimal("3200.00"),
        owner=test_user,
    )

    res = client.get("/api/portfolio/monthly-overview/?year=2025")
    assert res.status_code == 200
    data = res.json()

    asset_row = data["assets"][0]
    assert asset_row["name"] == "BuddyBank"
    assert asset_row["monthly_values"][0] == 3000.0  # jan index 0
    assert asset_row["monthly_values"][1] == 3200.0  # feb index 1
    assert all(v == 3200.0 for v in asset_row["monthly_values"][2:])


def test_monthly_overview_nw_equals_sum_of_assets(client, bank_asset, itype, test_user):
    """NW summary = sum of all asset values for that month."""
    AssetPriceHistory.objects.create(
        asset=bank_asset,
        date=date(2025, 3, 31),
        close=Decimal("5000.00"),
        owner=test_user,
    )

    # Add an investment asset
    inv = Asset.objects.create(
        name="VWCE",
        ticker="",
        investment_type=itype,
        tracking_type=Asset.MANUAL,
        currency="EUR",
        current_value=Decimal("8000.00"),
        invested_capital=Decimal("7000.00"),
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=inv, date=date(2025, 3, 31), close=Decimal("8000.00"), owner=test_user
    )

    res = client.get("/api/portfolio/monthly-overview/?year=2025")
    assert res.status_code == 200
    data = res.json()

    march = 2  # index 2 = March
    assert data["summary"]["nw"][march] == pytest.approx(13000.0)
    assert data["summary"]["balance"][march] == pytest.approx(
        5000.0
    )  # only bank account


def test_monthly_overview_nw_change(client, bank_asset, test_user):
    """NW Change = month-over-month delta."""
    AssetPriceHistory.objects.create(
        asset=bank_asset,
        date=date(2025, 1, 31),
        close=Decimal("10000.00"),
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=bank_asset,
        date=date(2025, 2, 28),
        close=Decimal("10500.00"),
        owner=test_user,
    )

    res = client.get("/api/portfolio/monthly-overview/?year=2025")
    data = res.json()

    assert data["summary"]["nw_change_abs"][0] is None  # first month = no change
    assert data["summary"]["nw_change_abs"][1] == pytest.approx(500.0)
    assert data["summary"]["nw_change_pct"][1] == pytest.approx(5.0)


def test_monthly_overview_fx_conversion(client, itype, test_user):
    """USD asset: close × fx_rate gives EUR value."""
    usd_asset = Asset.objects.create(
        name="S&P500",
        ticker="",
        investment_type=itype,
        tracking_type=Asset.MANUAL,
        currency="USD",
        current_value=Decimal("1000.00"),
        current_value_eur=Decimal("920.00"),
        invested_capital=Decimal("900.00"),
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=usd_asset,
        date=date(2025, 4, 30),
        close=Decimal("2000.00"),
        owner=test_user,
    )
    FXRateHistory.objects.create(
        from_currency="USD",
        to_currency="EUR",
        date=date(2025, 4, 30),
        rate=Decimal("0.92"),
        owner=test_user,
    )

    res = client.get("/api/portfolio/monthly-overview/?year=2025")
    data = res.json()

    april = 3  # index 3
    assert data["assets"][0]["monthly_values"][april] == pytest.approx(
        1840.0
    )  # 2000 × 0.92


def test_monthly_overview_reports_missing_fx(client, itype, test_user):
    asset = Asset.objects.create(
        name="USD account",
        investment_type=itype,
        tracking_type=Asset.MANUAL,
        currency="USD",
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=asset,
        date=date(2025, 4, 30),
        close=Decimal("2000.00"),
        owner=test_user,
    )

    data = client.get("/api/portfolio/monthly-overview/?year=2025").json()

    assert data["assets"][0]["monthly_values"][3] is None
    assert data["meta"] == {
        "fx_incomplete": True,
        "missing_fx_currencies": ["USD"],
    }


def test_monthly_overview_multiple_prices_same_month_uses_last(
    client, bank_asset, test_user
):
    """When multiple price history entries exist in a month, use the latest date."""
    AssetPriceHistory.objects.create(
        asset=bank_asset,
        date=date(2025, 5, 1),
        close=Decimal("1000.00"),
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=bank_asset,
        date=date(2025, 5, 20),
        close=Decimal("1100.00"),
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=bank_asset,
        date=date(2025, 5, 31),
        close=Decimal("1200.00"),
        owner=test_user,
    )

    res = client.get("/api/portfolio/monthly-overview/?year=2025")
    data = res.json()
    assert data["assets"][0]["monthly_values"][4] == pytest.approx(
        1200.0
    )  # index 4 = May


def test_monthly_overview_available_years_only_shows_years_with_data(
    client, bank_asset, test_user
):
    """available_years contains only years that have transactions or price history."""
    AssetPriceHistory.objects.create(
        asset=bank_asset,
        date=date(2023, 6, 30),
        close=Decimal("4000.00"),
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=bank_asset,
        date=date(2025, 3, 31),
        close=Decimal("5000.00"),
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=bank_asset,
        transaction_type=AssetTransaction.CASH_IN,
        price_per_share=Decimal("1000.00"),
        shares=1,
        date=date(2024, 1, 15),
        is_verified=True,
        owner=test_user,
    )

    res = client.get("/api/portfolio/monthly-overview/?year=2025")
    data = res.json()

    assert "available_years" in data
    assert set(data["available_years"]) == {2023, 2024, 2025}
    assert 2022 not in data["available_years"]
    assert 2026 not in data["available_years"]
    # Returned in descending order
    assert data["available_years"] == sorted(data["available_years"], reverse=True)


def test_monthly_overview_hides_months_before_first_transaction(
    client, itype, test_user
):
    asset = Asset.objects.create(
        name="QQQ",
        ticker="QQQ",
        investment_type=itype,
        tracking_type=Asset.AUTO,
        currency="EUR",
        current_value=Decimal("1000.00"),
        invested_capital=Decimal("1000.00"),
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=asset,
        transaction_type=AssetTransaction.BUY,
        price_per_share=Decimal("100.00"),
        shares=10,
        date=date(2025, 4, 15),
        is_verified=True,
        owner=test_user,
    )
    # Price history exists before ownership period: it must not leak into Jan-Mar.
    AssetPriceHistory.objects.create(
        asset=asset,
        date=date(2025, 1, 31),
        close=Decimal("80.00"),
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=asset,
        date=date(2025, 4, 30),
        close=Decimal("110.00"),
        owner=test_user,
    )

    res = client.get("/api/portfolio/monthly-overview/?year=2025")
    assert res.status_code == 200
    data = res.json()

    row = data["assets"][0]
    assert row["monthly_values"][0] is None
    assert row["monthly_values"][1] is None
    assert row["monthly_values"][2] is None
    assert row["monthly_values"][3] == pytest.approx(1100.0)


def test_monthly_overview_auto_asset_uses_owned_shares_not_single_quote(
    client, itype, test_user
):
    asset = Asset.objects.create(
        name="VWCE",
        ticker="VWCE",
        investment_type=itype,
        tracking_type=Asset.AUTO,
        currency="EUR",
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=asset,
        transaction_type=AssetTransaction.BUY,
        price_per_share=Decimal("100.00"),
        shares=Decimal("3"),
        date=date(2025, 1, 10),
        is_verified=True,
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=asset,
        date=date(2025, 1, 31),
        close=Decimal("100.00"),
        owner=test_user,
    )

    res = client.get("/api/portfolio/monthly-overview/?year=2025")
    assert res.status_code == 200
    data = res.json()

    row = data["assets"][0]
    # 3 shares × 100 EUR close = 300 EUR (not 100 EUR).
    assert row["monthly_values"][0] == pytest.approx(300.0)


def test_monthly_overview_auto_asset_ignores_non_positive_close(
    client, itype, test_user
):
    asset = Asset.objects.create(
        name="VWCE",
        ticker="VWCE",
        investment_type=itype,
        tracking_type=Asset.AUTO,
        currency="EUR",
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=asset,
        transaction_type=AssetTransaction.BUY,
        price_per_share=Decimal("100.00"),
        shares=Decimal("3"),
        date=date(2025, 1, 10),
        is_verified=True,
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=asset,
        date=date(2025, 1, 31),
        close=Decimal("100.00"),
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=asset,
        date=date(2025, 2, 28),
        close=Decimal("0.00"),
        owner=test_user,
    )

    res = client.get("/api/portfolio/monthly-overview/?year=2025")

    assert res.status_code == 200
    row = res.json()["assets"][0]
    assert row["monthly_values"][0] == pytest.approx(300.0)
    assert row["monthly_values"][1] == pytest.approx(300.0)


def test_monthly_overview_cashflow_uses_accounting_month(client, test_user, bank_asset):
    profile, _ = UserProfile.objects.get_or_create(user=test_user)
    profile.accounting_month_start_day = 27
    profile.save(update_fields=["accounting_month_start_day"])
    income_cat = Category.objects.create(
        name="Salary",
        owner=test_user,
        category_type=Category.INCOME,
    )
    expense_cat = Category.objects.create(
        name="Food",
        owner=test_user,
        category_type=Category.EXPENSE,
    )
    Expense.objects.create(
        description="Old salary",
        amount="1000.00",
        category=income_cat,
        date=date(2026, 5, 26),
        is_verified=True,
        owner=test_user,
    )
    Expense.objects.create(
        description="Salary",
        amount="2500.00",
        category=income_cat,
        date=date(2026, 5, 27),
        is_verified=True,
        owner=test_user,
    )
    Expense.objects.create(
        description="Groceries",
        amount="50.00",
        category=expense_cat,
        date=date(2026, 6, 26),
        is_verified=True,
        owner=test_user,
    )

    res = client.get("/api/portfolio/monthly-overview/?year=2026")

    assert res.status_code == 200
    may = 4
    data = res.json()
    assert data["summary"]["income"][may] == pytest.approx(2500.0)
    assert data["summary"]["outcome"][may] == pytest.approx(50.0)


def test_monthly_overview_does_not_project_into_future_months(
    client, bank_asset, test_user
):
    """Current year: months after the current month must stay null instead of
    carrying the last known price forward (regression: future months showed the
    current value)."""
    today = date.today()
    AssetPriceHistory.objects.create(
        asset=bank_asset,
        date=date(today.year, 1, 15),
        close=Decimal("3000.00"),
        owner=test_user,
    )

    res = client.get(f"/api/portfolio/monthly-overview/?year={today.year}")
    assert res.status_code == 200
    data = res.json()
    row = data["assets"][0]

    cur = today.month - 1  # 0-indexed current month
    # Current month still shows the last known value (carry-forward up to "now").
    assert row["monthly_values"][cur] == pytest.approx(3000.0)
    # Every month after the current one must be null, not projected.
    assert all(v is None for v in row["monthly_values"][cur + 1 :])
    assert all(v is None for v in data["summary"]["nw"][cur + 1 :])
    assert all(v is None for v in data["summary"]["balance"][cur + 1 :])


def test_monthly_overview_future_year_is_empty(client, bank_asset, test_user):
    """A year entirely in the future has no carried-forward values at all."""
    today = date.today()
    AssetPriceHistory.objects.create(
        asset=bank_asset,
        date=date(today.year, 1, 15),
        close=Decimal("3000.00"),
        owner=test_user,
    )

    res = client.get(f"/api/portfolio/monthly-overview/?year={today.year + 1}")
    assert res.status_code == 200
    data = res.json()
    row = data["assets"][0]

    assert all(v is None for v in row["monthly_values"])
    assert all(v is None for v in data["summary"]["nw"])
    assert all(v is None for v in data["summary"]["balance"])
