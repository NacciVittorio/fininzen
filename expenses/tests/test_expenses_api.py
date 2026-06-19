import pytest
from datetime import date
from decimal import Decimal
from django.test import Client

from expenses.models import Category, Expense
from finnet.models import UserProfile
from portfolio.models import Asset, AssetTransaction, InvestmentType


@pytest.fixture
def cat(test_user):
    return Category.objects.create(name="Food", owner=test_user)


@pytest.fixture
def client(test_user):
    c = Client()
    c.force_login(test_user)
    return c


def test_create_expense(client, cat):
    res = client.post(
        "/api/expenses/",
        data={
            "description": "Pizza",
            "amount": "12.50",
            "category": cat.id,
            "date": "2026-04-10",
        },
        content_type="application/json",
    )
    assert res.status_code == 201
    assert Expense.objects.filter(description="Pizza").exists()


def test_create_expense_requires_category(client):
    res = client.post(
        "/api/expenses/",
        data={
            "description": "No category",
            "amount": "12.50",
            "date": "2026-04-10",
        },
        content_type="application/json",
    )
    assert res.status_code == 400
    assert "category" in res.json()
    assert not Expense.objects.filter(description="No category").exists()


def test_patch_expense(client, cat, test_user):
    exp = Expense.objects.create(
        description="Old",
        amount=10,
        category=cat,
        date=date(2026, 4, 1),
        owner=test_user,
    )
    res = client.patch(
        f"/api/expenses/{exp.id}/",
        data={"description": "New"},
        content_type="application/json",
    )
    assert res.status_code == 200
    exp.refresh_from_db()
    assert exp.description == "New"


def test_patch_expense_rejects_null_category(client, cat, test_user):
    exp = Expense.objects.create(
        description="Old",
        amount=10,
        category=cat,
        date=date(2026, 4, 1),
        owner=test_user,
    )
    res = client.patch(
        f"/api/expenses/{exp.id}/",
        data={"category": None},
        content_type="application/json",
    )
    assert res.status_code == 400
    exp.refresh_from_db()
    assert exp.category_id == cat.id


def test_unverified_expense_linked_account_does_not_affect_balance(
    client, cat, test_user
):
    itype = InvestmentType.objects.create(
        name="Bank", is_bank_account=True, supports_ticker=False, owner=test_user
    )
    account = Asset.objects.create(
        name="Checking",
        investment_type=itype,
        tracking_type=Asset.MANUAL,
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=account,
        transaction_type=AssetTransaction.CASH_IN,
        date=date(2026, 1, 1),
        shares=Decimal("1"),
        price_per_share=Decimal("1000"),
        is_verified=True,
        owner=test_user,
    )
    account.recompute_from_transactions()

    res = client.post(
        "/api/expenses/",
        data={
            "description": "Pending lunch",
            "amount": "25.00",
            "category": cat.id,
            "date": "2026-04-10",
            "linked_asset": account.id,
            "is_verified": False,
        },
        content_type="application/json",
    )

    assert res.status_code == 201
    account.refresh_from_db()
    assert account.current_value == Decimal("1000.00")
    shadow = AssetTransaction.objects.get(source_expense_id=res.json()["id"])
    assert shadow.is_verified is False


def test_verifying_expense_linked_account_updates_balance(client, cat, test_user):
    itype = InvestmentType.objects.create(
        name="Bank", is_bank_account=True, supports_ticker=False, owner=test_user
    )
    account = Asset.objects.create(
        name="Checking",
        investment_type=itype,
        tracking_type=Asset.MANUAL,
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=account,
        transaction_type=AssetTransaction.CASH_IN,
        date=date(2026, 1, 1),
        shares=Decimal("1"),
        price_per_share=Decimal("1000"),
        is_verified=True,
        owner=test_user,
    )
    account.recompute_from_transactions()
    exp = Expense.objects.create(
        description="Pending lunch",
        amount=Decimal("25.00"),
        category=cat,
        date=date(2026, 4, 10),
        linked_asset=account,
        is_verified=False,
        owner=test_user,
    )

    res = client.patch(
        f"/api/expenses/{exp.id}/",
        data={"is_verified": True},
        content_type="application/json",
    )

    assert res.status_code == 200
    account.refresh_from_db()
    assert account.current_value == Decimal("975.00")
    shadow = AssetTransaction.objects.get(source_expense=exp)
    assert shadow.is_verified is True


def test_month_filter(client, cat, test_user):
    Expense.objects.create(
        description="Jan",
        amount=10,
        category=cat,
        date=date(2026, 1, 15),
        owner=test_user,
    )
    Expense.objects.create(
        description="Apr",
        amount=20,
        category=cat,
        date=date(2026, 4, 15),
        owner=test_user,
    )
    res = client.get("/api/expenses/?month=4&year=2026")
    assert res.status_code == 200
    data = res.json()
    items = data["results"] if isinstance(data, dict) else data
    descs = [e["description"] for e in items]
    assert "Apr" in descs
    assert "Jan" not in descs


def test_summary_endpoint(client, cat, test_user):
    Expense.objects.create(
        description="A",
        amount=10,
        category=cat,
        date=date(2026, 4, 10),
        is_verified=True,
        owner=test_user,
    )
    Expense.objects.create(
        description="B",
        amount=25,
        category=cat,
        date=date(2026, 4, 20),
        is_verified=True,
        owner=test_user,
    )
    res = client.get("/api/expenses/summary/?month=4&year=2026")
    assert res.status_code == 200
    data = res.json()
    total = sum(float(row["total"]) for row in data.get("by_category", []))
    assert total == 35.0


def test_summary_returns_category_type(client, test_user):
    """Feature L: rows must expose `category__category_type` so the dashboard
    donut can split outgoing/incoming client-side without an extra fetch."""
    expense_cat = Category.objects.create(
        name="Groceries", owner=test_user, category_type=Category.EXPENSE
    )
    income_cat = Category.objects.create(
        name="Salary", owner=test_user, category_type=Category.INCOME
    )
    Expense.objects.create(
        description="Spesa",
        amount=40,
        category=expense_cat,
        date=date(2026, 4, 5),
        is_verified=True,
        owner=test_user,
    )
    Expense.objects.create(
        description="Stipendio",
        amount=2500,
        category=income_cat,
        date=date(2026, 4, 27),
        is_verified=True,
        owner=test_user,
    )
    res = client.get("/api/expenses/summary/?month=4&year=2026")
    assert res.status_code == 200
    rows = res.json()["by_category"]
    assert len(rows) == 2
    types = {row["category__name"]: row["category__category_type"] for row in rows}
    assert types == {"Groceries": "expense", "Salary": "income"}


def test_month_filter_uses_accounting_month_start_day(client, test_user):
    profile, _ = UserProfile.objects.get_or_create(user=test_user)
    profile.accounting_month_start_day = 27
    profile.save(update_fields=["accounting_month_start_day"])
    cat = Category.objects.create(name="Groceries", owner=test_user)
    Expense.objects.create(
        description="Before period",
        amount="10.00",
        category=cat,
        date=date(2026, 5, 26),
        is_verified=True,
        owner=test_user,
    )
    Expense.objects.create(
        description="Period start",
        amount="20.00",
        category=cat,
        date=date(2026, 5, 27),
        is_verified=True,
        owner=test_user,
    )
    Expense.objects.create(
        description="Period end",
        amount="30.00",
        category=cat,
        date=date(2026, 6, 26),
        is_verified=True,
        owner=test_user,
    )
    Expense.objects.create(
        description="After period",
        amount="40.00",
        category=cat,
        date=date(2026, 6, 27),
        owner=test_user,
    )

    res = client.get("/api/expenses/?month=5&year=2026")

    assert res.status_code == 200
    data = res.json()
    rows = data if isinstance(data, list) else data["results"]
    assert {row["description"] for row in rows} == {"Period start", "Period end"}


def test_summary_uses_accounting_month_start_day(client, test_user):
    profile, _ = UserProfile.objects.get_or_create(user=test_user)
    profile.accounting_month_start_day = 27
    profile.save(update_fields=["accounting_month_start_day"])
    cat = Category.objects.create(name="Groceries", owner=test_user)
    Expense.objects.create(
        description="Before period",
        amount="10.00",
        category=cat,
        date=date(2026, 5, 26),
        owner=test_user,
    )
    Expense.objects.create(
        description="Period start",
        amount="20.00",
        category=cat,
        date=date(2026, 5, 27),
        is_verified=True,
        owner=test_user,
    )
    Expense.objects.create(
        description="Period end",
        amount="30.00",
        category=cat,
        date=date(2026, 6, 26),
        is_verified=True,
        owner=test_user,
    )

    res = client.get("/api/expenses/summary/?month=5&year=2026")

    assert res.status_code == 200
    assert float(res.json()["total"]) == 50.0


# ── Regression: monthly default year non deve essere hardcoded ───────────────


def test_monthly_default_year_is_current(client, test_user):
    """
    /api/expenses/monthly/ senza parametro ?year deve usare l'anno corrente,
    non un anno hardcoded (prima era 2026).
    """
    current_year = date.today().year
    Expense.objects.create(
        description="Test spesa anno corrente",
        amount="50.00",
        date=date(current_year, 3, 15),
        owner=test_user,
    )

    res = client.get("/api/expenses/monthly/")
    assert res.status_code == 200
    data = res.json()
    months = [row["month"][:4] for row in data]
    assert all(m == str(current_year) for m in months)


class TestIsVerifiedFilter:
    def test_filter_verified_true(self, client, cat, test_user):
        Expense.objects.create(
            description="V",
            amount="10",
            category=cat,
            date=date(2026, 1, 1),
            owner=test_user,
            is_verified=True,
        )
        Expense.objects.create(
            description="U",
            amount="10",
            category=cat,
            date=date(2026, 1, 2),
            owner=test_user,
            is_verified=False,
        )
        res = client.get("/api/expenses/?is_verified=true")
        assert res.status_code == 200
        data = res.json()
        results = data if isinstance(data, list) else data.get("results", data)
        descriptions = [e["description"] for e in results]
        assert "V" in descriptions
        assert "U" not in descriptions

    def test_filter_verified_false(self, client, cat, test_user):
        Expense.objects.create(
            description="V",
            amount="10",
            category=cat,
            date=date(2026, 1, 1),
            owner=test_user,
            is_verified=True,
        )
        Expense.objects.create(
            description="U",
            amount="10",
            category=cat,
            date=date(2026, 1, 2),
            owner=test_user,
            is_verified=False,
        )
        res = client.get("/api/expenses/?is_verified=false")
        assert res.status_code == 200
        data = res.json()
        results = data if isinstance(data, list) else data.get("results", data)
        descriptions = [e["description"] for e in results]
        assert "U" in descriptions
        assert "V" not in descriptions

    def test_no_is_verified_param_returns_all(self, client, cat, test_user):
        Expense.objects.create(
            description="V",
            amount="10",
            category=cat,
            date=date(2026, 1, 1),
            owner=test_user,
            is_verified=True,
        )
        Expense.objects.create(
            description="U",
            amount="10",
            category=cat,
            date=date(2026, 1, 2),
            owner=test_user,
            is_verified=False,
        )
        res = client.get("/api/expenses/")
        assert res.status_code == 200
        data = res.json()
        results = data if isinstance(data, list) else data.get("results", data)
        descriptions = [e["description"] for e in results]
        assert "V" in descriptions
        assert "U" in descriptions


def test_changing_linked_asset_is_atomic_on_shadow_failure(client, cat, test_user):
    """MED-11: moving an expense's linked_asset deletes the old account's shadow
    tx then upserts a new one. If the upsert fails, the cleanup *and* the expense
    row change must both roll back — otherwise the old account stays inflated."""
    from unittest.mock import patch

    itype = InvestmentType.objects.create(
        name="Bank", is_bank_account=True, supports_ticker=False, owner=test_user
    )
    acct_a = Asset.objects.create(
        name="A", investment_type=itype, tracking_type=Asset.MANUAL, owner=test_user
    )
    acct_b = Asset.objects.create(
        name="B", investment_type=itype, tracking_type=Asset.MANUAL, owner=test_user
    )
    exp = Expense.objects.create(
        description="rent",
        amount=Decimal("10.00"),
        category=cat,
        date=date(2026, 1, 1),
        linked_asset=acct_a,
        is_verified=True,
        owner=test_user,
    )
    assert AssetTransaction.objects.filter(source_expense=exp, asset=acct_a).exists()

    with patch(
        "portfolio.models.AssetTransaction.objects.update_or_create",
        side_effect=RuntimeError("boom"),
    ):
        with pytest.raises(RuntimeError):
            client.patch(
                f"/api/expenses/{exp.id}/",
                data={"linked_asset": acct_b.id},
                content_type="application/json",
            )

    exp.refresh_from_db()
    assert exp.linked_asset_id == acct_a.id
    assert AssetTransaction.objects.filter(source_expense=exp, asset=acct_a).exists()
    assert not AssetTransaction.objects.filter(
        source_expense=exp, asset=acct_b
    ).exists()
