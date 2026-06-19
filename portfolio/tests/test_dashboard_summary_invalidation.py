"""Regression tests per l'invalidazione di DashboardSummary nei service di portfolio.

Bug originale: i service in portfolio/services.py chiamavano invalidate_dashboard_summary()
senza passare `user`, e DashboardSummary.get_singleton(None) sollevava ValueError. L'eccezione
veniva ingoiata da un try/except + logger.exception, producendo righe ERROR nei log e —
soprattutto — non aggiornando mai il record di DashboardSummary corretto. La cache della
dashboard restava stale dopo ogni mutazione di asset/transaction (tranne il path price_refresh,
unico chiamante che passava già `user`).

Questi test fallivano sul codice rotto perché summary.invalidated_at restava None
(get_singleton non veniva mai eseguito con un user valido).
"""

import pytest
from decimal import Decimal
from datetime import date

from portfolio.models import Asset, AssetTransaction, DashboardSummary, InvestmentType
from portfolio.serializers import AssetTransactionSerializer
from portfolio.services import (
    create_transaction,
    delete_asset_cascade,
    delete_transaction,
    patch_transaction,
    transfer_between_accounts,
    invalidate_dashboard_summary,
)


@pytest.fixture
def bank_type(db, test_user):
    return InvestmentType.objects.create(
        name="Bank",
        is_bank_account=True,
        is_liquid_default=True,
        supports_ticker=False,
        owner=test_user,
    )


@pytest.fixture
def acc_a(bank_type, test_user):
    a = Asset.objects.create(
        name="Account A",
        ticker="",
        investment_type=bank_type,
        tracking_type=Asset.MANUAL,
        is_liquid=True,
        owner=test_user,
    )
    AssetTransaction.objects.create(
        asset=a,
        transaction_type=AssetTransaction.CASH_IN,
        date=date.today(),
        shares=Decimal("1"),
        price_per_share=Decimal("1000"),
        owner=test_user,
    )
    a.recompute_from_transactions()
    a.refresh_from_db()
    return a


@pytest.fixture
def acc_b(bank_type, test_user):
    return Asset.objects.create(
        name="Account B",
        ticker="",
        investment_type=bank_type,
        tracking_type=Asset.MANUAL,
        is_liquid=True,
        owner=test_user,
    )


def _summary(user):
    return DashboardSummary.objects.filter(owner=user).first()


class TestServiceInvalidatesSummary:
    def test_delete_asset_cascade_invalidates(self, acc_a, test_user):
        delete_asset_cascade(acc_a)
        s = _summary(test_user)
        assert s is not None
        assert s.invalidated_at is not None
        assert s.last_invalidation_reason == DashboardSummary.REASON_ASSET_CHANGED

    def test_transfer_invalidates(self, acc_a, acc_b, test_user):
        transfer_between_accounts(
            acc_a,
            acc_b,
            Decimal("100"),
            date.today().isoformat(),
            owner=test_user,
        )
        s = _summary(test_user)
        assert s is not None
        assert s.invalidated_at is not None
        assert s.last_invalidation_reason == DashboardSummary.REASON_TRANSACTION

    def test_create_transaction_invalidates(self, acc_a, test_user):
        ser = AssetTransactionSerializer(
            data={
                "transaction_type": AssetTransaction.CASH_IN,
                "date": date.today().isoformat(),
                "shares": "1",
                "price_per_share": "50",
            }
        )
        ser.is_valid(raise_exception=True)
        create_transaction(acc_a, ser, owner=test_user)
        s = _summary(test_user)
        assert s is not None
        assert s.invalidated_at is not None
        assert s.last_invalidation_reason == DashboardSummary.REASON_TRANSACTION

    def test_delete_transaction_invalidates(self, acc_a, test_user):
        tx = acc_a.transactions.first()
        # azzera lo stato precedente
        DashboardSummary.objects.filter(owner=test_user).update(
            invalidated_at=None, last_invalidation_reason=""
        )
        delete_transaction(tx)
        s = _summary(test_user)
        assert s is not None
        assert s.invalidated_at is not None
        assert s.last_invalidation_reason == DashboardSummary.REASON_TRANSACTION

    def test_patch_transaction_invalidates(self, acc_a, test_user):
        tx = acc_a.transactions.first()
        DashboardSummary.objects.filter(owner=test_user).update(
            invalidated_at=None, last_invalidation_reason=""
        )
        ser = AssetTransactionSerializer(
            tx, data={"price_per_share": "1500"}, partial=True
        )
        ser.is_valid(raise_exception=True)
        patch_transaction(tx, ser)
        s = _summary(test_user)
        assert s is not None
        assert s.invalidated_at is not None
        assert s.last_invalidation_reason == DashboardSummary.REASON_TRANSACTION


class TestInvalidateDashboardSummaryGuard:
    def test_user_none_does_not_raise_or_log_exception(self, db):
        """Quando user è None il service deve fare warning + return, NON lanciare/ingoiare ValueError."""
        import logging
        from portfolio import services as svc

        records = []

        class _Capture(logging.Handler):
            def emit(self, record):
                records.append(record)

        h = _Capture(level=logging.DEBUG)
        svc.logger.addHandler(h)
        try:
            invalidate_dashboard_summary(DashboardSummary.REASON_TRANSACTION, user=None)
        finally:
            svc.logger.removeHandler(h)

        # nessun ERROR (la versione rotta produceva ERROR + traceback)
        errors = [r for r in records if r.levelno >= logging.ERROR]
        assert not errors, (
            f"unexpected ERROR records: {[r.getMessage() for r in errors]}"
        )
        # un warning visibile
        assert any("user mancante" in r.getMessage() for r in records), (
            f"warning mancante. records={[r.getMessage() for r in records]}"
        )
        # nessun summary creato
        assert DashboardSummary.objects.count() == 0
