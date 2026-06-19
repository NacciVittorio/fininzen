"""Tests for PortfolioSnapshot by_asset_class and by_asset breakdown fields."""

import pytest
from decimal import Decimal
from portfolio.models import Asset, InvestmentType, PortfolioSnapshot


@pytest.fixture
def itype_etf(db, test_user):
    return InvestmentType.objects.create(
        name="ETF", supports_ticker=True, owner=test_user
    )


@pytest.fixture
def itype_bank(db, test_user):
    return InvestmentType.objects.create(
        name="Banca",
        is_bank_account=True,
        supports_ticker=False,
        owner=test_user,
    )


@pytest.fixture
def asset_etf(itype_etf, test_user):
    return Asset.objects.create(
        name="VWCE",
        ticker="",
        investment_type=itype_etf,
        is_liquid=True,
        current_value=Decimal("1000.00"),
        invested_capital=Decimal("900.00"),
        owner=test_user,
    )


@pytest.fixture
def asset_bank(itype_bank, test_user):
    return Asset.objects.create(
        name="Conto",
        ticker="",
        investment_type=itype_bank,
        is_liquid=True,
        current_value=Decimal("500.00"),
        invested_capital=Decimal("500.00"),
        owner=test_user,
    )


def test_snapshot_breakdown_uses_current_value_eur(db, test_user, usd_asset):
    """Regression for v0.14.12 / Sprint 3 P0-1.

    The snapshot creator in `aggiorna_tutti_i_prezzi` must populate
    `by_asset_class` and `by_asset` using `current_value_eur` (not the native
    `current_value`), otherwise the breakdown sum doesn't reconcile with
    `total_value` for portfolios with non-EUR assets.
    """
    from portfolio.prices import aggiorna_tutti_i_prezzi
    from portfolio.models import PortfolioSnapshot

    # No ticker → no yfinance call; aggiorna_tutti_i_prezzi falls through to
    # the snapshot block with successi=0, errori=0.
    aggiorna_tutti_i_prezzi()

    snap = (
        PortfolioSnapshot.objects.filter(owner=test_user)
        .order_by("-snapshot_date")
        .first()
    )
    assert snap is not None, "expected a snapshot for the test user"

    type_id = str(usd_asset.investment_type_id)
    # The asset has current_value=1100 (USD) and current_value_eur=1012.
    # Breakdown must be in EUR.
    assert snap.by_asset_class[type_id] == pytest.approx(1012.0, rel=1e-3)
    asset_entry = next(a for a in snap.by_asset if a["asset_id"] == usd_asset.id)
    assert asset_entry["value"] == pytest.approx(1012.0, rel=1e-3)
    # And the sum of by_asset_class must reconcile with total_value.
    breakdown_sum = sum(snap.by_asset_class.values())
    assert breakdown_sum == pytest.approx(float(snap.total_value), rel=1e-3)


def test_snapshot_breakdown_fields(db, asset_etf, asset_bank, test_user):
    snap = PortfolioSnapshot.objects.create(
        owner=test_user,
        total_value=Decimal("1500.00"),
        liquid_value=Decimal("1500.00"),
        illiquid_value=Decimal("0.00"),
        by_asset_class={
            str(asset_etf.investment_type_id): 1000.0,
            str(asset_bank.investment_type_id): 500.0,
        },
        by_asset=[
            {
                "asset_id": asset_etf.id,
                "name": "VWCE",
                "type_id": asset_etf.investment_type_id,
                "value": 1000.0,
            },
            {
                "asset_id": asset_bank.id,
                "name": "Conto",
                "type_id": asset_bank.investment_type_id,
                "value": 500.0,
            },
        ],
    )
    snap.refresh_from_db()
    assert str(asset_etf.investment_type_id) in snap.by_asset_class
    assert snap.by_asset_class[str(asset_etf.investment_type_id)] == 1000.0
    assert len(snap.by_asset) == 2
    names = {a["name"] for a in snap.by_asset}
    assert names == {"VWCE", "Conto"}
