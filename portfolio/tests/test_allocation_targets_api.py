import pytest
from decimal import Decimal
from django.contrib.auth.models import User
from django.test import Client
from finnet.models import DataAccessGrant
from portfolio.models import AllocationTarget, Asset, InvestmentType


def test_list_allocation_targets_empty(client, db):
    # The view returns ALL InvestmentTypes (with target_pct=None if no target set).
    # When no targets are configured, every entry should have target_pct=null.
    res = client.get("/api/portfolio/allocation-targets/")
    assert res.status_code == 200
    data = res.json()
    assert all(item["target_pct"] is None for item in data)


def test_create_allocation_target(client, itype):
    res = client.post(
        "/api/portfolio/allocation-targets/",
        data={"investment_type": itype.id, "target_percent": "30.00"},
        content_type="application/json",
    )
    assert res.status_code == 201
    assert AllocationTarget.objects.filter(investment_type=itype).exists()


def test_create_allocation_target_upserts(client, itype):
    client.post(
        "/api/portfolio/allocation-targets/",
        data={"investment_type": itype.id, "target_percent": "30.00"},
        content_type="application/json",
    )
    res2 = client.post(
        "/api/portfolio/allocation-targets/",
        data={"investment_type": itype.id, "target_percent": "50.00"},
        content_type="application/json",
    )
    assert res2.status_code == 200  # update returns 200
    assert AllocationTarget.objects.filter(investment_type=itype).count() == 1
    assert (
        float(AllocationTarget.objects.get(investment_type=itype).target_percent)
        == 50.0
    )


def test_list_shows_current_pct_and_diff(client, itype, test_user):
    # Single asset with current_value=1000 → 100% of portfolio
    Asset.objects.create(
        name="Only Asset",
        investment_type=itype,
        is_liquid=True,
        invested_capital=Decimal("1000.00"),
        current_value=Decimal("1000.00"),
        owner=test_user,
    )
    AllocationTarget.objects.create(
        investment_type=itype, target_percent=Decimal("80.00"), owner=test_user
    )

    res = client.get("/api/portfolio/allocation-targets/")
    assert res.status_code == 200
    entry = next(e for e in res.json() if e["id"] == itype.id)
    assert entry["current_pct"] == 100.0
    assert entry["target_pct"] == 80.0
    assert entry["diff"] == 20.0


def test_list_shows_action_buy_when_underweight(client, itype, test_user):
    # current=20%, target=30% → diff=-10 → buy
    itype2 = InvestmentType.objects.create(name="Bond", owner=test_user)
    Asset.objects.create(
        name="A1",
        investment_type=itype,
        current_value=Decimal("200.00"),
        invested_capital=Decimal("200.00"),
        owner=test_user,
    )
    Asset.objects.create(
        name="A2",
        investment_type=itype2,
        current_value=Decimal("800.00"),
        invested_capital=Decimal("800.00"),
        owner=test_user,
    )
    AllocationTarget.objects.create(
        investment_type=itype, target_percent=Decimal("30.00"), owner=test_user
    )

    res = client.get("/api/portfolio/allocation-targets/")
    entry = next(e for e in res.json() if e["id"] == itype.id)
    assert entry["action"] == "buy"


def test_list_shows_action_sell_when_overweight(client, itype, test_user):
    # current=80%, target=30% → diff=50 → sell
    itype2 = InvestmentType.objects.create(name="Bond", owner=test_user)
    Asset.objects.create(
        name="A1",
        investment_type=itype,
        current_value=Decimal("800.00"),
        invested_capital=Decimal("800.00"),
        owner=test_user,
    )
    Asset.objects.create(
        name="A2",
        investment_type=itype2,
        current_value=Decimal("200.00"),
        invested_capital=Decimal("200.00"),
        owner=test_user,
    )
    AllocationTarget.objects.create(
        investment_type=itype, target_percent=Decimal("30.00"), owner=test_user
    )

    res = client.get("/api/portfolio/allocation-targets/")
    entry = next(e for e in res.json() if e["id"] == itype.id)
    assert entry["action"] == "sell"


def test_list_shows_action_ok_within_2pct(client, itype, test_user):
    # current=31%, target=30% → diff=1 → ok
    itype2 = InvestmentType.objects.create(name="Bond", owner=test_user)
    Asset.objects.create(
        name="A1",
        investment_type=itype,
        current_value=Decimal("310.00"),
        invested_capital=Decimal("310.00"),
        owner=test_user,
    )
    Asset.objects.create(
        name="A2",
        investment_type=itype2,
        current_value=Decimal("690.00"),
        invested_capital=Decimal("690.00"),
        owner=test_user,
    )
    AllocationTarget.objects.create(
        investment_type=itype, target_percent=Decimal("30.00"), owner=test_user
    )

    res = client.get("/api/portfolio/allocation-targets/")
    entry = next(e for e in res.json() if e["id"] == itype.id)
    assert entry["action"] == "ok"


def test_delete_allocation_target(client, itype, test_user):
    target = AllocationTarget.objects.create(
        investment_type=itype, target_percent=Decimal("25.00"), owner=test_user
    )
    res = client.delete(f"/api/portfolio/allocation-targets/{target.id}/")
    assert res.status_code == 204
    assert not AllocationTarget.objects.filter(pk=target.id).exists()


def test_create_missing_fields_returns_400(client, db):
    res = client.post(
        "/api/portfolio/allocation-targets/",
        data={},
        content_type="application/json",
    )
    assert res.status_code == 400


# ── Read-grant write-block ────────────────────────────────────────────────────


@pytest.fixture
def user_b_alloc(db):
    return User.objects.create_user(username="user_b_alloc", password="pw")


@pytest.fixture
def read_grant_alloc(db, test_user, user_b_alloc):
    return DataAccessGrant.objects.create(
        owner=test_user, grantee=user_b_alloc, permission="read"
    )


@pytest.fixture
def client_b_alloc(db, user_b_alloc):
    c = Client()
    c.force_login(user_b_alloc)
    return c


def test_read_grant_blocks_post_allocation_target(
    client_b_alloc, test_user, read_grant_alloc, itype
):
    res = client_b_alloc.post(
        "/api/portfolio/allocation-targets/",
        data={"investment_type": itype.id, "target_percent": "10.00"},
        content_type="application/json",
        HTTP_X_VIEW_AS=str(test_user.id),
    )
    assert res.status_code == 403


def test_read_grant_blocks_delete_allocation_target(
    client, client_b_alloc, test_user, read_grant_alloc, itype
):
    target = AllocationTarget.objects.create(
        investment_type=itype, target_percent=Decimal("25.00"), owner=test_user
    )
    res = client_b_alloc.delete(
        f"/api/portfolio/allocation-targets/{target.id}/",
        HTTP_X_VIEW_AS=str(test_user.id),
    )
    assert res.status_code == 403
