import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from expenses.models import Category, Expense
from finnet.models import DataAccessGrant, UserProfile
from portfolio.models import Asset, AssetTransaction, InvestmentType


def test_profile_get_creates_default_profile(client, test_user):
    res = client.get("/api/auth/profile/")

    assert res.status_code == 200
    data = res.json()
    assert data["decimal_separator"] == ","
    assert data["email"] == test_user.email
    assert data["name"] == ""
    assert data["privacy_preferences"] == {}
    assert data["enabled_features"] == {
        "dashboard": True,
        "cashflow": True,
        "accounts": True,
        "investments": True,
        "fire": True,
    }
    assert data["accounting_month_start_day"] == 1
    assert UserProfile.objects.get(user=test_user).decimal_separator == ","


def test_profile_get_returns_email_and_name(client, test_user):
    profile = UserProfile.objects.get_or_create(user=test_user)[0]
    profile.name = "Vittorio"
    profile.save()

    res = client.get("/api/auth/profile/")

    assert res.status_code == 200
    data = res.json()
    assert data["email"] == test_user.email
    assert data["name"] == "Vittorio"


def test_profile_patch_updates_decimal_separator(client, test_user):
    res = client.patch(
        "/api/auth/profile/",
        data={"decimal_separator": "."},
        content_type="application/json",
    )

    assert res.status_code == 200
    data = res.json()
    assert data["decimal_separator"] == "."
    assert UserProfile.objects.get(user=test_user).decimal_separator == "."


def test_profile_patch_updates_name(client, test_user):
    res = client.patch(
        "/api/auth/profile/",
        data={"name": "Vittorio"},
        content_type="application/json",
    )

    assert res.status_code == 200
    assert res.json()["name"] == "Vittorio"
    assert UserProfile.objects.get(user=test_user).name == "Vittorio"


def test_profile_patch_updates_privacy_preferences(client, test_user):
    prefs = {"dashboard": {"net_worth": True}, "cashflow": {"income": False}}
    res = client.patch(
        "/api/auth/profile/",
        data={"privacy_preferences": prefs},
        content_type="application/json",
    )

    assert res.status_code == 200
    assert res.json()["privacy_preferences"] == prefs
    assert UserProfile.objects.get(user=test_user).privacy_preferences == prefs


def test_profile_patch_updates_enabled_features(client, test_user):
    features = {
        "dashboard": True,
        "cashflow": False,
        "accounts": True,
        "investments": False,
        "fire": True,
    }
    res = client.patch(
        "/api/auth/profile/",
        data={"enabled_features": features},
        content_type="application/json",
    )

    assert res.status_code == 200
    assert res.json()["enabled_features"] == features
    assert UserProfile.objects.get(user=test_user).enabled_features == features


def test_profile_enabled_features_are_per_user(client, test_user):
    other = User.objects.create_user(
        username="other-profile@test.com",
        email="other-profile@test.com",
        password="testpass123",
    )
    profile, _ = UserProfile.objects.get_or_create(user=other)
    profile.enabled_features = {"fire": False}
    profile.save(update_fields=["enabled_features"])

    res = client.get("/api/auth/profile/")

    assert res.status_code == 200
    assert res.json()["enabled_features"]["fire"] is True


def test_profile_patch_rejects_invalid_enabled_features(client, test_user):
    res = client.patch(
        "/api/auth/profile/",
        data={"enabled_features": ["invalid"]},
        content_type="application/json",
    )

    assert res.status_code == 400


def test_profile_patch_rejects_unknown_enabled_feature(client, test_user):
    res = client.patch(
        "/api/auth/profile/",
        data={"enabled_features": {"dashboard": True, "unknown": False}},
        content_type="application/json",
    )

    assert res.status_code == 400


def test_profile_patch_rejects_non_boolean_enabled_feature(client, test_user):
    res = client.patch(
        "/api/auth/profile/",
        data={"enabled_features": {"dashboard": "yes"}},
        content_type="application/json",
    )

    assert res.status_code == 400


def test_profile_get_defaults_dashboard_fields(client, test_user):
    res = client.get("/api/auth/profile/")

    assert res.status_code == 200
    data = res.json()
    assert data["dashboard_config"] == []
    assert data["dashboard_preferences"] == {}


def test_profile_patch_updates_dashboard_config(client, test_user):
    config = [
        {"id": "monthly_overview", "visible": True},
        {"id": "wealth_trend", "visible": False},
    ]
    res = client.patch(
        "/api/auth/profile/",
        data={"dashboard_config": config},
        content_type="application/json",
    )

    assert res.status_code == 200
    assert res.json()["dashboard_config"] == config
    assert UserProfile.objects.get(user=test_user).dashboard_config == config


def test_profile_patch_drops_malformed_dashboard_config_entries(client, test_user):
    res = client.patch(
        "/api/auth/profile/",
        data={
            "dashboard_config": [
                {"id": "wealth_trend", "visible": True},
                {"id": "no_visible_field"},
                {"visible": True},
                {"id": 123, "visible": True},
                {"id": "bad_visible", "visible": "yes"},
                "garbage",
            ]
        },
        content_type="application/json",
    )

    assert res.status_code == 200
    # Only the well-formed entry survives.
    assert res.json()["dashboard_config"] == [{"id": "wealth_trend", "visible": True}]


def test_profile_patch_rejects_non_list_dashboard_config(client, test_user):
    res = client.patch(
        "/api/auth/profile/",
        data={"dashboard_config": {"id": "wealth_trend"}},
        content_type="application/json",
    )

    assert res.status_code == 400


def test_profile_patch_updates_dashboard_preferences(client, test_user):
    prefs = {
        "monthly_overview": {"mode": "single", "year": 2026, "monthRange": 12},
        "wealth_metrics": ["wealth", "balance"],
    }
    res = client.patch(
        "/api/auth/profile/",
        data={"dashboard_preferences": prefs},
        content_type="application/json",
    )

    assert res.status_code == 200
    assert res.json()["dashboard_preferences"] == prefs
    assert UserProfile.objects.get(user=test_user).dashboard_preferences == prefs


def test_profile_patch_merges_dashboard_preferences(client, test_user):
    profile, _ = UserProfile.objects.get_or_create(user=test_user)
    profile.dashboard_preferences = {
        "monthly_overview": {"mode": "single", "year": 2024, "monthRange": 12},
        "wealth_metrics": ["wealth", "balance"],
    }
    profile.save(update_fields=["dashboard_preferences"])

    res = client.patch(
        "/api/auth/profile/",
        data={
            "dashboard_preferences": {
                "monthly_overview": {
                    "mode": "compare",
                    "yearA": 2023,
                    "yearB": 2024,
                    "monthRange": 6,
                }
            }
        },
        content_type="application/json",
    )

    assert res.status_code == 200
    prefs = res.json()["dashboard_preferences"]
    assert prefs["monthly_overview"] == {
        "mode": "compare",
        "yearA": 2023,
        "yearB": 2024,
        "monthRange": 6,
    }
    assert prefs["wealth_metrics"] == ["wealth", "balance"]
    assert UserProfile.objects.get(user=test_user).dashboard_preferences == prefs


def test_profile_patch_rejects_non_dict_dashboard_preferences(client, test_user):
    res = client.patch(
        "/api/auth/profile/",
        data={"dashboard_preferences": ["invalid"]},
        content_type="application/json",
    )

    assert res.status_code == 400


def test_profile_get_defaults_transaction_preferences(client, test_user):
    res = client.get("/api/auth/profile/")

    assert res.status_code == 200
    assert res.json()["transaction_preferences"] == {
        "cashflow_default_verified": False,
        "cashflow_autofill_last_account": False,
        "investments_default_verified": False,
    }


def test_profile_patch_merges_transaction_preferences(client, test_user):
    profile, _ = UserProfile.objects.get_or_create(user=test_user)
    profile.transaction_preferences = {"cashflow_default_verified": True}
    profile.save(update_fields=["transaction_preferences"])

    res = client.patch(
        "/api/auth/profile/",
        data={"transaction_preferences": {"investments_default_verified": True}},
        content_type="application/json",
    )

    assert res.status_code == 200
    prefs = res.json()["transaction_preferences"]
    # The partial PATCH must not clobber the previously-set key.
    assert prefs["cashflow_default_verified"] is True
    assert prefs["investments_default_verified"] is True
    assert prefs["cashflow_autofill_last_account"] is False


def test_profile_patch_rejects_unknown_transaction_preference_key(client, test_user):
    res = client.patch(
        "/api/auth/profile/",
        data={"transaction_preferences": {"bogus_key": True}},
        content_type="application/json",
    )

    assert res.status_code == 400


def test_profile_dashboard_config_is_per_user(client, test_user):
    other = User.objects.create_user(
        username="other-dash@test.com",
        email="other-dash@test.com",
        password="testpass123",
    )
    profile, _ = UserProfile.objects.get_or_create(user=other)
    profile.dashboard_config = [{"id": "wealth_trend", "visible": False}]
    profile.save(update_fields=["dashboard_config"])

    res = client.get("/api/auth/profile/")

    assert res.status_code == 200
    # test_user has not customised anything yet.
    assert res.json()["dashboard_config"] == []


def test_profile_patch_updates_accounting_month_start_day(client, test_user):
    res = client.patch(
        "/api/auth/profile/",
        data={"accounting_month_start_day": 27},
        content_type="application/json",
    )

    assert res.status_code == 200
    assert res.json()["accounting_month_start_day"] == 27
    assert UserProfile.objects.get(user=test_user).accounting_month_start_day == 27


@pytest.mark.parametrize("value", [0, 32])
def test_profile_patch_rejects_invalid_accounting_month_start_day(client, value):
    res = client.patch(
        "/api/auth/profile/",
        data={"accounting_month_start_day": value},
        content_type="application/json",
    )

    assert res.status_code == 400


def test_profile_patch_rejects_invalid_privacy_preferences(client, test_user):
    res = client.patch(
        "/api/auth/profile/",
        data={"privacy_preferences": ["invalid"]},
        content_type="application/json",
    )

    assert res.status_code == 400


def test_profile_patch_ignores_email_update(client, test_user):
    original_email = test_user.email
    res = client.patch(
        "/api/auth/profile/",
        data={"email": "hacker@evil.com"},
        content_type="application/json",
    )

    assert res.status_code == 200
    test_user.refresh_from_db()
    assert test_user.email == original_email


def test_profile_patch_rejects_invalid_separator(client, test_user):
    res = client.patch(
        "/api/auth/profile/",
        data={"decimal_separator": "x"},
        content_type="application/json",
    )

    assert res.status_code == 400


def test_profile_requires_authentication():
    anon = APIClient()
    assert anon.get("/api/auth/profile/").status_code == 401
    assert anon.patch("/api/auth/profile/", data={}, format="json").status_code == 401


def test_change_password_rejects_wrong_current(client, test_user):
    res = client.post(
        "/api/auth/change-password/",
        data={"old_password": "wrongpassword", "new_password": "NewPass123!"},
        content_type="application/json",
    )

    assert res.status_code == 400
    assert "old_password" in res.json()


def test_change_password_updates_user(client, test_user):
    res = client.post(
        "/api/auth/change-password/",
        data={"old_password": "testpass123", "new_password": "NewPass456!"},
        content_type="application/json",
    )

    assert res.status_code == 200
    test_user.refresh_from_db()
    assert test_user.check_password("NewPass456!")


def test_change_password_requires_authentication():
    anon = APIClient()
    res = anon.post(
        "/api/auth/change-password/",
        data={"old_password": "x", "new_password": "y"},
        format="json",
    )
    assert res.status_code == 401


def test_delete_account_requires_confirmation(client):
    res = client.delete(
        "/api/auth/account/",
        data={"password": "testpass123", "confirm": "WRONG"},
        content_type="application/json",
    )

    assert res.status_code == 400


def test_delete_account_rejects_wrong_password(client, test_user):
    res = client.delete(
        "/api/auth/account/",
        data={"password": "wrongpassword", "confirm": "DELETE"},
        content_type="application/json",
    )

    assert res.status_code == 400
    assert User.objects.filter(pk=test_user.pk).exists()


def test_delete_account_removes_user_and_owned_data(client, test_user):
    other = User.objects.create_user(
        username="other", email="other@example.com", password="testpass123"
    )
    DataAccessGrant.objects.create(owner=test_user, grantee=other, permission="read")
    DataAccessGrant.objects.create(owner=other, grantee=test_user, permission="read")
    category = Category.objects.create(name="Food", owner=test_user)
    Expense.objects.create(
        description="Lunch",
        amount="12.00",
        category=category,
        date="2026-05-27",
        owner=test_user,
    )
    inv_type = InvestmentType.objects.create(name="Bank", owner=test_user)
    asset = Asset.objects.create(
        name="Checking", investment_type=inv_type, owner=test_user
    )
    AssetTransaction.objects.create(
        asset=asset,
        transaction_type=AssetTransaction.CASH_IN,
        date="2026-05-27",
        shares="1",
        price_per_share="100.00",
        owner=test_user,
        is_verified=True,
    )

    res = client.delete(
        "/api/auth/account/",
        data={"password": "testpass123", "confirm": "DELETE"},
        content_type="application/json",
    )

    assert res.status_code == 204
    assert not User.objects.filter(pk=test_user.pk).exists()
    assert not Category.objects.filter(owner=test_user).exists()
    assert not Expense.objects.filter(owner=test_user).exists()
    assert not InvestmentType.objects.filter(owner=test_user).exists()
    assert not Asset.objects.filter(owner=test_user).exists()
    assert not DataAccessGrant.objects.filter(owner=test_user).exists()
    assert not DataAccessGrant.objects.filter(grantee=test_user).exists()


# ── HIGH-04: throttling of sensitive account endpoints ──────────────────────────


@pytest.mark.parametrize("view_name", ["AccountView", "ChangePasswordView"])
def test_account_endpoints_define_throttle_scope(view_name):
    import finnet.views as views

    assert getattr(views, view_name).throttle_scope == "account"


def test_change_password_is_rate_limited(client):
    from django.core.cache import cache

    # Self-contained: clear before so prior state can't help, and after so the
    # 11 requests we add don't leak into other account-scope tests.
    cache.clear()
    try:
        last = None
        for _ in range(11):
            last = client.post(
                "/api/auth/change-password/",
                data={"old_password": "wrongpassword", "new_password": "NewPass123!"},
                content_type="application/json",
            )
        # account scope is 10/minute → the 11th attempt is throttled.
        assert last.status_code == 429
    finally:
        cache.clear()
