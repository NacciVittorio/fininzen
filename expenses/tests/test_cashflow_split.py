"""Tests for Split integration into the unified CashFlow feed (plan sez. 5).

Covers:
- the payer's own NET PERSONAL QUOTA is shown, never the full expense amount
  and never `exp.amount - share.share_amount` (see the deviation note on
  `expenses/cashflow.py::_split_expense_to_item`: for a 100€ expense split 4
  ways, that expression evaluates to 75.00 — the credit owed back by the
  other participants, i.e. the wrong number for CashFlow's "only the
  personal quota" rule — instead of the correct 25.00 personal quota);
- `split_reimbursement` (settlements) is excluded from
  `get_cashflow_summary` totals, by omission, exactly like transfer/adjustment
  today;
- the existing category/account/search filters apply to split items.
"""

from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth.models import User

from expenses.cashflow import get_cashflow_ids, get_cashflow_summary
from expenses.models import Category
from portfolio.models import Asset, InvestmentType
from splitting.models import SplitContact, SplitExpense, SplitSettlement
from splitting.services import apply_split_shares


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def second_user(db):
    return User.objects.create_user(
        username="split_cf_second", email="split_cf_second@test.com", password="pw"
    )


@pytest.fixture
def third_user(db):
    return User.objects.create_user(
        username="split_cf_third", email="split_cf_third@test.com", password="pw"
    )


@pytest.fixture
def bank_type(test_user):
    return InvestmentType.objects.create(
        name="Bank", is_bank_account=True, supports_ticker=False, owner=test_user
    )


@pytest.fixture
def account(test_user, bank_type):
    return Asset.objects.create(
        name="Checking",
        tracking_type=Asset.MANUAL,
        investment_type=bank_type,
        owner=test_user,
    )


# ── Helpers ───────────────────────────────────────────────────────────────────


def _ensure_linked_partner(owner, other_user):
    """Test-only shortcut for the reciprocal-partner precondition that
    `_resolve_participant` now enforces for ad-hoc standalone participants
    (security fix, revisione fase 9 — see splitting/services.py): a
    registered user_id other than the caller must already be an accepted
    SplitPartnerLink (mirrored here as the SplitContact it produces),
    otherwise the request is rejected. This file lives outside
    splitting/tests/ so it can't reuse that tree's `split_contact_linked`
    fixture — this helper creates the same end-state directly via the ORM
    instead of going through the full request/accept HTTP flow."""
    SplitContact.objects.get_or_create(
        owner=owner,
        linked_user=other_user,
        defaults={"display_name": other_user.username},
    )


def _make_split_expense(
    *,
    description,
    amount,
    d,
    payer,
    others,
    created_by=None,
    category=None,
    linked_asset=None,
):
    """Standalone (group=None) EQUAL split among `payer` + `others`, mirroring
    the pattern used by splitting/tests/test_shadow_and_balances_smoke.py.
    """
    added_by = created_by or payer
    for other in others:
        _ensure_linked_partner(added_by, other)
    expense = SplitExpense.objects.create(
        group=None,
        description=description,
        amount=Decimal(str(amount)),
        date=d,
        split_method=SplitExpense.EQUAL,
        category=category,
        linked_asset=linked_asset,
        created_by=added_by,
    )
    payload = [{"user_id": payer.id, "is_payer": True}] + [
        {"user_id": u.id} for u in others
    ]
    apply_split_shares(expense, payload, SplitExpense.EQUAL, added_by=added_by)
    return expense


# ── Net personal quota shown correctly ───────────────────────────────────────


class TestSplitFeedNetQuota:
    def test_split_item_shows_payer_net_personal_quota(
        self, client, test_user, second_user, third_user
    ):
        fourth = User.objects.create_user(username="split_cf_fourth", password="pw")
        _make_split_expense(
            description="Cena di gruppo",
            amount="100.00",
            d=date(2026, 5, 1),
            payer=test_user,
            others=[second_user, third_user, fourth],
        )

        res = client.get("/api/expenses/cashflow/?types=split")

        assert res.status_code == 200
        data = res.json()
        assert data["count"] == 1
        item = data["results"][0]
        assert item["type"] == "split"
        assert item["source_type"] == "split_expense"
        # 100€ / 4 participants = 25.00 personal quota — NOT 75.00
        # (= 100 - 25, the credit owed back by the other three, which is the
        # `compute_balances` formula, wrongly copy-pasted into the plan text
        # for this function; see the deviation note in cashflow.py).
        assert item["amount"] == "25.00"
        assert item["description"] == "Cena di gruppo"

    def test_split_item_amount_is_never_the_full_expense_amount(
        self, client, test_user, second_user
    ):
        _make_split_expense(
            description="Weekend",
            amount="200.00",
            d=date(2026, 5, 3),
            payer=test_user,
            others=[second_user],
        )

        res = client.get("/api/expenses/cashflow/?types=split")

        item = res.json()["results"][0]
        assert item["amount"] == "100.00"
        assert item["amount"] != "200.00"

    def test_split_item_not_visible_for_non_payer_participant(
        self, client, test_user, second_user
    ):
        # second_user is the payer; test_user only owes their own share — the
        # feed only surfaces the observed user's OWN payer row (is_payer=True
        # AND participant.user=user), never a debt owed as a non-payer
        # participant (that stays in the Split tab, not CashFlow).
        _make_split_expense(
            description="Taxi",
            amount="40.00",
            d=date(2026, 5, 2),
            payer=second_user,
            others=[test_user],
            created_by=second_user,
        )

        res = client.get("/api/expenses/cashflow/?types=split")

        assert res.status_code == 200
        assert res.json()["count"] == 0

    def test_split_item_included_by_default_without_types_filter(
        self, client, test_user, second_user
    ):
        _make_split_expense(
            description="Default view",
            amount="50.00",
            d=date(2026, 5, 4),
            payer=test_user,
            others=[second_user],
        )

        res = client.get("/api/expenses/cashflow/")

        assert res.status_code == 200
        types_seen = {i["type"] for i in res.json()["results"]}
        assert "split" in types_seen


# ── split_reimbursement excluded from summary totals ─────────────────────────


class TestSplitCashflowSummary:
    def test_summary_outcome_includes_split_net_quota(
        self, client, test_user, second_user, third_user
    ):
        _make_split_expense(
            description="Cena",
            amount="90.00",
            d=date(2026, 5, 1),
            payer=test_user,
            others=[second_user, third_user],
        )

        res = client.get("/api/expenses/cashflow/?types=split")

        assert res.status_code == 200
        assert res.json()["summary"] == {
            "income": "0.00",
            "outcome": "30.00",
            "net": "-30.00",
        }

    def test_split_reimbursement_excluded_from_summary_totals(
        self, client, test_user, second_user, third_user
    ):
        _make_split_expense(
            description="Cena",
            amount="90.00",
            d=date(2026, 5, 1),
            payer=test_user,
            others=[second_user, third_user],
        )
        # A settlement for a wildly different amount: if it ever leaked into
        # the summary (income OR outcome) the assertion below would fail.
        SplitSettlement.objects.create(
            payer_user=second_user,
            payee_user=test_user,
            amount=Decimal("1000.00"),
            date=date(2026, 5, 2),
            created_by=second_user,
        )

        res = client.get("/api/expenses/cashflow/?types=split,split_reimbursement")

        assert res.status_code == 200
        data = res.json()
        types_seen = {i["type"] for i in data["results"]}
        assert types_seen == {"split", "split_reimbursement"}
        assert data["summary"] == {
            "income": "0.00",
            "outcome": "30.00",
            "net": "-30.00",
        }

    def test_get_cashflow_summary_excludes_reimbursement_directly(
        self, test_user, second_user, third_user
    ):
        _make_split_expense(
            description="Cena",
            amount="90.00",
            d=date(2026, 5, 1),
            payer=test_user,
            others=[second_user, third_user],
        )
        SplitSettlement.objects.create(
            payer_user=test_user,
            payee_user=second_user,
            amount=Decimal("500.00"),
            date=date(2026, 5, 2),
            created_by=test_user,
        )

        summary = get_cashflow_summary(
            test_user, {"types": ["outcome", "split", "split_reimbursement"]}
        )

        assert summary["outcome"] == "30.00"
        assert summary["income"] == "0.00"

    def test_summary_zero_when_split_not_in_requested_types(
        self, client, test_user, second_user
    ):
        # "types=income" only: split's outcome contribution is gated the same
        # way the plain Expense-based outcome sum is (by its own type name
        # being requested), symmetric with how income/outcome already behave.
        _make_split_expense(
            description="Cena",
            amount="40.00",
            d=date(2026, 5, 1),
            payer=test_user,
            others=[second_user],
        )

        res = client.get("/api/expenses/cashflow/?types=income")

        assert res.status_code == 200
        assert res.json()["summary"] == {
            "income": "0.00",
            "outcome": "0.00",
            "net": "0.00",
        }


# ── Category / account / search filters apply to split items ────────────────


class TestSplitCashflowFilters:
    def test_category_filter_matches_split_item(
        self, client, test_user, second_user, expense_cat
    ):
        other_cat = Category.objects.create(
            name="Other", category_type=Category.EXPENSE, owner=test_user
        )
        _make_split_expense(
            description="Food split",
            amount="40.00",
            d=date(2026, 5, 1),
            payer=test_user,
            others=[second_user],
            category=expense_cat,
        )
        _make_split_expense(
            description="Other split",
            amount="20.00",
            d=date(2026, 5, 1),
            payer=test_user,
            others=[second_user],
            category=other_cat,
        )

        res = client.get(
            f"/api/expenses/cashflow/?types=split&category={expense_cat.id}"
        )

        data = res.json()
        assert data["count"] == 1
        assert data["results"][0]["description"] == "Food split"

    def test_account_filter_matches_split_item(
        self, client, test_user, second_user, account
    ):
        _make_split_expense(
            description="Linked split",
            amount="40.00",
            d=date(2026, 5, 1),
            payer=test_user,
            others=[second_user],
            linked_asset=account,
        )
        _make_split_expense(
            description="Unlinked split",
            amount="20.00",
            d=date(2026, 5, 1),
            payer=test_user,
            others=[second_user],
        )

        res = client.get(f"/api/expenses/cashflow/?types=split&account={account.id}")

        data = res.json()
        assert data["count"] == 1
        assert data["results"][0]["description"] == "Linked split"

    def test_search_matches_split_description(self, client, test_user, second_user):
        _make_split_expense(
            description="Cena al ristorante",
            amount="40.00",
            d=date(2026, 5, 1),
            payer=test_user,
            others=[second_user],
        )
        _make_split_expense(
            description="Taxi aeroporto",
            amount="20.00",
            d=date(2026, 5, 1),
            payer=test_user,
            others=[second_user],
        )

        res = client.get("/api/expenses/cashflow/?types=split&search=Cena")

        data = res.json()
        assert data["count"] == 1
        assert data["results"][0]["description"] == "Cena al ristorante"

    def test_split_reimbursement_hidden_when_category_filter_active(
        self, client, test_user, second_user, expense_cat
    ):
        SplitSettlement.objects.create(
            payer_user=second_user,
            payee_user=test_user,
            amount=Decimal("50.00"),
            date=date(2026, 5, 1),
            created_by=second_user,
        )

        res = client.get(
            f"/api/expenses/cashflow/?types=split_reimbursement&category={expense_cat.id}"
        )

        assert res.status_code == 200
        assert res.json()["count"] == 0

    def test_other_user_split_not_visible(self, client, test_user, second_user):
        third = User.objects.create_user(username="split_cf_outsider", password="pw")
        _make_split_expense(
            description="Not mine",
            amount="40.00",
            d=date(2026, 5, 1),
            payer=second_user,
            others=[third],
            created_by=second_user,
        )

        res = client.get("/api/expenses/cashflow/?types=split")

        assert res.status_code == 200
        assert res.json()["count"] == 0


# ── Types validation + get_cashflow_ids ──────────────────────────────────────


class TestSplitTypesValidation:
    def test_split_and_split_reimbursement_are_accepted_types(self, client, test_user):
        res = client.get("/api/expenses/cashflow/?types=split,split_reimbursement")
        assert res.status_code == 200


class TestSplitCashflowIds:
    def test_get_cashflow_ids_includes_split_keys(self, test_user, second_user):
        expense = _make_split_expense(
            description="Cena",
            amount="40.00",
            d=date(2026, 5, 1),
            payer=test_user,
            others=[second_user],
        )
        settlement = SplitSettlement.objects.create(
            payer_user=second_user,
            payee_user=test_user,
            amount=Decimal("20.00"),
            date=date(2026, 5, 2),
            created_by=second_user,
        )

        ids = get_cashflow_ids(test_user, {"types": ["split", "split_reimbursement"]})

        assert ids["split"] == [expense.id]
        assert ids["split_reimbursement"] == [settlement.id]
