"""Feature G — Portfolio import endpoints.

Each importer follows the same contract as the cashflow importer:
- invalid rows are reported but do NOT block valid rows
- owner scoping is enforced server-side
- response always shapes as {imported, skipped, errors}
"""

import pytest
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model

from portfolio.models import Asset, AssetTransaction, InvestmentType

User = get_user_model()


@pytest.fixture
def bank_itype(test_user):
    return InvestmentType.objects.create(
        name="Bank",
        is_bank_account=True,
        is_liquid_default=True,
        owner=test_user,
    )


# ── /import-assets/ ─────────────────────────────────────────────────────────


def test_import_assets_happy_path(client, itype, test_user):
    existing = Asset.objects.create(
        name="VWCE",
        isin="IE00BK5BQT80",
        tracking_type="AUTO",
        investment_type=itype,
        owner=test_user,
    )
    rows = [
        {
            "name": "VWCE",
            "isin": "IE00BK5BQT80",
            "segno": "A",
            "date": "2026-03-15",
            "shares": "5",
            "price_per_share": "120.50",
            "notes": "Import test",
        }
    ]
    res = client.post(
        "/api/portfolio/import-assets/",
        data={"rows": rows},
        content_type="application/json",
    )
    assert res.status_code == 200
    body = res.json()
    assert body["imported"] == 1
    assert body["skipped"] == 0
    assert len(body["imported_rows"]) == 1
    assert body["imported_rows"][0]["row"] == 1
    assert body["imported_rows"][0]["asset_name"] == "VWCE"
    tx = AssetTransaction.objects.get(asset=existing)
    assert tx.transaction_type == AssetTransaction.BUY
    assert tx.shares == Decimal("5")
    assert tx.price_per_share == Decimal("120.50")


def test_import_assets_accepts_transaction_type(client, itype, test_user):
    existing = Asset.objects.create(
        name="SP500",
        isin="IE00B5BMR087",
        tracking_type="AUTO",
        investment_type=itype,
        owner=test_user,
    )
    rows = [
        {
            "name": "SP500",
            "isin": "IE00B5BMR087",
            "transaction_type": "buy",
            "date": "2026-04-01",
            "shares": "1.5",
            "price_per_share": "99.99",
        }
    ]
    res = client.post(
        "/api/portfolio/import-assets/",
        data={"rows": rows},
        content_type="application/json",
    )
    assert res.status_code == 200
    body = res.json()
    assert body["imported"] == 1
    assert body["skipped"] == 0
    tx = AssetTransaction.objects.get(asset=existing)
    assert tx.transaction_type == AssetTransaction.BUY
    assert tx.shares == Decimal("1.5")
    assert tx.price_per_share == Decimal("99.99")


def test_import_assets_buy_with_source_account_creates_cash_out(
    client, itype, bank_itype, test_user
):
    existing = Asset.objects.create(
        name="Core ETF",
        isin="IE00TESTBUY01",
        tracking_type="AUTO",
        investment_type=itype,
        owner=test_user,
    )
    bank = Asset.objects.create(
        name="Main Bank",
        tracking_type="MANUAL",
        investment_type=bank_itype,
        owner=test_user,
    )
    rows = [
        {
            "name": "Core ETF",
            "isin": "IE00TESTBUY01",
            "transaction_type": "buy",
            "date": "2026-04-02",
            "shares": "2",
            "price_per_share": "100",
            "source_account_id": str(bank.id),
        }
    ]
    res = client.post(
        "/api/portfolio/import-assets/",
        data={"rows": rows},
        content_type="application/json",
    )
    assert res.status_code == 200
    body = res.json()
    assert body["imported"] == 1
    assert body["skipped"] == 0
    buy_tx = AssetTransaction.objects.get(
        asset=existing, transaction_type=AssetTransaction.BUY
    )
    cash_out = AssetTransaction.objects.get(
        asset=bank,
        transaction_type=AssetTransaction.CASH_OUT,
        derived_from=buy_tx,
    )
    assert cash_out.price_per_share == Decimal("200")


def test_import_assets_buy_with_source_account_name(
    client, itype, bank_itype, test_user
):
    existing = Asset.objects.create(
        name="Core ETF",
        isin="IE00TESTNAME1",
        tracking_type="AUTO",
        investment_type=itype,
        owner=test_user,
    )
    bank = Asset.objects.create(
        name="Fineco",
        tracking_type="MANUAL",
        investment_type=bank_itype,
        owner=test_user,
    )
    rows = [
        {
            "name": "Core ETF",
            "isin": "IE00TESTNAME1",
            "transaction_type": "buy",
            "date": "2026-04-03",
            "shares": "2",
            "price_per_share": "100",
            "source_account_id": "Fineco",
        }
    ]
    res = client.post(
        "/api/portfolio/import-assets/",
        data={"rows": rows},
        content_type="application/json",
    )
    assert res.status_code == 200
    body = res.json()
    assert body["imported"] == 1, body
    buy_tx = AssetTransaction.objects.get(
        asset=existing, transaction_type=AssetTransaction.BUY
    )
    cash_out = AssetTransaction.objects.get(
        asset=bank, transaction_type=AssetTransaction.CASH_OUT, derived_from=buy_tx
    )
    assert cash_out.price_per_share == Decimal("200")


def test_import_assets_buy_with_debit_from_account_column(
    client, itype, bank_itype, test_user
):
    existing = Asset.objects.create(
        name="Core ETF",
        isin="IE00TESTDBT01",
        tracking_type="AUTO",
        investment_type=itype,
        owner=test_user,
    )
    bank = Asset.objects.create(
        name="Fineco",
        tracking_type="MANUAL",
        investment_type=bank_itype,
        owner=test_user,
    )
    rows = [
        {
            "name": "Core ETF",
            "isin": "IE00TESTDBT01",
            "transaction_type": "buy",
            "date": "2026-04-04",
            "shares": "3",
            "price_per_share": "50",
            "debit_from_account": "fineco",
        }
    ]
    res = client.post(
        "/api/portfolio/import-assets/",
        data={"rows": rows},
        content_type="application/json",
    )
    assert res.status_code == 200
    body = res.json()
    assert body["imported"] == 1, body
    buy_tx = AssetTransaction.objects.get(
        asset=existing, transaction_type=AssetTransaction.BUY
    )
    cash_out = AssetTransaction.objects.get(
        asset=bank, transaction_type=AssetTransaction.CASH_OUT, derived_from=buy_tx
    )
    assert cash_out.price_per_share == Decimal("150")


def test_import_assets_preview_duplicates_and_selective_import(
    client, itype, test_user
):
    existing = Asset.objects.create(
        name="VWCE",
        isin="IE00BK5BQT80",
        tracking_type="AUTO",
        investment_type=itype,
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=existing,
        transaction_type=AssetTransaction.BUY,
        date=date(2026, 3, 15),
        shares=Decimal("5"),
        price_per_share=Decimal("120.5"),
        owner=test_user,
    )
    rows = [
        {
            "name": "VWCE",
            "isin": "IE00BK5BQT80",
            "transaction_type": "buy",
            "date": "2026-03-15",
            "shares": "5",
            "price_per_share": "120.50",
        }
    ]
    preview = client.post(
        "/api/portfolio/import-assets/",
        data={"rows": rows, "preview_only": True},
        content_type="application/json",
    )
    assert preview.status_code == 200
    body = preview.json()
    assert body["duplicates"] == 1
    assert body["duplicate_rows"][0]["row"] == 1

    res_skip = client.post(
        "/api/portfolio/import-assets/",
        data={"rows": rows},
        content_type="application/json",
    )
    skip_body = res_skip.json()
    assert skip_body["imported"] == 0
    assert skip_body["skipped"] == 1

    res_include = client.post(
        "/api/portfolio/import-assets/",
        data={"rows": rows, "include_duplicate_rows": [1]},
        content_type="application/json",
    )
    include_body = res_include.json()
    assert include_body["imported"] == 1
    assert include_body["skipped"] == 0


def test_import_assets_rounds_price_per_share_to_2_decimals(client, itype, test_user):
    existing = Asset.objects.create(
        name="Round ETF",
        isin="IE00ROUND0001",
        tracking_type="AUTO",
        investment_type=itype,
        owner=test_user,
    )
    rows = [
        {
            "name": "Round ETF",
            "isin": "IE00ROUND0001",
            "transaction_type": "buy",
            "date": "2026-03-15",
            "shares": "1",
            "price_per_share": "120.505",
        }
    ]
    res = client.post(
        "/api/portfolio/import-assets/",
        data={"rows": rows},
        content_type="application/json",
    )
    body = res.json()
    assert body["imported"] == 1
    tx = AssetTransaction.objects.get(asset=existing)
    assert tx.price_per_share == Decimal("120.51")


def test_import_assets_truncates_shares_to_6_decimals(client, itype, test_user):
    existing = Asset.objects.create(
        name="Shares ETF",
        isin="IE00ROUND0003",
        tracking_type="AUTO",
        investment_type=itype,
        owner=test_user,
    )
    rows = [
        {
            "name": "Shares ETF",
            "isin": "IE00ROUND0003",
            "transaction_type": "buy",
            "date": "2026-03-15",
            "shares": "0.123456789",
            "price_per_share": "10",
        }
    ]
    res = client.post(
        "/api/portfolio/import-assets/",
        data={"rows": rows},
        content_type="application/json",
    )
    body = res.json()
    assert body["imported"] == 1
    tx = AssetTransaction.objects.get(asset=existing)
    assert tx.shares == Decimal("0.123456")


def test_import_assets_supports_is_verified(client, itype, test_user):
    existing = Asset.objects.create(
        name="Verified ETF",
        isin="IE00ROUND0004",
        tracking_type="AUTO",
        investment_type=itype,
        owner=test_user,
    )
    rows = [
        {
            "name": "Verified ETF",
            "isin": "IE00ROUND0004",
            "transaction_type": "buy",
            "date": "2026-03-15",
            "shares": "1",
            "price_per_share": "10",
            "is_verified": "true",
        }
    ]
    res = client.post(
        "/api/portfolio/import-assets/",
        data={"rows": rows},
        content_type="application/json",
    )
    body = res.json()
    assert body["imported"] == 1
    tx = AssetTransaction.objects.get(asset=existing)
    assert tx.is_verified is True


def test_import_assets_duplicate_detection_uses_rounded_price(client, itype, test_user):
    existing = Asset.objects.create(
        name="Dup ETF",
        isin="IE00ROUND0002",
        tracking_type="AUTO",
        investment_type=itype,
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=existing,
        transaction_type=AssetTransaction.BUY,
        date=date(2026, 3, 15),
        shares=Decimal("1"),
        price_per_share=Decimal("120.51"),
        owner=test_user,
    )
    rows = [
        {
            "name": "Dup ETF",
            "isin": "IE00ROUND0002",
            "transaction_type": "buy",
            "date": "2026-03-15",
            "shares": "1",
            "price_per_share": "120.505",
        }
    ]
    preview = client.post(
        "/api/portfolio/import-assets/",
        data={"rows": rows, "preview_only": True},
        content_type="application/json",
    )
    body = preview.json()
    assert body["duplicates"] == 1
    assert body["duplicate_rows"][0]["price_per_share"] == "120.51"


def test_import_assets_partial_failure_does_not_block_valid(client, itype):
    existing = Asset.objects.create(
        name="Good asset",
        isin="IE00TEST00001",
        tracking_type="AUTO",
        investment_type=itype,
        owner=itype.owner,
    )
    rows = [
        {"segno": "A", "date": "2026-03-15", "shares": "1", "price_per_share": "10"},
        {
            "name": "Good asset",
            "isin": "IE00TEST00001",
            "segno": "A",
            "date": "2026-03-15",
            "shares": "2",
            "price_per_share": "200,50",
        },
        {
            "name": "Good asset",
            "isin": "IE00TEST00001",
            "segno": "",
            "date": "2026-03-15",
            "shares": "1",
            "price_per_share": "50",
        },
    ]
    res = client.post(
        "/api/portfolio/import-assets/",
        data={"rows": rows},
        content_type="application/json",
    )
    body = res.json()
    assert body["imported"] == 1
    assert body["skipped"] == 2
    assert len(body["errors"]) == 2
    assert Asset.objects.filter(name="Good asset").count() == 1
    assert AssetTransaction.objects.filter(
        asset=existing,
        transaction_type=AssetTransaction.BUY,
        price_per_share=Decimal("200.5000"),
    ).exists()


def test_import_assets_rejects_other_user_investment_type(client, test_user):
    other = User.objects.create_user(username="other", password="x")
    other_type = InvestmentType.objects.create(name="Other", owner=other)
    other_asset = Asset.objects.create(
        name="Alien",
        isin="IE00ALIEN0001",
        tracking_type="AUTO",
        investment_type=other_type,
        owner=other,
    )
    res = client.post(
        "/api/portfolio/import-assets/",
        data={
            "rows": [
                {
                    "name": "Alien",
                    "isin": "IE00ALIEN0001",
                    "segno": "A",
                    "date": "2026-03-15",
                    "shares": "1",
                    "price_per_share": "100",
                }
            ]
        },
        content_type="application/json",
    )
    body = res.json()
    assert body["imported"] == 0
    assert body["skipped"] == 1
    assert not AssetTransaction.objects.filter(asset=other_asset).exists()


# ── /import-transactions/ ───────────────────────────────────────────────────


def test_import_transactions_happy_path(client, asset, test_user):
    rows = [
        {
            "asset_id": asset.id,
            "transaction_type": "buy",
            "date": "2026-03-15",
            "shares": "5",
            "price_per_share": "120.50",
        }
    ]
    res = client.post(
        "/api/portfolio/import-transactions/",
        data={"rows": rows},
        content_type="application/json",
    )
    body = res.json()
    assert body["imported"] == 1
    tx = AssetTransaction.objects.get(
        asset=asset, transaction_type="buy", date=date(2026, 3, 15)
    )
    assert tx.shares == Decimal("5")
    assert tx.price_per_share == Decimal("120.5000")
    assert tx.owner == test_user


def test_import_transactions_partial_failure(client, asset):
    rows = [
        {
            "asset_id": asset.id,
            "transaction_type": "INVALID",
            "date": "2026-03-15",
            "shares": "1",
            "price_per_share": "100",
        },
        {
            "asset_id": asset.id,
            "transaction_type": "buy",
            "date": "not-a-date",
            "shares": "1",
            "price_per_share": "100",
        },
        {
            "asset_id": asset.id,
            "transaction_type": "buy",
            "date": "15/03/2026",
            "shares": "2",
            "price_per_share": "200,50",
        },
    ]
    res = client.post(
        "/api/portfolio/import-transactions/",
        data={"rows": rows},
        content_type="application/json",
    )
    body = res.json()
    assert body["imported"] == 1
    assert body["skipped"] == 2
    assert AssetTransaction.objects.filter(
        asset=asset, price_per_share=Decimal("200.5000")
    ).exists()


def test_import_transactions_rejects_other_user_asset(client, test_user):
    other = User.objects.create_user(username="other2", password="x")
    other_type = InvestmentType.objects.create(name="X", owner=other)
    other_asset = Asset.objects.create(
        name="ALIEN", investment_type=other_type, owner=other
    )
    res = client.post(
        "/api/portfolio/import-transactions/",
        data={
            "rows": [
                {
                    "asset_id": other_asset.id,
                    "transaction_type": "buy",
                    "date": "2026-03-15",
                    "shares": "1",
                    "price_per_share": "100",
                }
            ]
        },
        content_type="application/json",
    )
    body = res.json()
    assert body["imported"] == 0
    assert body["skipped"] == 1


def test_import_transactions_truncates_shares_to_6_decimals(client, asset):
    rows = [
        {
            "asset_id": asset.id,
            "transaction_type": "buy",
            "date": "2026-03-15",
            "shares": "2.987654321",
            "price_per_share": "100",
        }
    ]
    res = client.post(
        "/api/portfolio/import-transactions/",
        data={"rows": rows},
        content_type="application/json",
    )
    body = res.json()
    assert body["imported"] == 1
    tx = AssetTransaction.objects.get(
        asset=asset, transaction_type="buy", date=date(2026, 3, 15)
    )
    assert tx.shares == Decimal("2.987654")


def test_import_transactions_supports_is_verified(client, asset):
    rows = [
        {
            "asset_id": asset.id,
            "transaction_type": "buy",
            "date": "2026-03-16",
            "shares": "1",
            "price_per_share": "100",
            "is_verified": "1",
        }
    ]
    res = client.post(
        "/api/portfolio/import-transactions/",
        data={"rows": rows},
        content_type="application/json",
    )
    body = res.json()
    assert body["imported"] == 1
    tx = AssetTransaction.objects.get(
        asset=asset, transaction_type="buy", date=date(2026, 3, 16)
    )
    assert tx.is_verified is True


# ── /import-accounts/ ───────────────────────────────────────────────────────


def test_import_accounts_happy_path(client, bank_itype, test_user):
    res = client.post(
        "/api/portfolio/import-accounts/",
        data={
            "rows": [
                {
                    "name": "Checking",
                    "investment_type_id": bank_itype.id,
                    "currency": "EUR",
                    "invested_capital": "5000.00",
                }
            ]
        },
        content_type="application/json",
    )
    body = res.json()
    assert body["imported"] == 1
    acct = Asset.objects.get(name="Checking", owner=test_user)
    assert acct.investment_type_id == bank_itype.id
    # initial CASH_IN created to mirror balance
    assert AssetTransaction.objects.filter(
        asset=acct, transaction_type="cash_in"
    ).exists()


def test_import_accounts_rejects_non_bank_type(client, itype):
    res = client.post(
        "/api/portfolio/import-accounts/",
        data={
            "rows": [
                {
                    "name": "Not a bank",
                    "investment_type_id": itype.id,  # ETF, not bank
                }
            ]
        },
        content_type="application/json",
    )
    body = res.json()
    assert body["imported"] == 0
    assert body["skipped"] == 1
    assert not Asset.objects.filter(name="Not a bank").exists()
