import pytest
from datetime import date
from expenses.models import Category, Expense


@pytest.fixture
def cat(test_user):
    return Category.objects.create(
        name="Food", category_type=Category.EXPENSE, owner=test_user
    )


@pytest.fixture
def income_cat(test_user):
    return Category.objects.create(
        name="Salary", category_type=Category.INCOME, owner=test_user
    )


def test_delete_expense(client, cat, test_user):
    exp = Expense.objects.create(
        description="Pizza",
        amount=12,
        category=cat,
        date=date(2026, 4, 1),
        owner=test_user,
    )
    res = client.delete(f"/api/expenses/{exp.id}/")
    assert res.status_code == 204
    assert not Expense.objects.filter(pk=exp.id).exists()


def test_monthly_returns_aggregated_totals(client, cat, test_user):
    Expense.objects.create(
        description="Jan A",
        amount=20,
        category=cat,
        date=date(2026, 1, 5),
        is_verified=True,
        owner=test_user,
    )
    Expense.objects.create(
        description="Jan B",
        amount=10,
        category=cat,
        date=date(2026, 1, 20),
        is_verified=True,
        owner=test_user,
    )
    Expense.objects.create(
        description="Apr A",
        amount=50,
        category=cat,
        date=date(2026, 4, 10),
        is_verified=True,
        owner=test_user,
    )

    res = client.get("/api/expenses/monthly/?year=2026")
    assert res.status_code == 200
    data = res.json()

    totals = {str(row["month"])[:7]: float(row["total"]) for row in data}
    assert totals["2026-01"] == 30.0
    assert totals["2026-04"] == 50.0


def test_monthly_filters_by_year(client, cat, test_user):
    Expense.objects.create(
        description="Old",
        amount=100,
        category=cat,
        date=date(2025, 6, 1),
        owner=test_user,
    )
    Expense.objects.create(
        description="New",
        amount=200,
        category=cat,
        date=date(2026, 6, 1),
        owner=test_user,
    )

    res = client.get("/api/expenses/monthly/?year=2026")
    assert res.status_code == 200
    data = res.json()
    months = [str(row["month"])[:4] for row in data]
    assert all(y == "2026" for y in months)


def test_expense_list_filter_by_type(client, cat, income_cat, test_user):
    Expense.objects.create(
        description="Pizza",
        amount=12,
        category=cat,
        date=date(2026, 4, 1),
        owner=test_user,
    )
    Expense.objects.create(
        description="Salary",
        amount=3000,
        category=income_cat,
        date=date(2026, 4, 1),
        owner=test_user,
    )

    res = client.get("/api/expenses/?type=expense")
    assert res.status_code == 200
    data = res.json()
    items = data["results"] if isinstance(data, dict) else data
    descs = [e["description"] for e in items]
    assert "Pizza" in descs
    assert "Salary" not in descs
