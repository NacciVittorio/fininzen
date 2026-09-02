"""
Feature F regression tests — Data Export endpoint.

Covers:
- GET /api/export/?type=accounts|assets|transactions|cashflow|price_history → 200 text/csv
- GET /api/export/?type=all → 200 application/zip with one csv per kind
- Demo user → 403
- Missing / invalid type → 400
- Owner scoping (no cross-user leak)
"""

import csv
import io
import zipfile
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth.models import User
from django.test import Client

import fininzen.export_views as export_views
from expenses.models import Budget, Category, Expense, RecurringExpense
from fininzen.models import DataAccessGrant, UserProfile
from portfolio.models import (
    AllocationTarget,
    Asset,
    AssetPriceHistory,
    AssetTransaction,
    ContributionSource,
    FireSettings,
    InvestmentType,
    RecurringInvestmentPlan,
)
from splitting.models import (
    SplitContact,
    SplitExpense,
    SplitExpenseShare,
    SplitGroup,
    SplitParticipant,
    SplitRecurringExpense,
    SplitSettlement,
)


def _response_body(response):
    return b"".join(response.streaming_content)


@pytest.fixture
def itype_bank(test_user):
    return InvestmentType.objects.create(
        name="Bank",
        is_bank_account=True,
        supports_ticker=False,
        is_liquid_default=True,
        owner=test_user,
    )


@pytest.fixture
def itype_etf(test_user):
    return InvestmentType.objects.create(
        name="ETF",
        is_bank_account=False,
        supports_ticker=True,
        is_liquid_default=True,
        owner=test_user,
    )


@pytest.fixture
def bank_account(test_user, itype_bank):
    return Asset.objects.create(
        name="Main Bank",
        investment_type=itype_bank,
        currency="EUR",
        current_value=Decimal("1500.00"),
        invested_capital=Decimal("1500.00"),
        owner=test_user,
    )


@pytest.fixture
def etf_asset(test_user, itype_etf):
    return Asset.objects.create(
        name="VWCE",
        ticker="VWCE.DE",
        isin="IE00BK5BQT80",
        investment_type=itype_etf,
        currency="EUR",
        shares=Decimal("10.000000"),
        price_per_share=Decimal("110.0000"),
        current_value=Decimal("1100.00"),
        invested_capital=Decimal("1000.00"),
        owner=test_user,
    )


@pytest.fixture
def contribution_source(test_user):
    return ContributionSource.objects.create(name="TFR", owner=test_user)


@pytest.fixture
def buy_tx(test_user, etf_asset, contribution_source):
    return AssetTransaction.objects.create(
        asset=etf_asset,
        transaction_type=AssetTransaction.BUY,
        date=date(2026, 5, 1),
        shares=Decimal("10.000000"),
        price_per_share=Decimal("100.0000"),
        contribution_source=contribution_source,
        notes="initial buy",
        owner=test_user,
    )


@pytest.fixture
def bank_cash_in_tx(test_user, bank_account):
    return AssetTransaction.objects.create(
        asset=bank_account,
        transaction_type=AssetTransaction.CASH_IN,
        date=date(2026, 5, 4),
        shares=Decimal("1.000000"),
        price_per_share=Decimal("500.0000"),
        notes="salary deposit",
        owner=test_user,
    )


@pytest.fixture
def cat_food(test_user):
    return Category.objects.create(
        name="Food", category_type=Category.EXPENSE, owner=test_user
    )


@pytest.fixture
def lunch_expense(test_user, cat_food):
    return Expense.objects.create(
        description="Lunch",
        amount=Decimal("12.50"),
        category=cat_food,
        date=date(2026, 5, 2),
        owner=test_user,
    )


@pytest.fixture
def price_point(test_user, etf_asset):
    return AssetPriceHistory.objects.create(
        asset=etf_asset,
        date=date(2026, 5, 1),
        close=Decimal("110.0000"),
        owner=test_user,
    )


# ── 200 paths ────────────────────────────────────────────────────────────────


def test_export_accounts_returns_csv(client, bank_account, etf_asset):
    res = client.get("/api/export/?type=accounts")
    assert res.status_code == 200
    assert res["Content-Type"].startswith("text/csv")
    assert 'filename="fininzen_accounts_' in res["Content-Disposition"]
    assert "filename*=UTF-8''fininzen_accounts_" in res["Content-Disposition"]
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == ["id", "name", "investment_type", "currency", "current_balance"]
    names = [r[1] for r in rows[1:]]
    assert "Main Bank" in names
    # ETF (non-bank) must not appear in accounts export
    assert "VWCE" not in names


def test_export_assets_returns_all_assets(client, bank_account, etf_asset):
    res = client.get("/api/export/?type=assets")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    names = [r[1] for r in rows[1:]]
    assert "Main Bank" in names and "VWCE" in names


def test_export_transactions_returns_csv(client, buy_tx, bank_cash_in_tx):
    res = client.get("/api/export/?type=transactions")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == [
        "id",
        "asset_name",
        "transaction_type",
        "date",
        "shares",
        "price_per_share",
        "total_value",
        "cash_amount",
        "contribution_source",
        "notes",
        "fee",
        "tax_amount",
        "fx_rate_to_eur",
        "gross_amount_eur",
        "fee_eur",
        "tax_amount_eur",
        "is_verified",
    ]
    asset_names = [r[1] for r in rows[1:]]
    # Investment trade is included…
    assert any(
        r[1] == "VWCE" and r[2] == "buy" and r[7] == "1000.00" and r[8] == "TFR"
        for r in rows[1:]
    )
    # …but bank-account cashflow movements (cash_in / cash_out / adjustment)
    # are excluded from the standalone Investments export.
    assert "Main Bank" not in asset_names


def test_export_transactions_includes_owned_tx(client, etf_asset):
    AssetTransaction.objects.create(
        asset=etf_asset,
        owner=etf_asset.owner,
        shares=Decimal("1.000000"),
        price_per_share=Decimal("100.0000"),
        transaction_type=AssetTransaction.BUY,
        date=date(2026, 5, 3),
    )
    res = client.get("/api/export/?type=transactions")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert any(r[1] == "VWCE" and r[2] == "buy" for r in rows[1:])


def test_export_cashflow_returns_csv(client, lunch_expense):
    res = client.get("/api/export/?type=cashflow")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == [
        "id",
        "date",
        "description",
        "amount",
        "category",
        "category_type",
        "linked_asset",
    ]
    assert any(r[2] == "Lunch" and r[4] == "Food" for r in rows[1:])


def test_export_price_history_returns_csv(client, price_point):
    res = client.get("/api/export/?type=price_history")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == ["asset_name", "date", "close", "currency", "open"]
    assert any(r[0] == "VWCE" for r in rows[1:])


def test_export_all_returns_zip_with_every_kind(
    client,
    bank_account,
    etf_asset,
    buy_tx,
    bank_cash_in_tx,
    lunch_expense,
    price_point,
    split_expense,
    split_settlement,
    split_recurring,
):
    res = client.get("/api/export/?type=all")
    assert res.status_code == 200
    assert res["Content-Type"] == "application/zip"
    assert 'filename="fininzen_export_' in res["Content-Disposition"]
    assert "filename*=UTF-8''fininzen_export_" in res["Content-Disposition"]
    with zipfile.ZipFile(io.BytesIO(_response_body(res))) as zf:
        names = zf.namelist()
        for kind in (
            "accounts",
            "assets",
            "transactions",
            "cashflow",
            "price_history",
            "categories",
            "budgets",
            "recurring_expenses",
            "recurring_investment_plans",
            "allocation_targets",
            "fire_settings",
            "investment_types",
            "contribution_sources",
            "profile",
            "sharing",
            "split_contacts",
            "split_groups",
            "split_expenses",
            "split_expense_shares",
            "split_settlements",
            "split_recurring_expenses",
        ):
            assert any(
                n.startswith(f"fininzen_{kind}_") and n.endswith(".csv") for n in names
            ), f"missing {kind} in zip: {names}"
        tx_name = next(n for n in names if n.startswith("fininzen_transactions_"))
        tx_rows = list(csv.reader(io.StringIO(zf.read(tx_name).decode("utf-8"))))
        # The ZIP keeps the full transactions stream — investment trades AND
        # bank-account cashflow movements — so Export All loses no data.
        assert any(r[1] == "VWCE" and r[2] == "buy" for r in tx_rows[1:])
        assert any(r[1] == "Main Bank" and r[2] == "cash_in" for r in tx_rows[1:])


# ── New kinds (complete-export follow-up) ───────────────────────────────────


@pytest.fixture
def subcategory(test_user, cat_food):
    return Category.objects.create(
        name="Restaurants",
        category_type=Category.EXPENSE,
        parent=cat_food,
        owner=test_user,
    )


@pytest.fixture
def budget(test_user, cat_food):
    return Budget.objects.create(
        category=cat_food, amount=Decimal("300.00"), owner=test_user
    )


@pytest.fixture
def recurring_expense(test_user, cat_food):
    return RecurringExpense.objects.create(
        description="Rent",
        amount=Decimal("800.00"),
        category=cat_food,
        start_date=date(2026, 1, 1),
        owner=test_user,
    )


@pytest.fixture
def recurring_investment_plan(test_user, etf_asset, bank_account):
    return RecurringInvestmentPlan.objects.create(
        name="Monthly VWCE",
        asset=etf_asset,
        source_account=bank_account,
        amount=Decimal("200.00"),
        start_date=date(2026, 1, 1),
        owner=test_user,
    )


@pytest.fixture
def allocation_target(test_user, itype_etf):
    return AllocationTarget.objects.create(
        investment_type=itype_etf, target_percent=Decimal("70.00"), owner=test_user
    )


@pytest.fixture
def fire_settings(test_user):
    return FireSettings.objects.create(owner=test_user, user_age=35, retirement_age=60)


@pytest.fixture
def split_second_user(db):
    return User.objects.create_user(
        username="splitpartner@test.com",
        email="splitpartner@test.com",
        password="pw12345!",
    )


@pytest.fixture
def split_group(test_user):
    group = SplitGroup.objects.create(name="Trip", icon="🏖️", created_by=test_user)
    SplitParticipant.objects.create(group=group, user=test_user, added_by=test_user)
    return group


@pytest.fixture
def split_contact(test_user):
    return SplitContact.objects.create(owner=test_user, display_name="Mario")


@pytest.fixture
def split_expense(split_group, split_contact, test_user, cat_food):
    expense = SplitExpense.objects.create(
        group=split_group,
        description="Dinner",
        amount=Decimal("40.00"),
        date=date(2026, 6, 1),
        split_method=SplitExpense.EQUAL,
        category=cat_food,
        created_by=test_user,
    )
    contact_participant = SplitParticipant.objects.create(
        group=split_group, contact=split_contact, added_by=test_user
    )
    owner_participant = SplitParticipant.objects.get(group=split_group, user=test_user)
    SplitExpenseShare.objects.create(
        expense=expense,
        participant=owner_participant,
        share_amount=Decimal("20.00"),
        is_payer=True,
    )
    SplitExpenseShare.objects.create(
        expense=expense,
        participant=contact_participant,
        share_amount=Decimal("20.00"),
    )
    return expense


@pytest.fixture
def split_settlement(split_group, split_contact, test_user):
    return SplitSettlement.objects.create(
        group=split_group,
        payer_user=test_user,
        payee_contact=split_contact,
        amount=Decimal("20.00"),
        date=date(2026, 6, 2),
        created_by=test_user,
    )


@pytest.fixture
def split_recurring(split_group, test_user):
    return SplitRecurringExpense.objects.create(
        group=split_group,
        description="Rent split",
        amount=Decimal("500.00"),
        split_method=SplitRecurringExpense.EQUAL,
        start_date=date(2026, 1, 1),
        created_by=test_user,
    )


@pytest.fixture
def sharing_grant(test_user):
    grantee = User.objects.create_user(
        username="grantee2@test.com", email="grantee2@test.com", password="pw12345!"
    )
    return DataAccessGrant.objects.create(
        owner=test_user, grantee=grantee, permission="read"
    )


def test_export_categories_returns_csv(client, subcategory, cat_food):
    res = client.get("/api/export/?type=categories")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == ["id", "name", "category_type", "color", "icon", "parent"]
    assert any(r[1] == "Restaurants" and r[5] == "Food" for r in rows[1:])
    assert any(r[1] == "Food" and r[5] == "" for r in rows[1:])


def test_export_budgets_returns_csv(client, budget):
    res = client.get("/api/export/?type=budgets")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == ["id", "category", "amount"]
    assert any(r[1] == "Food" and r[2] == "300.00" for r in rows[1:])


def test_export_recurring_expenses_returns_csv(client, recurring_expense):
    res = client.get("/api/export/?type=recurring_expenses")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == [
        "id",
        "description",
        "amount",
        "category",
        "linked_asset",
        "frequency",
        "day_of_month",
        "month_of_year",
        "start_date",
        "end_date",
        "status",
    ]
    assert any(r[1] == "Rent" and r[3] == "Food" for r in rows[1:])


def test_export_recurring_investment_plans_returns_csv(
    client, recurring_investment_plan
):
    res = client.get("/api/export/?type=recurring_investment_plans")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == [
        "id",
        "name",
        "asset",
        "source_account",
        "amount",
        "frequency",
        "day_of_week",
        "day_of_month",
        "anchor_month",
        "start_date",
        "end_date",
        "status",
    ]
    assert any(
        r[1] == "Monthly VWCE" and r[2] == "VWCE" and r[3] == "Main Bank"
        for r in rows[1:]
    )


def test_export_allocation_targets_returns_csv(client, allocation_target):
    res = client.get("/api/export/?type=allocation_targets")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == ["id", "investment_type", "target_percent"]
    assert any(r[1] == "ETF" and r[2] == "70.00" for r in rows[1:])


def test_export_fire_settings_returns_csv(client, fire_settings):
    res = client.get("/api/export/?type=fire_settings")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0][:2] == ["user_age", "retirement_age"]
    assert len(rows) == 2
    assert rows[1][:2] == ["35", "60"]


def test_export_fire_settings_header_only_when_absent(client):
    res = client.get("/api/export/?type=fire_settings")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert len(rows) == 1
    assert FireSettings.objects.count() == 0


def test_export_investment_types_returns_csv(client, itype_bank, itype_etf):
    res = client.get("/api/export/?type=investment_types")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == [
        "id",
        "name",
        "color",
        "icon",
        "is_bank_account",
        "supports_ticker",
        "is_liquid_default",
        "supports_contribution_source",
        "tax_rate",
    ]
    names = [r[1] for r in rows[1:]]
    assert "Bank" in names and "ETF" in names


def test_export_contribution_sources_returns_csv(client, contribution_source):
    res = client.get("/api/export/?type=contribution_sources")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == ["id", "name", "sort_order", "is_active"]
    assert any(r[1] == "TFR" for r in rows[1:])


def test_export_profile_returns_csv(client, test_user):
    profile = UserProfile.objects.create(user=test_user, name="Vittorio")
    res = client.get("/api/export/?type=profile")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0][:2] == ["decimal_separator", "name"]
    assert len(rows) == 2
    assert rows[1][:2] == [profile.decimal_separator, "Vittorio"]
    # security/internal fields must never appear
    header_text = ",".join(rows[0])
    assert "mfa_secret" not in header_text
    assert "status" not in header_text
    assert "role" not in header_text


def test_export_profile_header_only_when_absent(client):
    res = client.get("/api/export/?type=profile")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert len(rows) == 1


def test_export_sharing_returns_only_grants_given(client, test_user, sharing_grant):
    # A grant received (not given) by test_user must not appear.
    other = User.objects.create_user(username="other2@test.com", password="pw123456!")
    DataAccessGrant.objects.create(owner=other, grantee=test_user, permission="full")

    res = client.get("/api/export/?type=sharing")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == ["id", "grantee", "permission", "created_at"]
    grantees = [r[1] for r in rows[1:]]
    assert "grantee2@test.com" in grantees
    assert other.username not in grantees


# ── Split (piano QA-fix Batch 3.4) ───────────────────────────────────────────


def test_export_split_contacts_returns_csv(client, split_contact):
    res = client.get("/api/export/?type=split_contacts")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == [
        "id",
        "display_name",
        "color",
        "linked_user",
        "is_archived",
        "created_at",
    ]
    assert any(r[1] == "Mario" for r in rows[1:])


def test_export_split_groups_returns_csv(client, split_group):
    res = client.get("/api/export/?type=split_groups")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == ["id", "name", "icon", "is_archived", "created_at"]
    assert any(r[1] == "Trip" for r in rows[1:])


def test_export_split_groups_does_not_leak_other_users_groups(
    client, split_group, split_second_user
):
    other_group = SplitGroup.objects.create(
        name="Not mine", created_by=split_second_user
    )
    SplitParticipant.objects.create(
        group=other_group, user=split_second_user, added_by=split_second_user
    )
    res = client.get("/api/export/?type=split_groups")
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    names = [r[1] for r in rows[1:]]
    assert "Not mine" not in names
    assert "Trip" in names


def test_export_split_expenses_returns_csv(client, split_expense):
    res = client.get("/api/export/?type=split_expenses")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == [
        "id",
        "group",
        "description",
        "amount",
        "date",
        "split_method",
        "category",
        "linked_asset",
        "notes",
        "created_at",
    ]
    assert any(
        r[1] == "Trip" and r[2] == "Dinner" and r[3] == "40.00" and r[6] == "Food"
        for r in rows[1:]
    )


def test_export_split_expense_shares_returns_csv(client, split_expense, test_user):
    res = client.get("/api/export/?type=split_expense_shares")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == [
        "id",
        "expense",
        "participant",
        "share_amount",
        "raw_input",
        "is_payer",
    ]
    by_participant = {r[2]: r for r in rows[1:]}
    assert by_participant[test_user.email][3] == "20.00"
    assert by_participant[test_user.email][5] == "True"
    assert by_participant["Mario"][3] == "20.00"
    assert by_participant["Mario"][5] == "False"


def test_export_split_settlements_returns_csv(client, split_settlement, test_user):
    res = client.get("/api/export/?type=split_settlements")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == [
        "id",
        "group",
        "payer",
        "payee",
        "amount",
        "date",
        "notes",
        "linked_asset",
        "created_at",
    ]
    assert any(
        r[1] == "Trip"
        and r[2] == test_user.email
        and r[3] == "Mario"
        and r[4] == "20.00"
        for r in rows[1:]
    )


def test_export_split_recurring_expenses_returns_csv(client, split_recurring):
    res = client.get("/api/export/?type=split_recurring_expenses")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    assert rows[0] == [
        "id",
        "group",
        "description",
        "amount",
        "split_method",
        "frequency",
        "day_of_month",
        "month_of_year",
        "start_date",
        "end_date",
        "status",
    ]
    assert any(
        r[1] == "Trip" and r[2] == "Rent split" and r[3] == "500.00" for r in rows[1:]
    )


def test_export_categories_sanitizes_formulas(client, test_user):
    Category.objects.create(
        name='=HYPERLINK("http://attacker","click")',
        category_type=Category.EXPENSE,
        owner=test_user,
    )
    res = client.get("/api/export/?type=categories")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    _assert_no_unescaped_formula(rows[1:])
    assert any(r[1].startswith("'=") for r in rows[1:])


def test_export_recurring_expenses_sanitizes_formulas(client, test_user, cat_food):
    RecurringExpense.objects.create(
        description="=evil_recurring",
        amount=Decimal("10.00"),
        category=cat_food,
        start_date=date(2026, 1, 1),
        owner=test_user,
    )
    res = client.get("/api/export/?type=recurring_expenses")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    _assert_no_unescaped_formula(rows[1:])
    assert any(r[1].startswith("'=") for r in rows[1:])


def test_export_profile_sanitizes_formulas(client, test_user):
    UserProfile.objects.create(user=test_user, name="=evil_name")
    res = client.get("/api/export/?type=profile")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    _assert_no_unescaped_formula(rows[1:])
    assert rows[1][1].startswith("'=")


# ── 4xx paths ────────────────────────────────────────────────────────────────


def test_export_missing_type_returns_400(client):
    res = client.get("/api/export/")
    assert res.status_code == 400
    assert res.json()["error"] == "missing_type"


def test_export_invalid_type_returns_400(client):
    res = client.get("/api/export/?type=bogus")
    assert res.status_code == 400
    assert res.json()["error"] == "invalid_type"


def test_export_unauthenticated_returns_401(db):
    res = Client().get("/api/export/?type=assets")
    # DRF returns 401 (or 403 depending on auth scheme); both prove the
    # endpoint is locked down. Accept either to stay implementation-neutral.
    assert res.status_code in (401, 403)


def test_export_demo_user_returns_403(db):
    demo = User.objects.create_user(username="demo@demo.com", password="demopw")
    c = Client()
    c.force_login(demo)
    res = c.get("/api/export/?type=assets")
    assert res.status_code == 403
    assert res.json()["error"] == "demo_export_disabled"


# ── Owner scoping ────────────────────────────────────────────────────────────


def test_export_blocked_under_viewas(db, test_user, itype_etf):
    """A grantee using X-View-As must not be able to bulk-export the
    owner's data — read grants don't include exfiltration rights."""
    grantee = User.objects.create_user(
        username="grantee@test.com", email="grantee@test.com", password="pw12345!"
    )
    Asset.objects.create(
        name="OwnerOnly",
        investment_type=itype_etf,
        currency="EUR",
        current_value=Decimal("777.00"),
        invested_capital=Decimal("777.00"),
        owner=test_user,
    )
    DataAccessGrant.objects.create(owner=test_user, grantee=grantee, permission="read")

    c = Client()
    c.force_login(grantee)
    res = c.get("/api/export/?type=assets", HTTP_X_VIEW_AS=str(test_user.id))
    assert res.status_code == 403
    assert res.json()["error"] == "export_viewas_disabled"


def test_export_does_not_leak_other_users_assets(
    client, test_user, etf_asset, itype_etf
):
    other = User.objects.create_user(username="other@test.com", password="otherpw123")
    Asset.objects.create(
        name="OtherUserAsset",
        investment_type=itype_etf,
        currency="EUR",
        current_value=Decimal("999.00"),
        invested_capital=Decimal("999.00"),
        owner=other,
    )
    res = client.get("/api/export/?type=assets")
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    names = [r[1] for r in rows[1:]]
    assert "OtherUserAsset" not in names
    assert "VWCE" in names


# ── CSV formula-injection regression (CWE-1236) ──────────────────────────────

DANGEROUS_PAYLOADS = [
    '=HYPERLINK("http://attacker","click")',
    "+cmd",
    "-10+20",
    "@SUM(1,2)",
    "\tformula",
    "\rformula",
    "\nformula",
    "\x1fformula",
]


def _assert_no_unescaped_formula(rows):
    """Every cell that originally started with a dangerous char must now be
    single-quote-prefixed. Header rows (column names) are static and never
    start with these chars, so this also guards against accidental over-escape."""
    for row in rows:
        for cell in row:
            if not cell:
                continue
            if cell[0] in ("=", "+", "-", "@", "\t", "\r", "\n"):
                raise AssertionError(
                    f"unescaped formula-prefix cell in export: {cell!r}"
                )


@pytest.fixture
def dangerous_bank(test_user, itype_bank):
    return Asset.objects.create(
        name='=HYPERLINK("http://attacker","click")',
        investment_type=itype_bank,
        currency="EUR",
        current_value=Decimal("100.00"),
        invested_capital=Decimal("100.00"),
        owner=test_user,
    )


@pytest.fixture
def dangerous_etf(test_user, itype_etf):
    return Asset.objects.create(
        name="+cmd",
        ticker="-10+20",
        isin="@SUM(1,2)",
        investment_type=itype_etf,
        currency="EUR",
        shares=Decimal("1.000000"),
        price_per_share=Decimal("1.0000"),
        current_value=Decimal("1.00"),
        invested_capital=Decimal("1.00"),
        notes="=evil_note",
        owner=test_user,
    )


@pytest.fixture
def dangerous_tx(test_user, dangerous_etf, contribution_source):
    return AssetTransaction.objects.create(
        asset=dangerous_etf,
        transaction_type=AssetTransaction.BUY,
        date=date(2026, 5, 1),
        shares=Decimal("1.000000"),
        price_per_share=Decimal("1.0000"),
        contribution_source=contribution_source,
        notes="@SUM(1,2)",
        owner=test_user,
    )


@pytest.fixture
def dangerous_expense(test_user):
    cat = Category.objects.create(
        name="=evil", category_type=Category.EXPENSE, owner=test_user
    )
    return Expense.objects.create(
        description='=HYPERLINK("http://attacker","click")',
        amount=Decimal("1.00"),
        category=cat,
        date=date(2026, 5, 2),
        owner=test_user,
    )


@pytest.fixture
def dangerous_price_point(test_user, dangerous_etf):
    return AssetPriceHistory.objects.create(
        asset=dangerous_etf,
        date=date(2026, 5, 1),
        close=Decimal("1.0000"),
        owner=test_user,
    )


@pytest.fixture
def dangerous_split_contact(test_user):
    return SplitContact.objects.create(
        owner=test_user, display_name='=HYPERLINK("http://attacker","click")'
    )


def test_export_split_contacts_sanitizes_formulas(client, dangerous_split_contact):
    res = client.get("/api/export/?type=split_contacts")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    _assert_no_unescaped_formula(rows[1:])
    names = [r[1] for r in rows[1:]]
    assert any(n.startswith("'=") for n in names)


def test_export_accounts_sanitizes_formulas(client, dangerous_bank):
    res = client.get("/api/export/?type=accounts")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    _assert_no_unescaped_formula(rows[1:])
    # The original name should appear with a leading single-quote
    names = [r[1] for r in rows[1:]]
    assert any(n.startswith("'=") for n in names)


def test_export_assets_sanitizes_formulas(client, dangerous_etf):
    res = client.get("/api/export/?type=assets")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    _assert_no_unescaped_formula(rows[1:])


def test_export_transactions_sanitizes_formulas(client, dangerous_tx):
    res = client.get("/api/export/?type=transactions")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    _assert_no_unescaped_formula(rows[1:])
    # asset_name and notes columns must be sanitized
    assert any(r[1].startswith("'+") for r in rows[1:])
    assert any(r[9].startswith("'@") for r in rows[1:])


def test_export_cashflow_sanitizes_formulas(client, dangerous_expense):
    res = client.get("/api/export/?type=cashflow")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    _assert_no_unescaped_formula(rows[1:])
    # description and category must both be sanitized
    descriptions = [r[2] for r in rows[1:]]
    categories = [r[4] for r in rows[1:]]
    assert any(d.startswith("'=") for d in descriptions)
    assert any(c.startswith("'=") for c in categories)


def test_export_zip_sanitizes_every_kind(
    client,
    dangerous_bank,
    dangerous_etf,
    dangerous_tx,
    dangerous_expense,
    dangerous_price_point,
):
    res = client.get("/api/export/?type=all")
    assert res.status_code == 200
    with zipfile.ZipFile(io.BytesIO(_response_body(res))) as zf:
        for name in zf.namelist():
            with zf.open(name) as fp:
                text = fp.read().decode("utf-8")
            rows = list(csv.reader(io.StringIO(text)))
            _assert_no_unescaped_formula(rows[1:])


@pytest.mark.parametrize("payload", DANGEROUS_PAYLOADS)
def test_export_cashflow_sanitizes_every_dangerous_prefix(
    client, test_user, cat_food, payload
):
    Expense.objects.create(
        description=payload,
        amount=Decimal("1.00"),
        category=cat_food,
        date=date(2026, 5, 3),
        owner=test_user,
    )
    res = client.get("/api/export/?type=cashflow")
    assert res.status_code == 200
    rows = list(csv.reader(io.StringIO(_response_body(res).decode())))
    _assert_no_unescaped_formula(rows[1:])
    descriptions = [r[2] for r in rows[1:]]
    # Sanitized version is the payload prefixed with a single quote
    assert ("'" + payload) in descriptions, descriptions


def test_export_all_returns_413_when_zip_exceeds_cap(
    client,
    bank_account,
    etf_asset,
    monkeypatch,
):
    monkeypatch.setattr(export_views, "_ZIP_MAX_BYTES", 1)

    res = client.get("/api/export/?type=all")

    assert res.status_code == 413
    assert res.json()["error"] == "export_too_large"
