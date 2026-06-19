from decimal import Decimal

import pytest

from expenses.models import Category, Expense
from portfolio.models import Asset, AssetPriceHistory, AssetTransaction, InvestmentType


def _post_rows(client, rows):
    return client.post(
        "/api/expenses/import-csv/",
        data={"rows": rows},
        content_type="application/json",
    )


def _bank_account(user, name="Fineco"):
    account_type = InvestmentType.objects.create(
        name=f"{name} Account", is_bank_account=True, owner=user
    )
    return Asset.objects.create(
        name=name,
        investment_type=account_type,
        tracking_type=Asset.MANUAL,
        owner=user,
    )


def test_import_basic(client, expense_cat, test_user):
    account = _bank_account(test_user)
    res = _post_rows(
        client,
        [
            {
                "date": "2026-04-10",
                "description": "Pizza",
                "amount": "12.50",
                "category_name": "Food",
                "linked_asset_name": account.name,
            }
        ],
    )
    assert res.status_code == 200
    data = res.json()
    assert data["imported"] == 1
    assert data["skipped"] == 0
    assert Expense.objects.filter(description="Pizza").exists()


def test_matches_category_case_insensitive(client, expense_cat, test_user):
    account = _bank_account(test_user)
    # expense_cat fixture has name="Food"
    res = _post_rows(
        client,
        [
            {
                "date": "2026-04-10",
                "description": "Salad",
                "amount": "8",
                "category_name": "FOOD",
                "linked_asset_name": account.name,
            }
        ],
    )
    assert res.status_code == 200
    assert res.json()["imported"] == 1
    exp = Expense.objects.get(description="Salad")
    assert exp.category_id == expense_cat.id


def test_unknown_category_skips_row(client, test_user):
    account = _bank_account(test_user)
    res = _post_rows(
        client,
        [
            {
                "date": "2026-04-10",
                "description": "Mystery",
                "amount": "20",
                "category_name": "Unknown Cat",
                "linked_asset_name": account.name,
            }
        ],
    )
    assert res.status_code == 200
    data = res.json()
    assert data["imported"] == 0
    assert data["skipped"] == 1
    assert data["skipped_details"] == ["Row 1: category 'Unknown Cat' not found"]
    assert not Expense.objects.filter(description="Mystery").exists()


def test_missing_category_skips_row(client, test_user):
    account = _bank_account(test_user)
    res = _post_rows(
        client,
        [
            {
                "date": "2026-04-10",
                "description": "No Category",
                "amount": "20",
                "linked_asset_name": account.name,
            }
        ],
    )
    assert res.status_code == 200
    data = res.json()
    assert data["imported"] == 0
    assert data["skipped"] == 1
    assert data["skipped_details"] == ["Row 1: category is required"]
    assert not Expense.objects.filter(description="No Category").exists()


def test_multiple_date_formats(client, expense_cat, test_user):
    account = _bank_account(test_user)
    rows = [
        {
            "date": "2026-04-10",
            "description": "ISO",
            "amount": "1",
            "category_name": expense_cat.name,
            "linked_asset_name": account.name,
        },
        {
            "date": "10/04/2026",
            "description": "Slash",
            "amount": "2",
            "category_name": expense_cat.name,
            "linked_asset_name": account.name,
        },
        {
            "date": "10-04-2026",
            "description": "Dash",
            "amount": "3",
            "category_name": expense_cat.name,
            "linked_asset_name": account.name,
        },
        {
            "date": "10.04.2026",
            "description": "Dot",
            "amount": "4",
            "category_name": expense_cat.name,
            "linked_asset_name": account.name,
        },
    ]
    res = _post_rows(client, rows)
    assert res.status_code == 200
    assert res.json()["imported"] == 4
    assert res.json()["skipped"] == 0


def test_skips_missing_fields(client, db):
    rows = [
        {"date": "", "description": "No date", "amount": "10"},
        {"date": "2026-04-10", "description": "", "amount": "10"},
        {"date": "2026-04-10", "description": "No amount", "amount": ""},
    ]
    res = _post_rows(client, rows)
    assert res.status_code == 200
    assert res.json()["imported"] == 0
    assert res.json()["skipped"] == 3


def test_skips_zero_amount(client, db):
    res = _post_rows(
        client, [{"date": "2026-04-10", "description": "Free", "amount": "0"}]
    )
    assert res.status_code == 200
    assert res.json()["imported"] == 0
    assert res.json()["skipped"] == 1


def test_invalid_date_reports_error(client, db):
    res = _post_rows(
        client, [{"date": "not-a-date", "description": "Bad", "amount": "10"}]
    )
    assert res.status_code == 200
    data = res.json()
    assert data["skipped"] == 1
    assert len(data["errors"]) == 1
    assert "Row 1" in data["errors"][0]


def test_amount_comma_decimal(client, expense_cat, test_user):
    account = _bank_account(test_user)
    res = _post_rows(
        client,
        [
            {
                "date": "2026-04-10",
                "description": "Coffee",
                "amount": "2,50",
                "category_name": expense_cat.name,
                "linked_asset_name": account.name,
            }
        ],
    )
    assert res.status_code == 200
    assert res.json()["imported"] == 1
    exp = Expense.objects.get(description="Coffee")
    assert float(exp.amount) == 2.50


def test_import_csv_category_by_id(client, expense_cat, test_user):
    account = _bank_account(test_user)
    res = _post_rows(
        client,
        [
            {
                "date": "2026-04-10",
                "description": "Lunch",
                "amount": "15",
                "category_id": str(expense_cat.id),
                "linked_asset": str(account.id),
            }
        ],
    )
    assert res.status_code == 200
    assert res.json()["imported"] == 1
    exp = Expense.objects.get(description="Lunch")
    assert exp.category_id == expense_cat.id


def test_import_csv_category_id_wrong_owner(client, db):
    from django.contrib.auth.models import User

    other_user = User.objects.create_user(username="other_owner", password="pw")
    other_cat = Category.objects.create(name="Other", owner=other_user)
    res = _post_rows(
        client,
        [
            {
                "date": "2026-04-10",
                "description": "Stolen",
                "amount": "10",
                "category_id": str(other_cat.id),
            }
        ],
    )
    assert res.status_code == 200
    data = res.json()
    assert data["imported"] == 0
    assert data["skipped"] == 1
    assert data["skipped_details"] == [f"Row 1: category id '{other_cat.id}' not found"]
    assert not Expense.objects.filter(description="Stolen").exists()


# ── Regression: import CSV non deve usare le categorie di altri utenti ────────


def test_import_csv_category_scoped_to_owner(client, db, test_user):
    """
    La categoria deve essere matchata solo nell'owner corrente.
    Prima del fix, veniva usata la categoria di un altro utente.
    """
    from django.contrib.auth.models import User

    other_user = User.objects.create_user(username="other2", password="pw")
    # Crea una categoria con lo stesso nome ma appartenente a un altro utente
    Category.objects.create(name="Viaggi", owner=other_user)

    # L'utente corrente non ha questa categoria
    res = _post_rows(
        client,
        [
            {
                "date": "2026-04-10",
                "description": "Volo",
                "amount": "200",
                "category": "Viaggi",
            }
        ],
    )
    assert res.status_code == 200
    data = res.json()
    assert data["imported"] == 0
    assert data["skipped"] == 1
    assert data["skipped_details"] == ["Row 1: category 'Viaggi' not found"]
    assert not Expense.objects.filter(description="Volo").exists()


def test_import_csv_category_type_expense_matches(client, expense_cat, test_user):
    account = _bank_account(test_user)
    res = _post_rows(
        client,
        [
            {
                "date": "2026-04-10",
                "description": "Dinner",
                "amount": "20",
                "category_id": str(expense_cat.id),
                "category_type": "expense",
                "linked_asset_name": account.name,
            }
        ],
    )
    assert res.status_code == 200
    assert res.json()["imported"] == 1
    exp = Expense.objects.get(description="Dinner")
    assert exp.category_id == expense_cat.id


def test_import_csv_category_name_income_matches_type(client, income_cat, test_user):
    account = _bank_account(test_user)
    res = _post_rows(
        client,
        [
            {
                "date": "2026-04-10",
                "description": "Salary Imported",
                "amount": "2000",
                "category_name": "SALARY",
                "category_type": "income",
                "linked_asset_name": account.name,
            }
        ],
    )
    assert res.status_code == 200
    assert res.json()["imported"] == 1
    exp = Expense.objects.get(description="Salary Imported")
    assert exp.category_id == income_cat.id


def test_import_csv_category_name_filters_by_type(client, test_user):
    account = _bank_account(test_user)
    Category.objects.create(
        name="Bonus", category_type=Category.EXPENSE, owner=test_user
    )
    income = Category.objects.create(
        name="Bonus", category_type=Category.INCOME, owner=test_user
    )
    res = _post_rows(
        client,
        [
            {
                "date": "2026-04-10",
                "description": "Bonus Imported",
                "amount": "500",
                "category_name": "Bonus",
                "category_type": "income",
                "linked_asset_name": account.name,
            }
        ],
    )
    assert res.status_code == 200
    assert res.json()["imported"] == 1
    exp = Expense.objects.get(description="Bonus Imported")
    assert exp.category_id == income.id


def test_import_csv_income_subcategory_account_and_unverified_status(client, test_user):
    salary = Category.objects.create(
        name="Salary", category_type=Category.INCOME, owner=test_user
    )
    father = Category.objects.create(
        name="Father",
        category_type=Category.INCOME,
        parent=salary,
        owner=test_user,
    )
    account_type = InvestmentType.objects.create(
        name="Bank", is_bank_account=True, owner=test_user
    )
    account = Asset.objects.create(
        name="Fineco",
        investment_type=account_type,
        tracking_type=Asset.MANUAL,
        owner=test_user,
    )

    res = _post_rows(
        client,
        [
            {
                "date": "27/09/2023",
                "description": "",
                "amount": "500,00 €",
                "category_name": "Father",
                "category_type": "income",
                "linked_asset_name": "Fineco",
                "is_verified": "Unverified",
            }
        ],
    )

    assert res.status_code == 200
    assert res.json()["imported"] == 1
    exp = Expense.objects.get(description="Father")
    assert exp.category_id == father.id
    assert exp.linked_asset_id == account.id
    assert exp.is_verified is False
    assert exp.amount == 500


def test_import_csv_unknown_account_skips_row(client, income_cat):
    res = _post_rows(
        client,
        [
            {
                "date": "2026-04-10",
                "description": "Salary Imported",
                "amount": "100",
                "category_name": "Salary",
                "category_type": "income",
                "linked_asset_name": "Missing Bank",
            }
        ],
    )

    assert res.status_code == 200
    data = res.json()
    assert data["imported"] == 0
    assert data["skipped"] == 1
    assert data["skipped_details"] == ["Row 1: account 'Missing Bank' not found"]
    assert data["warnings"] == []
    assert not Expense.objects.filter(description="Salary Imported").exists()


def test_import_csv_missing_account_skips_row(client, income_cat):
    res = _post_rows(
        client,
        [
            {
                "date": "2026-04-10",
                "description": "No Account",
                "amount": "100",
                "category_name": "Salary",
                "category_type": "income",
            }
        ],
    )

    assert res.status_code == 200
    data = res.json()
    assert data["imported"] == 0
    assert data["skipped"] == 1
    assert data["skipped_details"] == ["Row 1: account is required"]
    assert not Expense.objects.filter(description="No Account").exists()


def test_import_csv_category_type_mismatch_skips_row(client, expense_cat):
    res = _post_rows(
        client,
        [
            {
                "date": "2026-04-10",
                "description": "Salary Imported",
                "amount": "2000",
                "category_id": str(expense_cat.id),
                "category_type": "income",
            }
        ],
    )
    assert res.status_code == 200
    data = res.json()
    assert data["imported"] == 0
    assert data["skipped"] == 1
    assert data["skipped_details"] == [
        f"Row 1: category 'id {expense_cat.id}' does not match type 'income'"
    ]
    assert not Expense.objects.filter(description="Salary Imported").exists()


def test_import_csv_supports_is_verified(client, income_cat, test_user):
    account = _bank_account(test_user)
    res = _post_rows(
        client,
        [
            {
                "date": "2026-04-10",
                "description": "Verified income",
                "amount": "100",
                "category_name": income_cat.name,
                "category_type": "income",
                "linked_asset_name": account.name,
                "is_verified": "true",
            }
        ],
    )
    assert res.status_code == 200
    assert res.json()["imported"] == 1
    exp = Expense.objects.get(description="Verified income")
    assert exp.is_verified is True


def test_import_csv_batch_creates_shadow_transactions_and_recomputes_account(
    client, expense_cat, income_cat, test_user
):
    account = _bank_account(test_user)
    res = _post_rows(
        client,
        [
            {
                "date": "2026-04-10",
                "description": "Groceries",
                "amount": "10",
                "category_name": expense_cat.name,
                "category_type": "expense",
                "linked_asset": str(account.id),
                "is_verified": "true",
            },
            {
                "date": "2026-04-11",
                "description": "Salary",
                "amount": "30",
                "category_name": income_cat.name,
                "category_type": "income",
                "linked_asset": str(account.id),
                "is_verified": "true",
            },
        ],
    )

    assert res.status_code == 200
    data = res.json()
    assert data["imported"] == 2
    assert data["skipped"] == 0

    expenses = Expense.objects.order_by("date")
    assert expenses.count() == 2
    txs = AssetTransaction.objects.filter(
        source_expense__in=expenses,
        asset=account,
    ).order_by("date")
    assert list(txs.values_list("transaction_type", "price_per_share")) == [
        (AssetTransaction.CASH_OUT, Decimal("10.0000")),
        (AssetTransaction.CASH_IN, Decimal("30.0000")),
    ]

    account.refresh_from_db()
    assert account.current_value == Decimal("20.00")
    assert AssetPriceHistory.objects.filter(asset=account).exists()


def test_import_csv_refreshes_each_touched_account_once(
    client, expense_cat, test_user, monkeypatch
):
    account = _bank_account(test_user)
    calls = []

    def fake_refresh(asset):
        calls.append(asset.pk)

    monkeypatch.setattr("portfolio.services._refresh_manual_asset_strict", fake_refresh)

    res = _post_rows(
        client,
        [
            {
                "date": "2026-04-10",
                "description": "One",
                "amount": "1",
                "category_name": expense_cat.name,
                "linked_asset": str(account.id),
            },
            {
                "date": "2026-04-11",
                "description": "Two",
                "amount": "2",
                "category_name": expense_cat.name,
                "linked_asset": str(account.id),
            },
            {
                "date": "2026-04-12",
                "description": "Three",
                "amount": "3",
                "category_name": expense_cat.name,
                "linked_asset": str(account.id),
            },
        ],
    )

    assert res.status_code == 200
    assert res.json()["imported"] == 3
    assert calls == [account.pk]


def test_import_csv_rolls_back_when_final_asset_refresh_fails(
    client, expense_cat, test_user, monkeypatch
):
    account = _bank_account(test_user)

    def fail_refresh(asset):
        raise RuntimeError("refresh failed")

    monkeypatch.setattr("portfolio.services._refresh_manual_asset_strict", fail_refresh)

    with pytest.raises(RuntimeError):
        _post_rows(
            client,
            [
                {
                    "date": "2026-04-10",
                    "description": "Rollback",
                    "amount": "10",
                    "category_name": expense_cat.name,
                    "linked_asset": str(account.id),
                }
            ],
        )

    assert not Expense.objects.filter(description="Rollback").exists()
    assert not AssetTransaction.objects.filter(asset=account).exists()
