from decimal import Decimal
from unittest.mock import patch

import pytest
from django.contrib.auth.models import User
from django.db import OperationalError
from portfolio.models import (
    Asset,
    AssetContributionSource,
    AssetTransaction,
    ContributionSource,
)


def test_list_assets(client, asset):
    res = client.get("/api/portfolio/")
    assert res.status_code == 200
    data = res.json()
    items = data["results"] if isinstance(data, dict) else data
    assert any(a["name"] == "VWCE" for a in items)
    first = next(a for a in items if a["name"] == "VWCE")
    # Serializer should include computed fields
    assert "gain" in first
    assert "gain_percent" in first


def test_list_assets_tolerates_sqlite_lock_during_manual_reconcile(client, asset):
    with (
        patch(
            "portfolio.views.reconcile_due_manual_assets",
            side_effect=OperationalError("database is locked"),
        ),
        patch("portfolio.views.logger.warning") as warning,
    ):
        res = client.get("/api/portfolio/")

    assert res.status_code == 200
    data = res.json()
    items = data["results"] if isinstance(data, dict) else data
    assert any(a["name"] == "VWCE" for a in items)
    assert warning.called


def test_list_assets_reraises_non_lock_operational_error(client, asset):
    with patch(
        "portfolio.views.reconcile_due_manual_assets",
        side_effect=OperationalError(
            "no such column: portfolio_asset.invested_capital_eur"
        ),
    ):
        with pytest.raises(OperationalError, match="no such column"):
            client.get("/api/portfolio/")


def test_create_asset_no_ticker(client, itype):
    res = client.post(
        "/api/portfolio/",
        data={
            "name": "MyBond",
            "ticker": "",
            "investment_type": itype.id,
            "is_liquid": True,
            "invested_capital": "5000.00",
            "current_value": "5200.00",
        },
        content_type="application/json",
    )
    assert res.status_code == 201
    assert Asset.objects.filter(name="MyBond").exists()


def test_create_asset_with_investment_type(client, itype):
    res = client.post(
        "/api/portfolio/",
        data={
            "name": "TestFund",
            "investment_type": itype.id,
            "is_liquid": True,
            "invested_capital": "1000.00",
            "current_value": "1000.00",
        },
        content_type="application/json",
    )
    assert res.status_code == 201
    data = res.json()
    assert data["investment_type_detail"]["name"] == "ETF"


def test_patch_asset(client, asset):
    res = client.patch(
        f"/api/portfolio/{asset.id}/",
        data={"notes": "Monitored closely"},
        content_type="application/json",
    )
    assert res.status_code == 200
    asset.refresh_from_db()
    assert asset.notes == "Monitored closely"


def test_patch_asset_custom_contribution_sources(client, asset, test_user):
    asset.contribution_source_mode = Asset.CONTRIBUTION_SOURCE_ENABLED
    asset.save(update_fields=["contribution_source_mode"])
    tfr = ContributionSource.objects.create(name="TFR", owner=test_user)
    employer = ContributionSource.objects.create(name="Employer", owner=test_user)

    res = client.patch(
        f"/api/portfolio/{asset.id}/",
        data={"contribution_source_ids": [tfr.id]},
        content_type="application/json",
    )

    assert res.status_code == 200
    data = res.json()
    assert data["custom_contribution_source_ids"] == [tfr.id]
    assert [source["id"] for source in data["available_contribution_sources"]] == [
        tfr.id
    ]
    assert AssetContributionSource.objects.filter(
        asset=asset,
        contribution_source=tfr,
        owner=test_user,
    ).exists()
    assert not AssetContributionSource.objects.filter(
        asset=asset,
        contribution_source=employer,
        owner=test_user,
    ).exists()


def test_delete_asset_also_deletes_transactions(client, asset):
    AssetTransaction.objects.create(
        asset=asset,
        owner=asset.owner,
        transaction_type=AssetTransaction.BUY,
        date="2026-01-01",
        shares=Decimal("5.000000"),
        price_per_share=Decimal("100.0000"),
    )
    res = client.delete(f"/api/portfolio/{asset.id}/")
    assert res.status_code == 204
    assert not Asset.objects.filter(pk=asset.id).exists()
    assert not AssetTransaction.objects.filter(asset_id=asset.id).exists()


def test_asset_gain_computed_property(client, asset):
    # asset: invested=1000, current=1100 → gain=100, gain_percent=10
    res = client.get(f"/api/portfolio/{asset.id}/")
    assert res.status_code == 200
    data = res.json()
    assert float(data["gain"]) == 100.0
    assert abs(float(data["gain_percent"]) - 10.0) < 0.1


def test_asset_gain_percent_zero_when_no_capital(client, itype, test_user):
    a = Asset.objects.create(
        name="ZeroInvested",
        investment_type=itype,
        invested_capital=Decimal("0"),
        current_value=Decimal("0"),
        owner=test_user,
    )
    res = client.get(f"/api/portfolio/{a.id}/")
    assert res.status_code == 200
    data = res.json()
    assert float(data["gain_percent"]) == 0.0


# ── AUDIT H7 — reset confirmation guard ───────────────────────────────────────


def test_portfolio_reset_without_confirm_returns_400(client, asset, test_user):
    res = client.post("/api/portfolio/reset/")
    assert res.status_code == 400
    assert res.json().get("error") == "missing_confirmation"
    assert Asset.objects.filter(owner=test_user).exists()


def test_portfolio_reset_with_wrong_confirm_returns_400(client, asset, test_user):
    for bad in ("true", 1, "yes", False, None):
        res = client.post(
            "/api/portfolio/reset/",
            data={"confirm": bad},
            content_type="application/json",
        )
        assert res.status_code == 400, f"confirm={bad!r} should be rejected"
    assert Asset.objects.filter(owner=test_user).exists()


def test_portfolio_reset_is_rate_limited(client, asset, test_user):
    for _ in range(5):
        res = client.post("/api/portfolio/reset/")
        assert res.status_code == 400

    res = client.post("/api/portfolio/reset/")
    assert res.status_code == 429
    assert Asset.objects.filter(owner=test_user).exists()


# ── Regression: reset deve essere scoped per owner ────────────────────────────


def test_reset_scoped_to_owner(client, asset, test_user, itype):
    """reset non deve eliminare asset di altri utenti."""
    other_user = User.objects.create_user(username="other", password="pw")
    other_asset = Asset.objects.create(
        name="OtherAsset",
        investment_type=itype,
        invested_capital=Decimal("500"),
        current_value=Decimal("500"),
        owner=other_user,
    )

    res = client.post(
        "/api/portfolio/reset/",
        data={"confirm": True},
        content_type="application/json",
    )
    assert res.status_code in (200, 204)

    # L'asset dell'utente corrente deve essere eliminato
    assert not Asset.objects.filter(owner=test_user).exists()
    # L'asset dell'altro utente deve sopravvivere
    assert Asset.objects.filter(id=other_asset.id).exists()
