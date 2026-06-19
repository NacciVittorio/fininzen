from datetime import date
from decimal import Decimal

from portfolio.models import (
    Asset,
    AssetPriceHistory,
    AssetTransaction,
    InvestmentType,
    RecurringInvestmentPlan,
)


def _make_bank_account(test_user):
    itype = InvestmentType.objects.create(
        name="Bank",
        supports_ticker=False,
        is_bank_account=True,
        owner=test_user,
    )
    account = Asset.objects.create(
        name="Checking",
        tracking_type=Asset.MANUAL,
        investment_type=itype,
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=account,
        transaction_type=AssetTransaction.CASH_IN,
        date="2026-01-01",
        shares=Decimal("1"),
        price_per_share=Decimal("1000"),
        is_verified=True,
        owner=test_user,
    )
    account.recompute_from_transactions()
    return account


def _make_auto_asset(test_user):
    itype = InvestmentType.objects.create(name="ETF", owner=test_user)
    return Asset.objects.create(
        name="VWCE",
        ticker="VWCE.MI",
        tracking_type=Asset.AUTO,
        investment_type=itype,
        current_value=Decimal("0"),
        invested_capital=Decimal("0"),
        owner=test_user,
    )


def test_create_pac_defaults_generated_transactions_to_unverified(client, test_user):
    asset = _make_auto_asset(test_user)
    account = _make_bank_account(test_user)

    res = client.post(
        "/api/portfolio/recurring-investments/",
        data={
            "name": "PAC VWCE",
            "asset": asset.id,
            "source_account": account.id,
            "amount": "100.00",
            "frequency": RecurringInvestmentPlan.FREQUENCY_MONTHLY,
            "day_of_month": 15,
            "start_date": "2026-06-01",
        },
        content_type="application/json",
    )

    assert res.status_code == 201
    assert res.json()["generated_transactions_verified"] is False


def test_generate_pac_uses_first_available_open_and_keeps_default_unverified(
    client, test_user
):
    asset = _make_auto_asset(test_user)
    account = _make_bank_account(test_user)
    plan = RecurringInvestmentPlan.objects.create(
        name="PAC VWCE",
        asset=asset,
        source_account=account,
        amount=Decimal("100.00"),
        frequency=RecurringInvestmentPlan.FREQUENCY_MONTHLY,
        day_of_month=15,
        start_date=date(2026, 6, 1),
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=asset,
        date=date(2026, 6, 17),
        open=Decimal("25.0000"),
        close=Decimal("26.0000"),
        owner=test_user,
    )

    res = client.post(
        "/api/portfolio/recurring-investments/generate/",
        data={"month": 6, "year": 2026},
        content_type="application/json",
    )

    assert res.status_code == 200
    assert res.json()["created"] == 1
    buy = AssetTransaction.objects.get(recurring_plan=plan)
    cash = AssetTransaction.objects.get(derived_from=buy)
    assert buy.date == date(2026, 6, 17)
    assert buy.recurring_occurrence_date == date(2026, 6, 15)
    assert buy.price_per_share == Decimal("25.0000")
    assert buy.shares == Decimal("4.000000")
    assert buy.is_verified is False
    assert cash.is_verified is False
    asset.refresh_from_db()
    account.refresh_from_db()
    assert asset.shares == Decimal("0.000000")
    assert account.current_value == Decimal("1000.00")


def test_generate_verified_pac_recomputes_asset_and_source_account(client, test_user):
    asset = _make_auto_asset(test_user)
    account = _make_bank_account(test_user)
    plan = RecurringInvestmentPlan.objects.create(
        name="PAC VWCE",
        asset=asset,
        source_account=account,
        amount=Decimal("120.00"),
        frequency=RecurringInvestmentPlan.FREQUENCY_MONTHLY,
        day_of_month=10,
        generated_transactions_verified=True,
        start_date=date(2026, 6, 1),
        owner=test_user,
    )
    AssetPriceHistory.objects.create(
        asset=asset,
        date=date(2026, 6, 10),
        open=Decimal("30.0000"),
        close=Decimal("31.0000"),
        owner=test_user,
    )

    res = client.post(
        "/api/portfolio/recurring-investments/generate/",
        data={"month": 6, "year": 2026},
        content_type="application/json",
    )

    assert res.status_code == 200
    assert res.json()["created"] == 1
    buy = AssetTransaction.objects.get(recurring_plan=plan)
    assert buy.is_verified is True
    asset.refresh_from_db()
    account.refresh_from_db()
    assert asset.shares == Decimal("4.000000")
    assert asset.invested_capital == Decimal("120.00")
    assert account.current_value == Decimal("880.00")


def test_weekly_pac_can_generate_multiple_occurrences_in_month(client, test_user):
    asset = _make_auto_asset(test_user)
    account = _make_bank_account(test_user)
    plan = RecurringInvestmentPlan.objects.create(
        name="Weekly VWCE",
        asset=asset,
        source_account=account,
        amount=Decimal("50.00"),
        frequency=RecurringInvestmentPlan.FREQUENCY_WEEKLY,
        day_of_week=1,
        start_date=date(2026, 6, 1),
        owner=test_user,
    )
    for day in (1, 8, 15, 22, 29):
        AssetPriceHistory.objects.create(
            asset=asset,
            date=date(2026, 6, day),
            open=Decimal("25.0000"),
            close=Decimal("26.0000"),
            owner=test_user,
        )

    res = client.post(
        "/api/portfolio/recurring-investments/generate/",
        data={"month": 6, "year": 2026},
        content_type="application/json",
    )
    again = client.post(
        "/api/portfolio/recurring-investments/generate/",
        data={"month": 6, "year": 2026},
        content_type="application/json",
    )

    assert res.status_code == 200
    assert res.json()["created"] == 5
    assert again.json()["created"] == 0
    assert again.json()["skipped"] == 5
    assert AssetTransaction.objects.filter(recurring_plan=plan).count() == 5
