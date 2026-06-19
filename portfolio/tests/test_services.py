"""Tests per portfolio/services.py — chiamano i servizi senza Client()."""

import pytest
import pandas as pd
import time
from concurrent.futures import TimeoutError as FuturesTimeoutError
from decimal import Decimal
from datetime import date
from unittest.mock import patch

from portfolio.models import (
    Asset,
    AssetPriceHistory,
    AssetTransaction,
    ContributionSource,
    InvestmentType,
)
from portfolio.prices import (
    _backfill_price_history_with_meta,
    _run_with_timeout,
    aggiorna_prezzo_singolo,
    fetch_price_history_points,
)
from portfolio.services import (
    _post_asset_save,
    transfer_between_accounts,
    delete_asset_cascade,
    ensure_default_contribution_sources,
)


@pytest.fixture
def bank_type(db):
    return InvestmentType.objects.create(
        name="Bank", is_bank_account=True, is_liquid_default=True, supports_ticker=False
    )


@pytest.fixture
def account_a(bank_type):
    a = Asset.objects.create(
        name="Account A",
        ticker="",
        investment_type=bank_type,
        tracking_type=Asset.MANUAL,
        is_liquid=True,
        invested_capital=Decimal("1000"),
        current_value=Decimal("1000"),
    )
    AssetTransaction.objects.create(
        asset=a,
        transaction_type=AssetTransaction.CASH_IN,
        date=date.today(),
        shares=Decimal("1"),
        price_per_share=Decimal("1000"),
        is_verified=True,
    )
    a.recompute_from_transactions()
    a.refresh_from_db()
    return a


@pytest.fixture
def account_b(bank_type):
    return Asset.objects.create(
        name="Account B",
        ticker="",
        investment_type=bank_type,
        tracking_type=Asset.MANUAL,
        is_liquid=True,
        invested_capital=Decimal("0"),
        current_value=Decimal("0"),
    )


class TestTransferBetweenAccounts:
    def test_transfer_moves_balance(self, account_a, account_b):
        result = transfer_between_accounts(
            account_a,
            account_b,
            Decimal("300"),
            date.today().isoformat(),
            is_verified=True,
        )
        account_a.refresh_from_db()
        account_b.refresh_from_db()
        assert account_a.current_value == Decimal("700")
        assert account_b.current_value == Decimal("300")
        assert "warning" not in result

    def test_transfer_insufficient_balance_warns(self, account_a, account_b):
        result = transfer_between_accounts(
            account_a,
            account_b,
            Decimal("9999"),
            date.today().isoformat(),
            is_verified=True,
        )
        assert result.get("warning") == "insufficient_balance"

    def test_transfer_creates_derived_tx(self, account_a, account_b):
        transfer_between_accounts(
            account_a,
            account_b,
            Decimal("100"),
            date.today().isoformat(),
            is_verified=True,
        )
        cash_out = AssetTransaction.objects.get(
            asset=account_a, transaction_type=AssetTransaction.CASH_OUT
        )
        cash_in = AssetTransaction.objects.get(
            asset=account_b, transaction_type=AssetTransaction.CASH_IN
        )
        assert cash_in.derived_from == cash_out

    def test_transfer_returns_balances(self, account_a, account_b):
        result = transfer_between_accounts(
            account_a,
            account_b,
            Decimal("200"),
            date.today().isoformat(),
            is_verified=True,
        )
        assert "from_balance" in result
        assert "to_balance" in result


class TestDeleteAssetCascade:
    def test_deletes_asset(self, account_a):
        aid = account_a.pk
        delete_asset_cascade(account_a)
        assert not Asset.objects.filter(pk=aid).exists()

    def test_refreshes_linked_accounts(self, account_a, account_b):
        # Crea una tx derivata: BUY su account_b con CASH_OUT derivato su account_a
        primary = AssetTransaction.objects.create(
            asset=account_b,
            transaction_type=AssetTransaction.CASH_IN,
            date=date.today(),
            shares=Decimal("1"),
            price_per_share=Decimal("200"),
            is_verified=True,
        )
        AssetTransaction.objects.create(
            asset=account_a,
            transaction_type=AssetTransaction.CASH_OUT,
            date=date.today(),
            shares=Decimal("1"),
            price_per_share=Decimal("200"),
            derived_from=primary,
            is_verified=True,
        )
        account_a.recompute_from_transactions()
        account_a.refresh_from_db()
        # Elimina account_b — deve ricalibrare account_a
        delete_asset_cascade(account_b)
        account_a.refresh_from_db()
        # Dopo CASCADE + recompute, account_a deve riflettere le tx rimaste
        assert account_a.current_value == Decimal("1000")


def test_auto_asset_with_only_isin_does_not_create_manual_price_snapshot(itype):
    asset = Asset.objects.create(
        name="Unresolved ISIN",
        isin="QS0000061309",
        ticker="",
        source_symbol="",
        tracking_type=Asset.AUTO,
        investment_type=itype,
        current_value=Decimal("1000"),
    )

    _post_asset_save(asset)

    assert not AssetPriceHistory.objects.filter(asset=asset).exists()


def test_ensure_default_contribution_sources_uses_english_names(test_user):
    ensure_default_contribution_sources(test_user)

    names = list(
        ContributionSource.objects.filter(owner=test_user)
        .order_by("sort_order")
        .values_list("name", flat=True)
    )
    assert names == [
        "Payroll withholding",
        "Employer contribution",
        "TFR",
        "Other non-account source",
    ]


def test_backfill_price_history_counts_only_missing_rows(itype, test_user):
    asset = Asset.objects.create(
        name="Tracked",
        ticker="TRACKED",
        investment_type=itype,
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=asset,
        date=date(2026, 1, 15),
        close=Decimal("100.0000"),
        owner=asset.owner,
    )
    points = [
        (date(2026, 1, 15), Decimal("100.0000")),
        (date(2026, 1, 31), Decimal("101.0000")),
    ]

    with patch(
        "portfolio.prices.fetch_price_history_points",
        return_value=(points, {"status": "ok", "message": "2 rows"}),
    ):
        created, meta = _backfill_price_history_with_meta(
            asset, from_date=date(2026, 1, 1)
        )

    assert created == 1
    assert meta == {"status": "ok", "message": "1 new rows"}
    assert list(asset.price_history.order_by("date").values_list("date", "close")) == [
        (date(2026, 1, 15), Decimal("100.0000")),
        (date(2026, 1, 31), Decimal("101.0000")),
    ]


def test_yahoo_history_ignores_non_positive_close(itype, test_user):
    asset = Asset.objects.create(
        name="Tracked",
        ticker="TRACKED",
        investment_type=itype,
        owner=test_user,
    )
    ticker = type(
        "Ticker",
        (),
        {
            "fast_info": {"currency": "EUR"},
            "history": lambda self, **_kwargs: pd.DataFrame(
                {"Close": [7.5, 0]},
                index=pd.to_datetime(["2026-01-15", "2026-01-31"]),
            ),
        },
    )()

    with patch("portfolio.prices.yf.Ticker", return_value=ticker):
        points, meta = fetch_price_history_points(asset, date(2026, 1, 1))

    assert points == [(date(2026, 1, 15), Decimal("7.5000"))]
    assert meta == {"status": "ok", "message": "1 rows"}


def test_provider_timeout_returns_without_waiting_for_worker():
    started = time.monotonic()
    with pytest.raises(FuturesTimeoutError):
        _run_with_timeout(lambda: time.sleep(0.4), timeout=0.01)
    assert time.monotonic() - started < 0.15


def test_yahoo_refresh_persists_normalized_currency(itype, test_user):
    asset = Asset.objects.create(
        name="London ETF",
        ticker="LONDON.L",
        investment_type=itype,
        shares=Decimal("2"),
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=asset,
        date=date(2026, 1, 1),
        close=Decimal("1"),
        owner=test_user,
    )
    ticker = type(
        "Ticker",
        (),
        {"fast_info": {"regularMarketPrice": 100, "currency": "GBp"}},
    )()

    with (
        patch("portfolio.prices.yf.Ticker", return_value=ticker),
        patch("portfolio.fx.get_exchange_rate", return_value=Decimal("1.2")),
    ):
        assert aggiorna_prezzo_singolo(asset) is True

    asset.refresh_from_db()
    assert asset.currency == "GBP"
    assert asset.price_per_share == Decimal("1.0000")
    assert asset.current_value == Decimal("2.00")
    assert asset.current_value_eur == Decimal("2.40")
