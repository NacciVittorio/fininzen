"""
Regression tests for portfolio security hardening.

#41 — IDOR: create_transaction source/dest account without owner filter
#44 — price refresh scoped to requesting user only
"""

import pytest
from decimal import Decimal
from unittest.mock import patch
from django.contrib.auth.models import User
from portfolio.models import Asset, AssetTransaction, InvestmentType


@pytest.fixture
def other_user(db):
    return User.objects.create_user(
        username="other@test.com", email="other@test.com", password="Pass!123abc"
    )


@pytest.fixture
def bank_type(test_user):
    return InvestmentType.objects.create(
        name="Bank",
        supports_ticker=False,
        is_liquid_default=True,
        is_bank_account=True,
        owner=test_user,
    )


@pytest.fixture
def own_bank(bank_type, test_user):
    return Asset.objects.create(
        name="My Bank",
        ticker="",
        investment_type=bank_type,
        tracking_type=Asset.MANUAL,
        is_liquid=True,
        invested_capital=Decimal("5000"),
        current_value=Decimal("5000"),
        owner=test_user,
    )


@pytest.fixture
def other_bank(other_user):
    itype = InvestmentType.objects.create(
        name="Bank",
        supports_ticker=False,
        is_liquid_default=True,
        is_bank_account=True,
        owner=other_user,
    )
    return Asset.objects.create(
        name="Other Bank",
        ticker="",
        investment_type=itype,
        tracking_type=Asset.MANUAL,
        is_liquid=True,
        invested_capital=Decimal("9000"),
        current_value=Decimal("9000"),
        owner=other_user,
    )


@pytest.fixture
def buy_asset(itype, test_user):
    return Asset.objects.create(
        name="ETF BUY",
        ticker="",
        investment_type=itype,
        tracking_type=Asset.MANUAL,
        is_liquid=True,
        invested_capital=Decimal("0"),
        current_value=Decimal("0"),
        owner=test_user,
    )


# ── #41 IDOR transaction source/dest account ─────────────────────────────────


def test_buy_with_other_users_source_account_is_rejected(client, buy_asset, other_bank):
    """BUY with another user's source account must not create a CASH_OUT on it."""
    initial_tx_count = AssetTransaction.objects.filter(asset=other_bank).count()

    res = client.post(
        f"/api/portfolio/{buy_asset.id}/transactions/",
        data={
            "transaction_type": "buy",
            "date": "2025-06-01",
            "shares": "1",
            "price_per_share": "100.00",
            "notes": "",
            "source_account_id": other_bank.id,
        },
        content_type="application/json",
    )
    assert res.status_code == 400
    # No derived CASH_OUT on the other user's account
    assert AssetTransaction.objects.filter(asset=other_bank).count() == initial_tx_count


def test_buy_with_own_source_account_creates_derived_cash_out(
    client, buy_asset, own_bank
):
    """BUY with own source account must create a CASH_OUT on it."""
    res = client.post(
        f"/api/portfolio/{buy_asset.id}/transactions/",
        data={
            "transaction_type": "buy",
            "date": "2025-06-01",
            "shares": "1",
            "price_per_share": "100.00",
            "notes": "",
            "source_account_id": own_bank.id,
        },
        content_type="application/json",
    )
    assert res.status_code == 201
    assert AssetTransaction.objects.filter(
        asset=own_bank, transaction_type=AssetTransaction.CASH_OUT
    ).exists()


# ── #44 refresh-prices scoped to user ────────────────────────────────────────


def test_refresh_prices_only_updates_own_assets(client, test_user, other_user, itype):
    """refresh-prices must only process assets owned by the requesting user."""
    other_itype = InvestmentType.objects.create(
        name="ETF", supports_ticker=True, is_liquid_default=True, owner=other_user
    )
    own_asset = Asset.objects.create(
        name="Own ETF",
        ticker="VWCE",
        investment_type=itype,
        is_liquid=True,
        invested_capital=Decimal("1000"),
        current_value=Decimal("1000"),
        owner=test_user,
    )
    other_asset = Asset.objects.create(
        name="Other ETF",
        ticker="SPY",
        investment_type=other_itype,
        is_liquid=True,
        invested_capital=Decimal("2000"),
        current_value=Decimal("2000"),
        owner=other_user,
    )

    refreshed = []

    def mock_refresh(asset):
        refreshed.append(asset.pk)
        return True

    with patch("portfolio.prices.aggiorna_prezzo_singolo", side_effect=mock_refresh):
        res = client.post("/api/portfolio/refresh-prices/")

    assert res.status_code == 200
    assert own_asset.pk in refreshed
    assert other_asset.pk not in refreshed
