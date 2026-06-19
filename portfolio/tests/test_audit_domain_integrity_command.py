from datetime import date
from decimal import Decimal

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import IntegrityError, transaction

from portfolio.models import Asset, AssetPriceHistory, AssetTransaction, InvestmentType
from expenses.models import Category, Expense


def test_audit_domain_integrity_accepts_clean_database(db):
    call_command("audit_domain_integrity")


def test_audit_domain_integrity_accepts_fee_and_tax_derived_rows(db, test_user):
    bank_type = InvestmentType.objects.create(
        name="Bank", owner=test_user, is_bank_account=True, supports_ticker=False
    )
    asset_type = InvestmentType.objects.create(name="ETF", owner=test_user)
    account = Asset.objects.create(
        name="Cash",
        investment_type=bank_type,
        tracking_type=Asset.MANUAL,
        owner=test_user,
    )
    asset = Asset.objects.create(
        name="ETF",
        investment_type=asset_type,
        owner=test_user,
    )
    buy = AssetTransaction.objects.create(
        asset=asset,
        transaction_type=AssetTransaction.BUY,
        date=date(2026, 1, 15),
        shares=Decimal("10"),
        price_per_share=Decimal("100"),
        fee=Decimal("5.00"),
        is_verified=True,
        owner=test_user,
    )
    sell = AssetTransaction.objects.create(
        asset=asset,
        transaction_type=AssetTransaction.SELL,
        date=date(2026, 2, 15),
        shares=Decimal("5"),
        price_per_share=Decimal("120"),
        fee=Decimal("10.00"),
        tax_amount=Decimal("23.40"),
        is_verified=True,
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=account,
        transaction_type=AssetTransaction.CASH_OUT,
        date=buy.date,
        shares=Decimal("1"),
        price_per_share=Decimal("1000.00"),
        derived_from=buy,
        derived_kind=AssetTransaction.DERIVED_PRINCIPAL,
        is_verified=True,
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=account,
        transaction_type=AssetTransaction.CASH_OUT,
        date=buy.date,
        shares=Decimal("1"),
        price_per_share=Decimal("5.00"),
        derived_from=buy,
        derived_kind=AssetTransaction.DERIVED_FEE,
        is_verified=True,
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=account,
        transaction_type=AssetTransaction.CASH_IN,
        date=sell.date,
        shares=Decimal("1"),
        price_per_share=Decimal("600.00"),
        derived_from=sell,
        derived_kind=AssetTransaction.DERIVED_PRINCIPAL,
        is_verified=True,
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=account,
        transaction_type=AssetTransaction.CASH_OUT,
        date=sell.date,
        shares=Decimal("1"),
        price_per_share=Decimal("10.00"),
        derived_from=sell,
        derived_kind=AssetTransaction.DERIVED_FEE,
        is_verified=True,
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=account,
        transaction_type=AssetTransaction.CASH_OUT,
        date=sell.date,
        shares=Decimal("1"),
        price_per_share=Decimal("23.40"),
        derived_from=sell,
        derived_kind=AssetTransaction.DERIVED_TAX,
        is_verified=True,
        owner=test_user,
    )

    call_command("audit_domain_integrity")


def test_schema_rejects_ownerless_asset(db):
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Asset.objects.create(name="Ownerless")


def test_schema_rejects_ownerless_child_rows(db, test_user):
    inv_type = InvestmentType.objects.create(name="ETF", owner=test_user)
    asset = Asset.objects.create(
        name="Owned", investment_type=inv_type, owner=test_user
    )
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            AssetTransaction.objects.create(
                asset=asset,
                transaction_type=AssetTransaction.BUY,
                date=date(2026, 1, 1),
                shares=Decimal("1"),
                price_per_share=Decimal("100"),
            )
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            AssetPriceHistory.objects.create(
                asset=asset,
                date=date(2026, 1, 1),
                close=Decimal("100"),
            )


def test_audit_domain_integrity_rejects_shadow_verification_mismatch(db, test_user):
    cat = Category.objects.create(name="Food", owner=test_user)
    inv_type = InvestmentType.objects.create(
        name="Bank", owner=test_user, is_bank_account=True, supports_ticker=False
    )
    account = Asset.objects.create(
        name="Cash",
        investment_type=inv_type,
        tracking_type=Asset.MANUAL,
        owner=test_user,
    )
    expense = Expense.objects.create(
        description="Lunch",
        amount=Decimal("25.00"),
        category=cat,
        date=date(2026, 1, 15),
        linked_asset=account,
        is_verified=True,
        owner=test_user,
    )
    AssetTransaction.objects.filter(source_expense=expense).update(is_verified=False)

    with pytest.raises(CommandError, match="Domain-integrity violations"):
        call_command("audit_domain_integrity")


def test_audit_domain_integrity_repairs_shadow_transactions(db, test_user):
    cat = Category.objects.create(name="Food", owner=test_user)
    inv_type = InvestmentType.objects.create(
        name="Bank", owner=test_user, is_bank_account=True, supports_ticker=False
    )
    account = Asset.objects.create(
        name="Cash",
        investment_type=inv_type,
        tracking_type=Asset.MANUAL,
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=account,
        transaction_type=AssetTransaction.CASH_IN,
        date=date(2026, 1, 1),
        shares=Decimal("1"),
        price_per_share=Decimal("100.00"),
        is_verified=True,
        owner=test_user,
    )
    expense = Expense.objects.create(
        description="Lunch",
        amount=Decimal("25.00"),
        category=cat,
        date=date(2026, 1, 15),
        linked_asset=account,
        is_verified=True,
        owner=test_user,
    )
    AssetTransaction.objects.filter(source_expense=expense).update(is_verified=False)
    account.recompute_from_transactions()

    account.refresh_from_db()
    assert account.current_value == Decimal("100.00")

    call_command("audit_domain_integrity", apply=True)

    shadow = AssetTransaction.objects.get(source_expense=expense)
    account.refresh_from_db()
    assert shadow.is_verified is True
    assert account.current_value == Decimal("75.00")


def test_audit_domain_integrity_repairs_missing_shadow_transaction(db, test_user):
    cat = Category.objects.create(name="Food", owner=test_user)
    inv_type = InvestmentType.objects.create(
        name="Bank", owner=test_user, is_bank_account=True, supports_ticker=False
    )
    account = Asset.objects.create(
        name="Cash",
        investment_type=inv_type,
        tracking_type=Asset.MANUAL,
        owner=test_user,
    )
    expense = Expense.objects.create(
        description="Lunch",
        amount=Decimal("25.00"),
        category=cat,
        date=date(2026, 1, 15),
        linked_asset=account,
        is_verified=True,
        owner=test_user,
    )
    AssetTransaction.objects.filter(source_expense=expense).delete()

    with pytest.raises(CommandError, match="Domain-integrity violations"):
        call_command("audit_domain_integrity")

    call_command("audit_domain_integrity", apply=True)

    shadow = AssetTransaction.objects.get(source_expense=expense)
    assert shadow.asset == account
    assert shadow.transaction_type == AssetTransaction.CASH_OUT
    assert shadow.price_per_share == Decimal("25.00")
    assert shadow.is_verified is True


def test_audit_domain_integrity_repairs_derived_transaction_mismatch(db, test_user):
    bank_type = InvestmentType.objects.create(
        name="Bank", owner=test_user, is_bank_account=True, supports_ticker=False
    )
    etf_type = InvestmentType.objects.create(
        name="ETF", owner=test_user, is_bank_account=False
    )
    account = Asset.objects.create(
        name="Fineco",
        investment_type=bank_type,
        tracking_type=Asset.MANUAL,
        owner=test_user,
    )
    asset = Asset.objects.create(
        name="Pension ETF",
        investment_type=etf_type,
        tracking_type=Asset.AUTO,
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=account,
        transaction_type=AssetTransaction.CASH_IN,
        date=date(2026, 1, 1),
        shares=Decimal("1"),
        price_per_share=Decimal("100.00"),
        is_verified=True,
        owner=test_user,
    )
    buy = AssetTransaction.objects.create(
        asset=asset,
        transaction_type=AssetTransaction.BUY,
        date=date(2026, 1, 15),
        shares=Decimal("2"),
        price_per_share=Decimal("12.50"),
        is_verified=True,
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=account,
        transaction_type=AssetTransaction.CASH_OUT,
        date=buy.date,
        shares=Decimal("1"),
        price_per_share=Decimal("25.00"),
        is_verified=False,
        derived_from=buy,
        owner=test_user,
    )
    account.recompute_from_transactions()
    account.refresh_from_db()
    assert account.current_value == Decimal("100.00")

    with pytest.raises(CommandError, match="Domain-integrity violations"):
        call_command("audit_domain_integrity")

    call_command("audit_domain_integrity", apply=True)

    mirror = AssetTransaction.objects.get(derived_from=buy)
    account.refresh_from_db()
    assert mirror.is_verified is True
    assert mirror.price_per_share == Decimal("25.00")
    assert account.current_value == Decimal("75.00")
