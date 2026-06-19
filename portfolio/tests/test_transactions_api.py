from decimal import Decimal
import json
import pytest
from django.test import Client

from portfolio.models import (
    Asset,
    AssetContributionSource,
    AssetPriceHistory,
    AssetTransaction,
    ContributionSource,
    InvestmentType,
)


@pytest.fixture
def bank_account(test_user):
    itype = InvestmentType.objects.create(
        name="CC", is_bank_account=True, supports_ticker=False, owner=test_user
    )
    acc = Asset.objects.create(
        name="Conto Corrente",
        investment_type=itype,
        tracking_type=Asset.MANUAL,
        is_liquid=True,
        invested_capital=Decimal("0"),
        current_value=Decimal("0"),
        owner=test_user,
    )
    # Seed with 1000€
    AssetTransaction.objects.create(
        asset=acc,
        transaction_type=AssetTransaction.CASH_IN,
        date="2026-01-01",
        shares=Decimal("1"),
        price_per_share=Decimal("1000"),
        is_verified=True,
        owner=test_user,
    )
    acc.recompute_from_transactions()
    return acc


@pytest.fixture
def asset(test_user):
    itype = InvestmentType.objects.create(name="ETF", owner=test_user)
    return Asset.objects.create(
        name="VWCE",
        investment_type=itype,
        is_liquid=True,
        invested_capital=Decimal("0"),
        current_value=Decimal("0"),
        price_per_share=Decimal("100.0000"),
        owner=test_user,
    )


@pytest.fixture
def contribution_source(test_user):
    return ContributionSource.objects.create(name="TFR", owner=test_user)


@pytest.fixture
def client(test_user):
    c = Client()
    c.force_login(test_user)
    return c


def _post_tx(client, asset_id, **body):
    payload = {
        "transaction_type": "buy",
        "date": "2026-01-10",
        "shares": "10",
        "price_per_share": "50",
        "notes": "",
        "is_verified": True,
    }
    payload.update(body)
    return client.post(
        f"/api/portfolio/{asset_id}/transactions/",
        data=payload,
        content_type="application/json",
    )


def _post_tx_bulk(client, payload):
    return client.post(
        "/api/portfolio/transactions/bulk/",
        data=json.dumps(payload),
        content_type="application/json",
    )


def test_create_transaction_recomputes_asset(client, asset):
    res = _post_tx(client, asset.id)
    assert res.status_code == 201
    asset.refresh_from_db()
    assert asset.shares == Decimal("10.000000")
    assert asset.invested_capital == Decimal("500.00")


def test_create_unverified_transaction_does_not_recompute_asset(client, asset):
    res = _post_tx(client, asset.id, is_verified=False)
    assert res.status_code == 201
    asset.refresh_from_db()
    assert asset.shares == Decimal("0.000000")
    assert asset.invested_capital == Decimal("0.00")


def test_create_transaction_returns_precise_decimal_total(client, asset):
    res = _post_tx(client, asset.id, shares="12.29", price_per_share="35.924")
    assert res.status_code == 201
    assert res.json()["total_value"] == "441.51"

    asset.refresh_from_db()
    assert asset.shares == Decimal("12.290000")
    assert asset.invested_capital == Decimal("441.51")


def test_create_transaction_rejects_non_positive_amount(client, asset):
    res = _post_tx(client, asset.id, price_per_share="-1")
    assert res.status_code == 400


def test_patch_transaction_recomputes_asset(client, asset):
    res = _post_tx(client, asset.id)
    tx_id = res.json()["id"]
    # Update shares from 10 to 20
    res = client.patch(
        f"/api/portfolio/{asset.id}/transactions/{tx_id}/",
        data={"shares": "20"},
        content_type="application/json",
    )
    assert res.status_code == 200
    asset.refresh_from_db()
    assert asset.shares == Decimal("20.000000")
    assert asset.invested_capital == Decimal("1000.00")


def test_delete_transaction_recomputes_asset(client, asset):
    res = _post_tx(client, asset.id)
    tx_id = res.json()["id"]
    res = client.delete(f"/api/portfolio/{asset.id}/transactions/{tx_id}/")
    assert res.status_code == 204
    asset.refresh_from_db()
    assert asset.shares == Decimal("0.000000")
    assert asset.invested_capital == Decimal("0.00")
    assert asset.current_value == Decimal("0.00")
    assert not AssetTransaction.objects.filter(pk=tx_id).exists()


def test_create_transaction_on_archived_asset_is_blocked(client, asset):
    asset.is_archived = True
    asset.save(update_fields=["is_archived"])

    res = _post_tx(client, asset.id)

    assert res.status_code == 409
    assert res.json()["error"] == "asset_archived"
    assert not AssetTransaction.objects.filter(asset=asset).exists()


def test_patch_transaction_on_archived_asset_is_blocked(client, asset):
    tx = AssetTransaction.objects.create(
        asset=asset,
        owner=asset.owner,
        transaction_type=AssetTransaction.BUY,
        date="2026-01-10",
        shares=Decimal("1"),
        price_per_share=Decimal("100"),
        is_verified=False,
    )
    asset.is_archived = True
    asset.save(update_fields=["is_archived"])

    res = client.patch(
        f"/api/portfolio/{asset.id}/transactions/{tx.id}/",
        data={"is_verified": True},
        content_type="application/json",
    )

    assert res.status_code == 409
    assert res.json()["error"] == "asset_archived"
    tx.refresh_from_db()
    assert tx.is_verified is False


def test_delete_transaction_on_archived_asset_is_blocked(client, asset):
    tx = AssetTransaction.objects.create(
        asset=asset,
        owner=asset.owner,
        transaction_type=AssetTransaction.BUY,
        date="2026-01-10",
        shares=Decimal("1"),
        price_per_share=Decimal("100"),
        is_verified=False,
    )
    asset.is_archived = True
    asset.save(update_fields=["is_archived"])

    res = client.delete(f"/api/portfolio/{asset.id}/transactions/{tx.id}/")

    assert res.status_code == 409
    assert res.json()["error"] == "asset_archived"
    assert AssetTransaction.objects.filter(pk=tx.id).exists()


def test_direct_delete_transaction_refreshes_manual_asset(client, bank_account):
    tx = AssetTransaction.objects.get(
        asset=bank_account, transaction_type=AssetTransaction.CASH_IN
    )

    tx.delete()

    bank_account.refresh_from_db()
    assert bank_account.current_value == Decimal("0.00")
    assert bank_account.invested_capital == Decimal("0.00")
    assert not AssetTransaction.objects.filter(pk=tx.pk).exists()
    assert not AssetPriceHistory.objects.filter(asset=bank_account).exists()


def test_delete_opening_balance_correction_clears_baseline(client, test_user):
    itype = InvestmentType.objects.create(
        name="Bank", is_bank_account=True, supports_ticker=False, owner=test_user
    )
    account = Asset.objects.create(
        name="Ledger Account",
        investment_type=itype,
        tracking_type=Asset.MANUAL,
        is_liquid=True,
        invested_capital=Decimal("0"),
        current_value=Decimal("0"),
        owner=test_user,
    )
    tx = AssetTransaction.objects.create(
        asset=account,
        transaction_type=AssetTransaction.ADJUSTMENT,
        date="2022-01-01",
        shares=Decimal("1"),
        price_per_share=Decimal("500"),
        notes="Opening balance correction for imported history",
        is_verified=True,
        owner=test_user,
    )
    account.recompute_from_transactions()
    assert account.opening_balance == Decimal("500.00")
    assert account.current_value == Decimal("500.00")

    res = client.delete(f"/api/portfolio/{account.id}/transactions/{tx.id}/")
    assert res.status_code == 204

    account.refresh_from_db()
    assert account.opening_balance == Decimal("0.00")
    assert account.opening_balance_date is None
    assert account.current_value == Decimal("0.00")


# ── Communicating vessels ──────────────────────────────────────────────────


def test_transfer_creates_cash_out_and_cash_in(client, bank_account, db, test_user):
    itype = InvestmentType.objects.create(
        name="Broker", is_bank_account=True, supports_ticker=False, owner=test_user
    )
    broker = Asset.objects.create(
        name="Broker Account",
        investment_type=itype,
        tracking_type=Asset.MANUAL,
        is_liquid=True,
        invested_capital=Decimal("0"),
        current_value=Decimal("0"),
        owner=test_user,
    )
    res = client.post(
        "/api/portfolio/transfer/",
        data={
            "from_account_id": bank_account.id,
            "to_account_id": broker.id,
            "amount": "300",
            "date": "2026-01-15",
            "is_verified": True,
        },
        content_type="application/json",
    )
    assert res.status_code == 200
    data = res.json()
    assert "warning" not in data

    bank_account.refresh_from_db()
    broker.refresh_from_db()
    assert bank_account.current_value == Decimal("700.00")
    assert broker.current_value == Decimal("300.00")

    cash_out = AssetTransaction.objects.get(
        asset=bank_account, transaction_type=AssetTransaction.CASH_OUT
    )
    cash_in = AssetTransaction.objects.get(
        asset=broker, transaction_type=AssetTransaction.CASH_IN
    )
    assert cash_in.derived_from == cash_out


def test_transfer_insufficient_balance_returns_warning(
    client, bank_account, db, test_user
):
    itype = InvestmentType.objects.create(
        name="Broker2", is_bank_account=True, supports_ticker=False, owner=test_user
    )
    broker = Asset.objects.create(
        name="Broker2",
        investment_type=itype,
        tracking_type=Asset.MANUAL,
        is_liquid=True,
        invested_capital=Decimal("0"),
        current_value=Decimal("0"),
        owner=test_user,
    )
    res = client.post(
        "/api/portfolio/transfer/",
        data={
            "from_account_id": bank_account.id,
            "to_account_id": broker.id,
            "amount": "5000",
            "date": "2026-01-15",
            "is_verified": True,
        },
        content_type="application/json",
    )
    assert res.status_code == 200
    assert res.json().get("warning") == "insufficient_balance"
    # Transfer should still happen
    broker.refresh_from_db()
    assert broker.current_value == Decimal("5000.00")


def test_unverified_transfer_does_not_affect_account_balances(
    client, bank_account, db, test_user
):
    itype = InvestmentType.objects.create(
        name="Broker Pending",
        is_bank_account=True,
        supports_ticker=False,
        owner=test_user,
    )
    broker = Asset.objects.create(
        name="Broker Pending",
        investment_type=itype,
        tracking_type=Asset.MANUAL,
        is_liquid=True,
        owner=test_user,
    )
    res = client.post(
        "/api/portfolio/transfer/",
        data={
            "from_account_id": bank_account.id,
            "to_account_id": broker.id,
            "amount": "300",
            "date": "2026-01-15",
            "is_verified": False,
        },
        content_type="application/json",
    )
    assert res.status_code == 200
    bank_account.refresh_from_db()
    broker.refresh_from_db()
    assert bank_account.current_value == Decimal("1000.00")
    assert broker.current_value == Decimal("0.00")


def test_buy_with_source_account_creates_cash_out(client, asset, bank_account):
    res = _post_tx(
        client,
        asset.id,
        shares="2",
        price_per_share="100",
        source_account_id=bank_account.id,
    )
    assert res.status_code == 201
    bank_account.refresh_from_db()
    # 1000 - 200 = 800
    assert bank_account.current_value == Decimal("800.00")
    buy_tx_id = res.json()["id"]
    derived = AssetTransaction.objects.get(
        asset=bank_account, transaction_type=AssetTransaction.CASH_OUT
    )
    assert derived.derived_from_id == buy_tx_id
    assert derived.price_per_share == Decimal("200.0000")


def test_buy_with_contribution_source_does_not_create_cash_out(
    client, asset, bank_account, contribution_source
):
    asset.investment_type.supports_contribution_source = True
    asset.investment_type.save(update_fields=["supports_contribution_source"])

    res = _post_tx(
        client,
        asset.id,
        shares="2",
        price_per_share="100",
        contribution_source=contribution_source.id,
    )

    assert res.status_code == 201
    assert res.json()["contribution_source"] == contribution_source.id
    assert res.json()["contribution_source_name"] == "TFR"
    asset.refresh_from_db()
    bank_account.refresh_from_db()
    assert asset.invested_capital == Decimal("200.00")
    assert bank_account.current_value == Decimal("1000.00")
    assert not AssetTransaction.objects.filter(
        derived_from_id=res.json()["id"],
        transaction_type=AssetTransaction.CASH_OUT,
    ).exists()


def test_contribution_source_requires_enabled_asset(client, asset, contribution_source):
    res = _post_tx(
        client,
        asset.id,
        contribution_source=contribution_source.id,
    )

    assert res.status_code == 400
    assert "does not support contribution sources" in res.json()["error"]


def test_contribution_source_can_be_enabled_per_asset_override(
    client, asset, contribution_source
):
    asset.contribution_source_mode = Asset.CONTRIBUTION_SOURCE_ENABLED
    asset.save(update_fields=["contribution_source_mode"])

    res = _post_tx(
        client,
        asset.id,
        contribution_source=contribution_source.id,
    )

    assert res.status_code == 201
    assert res.json()["contribution_source"] == contribution_source.id


def test_asset_override_can_disable_type_contribution_source(
    client, asset, contribution_source
):
    asset.investment_type.supports_contribution_source = True
    asset.investment_type.save(update_fields=["supports_contribution_source"])
    asset.contribution_source_mode = Asset.CONTRIBUTION_SOURCE_DISABLED
    asset.save(update_fields=["contribution_source_mode"])

    res = _post_tx(
        client,
        asset.id,
        contribution_source=contribution_source.id,
    )

    assert res.status_code == 400
    assert "does not support contribution sources" in res.json()["error"]


def test_contribution_source_cannot_be_combined_with_source_account(
    client, asset, bank_account, contribution_source
):
    asset.investment_type.supports_contribution_source = True
    asset.investment_type.save(update_fields=["supports_contribution_source"])

    res = _post_tx(
        client,
        asset.id,
        source_account_id=bank_account.id,
        contribution_source=contribution_source.id,
    )

    assert res.status_code == 400
    assert "cannot be used with a source account" in res.json()["error"]


def test_asset_transactions_include_linked_account_fields(client, asset, bank_account):
    res = _post_tx(
        client,
        asset.id,
        shares="2",
        price_per_share="100",
        source_account_id=bank_account.id,
    )
    assert res.status_code == 201
    assert res.json()["linked_account_id"] == bank_account.id
    assert res.json()["linked_account_name"] == "Conto Corrente"
    assert res.json()["linked_account_direction"] == "source"

    res = client.get(f"/api/portfolio/{asset.id}/transactions/")

    assert res.status_code == 200
    buy = next(item for item in res.json() if item["transaction_type"] == "buy")
    assert buy["linked_account_id"] == bank_account.id
    assert buy["linked_account_name"] == "Conto Corrente"
    assert buy["linked_account_direction"] == "source"


def test_patch_contribution_source_rejects_existing_source_account_mirror(
    client, asset, bank_account, contribution_source
):
    res = _post_tx(
        client,
        asset.id,
        shares="2",
        price_per_share="100",
        source_account_id=bank_account.id,
    )
    assert res.status_code == 201
    tx_id = res.json()["id"]
    asset.investment_type.supports_contribution_source = True
    asset.investment_type.save(update_fields=["supports_contribution_source"])

    res = client.patch(
        f"/api/portfolio/{asset.id}/transactions/{tx_id}/",
        data={"contribution_source": contribution_source.id},
        content_type="application/json",
    )

    assert res.status_code == 400
    assert "cannot be used with a source account" in res.json()["error"]
    tx = AssetTransaction.objects.get(pk=tx_id)
    assert tx.contribution_source is None
    assert AssetTransaction.objects.filter(
        derived_from=tx,
        transaction_type=AssetTransaction.CASH_OUT,
        asset=bank_account,
    ).exists()


def test_patch_contribution_source_can_clear_existing_source_account_mirror(
    client, asset, bank_account, contribution_source
):
    res = _post_tx(
        client,
        asset.id,
        shares="2",
        price_per_share="100",
        source_account_id=bank_account.id,
    )
    assert res.status_code == 201
    tx_id = res.json()["id"]
    asset.investment_type.supports_contribution_source = True
    asset.investment_type.save(update_fields=["supports_contribution_source"])

    res = client.patch(
        f"/api/portfolio/{asset.id}/transactions/{tx_id}/",
        data={
            "contribution_source": contribution_source.id,
            "source_account_id": "",
        },
        content_type="application/json",
    )

    assert res.status_code == 200
    assert res.json()["contribution_source"] == contribution_source.id
    assert res.json()["linked_account_id"] is None
    tx = AssetTransaction.objects.get(pk=tx_id)
    assert tx.contribution_source == contribution_source
    assert not AssetTransaction.objects.filter(
        derived_from=tx,
        transaction_type=AssetTransaction.CASH_OUT,
    ).exists()
    bank_account.refresh_from_db()
    assert bank_account.current_value == Decimal("1000.00")


def test_contribution_source_only_allowed_on_buy(client, asset, contribution_source):
    asset.investment_type.supports_contribution_source = True
    asset.investment_type.save(update_fields=["supports_contribution_source"])

    res = client.post(
        f"/api/portfolio/{asset.id}/transactions/",
        data={
            "transaction_type": "sell",
            "date": "2026-01-20",
            "shares": "1",
            "price_per_share": "100",
            "contribution_source": contribution_source.id,
        },
        content_type="application/json",
    )

    assert res.status_code == 400
    assert "allowed only on buy transactions" in res.json()["error"]


def test_contribution_source_must_be_available_for_asset(
    client, asset, contribution_source, test_user
):
    asset.contribution_source_mode = Asset.CONTRIBUTION_SOURCE_ENABLED
    asset.save(update_fields=["contribution_source_mode"])
    other_source = ContributionSource.objects.create(name="Employer", owner=test_user)
    AssetContributionSource.objects.create(
        owner=test_user,
        asset=asset,
        contribution_source=contribution_source,
    )

    res = _post_tx(client, asset.id, contribution_source=other_source.id)

    assert res.status_code == 400
    assert "not available for this asset" in res.json()["error"]


def test_delete_contribution_source_sets_transactions_uncategorized(
    client, asset, contribution_source
):
    asset.contribution_source_mode = Asset.CONTRIBUTION_SOURCE_ENABLED
    asset.save(update_fields=["contribution_source_mode"])
    res = _post_tx(client, asset.id, contribution_source=contribution_source.id)
    assert res.status_code == 201
    tx_id = res.json()["id"]

    res = client.delete(
        f"/api/portfolio/contribution-sources/{contribution_source.id}/",
        data={"transactions_action": "null"},
        content_type="application/json",
    )

    assert res.status_code == 204
    tx = AssetTransaction.objects.get(pk=tx_id)
    assert tx.contribution_source is None
    assert not ContributionSource.objects.filter(pk=contribution_source.id).exists()


def test_delete_contribution_source_reassigns_transactions(
    client, asset, contribution_source, test_user
):
    asset.contribution_source_mode = Asset.CONTRIBUTION_SOURCE_ENABLED
    asset.save(update_fields=["contribution_source_mode"])
    target = ContributionSource.objects.create(name="Employer", owner=test_user)
    res = _post_tx(client, asset.id, contribution_source=contribution_source.id)
    assert res.status_code == 201
    tx_id = res.json()["id"]

    res = client.delete(
        f"/api/portfolio/contribution-sources/{contribution_source.id}/",
        data={"transactions_action": "reassign", "reassign_to": target.id},
        content_type="application/json",
    )

    assert res.status_code == 204
    tx = AssetTransaction.objects.get(pk=tx_id)
    assert tx.contribution_source == target


def test_delete_contribution_source_deletes_transactions(
    client, asset, contribution_source
):
    asset.contribution_source_mode = Asset.CONTRIBUTION_SOURCE_ENABLED
    asset.save(update_fields=["contribution_source_mode"])
    res = _post_tx(
        client,
        asset.id,
        shares="2",
        price_per_share="100",
        contribution_source=contribution_source.id,
    )
    assert res.status_code == 201
    tx_id = res.json()["id"]

    res = client.delete(
        f"/api/portfolio/contribution-sources/{contribution_source.id}/",
        data={"transactions_action": "delete"},
        content_type="application/json",
    )

    assert res.status_code == 204
    assert not AssetTransaction.objects.filter(pk=tx_id).exists()
    asset.refresh_from_db()
    assert asset.invested_capital == Decimal("0.00")


def test_sell_with_dest_account_creates_cash_in(client, asset, bank_account):
    # First buy
    _post_tx(client, asset.id, shares="5", price_per_share="100")
    # Now sell 2 shares → credit bank_account
    res = client.post(
        f"/api/portfolio/{asset.id}/transactions/",
        data={
            "transaction_type": "sell",
            "date": "2026-01-20",
            "shares": "2",
            "price_per_share": "110",
            "dest_account_id": bank_account.id,
            "is_verified": True,
        },
        content_type="application/json",
    )
    assert res.status_code == 201
    bank_account.refresh_from_db()
    # 1000 + 220 = 1220
    assert bank_account.current_value == Decimal("1220.00")
    cash_in = AssetTransaction.objects.get(
        asset=bank_account,
        transaction_type=AssetTransaction.CASH_IN,
        price_per_share=Decimal("220"),
    )
    assert cash_in.derived_from is not None


def test_delete_buy_cascades_to_derived_cash_out(client, asset, bank_account):
    res = _post_tx(
        client,
        asset.id,
        shares="2",
        price_per_share="100",
        source_account_id=bank_account.id,
    )
    buy_tx_id = res.json()["id"]
    derived_id = AssetTransaction.objects.get(derived_from_id=buy_tx_id).id

    res = client.delete(f"/api/portfolio/{asset.id}/transactions/{buy_tx_id}/")
    assert res.status_code == 204
    assert not AssetTransaction.objects.filter(pk=buy_tx_id).exists()
    assert not AssetTransaction.objects.filter(pk=derived_id).exists()
    bank_account.refresh_from_db()
    assert bank_account.current_value == Decimal("1000.00")


def test_patch_buy_syncs_derived_cash_out_amount(client, asset, bank_account):
    res = _post_tx(
        client,
        asset.id,
        shares="2",
        price_per_share="100",
        source_account_id=bank_account.id,
    )
    buy_tx_id = res.json()["id"]

    # Patch shares from 2 to 3 → cost goes from 200 to 300
    res = client.patch(
        f"/api/portfolio/{asset.id}/transactions/{buy_tx_id}/",
        data={"shares": "3"},
        content_type="application/json",
    )
    assert res.status_code == 200
    derived = AssetTransaction.objects.get(derived_from_id=buy_tx_id)
    assert derived.price_per_share == Decimal("300.0000")
    bank_account.refresh_from_db()
    assert bank_account.current_value == Decimal("700.00")


def test_patch_buy_cash_mirror_directly_is_rejected(client, asset, bank_account):
    res = _post_tx(
        client,
        asset.id,
        shares="2",
        price_per_share="100",
        source_account_id=bank_account.id,
    )
    buy_tx_id = res.json()["id"]
    derived = AssetTransaction.objects.get(derived_from_id=buy_tx_id)

    res = client.patch(
        f"/api/portfolio/{bank_account.id}/transactions/{derived.id}/",
        data={"is_verified": False},
        content_type="application/json",
    )

    assert res.status_code == 400
    derived.refresh_from_db()
    assert derived.is_verified is True


def test_delete_buy_cash_mirror_directly_is_rejected(client, asset, bank_account):
    res = _post_tx(
        client,
        asset.id,
        shares="2",
        price_per_share="100",
        source_account_id=bank_account.id,
    )
    buy_tx_id = res.json()["id"]
    derived = AssetTransaction.objects.get(derived_from_id=buy_tx_id)

    res = client.delete(
        f"/api/portfolio/{bank_account.id}/transactions/{derived.id}/",
    )

    assert res.status_code == 400
    assert AssetTransaction.objects.filter(pk=derived.pk).exists()


def test_patch_transfer_is_verified_propagates_to_counterpart(
    client, bank_account, db, test_user
):
    itype = InvestmentType.objects.create(
        name="Broker Verified",
        is_bank_account=True,
        supports_ticker=False,
        owner=test_user,
    )
    broker = Asset.objects.create(
        name="Broker Verified",
        investment_type=itype,
        tracking_type=Asset.MANUAL,
        is_liquid=True,
        invested_capital=Decimal("0"),
        current_value=Decimal("0"),
        owner=test_user,
    )
    transfer_res = client.post(
        "/api/portfolio/transfer/",
        data={
            "from_account_id": bank_account.id,
            "to_account_id": broker.id,
            "amount": "300",
            "date": "2026-01-15",
            "is_verified": True,
        },
        content_type="application/json",
    )
    assert transfer_res.status_code == 200

    cash_out = AssetTransaction.objects.get(
        asset=bank_account,
        transaction_type=AssetTransaction.CASH_OUT,
    )
    cash_in = AssetTransaction.objects.get(
        asset=broker,
        transaction_type=AssetTransaction.CASH_IN,
    )

    res = client.patch(
        f"/api/portfolio/{bank_account.id}/transactions/{cash_out.id}/",
        data={"is_verified": True},
        content_type="application/json",
    )

    assert res.status_code == 200
    cash_out.refresh_from_db()
    cash_in.refresh_from_db()
    assert cash_out.is_verified is True
    assert cash_in.is_verified is True


def test_patch_adjustment_is_verified_updates_single_transaction(client, bank_account):
    adjustment = AssetTransaction.objects.create(
        asset=bank_account,
        transaction_type=AssetTransaction.ADJUSTMENT,
        date="2026-01-31",
        shares=Decimal("1"),
        price_per_share=Decimal("25"),
        owner=bank_account.owner,
    )

    res = client.patch(
        f"/api/portfolio/{bank_account.id}/transactions/{adjustment.id}/",
        data={"is_verified": True},
        content_type="application/json",
    )

    assert res.status_code == 200
    adjustment.refresh_from_db()
    assert adjustment.is_verified is True


def test_adjust_balance_creates_verified_adjustment(client, bank_account):
    res = client.post(
        f"/api/portfolio/{bank_account.id}/adjust-balance/",
        data={"new_balance": "1050"},
        content_type="application/json",
    )

    assert res.status_code == 200
    bank_account.refresh_from_db()
    assert bank_account.current_value == Decimal("1050.00")

    adjustment = AssetTransaction.objects.get(
        asset=bank_account,
        transaction_type=AssetTransaction.ADJUSTMENT,
    )
    assert adjustment.price_per_share == Decimal("50.0000")
    assert adjustment.is_verified is True


# ── SELL validation ─────────────────────────────────────────────────────────


def test_sell_more_than_owned_returns_400(client, asset):
    # Buy 5 shares
    _post_tx(client, asset.id, shares="5", price_per_share="100")
    # Try to sell 10
    res = client.post(
        f"/api/portfolio/{asset.id}/transactions/",
        data={
            "transaction_type": "sell",
            "date": "2026-02-01",
            "shares": "10",
            "price_per_share": "110",
            "is_verified": True,
        },
        content_type="application/json",
    )
    assert res.status_code == 400
    assert "Cannot sell" in res.json().get("error", "")


def test_sell_at_date_before_buy_returns_400(client, asset):
    # Buy 5 shares on 2026-02-01
    _post_tx(client, asset.id, date="2026-02-01", shares="5", price_per_share="100")
    # Try to sell 2 on 2026-01-15 (before buy)
    res = client.post(
        f"/api/portfolio/{asset.id}/transactions/",
        data={
            "transaction_type": "sell",
            "date": "2026-01-15",
            "shares": "2",
            "price_per_share": "110",
            "is_verified": True,
        },
        content_type="application/json",
    )
    assert res.status_code == 400


def test_sell_within_owned_succeeds(client, asset):
    _post_tx(client, asset.id, shares="5", price_per_share="100")
    res = client.post(
        f"/api/portfolio/{asset.id}/transactions/",
        data={
            "transaction_type": "sell",
            "date": "2026-02-01",
            "shares": "3",
            "price_per_share": "120",
            "is_verified": True,
        },
        content_type="application/json",
    )
    assert res.status_code == 201


def test_transactions_feed_searches_notes_and_asset_name(client, asset, test_user):
    other_type = InvestmentType.objects.create(name="Bond", owner=test_user)
    other = Asset.objects.create(
        name="Treasury Bond", investment_type=other_type, owner=test_user
    )
    _post_tx(client, asset.id, notes="monthly alpha buy")
    _post_tx(client, other.id, notes="plain note")

    res = client.get("/api/portfolio/transactions/?search=alpha")

    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 1
    assert body["results"][0]["asset"]["name"] == "VWCE"

    res = client.get("/api/portfolio/transactions/?search=treasury")

    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 1
    assert body["results"][0]["asset"]["name"] == "Treasury Bond"


def test_transactions_feed_orders_by_amount(client, asset):
    small = _post_tx(
        client,
        asset.id,
        date="2026-01-10",
        shares="1",
        price_per_share="10",
    ).json()["id"]
    large = _post_tx(
        client,
        asset.id,
        date="2026-01-11",
        shares="2",
        price_per_share="100",
    ).json()["id"]

    res = client.get("/api/portfolio/transactions/?ordering=-amount")

    assert res.status_code == 200
    ids = [row["id"] for row in res.json()["results"]]
    assert ids.index(large) < ids.index(small)


def test_transactions_feed_filters_unverified(client, asset):
    verified_id = _post_tx(client, asset.id, is_verified=True).json()["id"]
    unverified_id = _post_tx(
        client,
        asset.id,
        date="2026-01-11",
        is_verified=False,
    ).json()["id"]

    res = client.get("/api/portfolio/transactions/?verified=false")

    assert res.status_code == 200
    ids = [row["id"] for row in res.json()["results"]]
    assert unverified_id in ids
    assert verified_id not in ids


def test_transactions_bulk_verify_ids_recomputes_asset(client, asset):
    tx_id = _post_tx(client, asset.id, is_verified=False).json()["id"]
    asset.refresh_from_db()
    assert asset.shares == Decimal("0.000000")

    res = _post_tx_bulk(
        client,
        {
            "action": "edit",
            "selection": {"mode": "ids", "ids": [tx_id]},
            "patch": {"is_verified": True},
        },
    )

    assert res.status_code == 200, res.content
    tx = AssetTransaction.objects.get(pk=tx_id)
    asset.refresh_from_db()
    assert tx.is_verified is True
    assert asset.shares == Decimal("10.000000")


def test_transactions_bulk_verify_archived_asset_is_blocked(client, asset):
    tx = AssetTransaction.objects.create(
        asset=asset,
        owner=asset.owner,
        transaction_type=AssetTransaction.BUY,
        date="2026-01-10",
        shares=Decimal("1"),
        price_per_share=Decimal("100"),
        is_verified=False,
    )
    asset.is_archived = True
    asset.save(update_fields=["is_archived"])

    res = _post_tx_bulk(
        client,
        {
            "action": "edit",
            "selection": {"mode": "ids", "ids": [tx.id]},
            "patch": {"is_verified": True},
        },
    )

    assert res.status_code == 409
    assert res.json()["error_codes"] == ["asset_archived"]
    tx.refresh_from_db()
    assert tx.is_verified is False


def test_transactions_bulk_filtered_excludes_ids(client, asset):
    ids = [
        _post_tx(
            client,
            asset.id,
            date=f"2026-01-{10 + i:02d}",
            is_verified=False,
        ).json()["id"]
        for i in range(3)
    ]

    res = _post_tx_bulk(
        client,
        {
            "action": "edit",
            "selection": {
                "mode": "filtered",
                "filters": {"type": "buy", "verified": False},
                "exclude_ids": [ids[1]],
            },
            "patch": {"is_verified": True},
        },
    )

    assert res.status_code == 200, res.content
    states = {
        tx.pk: tx.is_verified
        for tx in AssetTransaction.objects.filter(pk__in=ids).order_by("pk")
    }
    assert states[ids[0]] is True
    assert states[ids[1]] is False
    assert states[ids[2]] is True


def test_transactions_bulk_verify_invalid_sell_rolls_back(client, asset):
    buy_id = _post_tx(
        client,
        asset.id,
        date="2026-01-10",
        shares="1",
        price_per_share="100",
        is_verified=False,
    ).json()["id"]
    sell_id = _post_tx(
        client,
        asset.id,
        transaction_type="sell",
        date="2026-01-11",
        shares="1",
        price_per_share="110",
        is_verified=False,
    ).json()["id"]

    res = _post_tx_bulk(
        client,
        {
            "action": "edit",
            "selection": {"mode": "ids", "ids": [sell_id]},
            "patch": {"is_verified": True},
        },
    )

    assert res.status_code == 400
    assert AssetTransaction.objects.get(pk=buy_id).is_verified is False
    assert AssetTransaction.objects.get(pk=sell_id).is_verified is False


# ── Asset destroy with linked accounts ──────────────────────────────────────


def test_delete_investment_cleans_up_linked_account(client, asset, bank_account):
    # Buy with linked account → CASH_OUT derived
    _post_tx(
        client,
        asset.id,
        shares="2",
        price_per_share="100",
        source_account_id=bank_account.id,
    )
    bank_account.refresh_from_db()
    assert bank_account.current_value == Decimal("800.00")  # 1000 - 200

    # Delete the asset → should cascade-delete tx + recompute bank
    res = client.delete(f"/api/portfolio/{asset.id}/")
    assert res.status_code == 204
    bank_account.refresh_from_db()
    assert bank_account.current_value == Decimal("1000.00")


# ── Initial balance on creation ─────────────────────────────────────────────


def test_create_manual_asset_with_initial_balance_creates_cash_in(
    client, db, test_user
):
    itype = InvestmentType.objects.create(
        name="CC2", is_bank_account=True, supports_ticker=False, owner=test_user
    )
    res = client.post(
        "/api/portfolio/",
        data={
            "name": "New CC",
            "investment_type": itype.id,
            "tracking_type": "MANUAL",
            "initial_balance": "1500",
            "currency": "EUR",
        },
        content_type="application/json",
    )
    assert res.status_code == 201
    asset_id = res.json()["id"]
    asset = Asset.objects.get(pk=asset_id)
    assert asset.current_value == Decimal("1500.00")
    assert asset.invested_capital == Decimal("1500.00")
    cash_in = AssetTransaction.objects.get(
        asset=asset, transaction_type=AssetTransaction.CASH_IN
    )
    assert cash_in.price_per_share == Decimal("1500.0000")


def test_create_manual_asset_without_initial_balance_creates_no_tx(
    client, db, test_user
):
    itype = InvestmentType.objects.create(
        name="CC3", is_bank_account=True, supports_ticker=False, owner=test_user
    )
    res = client.post(
        "/api/portfolio/",
        data={
            "name": "Empty CC",
            "investment_type": itype.id,
            "tracking_type": "MANUAL",
            "currency": "EUR",
        },
        content_type="application/json",
    )
    assert res.status_code == 201
    asset_id = res.json()["id"]
    asset = Asset.objects.get(pk=asset_id)
    assert asset.current_value == Decimal("0.00")
    assert not AssetTransaction.objects.filter(asset=asset).exists()


def test_create_auto_asset_ignores_initial_balance(client, db, test_user):
    itype = InvestmentType.objects.create(
        name="ETF2", is_bank_account=False, supports_ticker=True, owner=test_user
    )
    res = client.post(
        "/api/portfolio/",
        data={
            "name": "VWCE",
            "investment_type": itype.id,
            "tracking_type": "AUTO",
            "initial_balance": "5000",
            "currency": "EUR",
        },
        content_type="application/json",
    )
    assert res.status_code == 201
    asset_id = res.json()["id"]
    asset = Asset.objects.get(pk=asset_id)
    # AUTO assets: initial_balance is ignored, no CASH_IN created
    assert not AssetTransaction.objects.filter(asset=asset).exists()


# ── rebuild_manual_history ──────────────────────────────────────────────────


def test_transfer_creates_history_for_both_accounts(
    client, bank_account, db, test_user
):
    from portfolio.models import AssetPriceHistory

    itype = InvestmentType.objects.create(
        name="Broker3", is_bank_account=True, supports_ticker=False, owner=test_user
    )
    broker = Asset.objects.create(
        name="Broker3 Account",
        investment_type=itype,
        tracking_type=Asset.MANUAL,
        is_liquid=True,
        invested_capital=Decimal("0"),
        current_value=Decimal("0"),
        owner=test_user,
    )
    res = client.post(
        "/api/portfolio/transfer/",
        data={
            "from_account_id": bank_account.id,
            "to_account_id": broker.id,
            "amount": "200",
            "date": "2026-02-15",
            "is_verified": True,
        },
        content_type="application/json",
    )
    assert res.status_code == 200

    # Both accounts should have history entries
    src_hist = AssetPriceHistory.objects.filter(asset=bank_account)
    dst_hist = AssetPriceHistory.objects.filter(asset=broker)
    assert src_hist.exists()
    assert dst_hist.exists()
