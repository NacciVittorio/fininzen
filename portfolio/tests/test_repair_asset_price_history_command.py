from datetime import date
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from portfolio.models import Asset, AssetPriceHistory


@pytest.fixture
def tracked_asset(itype, test_user):
    return Asset.objects.create(
        name="Tracked Fund",
        ticker="0P0001EJWF.F",
        source_symbol="0P0001EJWF.F",
        investment_type=itype,
        owner=test_user,
    )


def test_repair_asset_price_history_is_dry_run_by_default(tracked_asset):
    AssetPriceHistory.objects.create(
        asset=tracked_asset,
        date=date(2026, 1, 15),
        close=Decimal("99.0000"),
        owner=tracked_asset.owner,
    )
    points = [
        (date(2026, 1, 15), Decimal("100.0000")),
        (date(2026, 1, 31), Decimal("101.0000")),
    ]
    output = StringIO()

    with patch(
        "portfolio.management.commands.repair_asset_price_history.fetch_price_history_points",
        return_value=(points, {"status": "ok", "message": "2 rows"}),
    ):
        call_command(
            "repair_asset_price_history",
            asset_id=tracked_asset.id,
            from_date="2026-01-01",
            stdout=output,
        )

    cached = list(
        AssetPriceHistory.objects.filter(asset=tracked_asset)
        .order_by("date")
        .values_list("date", "close")
    )
    assert cached == [(date(2026, 1, 15), Decimal("99.0000"))]
    assert "DRY-RUN" in output.getvalue()
    assert "changed=1 missing=1" in output.getvalue()


def test_repair_asset_price_history_applies_updates_and_missing_rows(tracked_asset):
    AssetPriceHistory.objects.create(
        asset=tracked_asset,
        date=date(2026, 1, 15),
        close=Decimal("99.0000"),
        owner=tracked_asset.owner,
    )
    points = [
        (date(2026, 1, 15), Decimal("100.0000")),
        (date(2026, 1, 31), Decimal("101.0000")),
    ]

    with patch(
        "portfolio.management.commands.repair_asset_price_history.fetch_price_history_points",
        return_value=(points, {"status": "ok", "message": "2 rows"}),
    ):
        call_command(
            "repair_asset_price_history",
            asset_id=tracked_asset.id,
            from_date="2026-01-01",
            apply=True,
        )

    cached = list(
        AssetPriceHistory.objects.filter(asset=tracked_asset)
        .order_by("date")
        .values_list("date", "close")
    )
    assert cached == [
        (date(2026, 1, 15), Decimal("100.0000")),
        (date(2026, 1, 31), Decimal("101.0000")),
    ]


def test_repair_asset_price_history_refuses_unvalidated_history(tracked_asset):
    with (
        patch(
            "portfolio.management.commands.repair_asset_price_history.fetch_price_history_points",
            return_value=([], {"status": "no_data", "message": "no validated history"}),
        ),
        pytest.raises(CommandError, match="no validated history"),
    ):
        call_command(
            "repair_asset_price_history",
            asset_id=tracked_asset.id,
            from_date="2026-01-01",
            apply=True,
        )


def test_repair_all_borsa_applies_updates_and_prunes_stale_rows(itype, test_user):
    explicit = Asset.objects.create(
        name="Explicit Borsa",
        ticker="4ARLPAC",
        source_symbol="4ARLPAC",
        price_source=Asset.PRICE_SOURCE_BORSA_ITALIANA,
        investment_type=itype,
        owner=test_user,
    )
    auto = Asset.objects.create(
        name="Auto Borsa",
        ticker="5AUTOFUND",
        source_symbol="5AUTOFUND",
        price_source=Asset.PRICE_SOURCE_AUTO,
        investment_type=itype,
        owner=test_user,
    )
    yahoo = Asset.objects.create(
        name="Yahoo",
        ticker="0P0001EJWF.F",
        source_symbol="0P0001EJWF.F",
        price_source=Asset.PRICE_SOURCE_YAHOO,
        investment_type=itype,
        owner=test_user,
    )
    for asset in (explicit, auto, yahoo):
        AssetPriceHistory.objects.create(
            asset=asset,
            date=date(2026, 1, 15),
            close=Decimal("99.0000"),
            owner=asset.owner,
        )
    AssetPriceHistory.objects.create(
        asset=explicit,
        date=date(2026, 1, 20),
        close=Decimal("98.0000"),
        owner=explicit.owner,
    )
    points = {
        explicit.pk: [(date(2026, 1, 15), Decimal("100.0000"))],
        auto.pk: [(date(2026, 1, 15), Decimal("101.0000"))],
    }
    output = StringIO()

    with patch(
        "portfolio.management.commands.repair_asset_price_history.fetch_price_history_points",
        side_effect=lambda asset, _from_date: (
            points[asset.pk],
            {"status": "ok", "message": "1 row"},
        ),
    ) as fetch:
        call_command(
            "repair_asset_price_history",
            all_borsa=True,
            from_date="2026-01-01",
            apply=True,
            prune=True,
            stdout=output,
        )

    assert fetch.call_count == 2
    assert list(
        explicit.price_history.order_by("date").values_list("date", "close")
    ) == [(date(2026, 1, 15), Decimal("100.0000"))]
    assert list(auto.price_history.values_list("date", "close")) == [
        (date(2026, 1, 15), Decimal("101.0000"))
    ]
    assert list(yahoo.price_history.values_list("date", "close")) == [
        (date(2026, 1, 15), Decimal("99.0000"))
    ]
    assert "SUMMARY: mode=APPLY assets=2 ok=2 errors=0" in output.getvalue()
    assert "stale=1 removed=1" in output.getvalue()


def test_repair_all_borsa_continues_after_provider_error(itype, test_user):
    failing = Asset.objects.create(
        name="Failing Borsa",
        ticker="4FAIL",
        price_source=Asset.PRICE_SOURCE_BORSA_ITALIANA,
        investment_type=itype,
        owner=test_user,
    )
    working = Asset.objects.create(
        name="Working Borsa",
        ticker="4WORK",
        price_source=Asset.PRICE_SOURCE_BORSA_ITALIANA,
        investment_type=itype,
        owner=test_user,
    )
    output = StringIO()
    errors = StringIO()

    def fetch(asset, _from_date):
        if asset == failing:
            return [], {"status": "no_data", "message": "no validated history"}
        return [(date(2026, 1, 15), Decimal("101.0000"))], {
            "status": "ok",
            "message": "1 row",
        }

    with patch(
        "portfolio.management.commands.repair_asset_price_history.fetch_price_history_points",
        side_effect=fetch,
    ):
        call_command(
            "repair_asset_price_history",
            all_borsa=True,
            from_date="2026-01-01",
            apply=True,
            stdout=output,
            stderr=errors,
        )

    assert working.price_history.filter(
        date=date(2026, 1, 15), close=Decimal("101.0000")
    ).exists()
    assert "no validated history" in errors.getvalue()
    assert "SUMMARY: mode=APPLY assets=2 ok=1 errors=1" in output.getvalue()


def test_repair_all_tracked_includes_yahoo_and_borsa(itype, test_user):
    yahoo = Asset.objects.create(
        name="Yahoo",
        ticker="0P0001EJWF.F",
        source_symbol="0P0001EJWF.F",
        price_source=Asset.PRICE_SOURCE_YAHOO,
        investment_type=itype,
        owner=test_user,
    )
    borsa = Asset.objects.create(
        name="Borsa",
        ticker="4ARLPAC",
        source_symbol="4ARLPAC",
        price_source=Asset.PRICE_SOURCE_BORSA_ITALIANA,
        investment_type=itype,
        owner=test_user,
    )
    Asset.objects.create(
        name="Manual",
        tracking_type=Asset.MANUAL,
        investment_type=itype,
        owner=test_user,
    )
    output = StringIO()

    with patch(
        "portfolio.management.commands.repair_asset_price_history.fetch_price_history_points",
        return_value=(
            [(date(2026, 1, 15), Decimal("101.0000"))],
            {"status": "ok", "message": "1 row"},
        ),
    ) as fetch:
        call_command(
            "repair_asset_price_history",
            all_tracked=True,
            from_date="2026-01-01",
            stdout=output,
        )

    assert [call.args[0].pk for call in fetch.call_args_list] == [yahoo.pk, borsa.pk]
    assert "SUMMARY: mode=DRY-RUN assets=2 ok=2 errors=0" in output.getvalue()
