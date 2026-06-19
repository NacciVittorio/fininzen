import pytest
from datetime import date
from expenses.models import Category, Expense


@pytest.fixture
def food_cat(test_user):
    return Category.objects.create(
        name="Food", category_type=Category.EXPENSE, owner=test_user
    )


@pytest.fixture
def restaurants_cat(food_cat, test_user):
    """Subcategory of Food."""
    return Category.objects.create(
        name="Restaurants",
        category_type=Category.EXPENSE,
        parent=food_cat,
        owner=test_user,
    )


class TestSummaryMonthFilter:
    """Regression: fetchExpSummaryCurrentMonth inviava month=05 (zero-padded).
    Verifica che il filtro month=5 (senza padding) restituisca i dati corretti."""

    def test_summary_month_unpadded_returns_expenses(self, client, food_cat, test_user):
        Expense.objects.create(
            description="Pizza",
            amount="25.00",
            category=food_cat,
            date=date(2026, 5, 10),
            is_verified=True,
            owner=test_user,
        )
        res = client.get("/api/expenses/summary/?month=5&year=2026&type=expense")
        assert res.status_code == 200
        data = res.json()
        assert float(data["total"]) == 25.0
        assert any(c["category__id"] == food_cat.id for c in data["by_category"])

    def test_summary_excludes_other_months(self, client, food_cat, test_user):
        Expense.objects.create(
            description="April",
            amount="50.00",
            category=food_cat,
            date=date(2026, 4, 15),
            is_verified=True,
            owner=test_user,
        )
        Expense.objects.create(
            description="May",
            amount="30.00",
            category=food_cat,
            date=date(2026, 5, 10),
            is_verified=True,
            owner=test_user,
        )
        res = client.get("/api/expenses/summary/?month=5&year=2026&type=expense")
        assert res.status_code == 200
        data = res.json()
        assert float(data["total"]) == 30.0

    def test_summary_by_category_groups_expenses(
        self, client, food_cat, restaurants_cat, test_user
    ):
        """Summary restituisce una entry separata per ogni categoria (rollup è frontend)."""
        Expense.objects.create(
            description="Supermarket",
            amount="40.00",
            category=food_cat,
            date=date(2026, 5, 5),
            is_verified=True,
            owner=test_user,
        )
        Expense.objects.create(
            description="Restaurant",
            amount="60.00",
            category=restaurants_cat,
            date=date(2026, 5, 12),
            is_verified=True,
            owner=test_user,
        )
        res = client.get("/api/expenses/summary/?month=5&year=2026&type=expense")
        assert res.status_code == 200
        data = res.json()
        cat_ids = {c["category__id"] for c in data["by_category"]}
        # Backend restituisce le due categorie separate — il rollup avviene nel frontend
        assert food_cat.id in cat_ids
        assert restaurants_cat.id in cat_ids
        assert float(data["total"]) == 100.0
