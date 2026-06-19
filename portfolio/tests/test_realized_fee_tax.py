from datetime import date
from decimal import Decimal

import pytest

from portfolio.models import Asset, AssetTransaction, InvestmentType
from portfolio.serializers import AssetTransactionSerializer
from portfolio.services import (
    create_transaction,
    patch_transaction,
    realize_manual_asset,
    remaining_tax_cost_basis,
    resync_asset_tax,
    tax_cost_basis_for_sell,
)
from portfolio.views.transactions_feed import _portfolio_tx_realized_tax


def _serializer(payload, instance=None):
    serializer = AssetTransactionSerializer(
        instance, data=payload, partial=instance is not None
    )
    serializer.is_valid(raise_exception=True)
    return serializer


@pytest.fixture
def bank_account(test_user):
    bank_type = InvestmentType.objects.create(
        name="Bank",
        supports_ticker=False,
        is_bank_account=True,
        owner=test_user,
    )
    account = Asset.objects.create(
        name="Broker cash",
        tracking_type=Asset.MANUAL,
        investment_type=bank_type,
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=account,
        transaction_type=AssetTransaction.CASH_IN,
        date=date(2026, 1, 1),
        shares=Decimal("1"),
        price_per_share=Decimal("10000"),
        is_verified=True,
        owner=test_user,
    )
    account.recompute_from_transactions()
    account.refresh_from_db()
    return account


@pytest.fixture
def taxable_asset(test_user):
    inv_type = InvestmentType.objects.create(
        name="ETF",
        supports_ticker=True,
        tax_rate=Decimal("0.2600"),
        owner=test_user,
    )
    return Asset.objects.create(
        name="Taxable ETF",
        tracking_type=Asset.AUTO,
        investment_type=inv_type,
        owner=test_user,
    )


def test_buy_with_fee_debits_account_without_increasing_cost_basis(
    taxable_asset, bank_account, test_user
):
    tx, extra = create_transaction(
        taxable_asset,
        _serializer(
            {
                "transaction_type": "buy",
                "date": "2026-01-10",
                "shares": "10",
                "price_per_share": "100",
                "fee": "5",
                "is_verified": True,
            }
        ),
        source_account_id=bank_account.pk,
        owner=test_user,
    )

    taxable_asset.refresh_from_db()
    bank_account.refresh_from_db()

    assert extra == {}
    assert taxable_asset.invested_capital == Decimal("1000.00")
    assert remaining_tax_cost_basis(taxable_asset) == Decimal("1005.00")
    assert bank_account.current_value == Decimal("8995.00")
    assert tx.derived_txs.get(
        derived_kind=AssetTransaction.DERIVED_FEE
    ).price_per_share == Decimal("5.0000")
    assert tx.derived_txs.get(
        derived_kind=AssetTransaction.DERIVED_PRINCIPAL
    ).price_per_share == Decimal("1000.0000")


def test_sell_with_gain_debits_fee_and_realized_tax(
    taxable_asset, bank_account, test_user
):
    create_transaction(
        taxable_asset,
        _serializer(
            {
                "transaction_type": "buy",
                "date": "2026-01-10",
                "shares": "10",
                "price_per_share": "100",
                "is_verified": True,
            }
        ),
        owner=test_user,
    )

    tx, _ = create_transaction(
        taxable_asset,
        _serializer(
            {
                "transaction_type": "sell",
                "date": "2026-02-10",
                "shares": "5",
                "price_per_share": "120",
                "fee": "10",
                "is_verified": True,
            }
        ),
        dest_account_id=bank_account.pk,
        owner=test_user,
    )

    bank_account.refresh_from_db()
    tx.refresh_from_db()

    assert tx.tax_amount == Decimal("23.40")
    assert bank_account.current_value == Decimal("10566.60")
    assert tx.derived_txs.get(
        derived_kind=AssetTransaction.DERIVED_TAX
    ).price_per_share == Decimal("23.4000")


def test_sell_tax_uses_gain_after_buy_and_sell_fees(
    taxable_asset, bank_account, test_user
):
    create_transaction(
        taxable_asset,
        _serializer(
            {
                "transaction_type": "buy",
                "date": "2026-01-10",
                "shares": "15",
                "price_per_share": "151.3867",
                "fee": "1",
                "is_verified": True,
            }
        ),
        owner=test_user,
    )

    tx, _ = create_transaction(
        taxable_asset,
        _serializer(
            {
                "transaction_type": "sell",
                "date": "2026-02-10",
                "shares": "15",
                "price_per_share": "152.94",
                "fee": "1",
                "is_verified": True,
            }
        ),
        dest_account_id=bank_account.pk,
        owner=test_user,
    )

    bank_account.refresh_from_db()
    tx.refresh_from_db()

    assert tx.tax_amount == Decimal("5.54")
    assert bank_account.current_value == Decimal("12287.56")


def test_sell_tax_matches_broker_case_with_buy_fee(
    taxable_asset, bank_account, test_user
):
    create_transaction(
        taxable_asset,
        _serializer(
            {
                "transaction_type": "buy",
                "date": "2026-06-12",
                "shares": "15",
                "price_per_share": "151.32",
                "fee": "1",
                "is_verified": True,
            }
        ),
        owner=test_user,
    )

    tx, _ = create_transaction(
        taxable_asset,
        _serializer(
            {
                "transaction_type": "sell",
                "date": "2026-06-15",
                "shares": "15",
                "price_per_share": "152.94",
                "fee": "1",
                "is_verified": True,
            }
        ),
        dest_account_id=bank_account.pk,
        owner=test_user,
    )

    bank_account.refresh_from_db()
    tx.refresh_from_db()

    assert tx.tax_amount == Decimal("5.80")
    assert bank_account.current_value == Decimal("12287.30")


def test_crypto_sell_uses_fifo_tax_lots(test_user):
    inv_type = InvestmentType.objects.create(
        name="Crypto",
        supports_ticker=True,
        tax_rate=Decimal("0.2600"),
        owner=test_user,
    )
    asset = Asset.objects.create(
        name="Bitcoin",
        tracking_type=Asset.AUTO,
        investment_type=inv_type,
        tax=Asset.TAX_CRYPTO,
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=asset,
        transaction_type=AssetTransaction.BUY,
        date=date(2026, 1, 1),
        shares=Decimal("1"),
        price_per_share=Decimal("100"),
        fee=Decimal("2"),
        is_verified=True,
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=asset,
        transaction_type=AssetTransaction.BUY,
        date=date(2026, 1, 2),
        shares=Decimal("1"),
        price_per_share=Decimal("200"),
        is_verified=True,
        owner=test_user,
    )
    sell = AssetTransaction.objects.create(
        asset=asset,
        transaction_type=AssetTransaction.SELL,
        date=date(2026, 1, 3),
        shares=Decimal("1"),
        price_per_share=Decimal("300"),
        is_verified=True,
        owner=test_user,
    )

    assert tax_cost_basis_for_sell(asset, sell) == Decimal("102")
    assert remaining_tax_cost_basis(asset) == Decimal("200.00")


def test_manual_sell_tax_overrides_estimated_tax(
    taxable_asset, bank_account, test_user
):
    create_transaction(
        taxable_asset,
        _serializer(
            {
                "transaction_type": "buy",
                "date": "2026-06-12",
                "shares": "15",
                "price_per_share": "151.32",
                "fee": "1",
                "is_verified": True,
            }
        ),
        owner=test_user,
    )

    tx, _ = create_transaction(
        taxable_asset,
        _serializer(
            {
                "transaction_type": "sell",
                "date": "2026-06-15",
                "shares": "15",
                "price_per_share": "152.94",
                "fee": "1",
                "tax_amount": "5.54",
                "tax_amount_is_manual": True,
                "is_verified": True,
            }
        ),
        dest_account_id=bank_account.pk,
        owner=test_user,
    )

    bank_account.refresh_from_db()
    tx.refresh_from_db()

    assert tx.tax_amount == Decimal("5.54")
    assert tx.tax_amount_is_manual is True
    assert tx.derived_txs.get(
        derived_kind=AssetTransaction.DERIVED_TAX
    ).price_per_share == Decimal("5.5400")
    assert bank_account.current_value == Decimal("12287.56")


def test_patch_sell_recalculates_fee_and_tax(taxable_asset, bank_account, test_user):
    create_transaction(
        taxable_asset,
        _serializer(
            {
                "transaction_type": "buy",
                "date": "2026-01-10",
                "shares": "10",
                "price_per_share": "100",
                "is_verified": True,
            }
        ),
        owner=test_user,
    )
    tx, _ = create_transaction(
        taxable_asset,
        _serializer(
            {
                "transaction_type": "sell",
                "date": "2026-02-10",
                "shares": "5",
                "price_per_share": "120",
                "fee": "10",
                "is_verified": True,
            }
        ),
        dest_account_id=bank_account.pk,
        owner=test_user,
    )

    patch_transaction(
        tx,
        _serializer({"price_per_share": "130", "fee": "20"}, instance=tx),
        owner=test_user,
    )

    tx.refresh_from_db()
    bank_account.refresh_from_db()

    assert tx.tax_amount == Decimal("33.80")
    assert tx.derived_txs.get(
        derived_kind=AssetTransaction.DERIVED_FEE
    ).price_per_share == Decimal("20.0000")
    assert bank_account.current_value == Decimal("10596.20")


def test_patch_sell_preserves_manual_tax(taxable_asset, bank_account, test_user):
    create_transaction(
        taxable_asset,
        _serializer(
            {
                "transaction_type": "buy",
                "date": "2026-01-10",
                "shares": "10",
                "price_per_share": "100",
                "is_verified": True,
            }
        ),
        owner=test_user,
    )
    tx, _ = create_transaction(
        taxable_asset,
        _serializer(
            {
                "transaction_type": "sell",
                "date": "2026-02-10",
                "shares": "5",
                "price_per_share": "120",
                "fee": "10",
                "tax_amount": "20",
                "tax_amount_is_manual": True,
                "is_verified": True,
            }
        ),
        dest_account_id=bank_account.pk,
        owner=test_user,
    )

    patch_transaction(
        tx,
        _serializer({"price_per_share": "130"}, instance=tx),
        owner=test_user,
    )

    tx.refresh_from_db()
    bank_account.refresh_from_db()

    assert tx.tax_amount == Decimal("20.00")
    assert tx.tax_amount_is_manual is True
    assert tx.derived_txs.get(
        derived_kind=AssetTransaction.DERIVED_TAX
    ).price_per_share == Decimal("20.0000")
    assert bank_account.current_value == Decimal("10620.00")


def _make_sell(taxable_asset, bank_account, test_user, **overrides):
    create_transaction(
        taxable_asset,
        _serializer(
            {
                "transaction_type": "buy",
                "date": "2026-06-12",
                "shares": "15",
                "price_per_share": "151.32",
                "fee": "1",
                "is_verified": True,
            }
        ),
        owner=test_user,
    )
    payload = {
        "transaction_type": "sell",
        "date": "2026-06-15",
        "shares": "15",
        "price_per_share": "152.94",
        "fee": "1",
        "is_verified": True,
    }
    payload.update(overrides)
    tx, _ = create_transaction(
        taxable_asset,
        _serializer(payload),
        dest_account_id=bank_account.pk,
        owner=test_user,
    )
    tx.refresh_from_db()
    return tx


def test_feed_tax_is_snapshot_immune_to_later_rate_change(
    taxable_asset, bank_account, test_user
):
    # Auto sell snapshots tax at the rate in force when it was created (26%).
    tx = _make_sell(taxable_asset, bank_account, test_user)
    assert tx.tax_amount == Decimal("5.80")

    # Bumping the type's rate afterwards must NOT retroactively change the feed
    # value: the snapshot is frozen until an explicit propagation.
    taxable_asset.investment_type.tax_rate = Decimal("0.5000")
    taxable_asset.investment_type.save(update_fields=["tax_rate"])
    tx.refresh_from_db()

    assert tx.tax_amount == Decimal("5.80")
    assert _portfolio_tx_realized_tax(tx) == Decimal("5.80")


def test_resync_asset_tax_updates_auto_and_preserves_manual(
    taxable_asset, bank_account, test_user
):
    auto = _make_sell(taxable_asset, bank_account, test_user)
    assert auto.tax_amount == Decimal("5.80")

    # Raise the type's rate and propagate to existing transactions.
    taxable_asset.investment_type.tax_rate = Decimal("0.5000")
    taxable_asset.investment_type.save(update_fields=["tax_rate"])
    taxable_asset.refresh_from_db()
    changed = resync_asset_tax(taxable_asset)

    auto.refresh_from_db()
    assert changed == 1
    # 5.80 was 26% of the taxable gain; at 50% it scales to ~11.15.
    assert auto.tax_amount == Decimal("11.15")
    # The derived tax cash movement (account balance) follows the new snapshot.
    assert auto.derived_txs.get(
        derived_kind=AssetTransaction.DERIVED_TAX
    ).price_per_share == Decimal("11.1500")


def test_resync_asset_tax_leaves_manual_override_untouched(
    taxable_asset, bank_account, test_user
):
    manual = _make_sell(
        taxable_asset,
        bank_account,
        test_user,
        tax_amount="3.00",
        tax_amount_is_manual=True,
    )
    assert manual.tax_amount == Decimal("3.00")

    taxable_asset.investment_type.tax_rate = Decimal("0.5000")
    taxable_asset.investment_type.save(update_fields=["tax_rate"])
    taxable_asset.refresh_from_db()
    changed = resync_asset_tax(taxable_asset)

    manual.refresh_from_db()
    assert changed == 0
    assert manual.tax_amount == Decimal("3.00")
    assert manual.tax_amount_is_manual is True


def test_realize_manual_asset_archives_and_credits_net_proceeds(
    itype_no_ticker, bank_account, test_user
):
    asset = Asset.objects.create(
        name="Watch",
        tracking_type=Asset.MANUAL,
        investment_type=itype_no_ticker,
        tax_rate_override=Decimal("0.2600"),
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=asset,
        transaction_type=AssetTransaction.CASH_IN,
        date=date(2026, 1, 1),
        shares=Decimal("1"),
        price_per_share=Decimal("1000"),
        is_verified=True,
        owner=test_user,
    )
    asset.recompute_from_transactions()

    tx = realize_manual_asset(
        asset,
        sale_price=Decimal("1500"),
        dest_account_id=bank_account.pk,
        fee=Decimal("50"),
        owner=test_user,
    )

    asset.refresh_from_db()
    bank_account.refresh_from_db()
    tx.refresh_from_db()

    assert tx.tax_amount == Decimal("117.00")
    assert asset.current_value == Decimal("0.00")
    assert asset.invested_capital == Decimal("0.00")
    assert asset.invested_capital_eur == Decimal("0.00")
    assert asset.is_archived is True
    assert bank_account.current_value == Decimal("11333.00")
