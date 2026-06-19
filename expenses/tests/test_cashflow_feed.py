"""Tests for GET /api/expenses/cashflow/ — unified cash flow feed."""

import pytest
from datetime import date
from decimal import Decimal
from django.test import Client

from expenses.models import Category, Expense
from portfolio.models import Asset, AssetTransaction, InvestmentType


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def client(test_user):
    c = Client()
    c.force_login(test_user)
    return c


@pytest.fixture
def expense_cat(test_user):
    return Category.objects.create(
        name="Food", category_type=Category.EXPENSE, owner=test_user
    )


@pytest.fixture
def income_cat(test_user):
    return Category.objects.create(
        name="Salary", category_type=Category.INCOME, owner=test_user
    )


@pytest.fixture
def bank_type(test_user):
    return InvestmentType.objects.create(
        name="Bank", is_bank_account=True, owner=test_user
    )


@pytest.fixture
def account_a(test_user, bank_type):
    return Asset.objects.create(
        name="Account A",
        tracking_type=Asset.MANUAL,
        investment_type=bank_type,
        owner=test_user,
    )


@pytest.fixture
def account_b(test_user, bank_type):
    return Asset.objects.create(
        name="Account B",
        tracking_type=Asset.MANUAL,
        investment_type=bank_type,
        owner=test_user,
    )


# ── Helpers ───────────────────────────────────────────────────────────────────


def make_transfer(account_a, account_b, amount, d, user):
    """Create a paired CASH_OUT → CASH_IN transfer."""
    cash_out = AssetTransaction.objects.create(
        asset=account_a,
        transaction_type=AssetTransaction.CASH_OUT,
        date=d,
        shares=Decimal("1"),
        price_per_share=Decimal(str(amount)),
        owner=user,
    )
    cash_in = AssetTransaction.objects.create(
        asset=account_b,
        transaction_type=AssetTransaction.CASH_IN,
        date=d,
        shares=Decimal("1"),
        price_per_share=Decimal(str(amount)),
        derived_from=cash_out,
        owner=user,
    )
    return cash_out, cash_in


def make_adjustment(account, amount, d, user):
    return AssetTransaction.objects.create(
        asset=account,
        transaction_type=AssetTransaction.ADJUSTMENT,
        date=d,
        shares=Decimal("1"),
        price_per_share=Decimal(str(amount)),
        owner=user,
    )


# ── Basic feed tests ──────────────────────────────────────────────────────────


class TestCashflowFeedBasic:
    def test_outcome_expense_appears(self, client, test_user, expense_cat):
        Expense.objects.create(
            description="Pizza",
            amount=Decimal("12.50"),
            category=expense_cat,
            date=date(2026, 5, 1),
            owner=test_user,
        )
        res = client.get("/api/expenses/cashflow/")
        assert res.status_code == 200
        data = res.json()
        assert data["count"] == 1
        item = data["results"][0]
        assert item["type"] == "outcome"
        assert item["source_type"] == "expense"
        assert item["description"] == "Pizza"
        assert item["amount"] == "12.50"

    def test_income_expense_appears(self, client, test_user, income_cat):
        Expense.objects.create(
            description="Salary",
            amount=Decimal("3000"),
            category=income_cat,
            date=date(2026, 5, 1),
            owner=test_user,
        )
        res = client.get("/api/expenses/cashflow/")
        assert res.status_code == 200
        item = res.json()["results"][0]
        assert item["type"] == "income"

    def test_transfer_appears_as_single_item(
        self, client, test_user, account_a, account_b
    ):
        make_transfer(account_a, account_b, "500", date(2026, 5, 1), test_user)
        res = client.get("/api/expenses/cashflow/")
        assert res.status_code == 200
        data = res.json()
        transfer_items = [i for i in data["results"] if i["type"] == "transfer"]
        assert len(transfer_items) == 1
        item = transfer_items[0]
        assert item["amount"] == "500.00"
        assert item["from_account"]["name"] == "Account A"
        assert item["to_account"]["name"] == "Account B"
        assert item["paired_id"] is not None

    def test_adjustment_appears(self, client, test_user, account_a):
        make_adjustment(account_a, "25.00", date(2026, 5, 1), test_user)
        res = client.get("/api/expenses/cashflow/")
        assert res.status_code == 200
        items = res.json()["results"]
        adj = [i for i in items if i["type"] == "adjustment"]
        assert len(adj) == 1
        assert adj[0]["amount"] == "25.00"  # quantized from 1 * 25.0000
        assert adj[0]["account"]["name"] == "Account A"

    def test_unauthenticated_returns_401(self):
        c = Client()
        res = c.get("/api/expenses/cashflow/")
        assert res.status_code == 401

    def test_other_user_data_not_visible(self, client, test_user, expense_cat):
        from django.contrib.auth import get_user_model

        other = get_user_model().objects.create_user(username="other_cf", password="pw")
        Expense.objects.create(
            description="Secret",
            amount=Decimal("99"),
            category=expense_cat,
            date=date(2026, 5, 1),
            owner=other,
        )
        res = client.get("/api/expenses/cashflow/")
        assert res.status_code == 200
        assert res.json()["count"] == 0


# ── Sorting ───────────────────────────────────────────────────────────────────


class TestCashflowFeedSorting:
    def test_sorted_date_descending(self, client, test_user, expense_cat):
        Expense.objects.create(
            description="Old",
            amount=Decimal("10"),
            category=expense_cat,
            date=date(2026, 4, 1),
            owner=test_user,
        )
        Expense.objects.create(
            description="New",
            amount=Decimal("20"),
            category=expense_cat,
            date=date(2026, 5, 1),
            owner=test_user,
        )
        res = client.get("/api/expenses/cashflow/")
        results = res.json()["results"]
        assert results[0]["description"] == "New"
        assert results[1]["description"] == "Old"


# ── Filter tests ──────────────────────────────────────────────────────────────


class TestCashflowFeedFilters:
    def test_filter_date_from(self, client, test_user, expense_cat):
        Expense.objects.create(
            description="Before",
            amount=Decimal("10"),
            category=expense_cat,
            date=date(2026, 3, 1),
            owner=test_user,
        )
        Expense.objects.create(
            description="After",
            amount=Decimal("20"),
            category=expense_cat,
            date=date(2026, 5, 1),
            owner=test_user,
        )
        res = client.get("/api/expenses/cashflow/?date_from=2026-04-01")
        data = res.json()
        assert data["count"] == 1
        assert data["results"][0]["description"] == "After"

    def test_filter_date_to(self, client, test_user, expense_cat):
        Expense.objects.create(
            description="Early",
            amount=Decimal("10"),
            category=expense_cat,
            date=date(2026, 1, 1),
            owner=test_user,
        )
        Expense.objects.create(
            description="Late",
            amount=Decimal("20"),
            category=expense_cat,
            date=date(2026, 12, 1),
            owner=test_user,
        )
        res = client.get("/api/expenses/cashflow/?date_to=2026-06-01")
        data = res.json()
        assert data["count"] == 1
        assert data["results"][0]["description"] == "Early"

    def test_filter_type_income_only(self, client, test_user, expense_cat, income_cat):
        Expense.objects.create(
            description="Expense",
            amount=Decimal("10"),
            category=expense_cat,
            date=date(2026, 5, 1),
            owner=test_user,
        )
        Expense.objects.create(
            description="Income",
            amount=Decimal("3000"),
            category=income_cat,
            date=date(2026, 5, 1),
            owner=test_user,
        )
        res = client.get("/api/expenses/cashflow/?types=income")
        data = res.json()
        assert data["count"] == 1
        assert data["results"][0]["type"] == "income"

    def test_filter_type_outcome_only(self, client, test_user, expense_cat, income_cat):
        Expense.objects.create(
            description="Expense",
            amount=Decimal("10"),
            category=expense_cat,
            date=date(2026, 5, 1),
            owner=test_user,
        )
        Expense.objects.create(
            description="Income",
            amount=Decimal("3000"),
            category=income_cat,
            date=date(2026, 5, 1),
            owner=test_user,
        )
        res = client.get("/api/expenses/cashflow/?types=outcome")
        data = res.json()
        assert data["count"] == 1
        assert data["results"][0]["description"] == "Expense"

    def test_filter_type_transfer_only(
        self, client, test_user, expense_cat, account_a, account_b
    ):
        Expense.objects.create(
            description="Regular expense",
            amount=Decimal("10"),
            category=expense_cat,
            date=date(2026, 5, 1),
            owner=test_user,
        )
        make_transfer(account_a, account_b, "200", date(2026, 5, 1), test_user)
        res = client.get("/api/expenses/cashflow/?types=transfer")
        data = res.json()
        assert data["count"] == 1
        assert data["results"][0]["type"] == "transfer"

    def test_filter_type_adjustment_only(
        self, client, test_user, expense_cat, account_a
    ):
        Expense.objects.create(
            description="Regular expense",
            amount=Decimal("10"),
            category=expense_cat,
            date=date(2026, 5, 1),
            owner=test_user,
        )
        make_adjustment(account_a, "50", date(2026, 5, 1), test_user)
        res = client.get("/api/expenses/cashflow/?types=adjustment")
        data = res.json()
        assert data["count"] == 1
        assert data["results"][0]["type"] == "adjustment"

    def test_filter_category(self, client, test_user, expense_cat):
        other_cat = Category.objects.create(
            name="Other", category_type=Category.EXPENSE, owner=test_user
        )
        Expense.objects.create(
            description="Food expense",
            amount=Decimal("10"),
            category=expense_cat,
            date=date(2026, 5, 1),
            owner=test_user,
        )
        Expense.objects.create(
            description="Other expense",
            amount=Decimal("20"),
            category=other_cat,
            date=date(2026, 5, 1),
            owner=test_user,
        )
        res = client.get(f"/api/expenses/cashflow/?category={expense_cat.id}")
        data = res.json()
        assert data["count"] == 1
        assert data["results"][0]["description"] == "Food expense"

    def test_filter_parent_category(self, client, test_user):
        parent = Category.objects.create(
            name="Food", category_type=Category.EXPENSE, owner=test_user
        )
        sub = Category.objects.create(
            name="Restaurants",
            category_type=Category.EXPENSE,
            parent=parent,
            owner=test_user,
        )
        Expense.objects.create(
            description="Parent expense",
            amount=Decimal("10"),
            category=parent,
            date=date(2026, 5, 1),
            owner=test_user,
        )
        Expense.objects.create(
            description="Sub expense",
            amount=Decimal("20"),
            category=sub,
            date=date(2026, 5, 1),
            owner=test_user,
        )
        res = client.get(f"/api/expenses/cashflow/?parent_category={parent.id}")
        data = res.json()
        assert data["count"] == 2

    def test_filter_account(self, client, test_user, expense_cat, account_a, account_b):
        exp_linked = Expense.objects.create(
            description="Linked",
            amount=Decimal("10"),
            category=expense_cat,
            date=date(2026, 5, 1),
            linked_asset=account_a,
            owner=test_user,
        )
        Expense.objects.create(
            description="Unlinked",
            amount=Decimal("20"),
            category=expense_cat,
            date=date(2026, 5, 1),
            owner=test_user,
        )
        res = client.get(f"/api/expenses/cashflow/?account={account_a.id}")
        data = res.json()
        assert data["count"] == 1
        assert data["results"][0]["source_id"] == exp_linked.id

    def test_invalid_type_returns_400(self, client):
        res = client.get("/api/expenses/cashflow/?types=invalid_type")
        assert res.status_code == 400


# ── Pagination tests ──────────────────────────────────────────────────────────


class TestCashflowFeedPagination:
    def _create_expenses(self, n, user, cat):
        for i in range(n):
            Expense.objects.create(
                description=f"Expense {i}",
                amount=Decimal("10"),
                category=cat,
                date=date(2026, 1, 1),
                owner=user,
            )

    def test_default_page_size_50(self, client, test_user, expense_cat):
        self._create_expenses(60, test_user, expense_cat)
        res = client.get("/api/expenses/cashflow/")
        data = res.json()
        assert data["count"] == 60
        assert len(data["results"]) == 50
        assert data["next_page"] == 2

    def test_page_2(self, client, test_user, expense_cat):
        self._create_expenses(60, test_user, expense_cat)
        res = client.get("/api/expenses/cashflow/?page=2")
        data = res.json()
        assert len(data["results"]) == 10
        assert data["next_page"] is None

    def test_load_all_is_rejected(self, client, test_user, expense_cat):
        self._create_expenses(60, test_user, expense_cat)
        res = client.get("/api/expenses/cashflow/?page_size=all")
        assert res.status_code == 400

    def test_custom_page_size(self, client, test_user, expense_cat):
        self._create_expenses(20, test_user, expense_cat)
        res = client.get("/api/expenses/cashflow/?page_size=10")
        data = res.json()
        assert len(data["results"]) == 10
        assert data["next_page"] == 2

    def test_no_next_page_on_last(self, client, test_user, expense_cat):
        self._create_expenses(5, test_user, expense_cat)
        res = client.get("/api/expenses/cashflow/")
        data = res.json()
        assert len(data["results"]) == 5
        assert data["next_page"] is None

    def test_absurd_page_returns_empty_without_error(
        self, client, test_user, expense_cat
    ):
        # CRIT-07: a wildly out-of-range page must short-circuit to an empty
        # page (the fetch_limit clamp guards against materializing the whole
        # feed for an unreachable offset).
        self._create_expenses(5, test_user, expense_cat)
        res = client.get("/api/expenses/cashflow/?page=999999999")
        assert res.status_code == 200
        data = res.json()
        assert data["results"] == []
        assert data["next_page"] is None


class TestCashflowSummary:
    def test_summary_counts_only_verified_rows_and_ignores_pagination(
        self, client, test_user, expense_cat, income_cat
    ):
        Expense.objects.create(
            description="Verified income",
            amount=Decimal("100"),
            category=income_cat,
            date=date(2026, 1, 1),
            owner=test_user,
            is_verified=True,
        )
        Expense.objects.create(
            description="Pending income",
            amount=Decimal("999"),
            category=income_cat,
            date=date(2026, 1, 4),
            owner=test_user,
            is_verified=False,
        )
        Expense.objects.create(
            description="Verified outcome",
            amount=Decimal("40"),
            category=expense_cat,
            date=date(2026, 1, 2),
            owner=test_user,
            is_verified=True,
        )
        Expense.objects.create(
            description="Pending outcome",
            amount=Decimal("777"),
            category=expense_cat,
            date=date(2026, 1, 3),
            owner=test_user,
            is_verified=False,
        )

        res = client.get("/api/expenses/cashflow/?page_size=1")

        assert res.status_code == 200
        data = res.json()
        assert len(data["results"]) == 1
        assert data["count"] == 4
        assert data["summary"] == {
            "income": "100.00",
            "outcome": "40.00",
            "net": "60.00",
        }

    def test_summary_respects_date_range_and_type_filters(
        self, client, test_user, expense_cat, income_cat
    ):
        Expense.objects.create(
            description="January income",
            amount=Decimal("100"),
            category=income_cat,
            date=date(2026, 1, 10),
            owner=test_user,
            is_verified=True,
        )
        Expense.objects.create(
            description="February income",
            amount=Decimal("300"),
            category=income_cat,
            date=date(2026, 2, 10),
            owner=test_user,
            is_verified=True,
        )
        Expense.objects.create(
            description="February outcome",
            amount=Decimal("80"),
            category=expense_cat,
            date=date(2026, 2, 11),
            owner=test_user,
            is_verified=True,
        )
        Expense.objects.create(
            description="March outcome",
            amount=Decimal("40"),
            category=expense_cat,
            date=date(2026, 3, 10),
            owner=test_user,
            is_verified=True,
        )

        res = client.get(
            "/api/expenses/cashflow/"
            "?date_from=2026-02-01&date_to=2026-02-28&types=outcome"
        )

        assert res.status_code == 200
        assert res.json()["summary"] == {
            "income": "0.00",
            "outcome": "80.00",
            "net": "-80.00",
        }

    def test_summary_is_empty_for_pending_only_filter(
        self, client, test_user, expense_cat
    ):
        Expense.objects.create(
            description="Verified outcome",
            amount=Decimal("40"),
            category=expense_cat,
            date=date(2026, 1, 2),
            owner=test_user,
            is_verified=True,
        )
        Expense.objects.create(
            description="Pending outcome",
            amount=Decimal("777"),
            category=expense_cat,
            date=date(2026, 1, 3),
            owner=test_user,
            is_verified=False,
        )

        res = client.get("/api/expenses/cashflow/?verified=false")

        assert res.status_code == 200
        assert res.json()["summary"] == {
            "income": "0.00",
            "outcome": "0.00",
            "net": "0.00",
        }


class TestVerifiedFilter:
    def test_verified_true_returns_only_verified_expenses(
        self, client, test_user, expense_cat
    ):
        Expense.objects.create(
            description="V",
            amount=Decimal("10"),
            category=expense_cat,
            date=date(2026, 1, 1),
            owner=test_user,
            is_verified=True,
        )
        Expense.objects.create(
            description="U",
            amount=Decimal("10"),
            category=expense_cat,
            date=date(2026, 1, 2),
            owner=test_user,
            is_verified=False,
        )
        res = client.get("/api/expenses/cashflow/?verified=true")
        assert res.status_code == 200
        descriptions = [i["description"] for i in res.json()["results"]]
        assert "V" in descriptions
        assert "U" not in descriptions

    def test_verified_false_returns_only_unverified_expenses(
        self, client, test_user, expense_cat
    ):
        Expense.objects.create(
            description="V",
            amount=Decimal("10"),
            category=expense_cat,
            date=date(2026, 1, 1),
            owner=test_user,
            is_verified=True,
        )
        Expense.objects.create(
            description="U",
            amount=Decimal("10"),
            category=expense_cat,
            date=date(2026, 1, 2),
            owner=test_user,
            is_verified=False,
        )
        res = client.get("/api/expenses/cashflow/?verified=false")
        assert res.status_code == 200
        descriptions = [i["description"] for i in res.json()["results"]]
        assert "U" in descriptions
        assert "V" not in descriptions

    def test_verified_true_filters_transfers(
        self, client, test_user, account_a, account_b
    ):
        cash_out, cash_in = make_transfer(
            account_a, account_b, 100, date(2026, 1, 1), test_user
        )
        cash_in.is_verified = True
        cash_in.save()
        cash_out2, cash_in2 = make_transfer(
            account_a, account_b, 50, date(2026, 1, 2), test_user
        )
        res = client.get("/api/expenses/cashflow/?verified=true&types=transfer")
        assert res.status_code == 200
        results = res.json()["results"]
        assert len(results) == 1
        assert results[0]["amount"] == "100.00"

    def test_verified_true_filters_adjustments(self, client, test_user, account_a):
        verified_adjustment = make_adjustment(
            account_a, 25, date(2026, 1, 1), test_user
        )
        verified_adjustment.is_verified = True
        verified_adjustment.save(update_fields=["is_verified"])
        make_adjustment(account_a, 50, date(2026, 1, 2), test_user)

        res = client.get("/api/expenses/cashflow/?verified=true&types=adjustment")

        assert res.status_code == 200
        results = res.json()["results"]
        assert len(results) == 1
        assert results[0]["amount"] == "25.00"
        assert results[0]["is_verified"] is True

    def test_no_verified_param_returns_all(self, client, test_user, expense_cat):
        Expense.objects.create(
            description="V",
            amount=Decimal("10"),
            category=expense_cat,
            date=date(2026, 1, 1),
            owner=test_user,
            is_verified=True,
        )
        Expense.objects.create(
            description="U",
            amount=Decimal("10"),
            category=expense_cat,
            date=date(2026, 1, 2),
            owner=test_user,
            is_verified=False,
        )
        res = client.get("/api/expenses/cashflow/")
        assert res.status_code == 200
        descriptions = [i["description"] for i in res.json()["results"]]
        assert "V" in descriptions
        assert "U" in descriptions


class TestAccountNoLinkFilter:
    def test_returns_only_unlinked_expenses(
        self, client, test_user, expense_cat, account_a
    ):
        Expense.objects.create(
            description="Linked",
            amount=Decimal("10"),
            category=expense_cat,
            date=date(2026, 5, 1),
            linked_asset=account_a,
            owner=test_user,
        )
        Expense.objects.create(
            description="Unlinked",
            amount=Decimal("20"),
            category=expense_cat,
            date=date(2026, 5, 1),
            owner=test_user,
        )
        res = client.get("/api/expenses/cashflow/?account=none")
        data = res.json()
        assert res.status_code == 200
        descriptions = [i["description"] for i in data["results"]]
        assert "Unlinked" in descriptions
        assert "Linked" not in descriptions

    def test_excludes_all_linked_expenses(
        self, client, test_user, expense_cat, account_a
    ):
        Expense.objects.create(
            description="Linked",
            amount=Decimal("10"),
            category=expense_cat,
            date=date(2026, 5, 1),
            linked_asset=account_a,
            owner=test_user,
        )
        res = client.get("/api/expenses/cashflow/?account=none&types=outcome")
        assert res.status_code == 200
        assert res.json()["count"] == 0

    def test_does_not_suppress_transfers(self, client, test_user, account_a, account_b):
        make_transfer(account_a, account_b, "100", date(2026, 5, 1), test_user)
        res = client.get("/api/expenses/cashflow/?account=none&types=transfer")
        assert res.status_code == 200
        assert res.json()["count"] == 1


class TestCfDeleteIntegration:
    def test_delete_expense_removes_from_feed(self, client, test_user, expense_cat):
        exp = Expense.objects.create(
            description="ToDelete",
            amount=Decimal("25"),
            category=expense_cat,
            date=date(2026, 3, 1),
            owner=test_user,
        )
        res = client.delete(f"/api/expenses/{exp.id}/")
        assert res.status_code == 204
        feed = client.get("/api/expenses/cashflow/").json()["results"]
        assert not any(i["description"] == "ToDelete" for i in feed)

    def test_delete_transfer_removes_both_legs(
        self, client, test_user, account_a, account_b
    ):
        cash_out, cash_in = make_transfer(
            account_a, account_b, 200, date(2026, 3, 1), test_user
        )
        res = client.delete(
            f"/api/portfolio/{account_a.id}/transactions/{cash_out.id}/"
        )
        assert res.status_code == 204
        from portfolio.models import AssetTransaction

        assert not AssetTransaction.objects.filter(pk=cash_out.id).exists()
        assert not AssetTransaction.objects.filter(pk=cash_in.id).exists()
        feed = client.get("/api/expenses/cashflow/?types=transfer").json()["results"]
        assert len(feed) == 0

    def test_delete_expense_other_user_returns_404(
        self, client, test_user, expense_cat
    ):
        from django.contrib.auth.models import User

        other = User.objects.create_user(username="other_cf", password="x")
        exp = Expense.objects.create(
            description="OtherExp",
            amount=Decimal("10"),
            category=expense_cat,
            date=date(2026, 3, 1),
            owner=other,
        )
        res = client.delete(f"/api/expenses/{exp.id}/")
        assert res.status_code == 404
        assert Expense.objects.filter(pk=exp.id).exists()
