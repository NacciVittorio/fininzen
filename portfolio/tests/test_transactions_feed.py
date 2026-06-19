"""Tests for GET /api/portfolio/transactions/ — global asset-transaction feed."""

from decimal import Decimal

import pytest
from django.contrib.auth.models import User
from django.test import Client

from portfolio.models import Asset, AssetTransaction, InvestmentType


@pytest.fixture
def etf_type(test_user):
    return InvestmentType.objects.create(name="ETF", owner=test_user, icon="📈")


@pytest.fixture
def bank_type(test_user):
    return InvestmentType.objects.create(
        name="Bank",
        is_bank_account=True,
        supports_ticker=False,
        owner=test_user,
        icon="🏦",
    )


@pytest.fixture
def asset_a(test_user, etf_type):
    return Asset.objects.create(
        name="VWCE",
        investment_type=etf_type,
        is_liquid=True,
        invested_capital=Decimal("0"),
        current_value=Decimal("0"),
        price_per_share=Decimal("100"),
        currency="EUR",
        owner=test_user,
    )


@pytest.fixture
def asset_b(test_user, bank_type):
    return Asset.objects.create(
        name="Checking",
        investment_type=bank_type,
        tracking_type=Asset.MANUAL,
        is_liquid=True,
        invested_capital=Decimal("0"),
        current_value=Decimal("0"),
        currency="EUR",
        owner=test_user,
    )


@pytest.fixture
def make_tx(test_user):
    def _make(asset, **kw):
        defaults = {
            "asset": asset,
            "owner": test_user,
            "shares": Decimal("1"),
            "price_per_share": Decimal("100"),
            "transaction_type": AssetTransaction.BUY,
        }
        defaults.update(kw)
        return AssetTransaction.objects.create(**defaults)

    return _make


def test_feed_returns_user_transactions_sorted_desc(client, asset_a, make_tx):
    make_tx(asset_a, date="2026-01-01")
    make_tx(asset_a, date="2026-03-01")
    make_tx(asset_a, date="2026-02-01")
    res = client.get("/api/portfolio/transactions/")
    assert res.status_code == 200
    data = res.json()
    dates = [r["date"] for r in data["results"]]
    assert dates == ["2026-03-01", "2026-02-01", "2026-01-01"]
    assert data["count"] == 3
    assert data["next_page"] is None


def test_feed_includes_asset_info(client, asset_a, make_tx):
    make_tx(asset_a, date="2026-01-01")
    res = client.get("/api/portfolio/transactions/")
    item = res.json()["results"][0]
    assert item["asset"]["id"] == asset_a.id
    assert item["asset"]["name"] == "VWCE"
    assert item["asset"]["icon"] == "📈"
    assert item["asset"]["currency"] == "EUR"
    assert item["asset"]["is_bank_account"] is False
    assert item["asset"]["is_archived"] is False
    assert item["transaction_type"] == "buy"
    assert item["total_value"] == "100.00"


def test_feed_includes_sell_tax_cost_basis(client, asset_a, make_tx):
    make_tx(
        asset_a,
        date="2026-01-01",
        transaction_type=AssetTransaction.BUY,
        shares=Decimal("15"),
        price_per_share=Decimal("151.3867"),
        fee=Decimal("1.00"),
        is_verified=True,
    )
    sell = make_tx(
        asset_a,
        date="2026-02-01",
        transaction_type=AssetTransaction.SELL,
        shares=Decimal("15"),
        price_per_share=Decimal("152.94"),
        fee=Decimal("1.00"),
        is_verified=True,
    )

    res = client.get("/api/portfolio/transactions/?type=sell")
    item = res.json()["results"][0]

    assert item["id"] == sell.id
    assert item["tax_cost_basis"] == "2271.80"


def test_feed_includes_net_cash_flow_value(client, asset_a, make_tx):
    asset_a.investment_type.tax_rate = Decimal("0.2600")
    asset_a.investment_type.save(update_fields=["tax_rate"])
    make_tx(
        asset_a,
        date="2026-06-12",
        transaction_type=AssetTransaction.BUY,
        shares=Decimal("15"),
        price_per_share=Decimal("151.32"),
        fee=Decimal("1.00"),
        is_verified=True,
    )
    # tax_amount is a snapshot taken at create/update time by the service layer.
    # The fixture writes the row directly, so we set the snapshot it would have
    # stored (auto, non-manual). The feed returns it verbatim — it no longer
    # recomputes from the current rate.
    sell = make_tx(
        asset_a,
        date="2026-06-15",
        transaction_type=AssetTransaction.SELL,
        shares=Decimal("15"),
        price_per_share=Decimal("152.94"),
        fee=Decimal("1.00"),
        tax_amount=Decimal("5.80"),
        is_verified=True,
    )

    res = client.get("/api/portfolio/transactions/?type=buy,sell")
    sell_item = next(item for item in res.json()["results"] if item["id"] == sell.id)

    assert sell_item["total_value"] == "2294.10"
    assert sell_item["tax_amount"] == "5.80"
    assert sell_item["cash_flow_value"] == "2287.30"


def test_feed_uses_manual_sell_tax_for_net_cash_flow_value(client, asset_a, make_tx):
    asset_a.investment_type.tax_rate = Decimal("0.2600")
    asset_a.investment_type.save(update_fields=["tax_rate"])
    make_tx(
        asset_a,
        date="2026-06-12",
        transaction_type=AssetTransaction.BUY,
        shares=Decimal("15"),
        price_per_share=Decimal("151.32"),
        fee=Decimal("1.00"),
        is_verified=True,
    )
    sell = make_tx(
        asset_a,
        date="2026-06-15",
        transaction_type=AssetTransaction.SELL,
        shares=Decimal("15"),
        price_per_share=Decimal("152.94"),
        fee=Decimal("1.00"),
        tax_amount=Decimal("5.54"),
        tax_amount_is_manual=True,
        is_verified=True,
    )

    res = client.get("/api/portfolio/transactions/?type=buy,sell")
    sell_item = next(item for item in res.json()["results"] if item["id"] == sell.id)

    assert sell_item["total_value"] == "2294.10"
    assert sell_item["tax_amount"] == "5.54"
    assert sell_item["tax_amount_is_manual"] is True
    assert sell_item["cash_flow_value"] == "2287.56"


def test_feed_includes_archived_asset_transactions(client, asset_a, make_tx):
    make_tx(asset_a, date="2026-01-01")
    asset_a.is_archived = True
    asset_a.save(update_fields=["is_archived"])

    res = client.get("/api/portfolio/transactions/")

    assert res.status_code == 200
    data = res.json()
    assert data["count"] == 1
    assert data["results"][0]["asset"]["id"] == asset_a.id
    assert data["results"][0]["asset"]["is_archived"] is True


def test_filter_by_asset(client, asset_a, asset_b, make_tx):
    make_tx(asset_a, date="2026-01-01")
    make_tx(
        asset_b,
        date="2026-01-02",
        transaction_type=AssetTransaction.CASH_IN,
        price_per_share=Decimal("500"),
    )
    res = client.get(f"/api/portfolio/transactions/?asset={asset_a.id}")
    data = res.json()
    assert data["count"] == 1
    assert data["results"][0]["asset"]["id"] == asset_a.id


def test_filter_by_type(client, asset_a, asset_b, make_tx):
    make_tx(asset_a, date="2026-01-01", transaction_type=AssetTransaction.BUY)
    make_tx(asset_a, date="2026-01-02", transaction_type=AssetTransaction.SELL)
    make_tx(
        asset_b,
        date="2026-01-03",
        transaction_type=AssetTransaction.CASH_IN,
        price_per_share=Decimal("1"),
    )
    res = client.get("/api/portfolio/transactions/?type=buy,sell")
    types = [r["transaction_type"] for r in res.json()["results"]]
    assert set(types) == {"buy", "sell"}


def test_filter_by_date_range(client, asset_a, make_tx):
    make_tx(asset_a, date="2026-01-01")
    make_tx(asset_a, date="2026-02-15")
    make_tx(asset_a, date="2026-03-01")
    res = client.get(
        "/api/portfolio/transactions/?date_from=2026-02-01&date_to=2026-02-28"
    )
    data = res.json()
    assert data["count"] == 1
    assert data["results"][0]["date"] == "2026-02-15"


def test_filter_verified(client, asset_a, make_tx):
    make_tx(asset_a, date="2026-01-01", is_verified=True)
    make_tx(asset_a, date="2026-01-02", is_verified=False)
    res = client.get("/api/portfolio/transactions/?verified=true")
    data = res.json()
    assert data["count"] == 1
    assert data["results"][0]["is_verified"] is True


def test_pagination(client, asset_a, make_tx):
    for i in range(7):
        make_tx(asset_a, date=f"2026-01-{i + 1:02d}")
    res = client.get("/api/portfolio/transactions/?page=1&page_size=3")
    data = res.json()
    assert data["count"] == 7
    assert len(data["results"]) == 3
    assert data["next_page"] == 2

    res2 = client.get("/api/portfolio/transactions/?page=3&page_size=3")
    data2 = res2.json()
    assert len(data2["results"]) == 1
    assert data2["next_page"] is None


def test_page_size_all_is_rejected(client, asset_a, make_tx):
    for i in range(60):
        make_tx(asset_a, date=f"2026-01-{(i % 28) + 1:02d}")
    res = client.get("/api/portfolio/transactions/?page_size=all")
    assert res.status_code == 400


def test_owner_scoping(client, asset_a, make_tx):
    make_tx(asset_a, date="2026-01-01")
    other = User.objects.create_user(
        username="other", email="o@o.com", password="Pass!123abc"
    )
    other_type = InvestmentType.objects.create(name="OtherT", owner=other)
    other_asset = Asset.objects.create(
        name="OtherAsset",
        investment_type=other_type,
        is_liquid=True,
        invested_capital=Decimal("0"),
        current_value=Decimal("0"),
        currency="EUR",
        owner=other,
    )
    AssetTransaction.objects.create(
        asset=other_asset,
        owner=other,
        shares=Decimal("1"),
        price_per_share=Decimal("999"),
        transaction_type=AssetTransaction.BUY,
        date="2026-01-01",
    )
    res = client.get("/api/portfolio/transactions/")
    data = res.json()
    assert data["count"] == 1
    assert all(r["asset"]["name"] == "VWCE" for r in data["results"])


def test_invalid_type_returns_400(client):
    res = client.get("/api/portfolio/transactions/?type=foo")
    assert res.status_code == 400


def test_invalid_date_returns_400(client):
    res = client.get("/api/portfolio/transactions/?date_from=not-a-date")
    assert res.status_code == 400


def test_unauthenticated_returns_401_or_403():
    c = Client()
    res = c.get("/api/portfolio/transactions/")
    assert res.status_code in (401, 403)


def test_excludes_bank_account_tx_by_default(client, asset_a, asset_b, make_tx):
    make_tx(asset_a, date="2026-01-01")
    make_tx(
        asset_b,
        date="2026-01-02",
        transaction_type=AssetTransaction.CASH_IN,
        price_per_share=Decimal("500"),
    )
    res = client.get("/api/portfolio/transactions/")
    data = res.json()
    assert data["count"] == 1
    assert all(r["asset"]["is_bank_account"] is False for r in data["results"])


def test_ownerless_transaction_is_rejected(db, asset_a):
    from django.db import IntegrityError, transaction

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            AssetTransaction.objects.create(
                asset=asset_a,
                shares=Decimal("1"),
                price_per_share=Decimal("100"),
                transaction_type=AssetTransaction.BUY,
                date="2026-01-01",
            )


def test_includes_bank_account_tx_when_requested(client, asset_a, asset_b, make_tx):
    make_tx(asset_a, date="2026-01-01")
    make_tx(
        asset_b,
        date="2026-01-02",
        transaction_type=AssetTransaction.CASH_IN,
        price_per_share=Decimal("500"),
    )
    res = client.get("/api/portfolio/transactions/?include_bank=true")
    data = res.json()
    assert data["count"] == 2
