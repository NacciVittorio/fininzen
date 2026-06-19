from portfolio.models import Asset, ContributionSource, InvestmentType


def test_list_investment_types(client, itype):
    res = client.get("/api/portfolio/investment-types/")
    assert res.status_code == 200
    names = [t["name"] for t in res.json()]
    assert "ETF" in names


def test_create_investment_type(client, db):
    res = client.post(
        "/api/portfolio/investment-types/",
        data={
            "name": "Crypto",
            "supports_ticker": True,
            "is_liquid_default": True,
            "color": "#f59e0b",
            "icon": "₿",
        },
        content_type="application/json",
    )
    assert res.status_code == 201
    assert InvestmentType.objects.filter(name="Crypto").exists()


def test_create_and_list_contribution_sources(client, test_user):
    res = client.post(
        "/api/portfolio/contribution-sources/",
        data={"name": "TFR", "sort_order": 2, "is_active": True},
        content_type="application/json",
    )

    assert res.status_code == 201
    source = ContributionSource.objects.get(name="TFR", owner=test_user)
    assert source.sort_order == 2

    res = client.get("/api/portfolio/contribution-sources/")
    assert res.status_code == 200
    data = res.json()
    assert any(
        item["name"] == "TFR" and item["transaction_count"] == 0 for item in data
    )


def test_patch_investment_type(client, itype):
    res = client.patch(
        f"/api/portfolio/investment-types/{itype.id}/",
        data={"name": "ETF v2"},
        content_type="application/json",
    )
    assert res.status_code == 200
    itype.refresh_from_db()
    assert itype.name == "ETF v2"


def test_delete_investment_type_no_assets(client, itype):
    res = client.delete(
        f"/api/portfolio/investment-types/{itype.id}/",
        content_type="application/json",
    )
    assert res.status_code == 204
    assert not InvestmentType.objects.filter(pk=itype.id).exists()


def test_delete_investment_type_reassign_assets(client, asset, itype, itype_no_ticker):
    # asset fixture belongs to itype; reassign to itype_no_ticker
    res = client.delete(
        f"/api/portfolio/investment-types/{itype.id}/",
        data={"assets_action": "reassign", "reassign_to": itype_no_ticker.id},
        content_type="application/json",
    )
    assert res.status_code == 204
    asset.refresh_from_db()
    assert asset.investment_type_id == itype_no_ticker.id
    assert not InvestmentType.objects.filter(pk=itype.id).exists()


def test_delete_investment_type_delete_assets(client, asset, itype):
    res = client.delete(
        f"/api/portfolio/investment-types/{itype.id}/",
        data={"assets_action": "delete"},
        content_type="application/json",
    )
    assert res.status_code == 204
    assert not Asset.objects.filter(pk=asset.id).exists()
    assert not InvestmentType.objects.filter(pk=itype.id).exists()


def test_delete_investment_type_null_assets(client, asset, itype):
    # Default (no body): Asset.investment_type becomes NULL (SET_NULL)
    res = client.delete(
        f"/api/portfolio/investment-types/{itype.id}/",
        content_type="application/json",
    )
    assert res.status_code == 204
    asset.refresh_from_db()
    assert asset.investment_type is None
    assert not InvestmentType.objects.filter(pk=itype.id).exists()
