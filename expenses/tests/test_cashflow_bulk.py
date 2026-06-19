"""Tests for POST /api/expenses/cashflow/bulk/ — bulk edit/delete endpoint."""

import json
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
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
def expense_cat_other(test_user):
    return Category.objects.create(
        name="Transport", category_type=Category.EXPENSE, owner=test_user
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


def _make_expense(user, cat, **kwargs):
    return Expense.objects.create(
        description=kwargs.get("description", "expense"),
        amount=Decimal(str(kwargs.get("amount", "10.00"))),
        category=cat,
        date=kwargs.get("date", date(2026, 5, 1)),
        owner=user,
        is_verified=kwargs.get("is_verified", False),
        linked_asset=kwargs.get("linked_asset"),
    )


def _make_transfer(user, src, dst, amount, d):
    cash_out = AssetTransaction.objects.create(
        asset=src,
        transaction_type=AssetTransaction.CASH_OUT,
        date=d,
        shares=Decimal("1"),
        price_per_share=Decimal(str(amount)),
        owner=user,
    )
    cash_in = AssetTransaction.objects.create(
        asset=dst,
        transaction_type=AssetTransaction.CASH_IN,
        date=d,
        shares=Decimal("1"),
        price_per_share=Decimal(str(amount)),
        derived_from=cash_out,
        owner=user,
    )
    return cash_out, cash_in


def _make_adjustment(user, account, amount, d):
    return AssetTransaction.objects.create(
        asset=account,
        transaction_type=AssetTransaction.ADJUSTMENT,
        date=d,
        shares=Decimal("1"),
        price_per_share=Decimal(str(amount)),
        owner=user,
    )


def _post(client, payload):
    return client.post(
        "/api/expenses/cashflow/bulk/",
        data=json.dumps(payload),
        content_type="application/json",
    )


# ── Basic plumbing ────────────────────────────────────────────────────────────


class TestEndpointPlumbing:
    def test_unauthenticated_returns_401(self):
        c = Client()
        res = c.post(
            "/api/expenses/cashflow/bulk/", data={}, content_type="application/json"
        )
        assert res.status_code == 401

    def test_empty_payload_returns_400(self, client):
        res = _post(client, {})
        assert res.status_code == 400

    def test_unknown_action_returns_400(self, client):
        res = _post(
            client, {"action": "rename", "selection": {"mode": "ids", "ids": []}}
        )
        assert res.status_code == 400

    def test_unknown_selection_mode_returns_400(self, client):
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "magic"},
                "patch": {"is_verified": True},
            },
        )
        assert res.status_code == 400


# ── Verify / unverify (universal field) ──────────────────────────────────────


class TestBulkVerify:
    def test_bulk_verify_expenses(self, client, test_user, expense_cat):
        ids = []
        for i in range(3):
            e = _make_expense(test_user, expense_cat, description=f"e{i}")
            ids.append(f"expense_{e.id}")
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "ids", "ids": ids},
                "patch": {"is_verified": True},
            },
        )
        assert res.status_code == 200, res.content
        body = res.json()
        assert body["applied"]["expense"] == 3
        assert Expense.objects.filter(owner=test_user, is_verified=True).count() == 3

    def test_bulk_verify_transfer_updates_both_legs(
        self, client, test_user, account_a, account_b
    ):
        cash_out, cash_in = _make_transfer(
            test_user, account_a, account_b, "100", date(2026, 5, 1)
        )
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "ids", "ids": [f"transfer_{cash_in.id}"]},
                "patch": {"is_verified": True},
            },
        )
        assert res.status_code == 200, res.content
        cash_in.refresh_from_db()
        cash_out.refresh_from_db()
        assert cash_in.is_verified is True
        assert cash_out.is_verified is True

    def test_bulk_verify_transfers_only(self, client, test_user, account_a, account_b):
        _, cash_in1 = _make_transfer(
            test_user, account_a, account_b, "50", date(2026, 5, 1)
        )
        _, cash_in2 = _make_transfer(
            test_user, account_a, account_b, "75", date(2026, 5, 2)
        )
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {
                    "mode": "ids",
                    "ids": [f"transfer_{cash_in1.id}", f"transfer_{cash_in2.id}"],
                },
                "patch": {"is_verified": True},
            },
        )
        assert res.status_code == 200, res.content
        body = res.json()
        assert body["applied"]["transfer"] == 2
        assert body["kind"] == "transfer"


# ── Field gating ──────────────────────────────────────────────────────────────


class TestFieldGating:
    def test_expense_plus_transfer_selection_rejected_with_mixed_kinds(
        self, client, test_user, expense_cat, account_a, account_b, expense_cat_other
    ):
        e = _make_expense(test_user, expense_cat)
        _, cash_in = _make_transfer(
            test_user, account_a, account_b, "50", date(2026, 5, 1)
        )
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {
                    "mode": "ids",
                    "ids": [f"expense_{e.id}", f"transfer_{cash_in.id}"],
                },
                "patch": {"category_id": expense_cat_other.id},
            },
        )
        assert res.status_code == 400
        body = res.json()
        assert "mixed_kinds" in body["error_codes"]

    def test_category_direction_mismatch_returns_400(
        self, client, test_user, expense_cat, income_cat
    ):
        e = _make_expense(test_user, expense_cat)
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "ids", "ids": [f"expense_{e.id}"]},
                "patch": {"category_id": income_cat.id},
            },
        )
        assert res.status_code == 400

    def test_change_category_same_direction(
        self, client, test_user, expense_cat, expense_cat_other
    ):
        e = _make_expense(test_user, expense_cat)
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "ids", "ids": [f"expense_{e.id}"]},
                "patch": {"category_id": expense_cat_other.id},
            },
        )
        assert res.status_code == 200, res.content
        e.refresh_from_db()
        assert e.category_id == expense_cat_other.id

    def test_linked_asset_must_be_manual_bank_account(
        self, client, test_user, expense_cat
    ):
        # Investment type without bank flag — should be rejected
        inv = InvestmentType.objects.create(name="ETF", owner=test_user)
        non_bank = Asset.objects.create(
            name="ETF Acc",
            tracking_type=Asset.AUTO,
            investment_type=inv,
            owner=test_user,
        )
        e = _make_expense(test_user, expense_cat)
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "ids", "ids": [f"expense_{e.id}"]},
                "patch": {"linked_asset_id": non_bank.id},
            },
        )
        assert res.status_code == 400


# ── Filtered selection ───────────────────────────────────────────────────────


class TestFilteredSelection:
    def test_filtered_select_all_paginated(self, client, test_user, expense_cat):
        # Beyond default page_size — confirms the filtered-mode resolver does
        # not stop at page 1 but iterates the unbounded feed.
        for i in range(60):
            _make_expense(test_user, expense_cat, description=f"e{i}")
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {
                    "mode": "filtered",
                    "filters": {"types": ["outcome"]},
                },
                "patch": {"is_verified": True},
            },
        )
        assert res.status_code == 200, res.content
        body = res.json()
        assert body["applied"]["expense"] == 60

    def test_filtered_with_exclude_ids(self, client, test_user, expense_cat):
        kept = []
        excluded = None
        for i in range(5):
            e = _make_expense(test_user, expense_cat, description=f"e{i}")
            if i == 2:
                excluded = e
            else:
                kept.append(e)
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {
                    "mode": "filtered",
                    "filters": {"types": ["outcome"]},
                    "exclude_ids": [f"expense_{excluded.id}"],
                },
                "patch": {"is_verified": True},
            },
        )
        assert res.status_code == 200, res.content
        excluded.refresh_from_db()
        assert excluded.is_verified is False
        for k in kept:
            k.refresh_from_db()
            assert k.is_verified is True

    def test_dry_run_does_not_mutate(self, client, test_user, expense_cat):
        e = _make_expense(test_user, expense_cat)
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "ids", "ids": [f"expense_{e.id}"]},
                "patch": {"is_verified": True},
                "dry_run": True,
            },
        )
        assert res.status_code == 200, res.content
        body = res.json()
        assert body["total_selected"] == 1
        assert "applied" not in body
        e.refresh_from_db()
        assert e.is_verified is False


# ── Bulk delete ───────────────────────────────────────────────────────────────


class TestBulkDelete:
    def test_delete_expenses(self, client, test_user, expense_cat):
        ids = []
        for i in range(3):
            e = _make_expense(test_user, expense_cat, description=f"e{i}")
            ids.append(f"expense_{e.id}")
        res = _post(
            client,
            {
                "action": "delete",
                "selection": {"mode": "ids", "ids": ids},
            },
        )
        assert res.status_code == 200, res.content
        assert Expense.objects.filter(owner=test_user).count() == 0

    def test_delete_transfer_removes_both_legs(
        self, client, test_user, account_a, account_b
    ):
        cash_out, cash_in = _make_transfer(
            test_user, account_a, account_b, "100", date(2026, 5, 1)
        )
        res = _post(
            client,
            {
                "action": "delete",
                "selection": {"mode": "ids", "ids": [f"transfer_{cash_in.id}"]},
            },
        )
        assert res.status_code == 200, res.content
        assert not AssetTransaction.objects.filter(pk=cash_in.id).exists()
        assert not AssetTransaction.objects.filter(pk=cash_out.id).exists()


# ── Ownership isolation ──────────────────────────────────────────────────────


class TestOwnershipIsolation:
    def test_cannot_touch_other_user_rows(self, client, test_user, expense_cat):
        other = get_user_model().objects.create_user(
            username="other_bulk", password="pw"
        )
        other_cat = Category.objects.create(
            name="X", category_type=Category.EXPENSE, owner=other
        )
        other_expense = Expense.objects.create(
            description="other",
            amount=Decimal("10"),
            category=other_cat,
            date=date(2026, 5, 1),
            owner=other,
        )
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "ids", "ids": [f"expense_{other_expense.id}"]},
                "patch": {"is_verified": True},
            },
        )
        # The endpoint should not crash; the row should be silently filtered
        # (reported under missing_ids) and not modified.
        assert res.status_code == 200, res.content
        body = res.json()
        assert body["applied"]["total"] == 0
        assert f"expense_{other_expense.id}" in body["missing_ids"]
        other_expense.refresh_from_db()
        assert other_expense.is_verified is False


# ── Linked-asset balance integrity ───────────────────────────────────────────


class TestBulkLinkedAccountIntegrity:
    def test_linked_asset_change_recomputes_balances(
        self, client, test_user, expense_cat, account_a, account_b
    ):
        e = _make_expense(
            test_user,
            expense_cat,
            amount="40",
            linked_asset=account_a,
            is_verified=True,
        )
        # Sanity: signals created the shadow CASH_OUT on account_a.
        account_a.refresh_from_db()
        balance_a_before = account_a.current_value

        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "ids", "ids": [f"expense_{e.id}"]},
                "patch": {"linked_asset_id": account_b.id},
            },
        )
        assert res.status_code == 200, res.content
        account_a.refresh_from_db()
        account_b.refresh_from_db()
        # Account A is now free of the shadow CASH_OUT, B carries it.
        assert account_a.current_value > balance_a_before
        assert account_b.current_value < Decimal("0")

    def test_clear_linked_asset_removes_shadow_tx(
        self, client, test_user, expense_cat, account_a
    ):
        from portfolio.models import AssetTransaction as AT

        e = _make_expense(
            test_user,
            expense_cat,
            amount="25",
            linked_asset=account_a,
            is_verified=True,
        )
        # Sanity: shadow tx exists.
        assert AT.objects.filter(source_expense=e).count() == 1
        account_a.refresh_from_db()
        before = account_a.current_value

        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "ids", "ids": [f"expense_{e.id}"]},
                "patch": {"linked_asset_id": None},
            },
        )
        assert res.status_code == 200, res.content
        e.refresh_from_db()
        assert e.linked_asset_id is None
        assert AT.objects.filter(source_expense=e).count() == 0
        account_a.refresh_from_db()
        # Account A balance restored toward zero (shadow CASH_OUT gone).
        assert account_a.current_value > before


# ── Dry-run guarantees ────────────────────────────────────────────────────────


class TestDryRun:
    def test_dry_run_delete_does_not_mutate(self, client, test_user, expense_cat):
        e = _make_expense(test_user, expense_cat)
        res = _post(
            client,
            {
                "action": "delete",
                "selection": {"mode": "ids", "ids": [f"expense_{e.id}"]},
                "dry_run": True,
            },
        )
        assert res.status_code == 200, res.content
        body = res.json()
        assert body["total_selected"] == 1
        assert "applied" not in body
        assert Expense.objects.filter(pk=e.pk).exists()


# ── Filtered mode edge cases ──────────────────────────────────────────────────


class TestFilteredEdgeCases:
    def test_filtered_empty_result_returns_ok(self, client, test_user):
        # No rows in DB; filtered selection should resolve cleanly.
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {
                    "mode": "filtered",
                    "filters": {"types": ["outcome"]},
                },
                "patch": {"is_verified": True},
            },
        )
        assert res.status_code == 200, res.content
        body = res.json()
        assert body["applied"]["total"] == 0
        assert "selection is empty" in body.get("warnings", [])

    def test_filtered_selection_cap_enforced(
        self, client, test_user, expense_cat, monkeypatch
    ):
        # Lower the cap so we don't have to insert 5000 rows.
        import expenses.bulk as bulk_module

        monkeypatch.setattr(bulk_module, "MAX_FILTERED_SELECTION", 3)
        for i in range(5):
            _make_expense(test_user, expense_cat, description=f"cap_{i}")
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {
                    "mode": "filtered",
                    "filters": {"types": ["outcome"]},
                },
                "patch": {"is_verified": True},
            },
        )
        assert res.status_code == 400, res.content
        body = res.json()
        assert any("exceeds" in err for err in body.get("errors", []))


# ── Category-less expense direction policy ────────────────────────────────────


class TestCategoryLessExpense:
    def test_categoryless_expense_blocked_from_income_category(
        self, client, test_user, income_cat
    ):
        """A no-category expense behaves as EXPENSE direction (per signals.py);
        moving it to an income category would silently flip its shadow tx."""
        e = Expense.objects.create(
            description="no-cat",
            amount=Decimal("10"),
            category=None,
            date=date(2026, 5, 1),
            owner=test_user,
            is_verified=False,
        )
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "ids", "ids": [f"expense_{e.id}"]},
                "patch": {"category_id": income_cat.id},
            },
        )
        assert res.status_code == 400, res.content
        body = res.json()
        assert any("direction mismatch" in err for err in body["errors"])

    def test_categoryless_expense_allowed_into_expense_category(
        self, client, test_user, expense_cat
    ):
        e = Expense.objects.create(
            description="no-cat",
            amount=Decimal("10"),
            category=None,
            date=date(2026, 5, 1),
            owner=test_user,
            is_verified=False,
        )
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "ids", "ids": [f"expense_{e.id}"]},
                "patch": {"category_id": expense_cat.id},
            },
        )
        assert res.status_code == 200, res.content
        e.refresh_from_db()
        assert e.category_id == expense_cat.id


# ── Dashboard invalidation atomicity ──────────────────────────────────────────


class TestDashboardInvalidationOnCommit:
    def test_invalidation_deferred_to_on_commit(
        self, client, test_user, expense_cat, monkeypatch
    ):
        """The invalidation must be scheduled via transaction.on_commit so it
        only fires after the bulk atomic commits — never before, never on rollback."""
        from django.test.testcases import TestCase
        from expenses import bulk as bulk_module

        calls: list[str] = []

        def fake_invalidate(reason, user=None):
            calls.append(reason)

        monkeypatch.setattr(
            bulk_module, "invalidate_dashboard_summary", fake_invalidate
        )

        e = _make_expense(test_user, expense_cat)
        with TestCase.captureOnCommitCallbacks(execute=True) as callbacks:
            res = _post(
                client,
                {
                    "action": "edit",
                    "selection": {"mode": "ids", "ids": [f"expense_{e.id}"]},
                    "patch": {"is_verified": True},
                },
            )
        assert res.status_code == 200, res.content
        # At least one on_commit callback was scheduled by the bulk path (the
        # dashboard invalidate). It only fired because captureOnCommitCallbacks
        # executed pending callbacks — confirming the deferral works.
        assert any(calls), "expected dashboard invalidation to have fired on commit"
        assert callbacks, "expected at least one on_commit callback to be scheduled"


# ── Asset refresh atomicity (rollback on failure) ────────────────────────────


class TestRefreshAtomicity:
    """If the post-mutation account refresh fails, the entire bulk must roll
    back so balances stay consistent rather than going silently stale."""

    def test_refresh_failure_rolls_back_transfer_edit(
        self, client, test_user, account_a, account_b, monkeypatch
    ):
        from expenses import bulk as bulk_module

        _, cash_in = _make_transfer(
            test_user, account_a, account_b, "100", date(2026, 5, 1)
        )

        def boom(_asset):
            raise RuntimeError("simulated balance recompute failure")

        monkeypatch.setattr("portfolio.services._refresh_manual_asset_strict", boom)
        # Sanity: confirm bulk imports the strict variant via the lazy import
        # inside _refresh_assets_strict.
        assert hasattr(bulk_module, "_refresh_assets_strict")

        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "ids", "ids": [f"transfer_{cash_in.id}"]},
                "patch": {"is_verified": True, "date": "2026-06-15"},
            },
        )
        assert res.status_code == 409, res.content
        body = res.json()
        assert body["ok"] is False
        assert body["error_codes"] == ["asset_refresh_failed"]
        # Mutations rolled back — the leg keeps its original verified=False / date.
        cash_in.refresh_from_db()
        assert cash_in.is_verified is False
        assert cash_in.date == date(2026, 5, 1)

    def test_refresh_failure_rolls_back_delete(
        self, client, test_user, account_a, account_b, monkeypatch
    ):
        _, cash_in = _make_transfer(
            test_user, account_a, account_b, "50", date(2026, 5, 1)
        )
        monkeypatch.setattr(
            "portfolio.services._refresh_manual_asset_strict",
            lambda _a: (_ for _ in ()).throw(RuntimeError("boom")),
        )
        res = _post(
            client,
            {
                "action": "delete",
                "selection": {"mode": "ids", "ids": [f"transfer_{cash_in.id}"]},
            },
        )
        assert res.status_code == 409, res.content
        # Row still exists — delete was rolled back.
        assert AssetTransaction.objects.filter(pk=cash_in.id).exists()

    def test_refresh_failure_preserves_asset_balance(
        self, client, test_user, account_a, account_b, monkeypatch
    ):
        _, cash_in = _make_transfer(
            test_user, account_a, account_b, "100", date(2026, 5, 1)
        )
        account_b.refresh_from_db()
        before = account_b.current_value

        monkeypatch.setattr(
            "portfolio.services._refresh_manual_asset_strict",
            lambda _a: (_ for _ in ()).throw(RuntimeError("boom")),
        )

        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "ids", "ids": [f"transfer_{cash_in.id}"]},
                "patch": {"date": "2026-06-15"},
            },
        )
        assert res.status_code == 409, res.content
        account_b.refresh_from_db()
        assert account_b.current_value == before

    def test_response_includes_error_codes_on_validation_failure(
        self, client, test_user, expense_cat, income_cat
    ):
        e = _make_expense(test_user, expense_cat)
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "ids", "ids": [f"expense_{e.id}"]},
                "patch": {"category_id": income_cat.id},
            },
        )
        assert res.status_code == 400, res.content
        body = res.json()
        assert "category_direction_mismatch" in body.get("error_codes", [])
        # Row-level rejected_rows lets the UI highlight the offending rows.
        rejected = body.get("rejected_rows") or []
        assert any(r.get("id") == f"expense_{e.id}" for r in rejected)


# ── Selection kind gating (Iter 2) ────────────────────────────────────────────


class TestKindGating:
    """A bulk selection must be homogeneous (income | outcome | transfer |
    adjustment). Adjustments cannot be edited in bulk — only deleted."""

    def test_mixed_income_outcome_rejected(
        self, client, test_user, expense_cat, income_cat
    ):
        out = _make_expense(test_user, expense_cat)
        inc = _make_expense(test_user, income_cat)
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {
                    "mode": "ids",
                    "ids": [f"expense_{out.id}", f"expense_{inc.id}"],
                },
                "patch": {"is_verified": True},
            },
        )
        assert res.status_code == 400, res.content
        body = res.json()
        assert "mixed_kinds" in body["error_codes"]

    def test_mixed_expense_adjustment_rejected(
        self, client, test_user, expense_cat, account_a
    ):
        e = _make_expense(test_user, expense_cat)
        adj = _make_adjustment(test_user, account_a, "20", date(2026, 5, 1))
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {
                    "mode": "ids",
                    "ids": [f"expense_{e.id}", f"adjustment_{adj.id}"],
                },
                "patch": {"is_verified": True},
            },
        )
        assert res.status_code == 400
        assert "mixed_kinds" in res.json()["error_codes"]

    def test_adjustment_only_edit_rejected(self, client, test_user, account_a):
        adj = _make_adjustment(test_user, account_a, "20", date(2026, 5, 1))
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "ids", "ids": [f"adjustment_{adj.id}"]},
                "patch": {"is_verified": True},
            },
        )
        assert res.status_code == 400, res.content
        body = res.json()
        assert "adjustment_not_editable" in body["error_codes"]
        adj.refresh_from_db()
        assert adj.is_verified is False  # untouched

    def test_adjustment_only_delete_allowed(self, client, test_user, account_a):
        adj = _make_adjustment(test_user, account_a, "20", date(2026, 5, 1))
        res = _post(
            client,
            {
                "action": "delete",
                "selection": {"mode": "ids", "ids": [f"adjustment_{adj.id}"]},
            },
        )
        assert res.status_code == 200, res.content
        body = res.json()
        assert body["applied"]["adjustment"] == 1
        assert not AssetTransaction.objects.filter(pk=adj.id).exists()

    def test_homogeneous_outcome_selection_can_change_category(
        self, client, test_user, expense_cat, expense_cat_other
    ):
        a = _make_expense(test_user, expense_cat)
        b = _make_expense(test_user, expense_cat)
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {
                    "mode": "ids",
                    "ids": [f"expense_{a.id}", f"expense_{b.id}"],
                },
                "patch": {"category_id": expense_cat_other.id},
            },
        )
        assert res.status_code == 200, res.content
        assert res.json()["kind"] == "outcome"
        a.refresh_from_db()
        b.refresh_from_db()
        assert a.category_id == expense_cat_other.id
        assert b.category_id == expense_cat_other.id

    def test_transfer_only_cannot_use_expense_fields(
        self, client, test_user, account_a, account_b, expense_cat
    ):
        _, cash_in = _make_transfer(
            test_user, account_a, account_b, "50", date(2026, 5, 1)
        )
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "ids", "ids": [f"transfer_{cash_in.id}"]},
                "patch": {"category_id": expense_cat.id},
            },
        )
        assert res.status_code == 400, res.content
        body = res.json()
        assert "fields_not_applicable" in body["error_codes"]


# ── Transfer account patch (Iter 2: from/to) ─────────────────────────────────


class TestTransferAccountPatch:
    """Transfers expose two new patch fields: from_account_id (mutates the
    CASH_OUT leg) and to_account_id (mutates the CASH_IN leg). Both source and
    target accounts must be recomputed so balances stay in sync."""

    def test_change_to_account_swaps_cash_in_leg(
        self, client, test_user, account_a, account_b, bank_type
    ):
        account_c = Asset.objects.create(
            name="Account C",
            tracking_type=Asset.MANUAL,
            investment_type=bank_type,
            owner=test_user,
        )
        cash_out, cash_in = _make_transfer(
            test_user, account_a, account_b, "100", date(2026, 5, 1)
        )
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "ids", "ids": [f"transfer_{cash_in.id}"]},
                "patch": {"to_account_id": account_c.id},
            },
        )
        assert res.status_code == 200, res.content
        cash_in.refresh_from_db()
        cash_out.refresh_from_db()
        assert cash_in.asset_id == account_c.id
        assert cash_out.asset_id == account_a.id  # untouched

    def test_change_from_account_swaps_cash_out_leg(
        self, client, test_user, account_a, account_b, bank_type
    ):
        account_c = Asset.objects.create(
            name="Account C",
            tracking_type=Asset.MANUAL,
            investment_type=bank_type,
            owner=test_user,
        )
        cash_out, cash_in = _make_transfer(
            test_user, account_a, account_b, "100", date(2026, 5, 1)
        )
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "ids", "ids": [f"transfer_{cash_in.id}"]},
                "patch": {"from_account_id": account_c.id},
            },
        )
        assert res.status_code == 200, res.content
        cash_out.refresh_from_db()
        cash_in.refresh_from_db()
        assert cash_out.asset_id == account_c.id
        assert cash_in.asset_id == account_b.id  # untouched

    def test_same_account_both_sides_rejected(
        self, client, test_user, account_a, account_b
    ):
        _, cash_in = _make_transfer(
            test_user, account_a, account_b, "100", date(2026, 5, 1)
        )
        res = _post(
            client,
            {
                "action": "edit",
                "selection": {"mode": "ids", "ids": [f"transfer_{cash_in.id}"]},
                "patch": {
                    "from_account_id": account_a.id,
                    "to_account_id": account_a.id,
                },
            },
        )
        assert res.status_code == 400, res.content
        assert "same_account_transfer" in res.json()["error_codes"]
