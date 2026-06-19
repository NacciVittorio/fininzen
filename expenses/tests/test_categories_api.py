import pytest
from datetime import date
from decimal import Decimal
from expenses.models import Category, Expense
from portfolio.models import Asset, AssetTransaction, InvestmentType


@pytest.fixture
def cat_a(test_user):
    return Category.objects.create(
        name="Transport", category_type=Category.EXPENSE, owner=test_user
    )


@pytest.fixture
def cat_b(test_user):
    return Category.objects.create(
        name="Health", category_type=Category.EXPENSE, owner=test_user
    )


@pytest.fixture
def income_type(test_user):
    return Category.objects.create(
        name="Salary", category_type=Category.INCOME, owner=test_user
    )


def test_list_categories(client, cat_a):
    res = client.get("/api/expenses/categories/")
    assert res.status_code == 200
    names = [c["name"] for c in res.json()]
    assert "Transport" in names


def test_create_category(client, db):
    res = client.post(
        "/api/expenses/categories/",
        data={
            "name": "Books",
            "category_type": "expense",
            "color": "#ff0000",
            "icon": "📚",
        },
        content_type="application/json",
    )
    assert res.status_code == 201
    assert Category.objects.filter(name="Books").exists()


def test_create_subcategory(client, cat_a):
    res = client.post(
        "/api/expenses/categories/",
        data={"name": "Taxi", "category_type": "expense", "parent": cat_a.id},
        content_type="application/json",
    )
    assert res.status_code == 201
    data = res.json()
    assert data["parent"] == cat_a.id
    assert Category.objects.filter(name="Taxi", parent=cat_a).exists()


def test_patch_category(client, cat_a):
    res = client.patch(
        f"/api/expenses/categories/{cat_a.id}/",
        data={"color": "#aabbcc"},
        content_type="application/json",
    )
    assert res.status_code == 200
    cat_a.refresh_from_db()
    assert cat_a.color == "#aabbcc"


def test_patch_category_type_syncs_linked_expense_shadow(client, cat_a, test_user):
    bank_type = InvestmentType.objects.create(
        name="Bank", is_bank_account=True, supports_ticker=False, owner=test_user
    )
    account = Asset.objects.create(
        name="Cash",
        investment_type=bank_type,
        tracking_type=Asset.MANUAL,
        owner=test_user,
    )
    exp = Expense.objects.create(
        description="Refundable",
        amount=Decimal("25.00"),
        category=cat_a,
        date=date(2026, 4, 1),
        linked_asset=account,
        is_verified=True,
        owner=test_user,
    )
    account.refresh_from_db()
    assert account.current_value == Decimal("-25.00")

    res = client.patch(
        f"/api/expenses/categories/{cat_a.id}/",
        data={"category_type": "income"},
        content_type="application/json",
    )

    assert res.status_code == 200
    shadow = AssetTransaction.objects.get(source_expense=exp)
    account.refresh_from_db()
    assert shadow.transaction_type == AssetTransaction.CASH_IN
    assert account.current_value == Decimal("25.00")


def test_delete_category_simple(client, cat_a):
    res = client.delete(
        f"/api/expenses/categories/{cat_a.id}/",
        content_type="application/json",
    )
    assert res.status_code == 204
    assert not Category.objects.filter(pk=cat_a.id).exists()


def test_delete_category_delete_subcategories(client, cat_a, cat_b):
    sub = Category.objects.create(
        name="Bus", category_type=Category.EXPENSE, parent=cat_a
    )
    Expense.objects.create(
        description="Bus ticket", amount=2, category=sub, date=date(2026, 4, 1)
    )

    res = client.delete(
        f"/api/expenses/categories/{cat_a.id}/",
        data={"subs_action": "delete"},
        content_type="application/json",
    )
    assert res.status_code == 204
    assert not Category.objects.filter(pk=cat_a.id).exists()
    assert not Category.objects.filter(pk=sub.id).exists()
    assert not Expense.objects.filter(description="Bus ticket").exists()


def test_delete_category_reassign_subcategories(client, cat_a, cat_b):
    sub = Category.objects.create(
        name="Taxi", category_type=Category.EXPENSE, parent=cat_a
    )

    res = client.delete(
        f"/api/expenses/categories/{cat_a.id}/",
        data={"subs_action": "reassign", "reassign_subs_to": cat_b.id},
        content_type="application/json",
    )
    assert res.status_code == 204
    sub.refresh_from_db()
    assert sub.parent_id == cat_b.id


def test_delete_category_delete_expenses(client, cat_a):
    Expense.objects.create(
        description="Lunch", amount=15, category=cat_a, date=date(2026, 4, 1)
    )
    Expense.objects.create(
        description="Dinner", amount=30, category=cat_a, date=date(2026, 4, 2)
    )

    res = client.delete(
        f"/api/expenses/categories/{cat_a.id}/",
        data={"expenses_action": "delete"},
        content_type="application/json",
    )
    assert res.status_code == 204
    assert not Expense.objects.filter(category=cat_a).exists()


def test_delete_category_reassign_expenses(client, cat_a, cat_b):
    exp = Expense.objects.create(
        description="Gym", amount=50, category=cat_a, date=date(2026, 4, 1)
    )

    res = client.delete(
        f"/api/expenses/categories/{cat_a.id}/",
        data={"expenses_action": "reassign", "reassign_expenses_to": cat_b.id},
        content_type="application/json",
    )
    assert res.status_code == 204
    exp.refresh_from_db()
    assert exp.category_id == cat_b.id


def test_delete_category_null_expenses(client, cat_a):
    # Default behaviour (no body): expenses survive with category=None (SET_NULL)
    exp = Expense.objects.create(
        description="Pizza", amount=12, category=cat_a, date=date(2026, 4, 1)
    )

    res = client.delete(
        f"/api/expenses/categories/{cat_a.id}/",
        content_type="application/json",
    )
    assert res.status_code == 204
    exp.refresh_from_db()
    assert exp.category is None


def test_delete_income_category_null_syncs_linked_shadow(
    client, income_type, test_user
):
    bank_type = InvestmentType.objects.create(
        name="Bank", is_bank_account=True, supports_ticker=False, owner=test_user
    )
    account = Asset.objects.create(
        name="Cash",
        investment_type=bank_type,
        tracking_type=Asset.MANUAL,
        owner=test_user,
    )
    exp = Expense.objects.create(
        description="Gift",
        amount=Decimal("25.00"),
        category=income_type,
        date=date(2026, 4, 1),
        linked_asset=account,
        is_verified=True,
        owner=test_user,
    )
    account.refresh_from_db()
    assert account.current_value == Decimal("25.00")

    res = client.delete(
        f"/api/expenses/categories/{income_type.id}/",
        content_type="application/json",
    )

    assert res.status_code == 204
    exp.refresh_from_db()
    shadow = AssetTransaction.objects.get(source_expense=exp)
    account.refresh_from_db()
    assert exp.category is None
    assert shadow.transaction_type == AssetTransaction.CASH_OUT
    assert account.current_value == Decimal("-25.00")


def test_filter_by_type_expense(client, cat_a, income_type):
    res = client.get("/api/expenses/categories/?type=expense")
    assert res.status_code == 200
    names = [c["name"] for c in res.json()]
    assert "Transport" in names
    assert "Salary" not in names


def test_filter_by_type_income(client, cat_a, income_type):
    res = client.get("/api/expenses/categories/?type=income")
    assert res.status_code == 200
    names = [c["name"] for c in res.json()]
    assert "Salary" in names
    assert "Transport" not in names
