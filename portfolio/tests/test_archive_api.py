from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction
from portfolio.models import Asset, InvestmentType


@pytest.fixture
def bank_type(test_user):
    return InvestmentType.objects.create(
        name="Bank",
        supports_ticker=False,
        is_liquid_default=True,
        is_bank_account=True,
        owner=test_user,
    )


@pytest.fixture
def bank_account_zero(bank_type, test_user):
    return Asset.objects.create(
        name="Conto Zero",
        ticker="",
        investment_type=bank_type,
        is_liquid=True,
        invested_capital=Decimal("0.00"),
        current_value=Decimal("0.00"),
        owner=test_user,
    )


@pytest.fixture
def bank_account_positive(bank_type, test_user):
    return Asset.objects.create(
        name="Conto Positivo",
        ticker="",
        investment_type=bank_type,
        is_liquid=True,
        invested_capital=Decimal("0.00"),
        current_value=Decimal("123.45"),
        owner=test_user,
    )


def test_archive_bank_account_with_zero_balance_succeeds(client, bank_account_zero):
    res = client.post(f"/api/portfolio/{bank_account_zero.id}/archive/")
    assert res.status_code == 200, res.content
    bank_account_zero.refresh_from_db()
    assert bank_account_zero.is_archived is True
    assert bank_account_zero.archived_at is not None


def test_archive_bank_account_with_positive_balance_is_blocked(
    client, bank_account_positive
):
    res = client.post(f"/api/portfolio/{bank_account_positive.id}/archive/")
    assert res.status_code == 409
    body = res.json()
    assert body["error"] == "non_zero_balance"
    assert body["current_value"] == "123.45"
    assert body["currency"] == "EUR"
    bank_account_positive.refresh_from_db()
    assert bank_account_positive.is_archived is False


def test_archive_auto_asset_with_positive_shares_is_blocked(client, asset):
    assert asset.shares > 0
    res = client.post(f"/api/portfolio/{asset.id}/archive/")
    assert res.status_code == 409
    body = res.json()
    assert body["error"] == "non_zero_shares"
    assert body["shares"] == "10.000000"
    asset.refresh_from_db()
    assert asset.is_archived is False


def test_auto_asset_negative_shares_rejected_by_db(asset):
    # Le quote negative non possono più esistere: il CHECK constraint
    # asset_shares_non_negative le rifiuta alla radice. Questa è una garanzia più
    # forte del 409 del guard di archive — che resta coperto per il caso non-zero
    # da test_archive_auto_asset_with_positive_shares_is_blocked. Verifichiamo che
    # nemmeno una update() raw (che bypassa i validator DRF) possa introdurle.
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            Asset.objects.filter(pk=asset.pk).update(shares=Decimal("-1.000000"))
    asset.refresh_from_db()
    assert asset.shares != Decimal("-1.000000")


def test_archive_auto_asset_with_zero_shares_succeeds(client, asset):
    asset.shares = Decimal("0.000000")
    asset.current_value = Decimal("0.00")
    asset.save(update_fields=["shares", "current_value"])
    res = client.post(f"/api/portfolio/{asset.id}/archive/")
    assert res.status_code == 200, res.content
    asset.refresh_from_db()
    assert asset.is_archived is True


def test_archive_manual_non_bank_with_positive_balance_is_blocked(
    client, itype_no_ticker, test_user
):
    manual = Asset.objects.create(
        name="Manual Fund",
        ticker="",
        tracking_type=Asset.MANUAL,
        investment_type=itype_no_ticker,
        is_liquid=False,
        invested_capital=Decimal("0.00"),
        current_value=Decimal("100.00"),
        owner=test_user,
    )
    res = client.post(f"/api/portfolio/{manual.id}/archive/")
    assert res.status_code == 409
    body = res.json()
    assert body["error"] == "non_zero_balance"
    assert body["current_value"] == "100.00"
    manual.refresh_from_db()
    assert manual.is_archived is False


def test_archive_manual_non_bank_with_zero_balance_succeeds(
    client, itype_no_ticker, test_user
):
    manual = Asset.objects.create(
        name="Closed Manual Fund",
        ticker="",
        tracking_type=Asset.MANUAL,
        investment_type=itype_no_ticker,
        is_liquid=False,
        invested_capital=Decimal("0.00"),
        current_value=Decimal("0.00"),
        owner=test_user,
    )
    res = client.post(f"/api/portfolio/{manual.id}/archive/")
    assert res.status_code == 200, res.content
    manual.refresh_from_db()
    assert manual.is_archived is True
