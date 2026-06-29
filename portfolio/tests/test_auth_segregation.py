"""
Tests that user B cannot access user A's portfolio data.
All endpoints must return 404 (not 403) to avoid leaking resource existence.
"""

import pytest
from decimal import Decimal
from django.contrib.auth.models import User
from portfolio.models import Asset, InvestmentType


@pytest.fixture
def user_a(db):
    return User.objects.create_user(
        username="a@test.com", email="a@test.com", password="Pass!123abc"
    )


@pytest.fixture
def user_b(db):
    return User.objects.create_user(
        username="b@test.com", email="b@test.com", password="Pass!123abc"
    )


@pytest.fixture
def itype_a(user_a):
    return InvestmentType.objects.create(
        name="ETF", supports_ticker=False, owner=user_a
    )


@pytest.fixture
def asset_a(itype_a, user_a):
    return Asset.objects.create(
        name="VWCE",
        ticker="",
        investment_type=itype_a,
        is_liquid=True,
        invested_capital=Decimal("1000.00"),
        current_value=Decimal("1100.00"),
        owner=user_a,
    )


# ── Asset list ──


def test_b_not_in_asset_list(client, user_b, asset_a):
    client.force_login(user_b)
    ids = [x["id"] for x in client.get("/api/portfolio/").json()["results"]]
    assert asset_a.id not in ids


def test_b_cannot_read_asset_detail(client, user_b, asset_a):
    client.force_login(user_b)
    assert client.get(f"/api/portfolio/{asset_a.id}/").status_code == 404


def test_b_cannot_patch_asset(client, user_b, asset_a):
    client.force_login(user_b)
    res = client.patch(
        f"/api/portfolio/{asset_a.id}/",
        data={"name": "hacked"},
        content_type="application/json",
    )
    assert res.status_code == 404


def test_b_cannot_delete_asset(client, user_b, asset_a):
    client.force_login(user_b)
    assert client.delete(f"/api/portfolio/{asset_a.id}/").status_code == 404


# ── Transactions ──


def test_b_cannot_list_transactions(client, user_b, asset_a):
    client.force_login(user_b)
    assert client.get(f"/api/portfolio/{asset_a.id}/transactions/").status_code == 404


def test_b_cannot_post_transaction(client, user_b, asset_a):
    client.force_login(user_b)
    assert (
        client.post(
            f"/api/portfolio/{asset_a.id}/transactions/",
            data={
                "transaction_type": "BUY",
                "shares": "1",
                "price_per_share": "10",
                "date": "2024-01-01",
            },
            content_type="application/json",
        ).status_code
        == 404
    )


def test_b_cannot_delete_transaction(client, user_b, asset_a, user_a):
    from decimal import Decimal
    from portfolio.models import AssetTransaction

    tx = AssetTransaction.objects.create(
        asset=asset_a,
        transaction_type=AssetTransaction.CASH_IN,
        date="2026-01-01",
        shares=Decimal("1"),
        price_per_share=Decimal("100"),
        owner=user_a,
    )
    client.force_login(user_b)
    assert (
        client.delete(f"/api/portfolio/{asset_a.id}/transactions/{tx.id}/").status_code
        == 404
    )
    assert AssetTransaction.objects.filter(pk=tx.id).exists()


def test_b_cannot_patch_transaction(client, user_b, asset_a, user_a):
    from decimal import Decimal
    from portfolio.models import AssetTransaction

    tx = AssetTransaction.objects.create(
        asset=asset_a,
        transaction_type=AssetTransaction.CASH_IN,
        date="2026-01-01",
        shares=Decimal("1"),
        price_per_share=Decimal("100"),
        owner=user_a,
    )
    client.force_login(user_b)
    res = client.patch(
        f"/api/portfolio/{asset_a.id}/transactions/{tx.id}/",
        data={"is_verified": True},
        content_type="application/json",
    )
    assert res.status_code == 404
    tx.refresh_from_db()
    assert tx.is_verified is False


# ── Aggregate endpoints ──


def test_history_only_own_data(client, user_b):
    client.force_login(user_b)
    res = client.get("/api/portfolio/history/")
    assert res.status_code == 200


# ── Security regression: IDOR on transfer endpoint ──


@pytest.fixture
def itype_b(user_b):
    return InvestmentType.objects.create(
        name="Conto", supports_ticker=False, is_bank_account=True, owner=user_b
    )


@pytest.fixture
def asset_b(itype_b, user_b):
    return Asset.objects.create(
        name="Conto B",
        ticker="",
        investment_type=itype_b,
        is_liquid=True,
        tracking_type="MANUAL",
        invested_capital=Decimal("500.00"),
        current_value=Decimal("500.00"),
        owner=user_b,
    )


def test_b_cannot_transfer_from_a_asset(client, user_b, asset_a, asset_b):
    """Regression: transfer endpoint must reject cross-user asset IDs."""
    client.force_login(user_b)
    res = client.post(
        "/api/portfolio/transfer/",
        data={
            "from_account_id": asset_a.id,
            "to_account_id": asset_b.id,
            "amount": "100",
            "date": "2024-01-01",
        },
        content_type="application/json",
    )
    assert res.status_code == 404


def test_b_cannot_transfer_to_a_asset(client, user_b, asset_a, asset_b):
    """Regression: transfer endpoint must reject cross-user destination asset IDs."""
    client.force_login(user_b)
    res = client.post(
        "/api/portfolio/transfer/",
        data={
            "from_account_id": asset_b.id,
            "to_account_id": asset_a.id,
            "amount": "100",
            "date": "2024-01-01",
        },
        content_type="application/json",
    )
    assert res.status_code == 404


# ── Security regression: IDOR on allocation-targets endpoint ──


def test_b_cannot_set_allocation_target_on_a_investment_type(client, user_b, itype_a):
    """Regression: allocation-targets must reject InvestmentType IDs belonging to another user."""
    client.force_login(user_b)
    res = client.post(
        "/api/portfolio/allocation-targets/",
        data={"investment_type": itype_a.id, "target_percent": "10"},
        content_type="application/json",
    )
    assert res.status_code == 404
