from decimal import Decimal
from datetime import date
import pytest

from portfolio.models import Asset, AssetTransaction, InvestmentType


@pytest.fixture
def asset(db):
    itype = InvestmentType.objects.create(name="ETF")
    return Asset.objects.create(
        name="VUSA",
        investment_type=itype,
        is_liquid=True,
        invested_capital=Decimal("0"),
        current_value=Decimal("0"),
        price_per_share=Decimal("100.0000"),
    )


def _buy(asset, shares, price, d=date(2026, 1, 1), is_verified=True):
    return AssetTransaction.objects.create(
        asset=asset,
        transaction_type=AssetTransaction.BUY,
        date=d,
        shares=Decimal(shares),
        price_per_share=Decimal(price),
        is_verified=is_verified,
    )


def _sell(asset, shares, price, d=date(2026, 2, 1), is_verified=True):
    return AssetTransaction.objects.create(
        asset=asset,
        transaction_type=AssetTransaction.SELL,
        date=d,
        shares=Decimal(shares),
        price_per_share=Decimal(price),
        is_verified=is_verified,
    )


def test_buy_only(asset):
    _buy(asset, "10", "50")
    _buy(asset, "5", "60", d=date(2026, 1, 15))
    asset.recompute_from_transactions()
    asset.refresh_from_db()
    assert asset.shares == Decimal("15.000000")
    # 10*50 + 5*60 = 800
    assert asset.invested_capital == Decimal("800.00")


def test_buy_then_partial_sell_reduces_cost_basis_at_avg(asset):
    _buy(asset, "10", "50")  # avg cost = 50
    _sell(asset, "4", "70")  # sells 4 * 50 = 200 from cost
    asset.recompute_from_transactions()
    asset.refresh_from_db()
    assert asset.shares == Decimal("6.000000")
    assert asset.invested_capital == Decimal("300.00")


def test_sell_more_than_held_caps_at_zero(asset):
    _buy(asset, "5", "100")
    _sell(asset, "100", "120")
    asset.recompute_from_transactions()
    asset.refresh_from_db()
    assert asset.shares == Decimal("0.000000")
    assert asset.invested_capital == Decimal("0.00")
    assert asset.current_value == Decimal("0.00")


def test_current_value_uses_latest_price(asset):
    _buy(asset, "10", "50")
    asset.price_per_share = Decimal("75.0000")
    asset.save()
    asset.recompute_from_transactions()
    asset.refresh_from_db()
    # 10 * 75 = 750
    assert asset.current_value == Decimal("750.00")


def test_unverified_auto_transactions_do_not_affect_holdings(asset):
    _buy(asset, "10", "50", is_verified=False)
    asset.recompute_from_transactions()
    asset.refresh_from_db()
    assert asset.shares == Decimal("0.000000")
    assert asset.invested_capital == Decimal("0.00")
    assert asset.current_value == Decimal("0.00")


def test_sell_before_any_buy_is_a_noop(asset):
    # SELL with no prior BUY: running_shares == 0, guard skips the division.
    # Asset state must not change.
    _sell(asset, "5", "100")
    asset.recompute_from_transactions()
    asset.refresh_from_db()
    assert asset.shares == Decimal("0.000000")
    assert asset.invested_capital == Decimal("0.00")
    assert asset.current_value == Decimal("0.00")


def test_manual_tracking_cash_in_out(db):
    from portfolio.models import Asset, AssetTransaction, InvestmentType

    itype = InvestmentType.objects.create(name="Conto")
    manual_asset = Asset.objects.create(
        name="Conto Risparmio",
        investment_type=itype,
        tracking_type=Asset.MANUAL,
        is_liquid=True,
        invested_capital=Decimal("0"),
        current_value=Decimal("0"),
    )
    AssetTransaction.objects.create(
        asset=manual_asset,
        transaction_type=AssetTransaction.CASH_IN,
        date=date(2026, 1, 1),
        shares=Decimal("1"),
        price_per_share=Decimal("1000"),
        is_verified=True,
    )
    AssetTransaction.objects.create(
        asset=manual_asset,
        transaction_type=AssetTransaction.CASH_OUT,
        date=date(2026, 2, 1),
        shares=Decimal("1"),
        price_per_share=Decimal("200"),
        is_verified=True,
    )
    AssetTransaction.objects.create(
        asset=manual_asset,
        transaction_type=AssetTransaction.ADJUSTMENT,
        date=date(2026, 3, 1),
        shares=Decimal("1"),
        price_per_share=Decimal("50"),
        is_verified=True,
    )
    manual_asset.recompute_from_transactions()
    manual_asset.refresh_from_db()
    # invested = 1000 - 200 = 800
    assert manual_asset.invested_capital == Decimal("800.00")
    # current = 800 + 50 = 850
    assert manual_asset.current_value == Decimal("850.00")
    assert manual_asset.shares is None


def test_unverified_manual_transactions_do_not_affect_balance(db):
    itype = InvestmentType.objects.create(name="Conto")
    manual_asset = Asset.objects.create(
        name="Conto Risparmio",
        investment_type=itype,
        tracking_type=Asset.MANUAL,
        is_liquid=True,
        invested_capital=Decimal("0"),
        current_value=Decimal("0"),
    )
    AssetTransaction.objects.create(
        asset=manual_asset,
        transaction_type=AssetTransaction.CASH_IN,
        date=date(2026, 1, 1),
        shares=Decimal("1"),
        price_per_share=Decimal("1000"),
        is_verified=False,
    )
    manual_asset.recompute_from_transactions()
    manual_asset.refresh_from_db()
    assert manual_asset.invested_capital == Decimal("0.00")
    assert manual_asset.current_value == Decimal("0.00")


# ── Regression: rebuild_manual_history deve consentire saldi negativi (come recompute) ──


def test_rebuild_manual_history_allows_negative_balance(db):
    """
    Se cash_out > cash_in, il saldo deve essere negativo nel price history
    (conto in rosso / scoperto). Prima del fix veniva clampato a 0.
    """
    from portfolio.prices import rebuild_manual_history
    from portfolio.models import AssetPriceHistory

    itype = InvestmentType.objects.create(name="Bank")
    asset = Asset.objects.create(
        name="Conto Scoperto",
        ticker="",
        investment_type=itype,
        tracking_type=Asset.MANUAL,
        current_value=Decimal("-300.00"),
    )

    AssetTransaction.objects.create(
        asset=asset,
        transaction_type=AssetTransaction.CASH_IN,
        date=date(2026, 1, 1),
        shares=Decimal("1"),
        price_per_share=Decimal("100"),
        is_verified=True,
    )
    AssetTransaction.objects.create(
        asset=asset,
        transaction_type=AssetTransaction.CASH_OUT,
        date=date(2026, 2, 1),
        shares=Decimal("1"),
        price_per_share=Decimal("400"),
        is_verified=True,
    )

    rebuild_manual_history(asset)

    entry = AssetPriceHistory.objects.filter(asset=asset, date=date(2026, 2, 1)).first()
    assert entry is not None
    # 100 - 400 = -300: il saldo negativo deve essere preservato, non clampato a 0
    assert entry.close == Decimal("-300")


def test_rebuild_manual_history_applies_opening_balance_correction(db):
    from portfolio.models import (
        Asset,
        AssetPriceHistory,
        AssetTransaction,
        InvestmentType,
    )
    from portfolio.prices import rebuild_manual_history

    itype = InvestmentType.objects.create(name="Bank")
    asset = Asset.objects.create(
        name="Conto Rettificato",
        ticker="",
        investment_type=itype,
        tracking_type=Asset.MANUAL,
        opening_balance=Decimal("500.00"),
        opening_balance_date=date(2022, 1, 1),
        current_value=Decimal("0"),
    )

    AssetTransaction.objects.create(
        asset=asset,
        transaction_type=AssetTransaction.CASH_IN,
        date=date(2022, 2, 1),
        shares=Decimal("1"),
        price_per_share=Decimal("250"),
        is_verified=True,
    )

    asset.recompute_from_transactions()
    rebuild_manual_history(asset)

    opening = AssetPriceHistory.objects.filter(
        asset=asset, date=date(2022, 1, 1)
    ).first()
    assert opening is not None
    assert opening.close == Decimal("500")

    feb = AssetPriceHistory.objects.filter(asset=asset, date=date(2022, 2, 1)).first()
    assert feb is not None
    assert feb.close == Decimal("750")

    today = AssetPriceHistory.objects.filter(asset=asset, date=date.today()).first()
    assert today is not None
    assert today.close == Decimal("750.00")
