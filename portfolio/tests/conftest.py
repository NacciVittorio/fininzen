import pytest
from decimal import Decimal
from portfolio.models import Asset, InvestmentType


@pytest.fixture
def itype(test_user):
    return InvestmentType.objects.create(
        name="ETF", supports_ticker=True, is_liquid_default=True, owner=test_user
    )


@pytest.fixture
def itype_no_ticker(test_user):
    return InvestmentType.objects.create(
        name="Real Estate",
        supports_ticker=False,
        is_liquid_default=False,
        owner=test_user,
    )


@pytest.fixture
def asset(itype, test_user):
    # ticker="" evita qualsiasi chiamata yfinance in perform_create/_post_asset_save
    return Asset.objects.create(
        name="VWCE",
        ticker="",
        investment_type=itype,
        is_liquid=True,
        invested_capital=Decimal("1000.00"),
        current_value=Decimal("1100.00"),
        price_per_share=Decimal("110.0000"),
        shares=Decimal("10.000000"),
        owner=test_user,
    )


@pytest.fixture
def illiquid_asset(itype_no_ticker, test_user):
    return Asset.objects.create(
        name="Milan Apartment",
        ticker="",
        investment_type=itype_no_ticker,
        is_liquid=False,
        invested_capital=Decimal("200000.00"),
        current_value=Decimal("250000.00"),
        owner=test_user,
    )


@pytest.fixture
def usd_asset(itype, test_user):
    # Simula asset in USD: current_value=1100 USD, current_value_eur=1012 (tasso ~0.92)
    return Asset.objects.create(
        name="S&P500 ETF",
        ticker="",
        investment_type=itype,
        is_liquid=True,
        currency="USD",
        invested_capital=Decimal("1000.00"),
        current_value=Decimal("1100.00"),
        current_value_eur=Decimal("1012.00"),
        price_per_share=Decimal("110.0000"),
        shares=Decimal("10.000000"),
        owner=test_user,
    )
