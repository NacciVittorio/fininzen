import pytest
from django.contrib.auth.models import User
from django.test import Client
from finnet.models import DataAccessGrant
from expenses.models import Category, Expense
from portfolio.models import Asset
from decimal import Decimal


@pytest.fixture
def user_b_fire(db):
    return User.objects.create_user(username="user_b_fire", password="pw")


@pytest.fixture
def read_grant_fire(db, test_user, user_b_fire):
    return DataAccessGrant.objects.create(
        owner=test_user, grantee=user_b_fire, permission="read"
    )


@pytest.fixture
def client_b_fire(db, user_b_fire):
    c = Client()
    c.force_login(user_b_fire)
    return c


def test_fire_list_returns_ok(client, db):
    res = client.get("/api/portfolio/fire/")
    assert res.status_code == 200


def test_fire_list_computes_annual_savings_from_cashflow(client, test_user, db):
    expense_cat = Category.objects.create(
        name="Rent", category_type="expense", owner=test_user
    )
    income_cat = Category.objects.create(
        name="Salary", category_type="income", owner=test_user
    )
    Expense.objects.create(
        owner=test_user,
        description="R",
        amount=Decimal("1000"),
        category=expense_cat,
        date="2026-01-10",
        is_verified=True,
    )
    Expense.objects.create(
        owner=test_user,
        description="S",
        amount=Decimal("3000"),
        category=income_cat,
        date="2026-01-10",
        is_verified=True,
    )
    Asset.objects.create(owner=test_user, name="Cash", current_value=Decimal("10000"))
    res = client.get("/api/portfolio/fire/")
    assert res.status_code == 200
    data = res.json()
    assert Decimal(data["computed_annual_income"]) > Decimal("0")
    assert Decimal(data["computed_annual_savings"]) > Decimal("0")
    assert "kpis" in data
    assert "probability_band" in data
    assert "actionable_levers" in data


def test_read_grant_blocks_patch_fire_settings(
    client_b_fire, test_user, read_grant_fire
):
    res = client_b_fire.patch(
        "/api/portfolio/fire/settings/",
        data='{"withdrawal_rate": "0.04"}',
        content_type="application/json",
        HTTP_X_VIEW_AS=str(test_user.id),
    )
    assert res.status_code == 403


def test_patch_fire_settings_rejects_invalid_mode(client, db):
    res = client.patch(
        "/api/portfolio/fire/settings/",
        data='{"model_mode": "wrong-mode"}',
        content_type="application/json",
    )
    assert res.status_code == 400


def test_patch_fire_settings_rejects_inconsistent_ages(client, db):
    res = client.patch(
        "/api/portfolio/fire/settings/",
        data='{"user_age": 50, "target_retirement_age": 45}',
        content_type="application/json",
    )
    assert res.status_code == 400


@pytest.mark.parametrize("field", ["withdrawal_rate", "swr_base", "swr_min", "swr_max"])
def test_patch_fire_settings_rejects_zero_rates(client, db, field):
    res = client.patch(
        "/api/portfolio/fire/settings/",
        data={field: "0"},
        content_type="application/json",
    )
    assert res.status_code == 400


def test_patch_fire_settings_rejects_retirement_age_not_after_user_age(client, db):
    res = client.patch(
        "/api/portfolio/fire/settings/",
        data={"user_age": 50, "retirement_age": 45},
        content_type="application/json",
    )
    assert res.status_code == 400
