import pyotp
import pytest
from django.contrib.auth.models import User
from django.test import Client

from fininzen.models import MfaBackupCode, MfaChallenge, UserProfile


def _enable_mfa(client, user):
    """Helper: run setup+enable for an already-authenticated `client`, return secret.

    /mfa/setup/ get_or_create's a UserProfile row for `user`, defaulting to
    STATUS_PENDING — fine for real accounts (registration always creates an
    explicit profile row first) but the `test_user` fixture has no profile at
    all, so the login serializer's `profile is None -> APPROVED` fallback no
    longer applies afterwards. Pin it approved so login tests aren't blocked
    by a side effect of calling setup.
    """
    UserProfile.objects.update_or_create(
        user=user, defaults={"status": UserProfile.STATUS_APPROVED}
    )
    setup_res = client.post("/api/auth/mfa/setup/", content_type="application/json")
    secret = setup_res.json()["secret"]
    code = pyotp.TOTP(secret).now()
    enable_res = client.post(
        "/api/auth/mfa/enable/",
        data={"code": code},
        content_type="application/json",
    )
    return secret, enable_res


def test_mfa_setup_returns_secret_and_qr(client, test_user):
    res = client.post("/api/auth/mfa/setup/", content_type="application/json")

    assert res.status_code == 200
    body = res.json()
    assert body["secret"]
    assert body["qr_svg_base64"]
    test_user.refresh_from_db()
    assert test_user.profile.mfa_secret == body["secret"]
    assert test_user.profile.mfa_enabled is False


def test_mfa_setup_blocked_for_demo(db):
    demo = User.objects.create_user(username="demo@demo.com", password="pw")
    c = Client()
    c.force_login(demo)
    res = c.post("/api/auth/mfa/setup/", content_type="application/json")
    assert res.status_code == 403


def test_mfa_setup_requires_authentication():
    res = Client().post("/api/auth/mfa/setup/", content_type="application/json")
    assert res.status_code == 401


def test_mfa_enable_rejects_invalid_code(client, test_user):
    client.post("/api/auth/mfa/setup/", content_type="application/json")
    res = client.post(
        "/api/auth/mfa/enable/",
        data={"code": "000000"},
        content_type="application/json",
    )
    assert res.status_code == 400
    test_user.refresh_from_db()
    assert test_user.profile.mfa_enabled is False


def test_mfa_enable_requires_setup_first(client):
    res = client.post(
        "/api/auth/mfa/enable/",
        data={"code": "123456"},
        content_type="application/json",
    )
    assert res.status_code == 400


def test_mfa_enable_with_valid_code_returns_backup_codes(client, test_user):
    secret, enable_res = _enable_mfa(client, test_user)

    assert enable_res.status_code == 200
    codes = enable_res.json()["backup_codes"]
    assert len(codes) == 8
    assert len(set(codes)) == 8

    test_user.refresh_from_db()
    assert test_user.profile.mfa_enabled is True
    assert MfaBackupCode.objects.filter(user=test_user).count() == 8


def test_login_requires_mfa_when_enabled(client, test_user):
    _enable_mfa(client, test_user)

    res = Client().post(
        "/api/auth/token/",
        data={"username": test_user.username, "password": "testpass123"},
        content_type="application/json",
    )

    assert res.status_code == 200
    body = res.json()
    assert body["mfa_required"] is True
    assert body["mfa_token"]
    assert "access" not in body
    assert MfaChallenge.objects.filter(token=body["mfa_token"], user=test_user).exists()


def test_login_skips_mfa_when_disabled(client, test_user):
    res = Client().post(
        "/api/auth/token/",
        data={"username": test_user.username, "password": "testpass123"},
        content_type="application/json",
    )

    assert res.status_code == 200
    body = res.json()
    assert "mfa_required" not in body
    assert body["access"]


def test_mfa_verify_with_totp_code_issues_tokens(client, test_user):
    secret, _ = _enable_mfa(client, test_user)
    login_res = Client().post(
        "/api/auth/token/",
        data={"username": test_user.username, "password": "testpass123"},
        content_type="application/json",
    )
    mfa_token = login_res.json()["mfa_token"]

    res = Client().post(
        "/api/auth/mfa/verify/",
        data={"mfa_token": mfa_token, "code": pyotp.TOTP(secret).now()},
        content_type="application/json",
    )

    assert res.status_code == 200
    assert res.json()["access"]
    assert not MfaChallenge.objects.filter(token=mfa_token).exists()


def test_mfa_verify_with_wrong_code_keeps_challenge_alive(client, test_user):
    secret, _ = _enable_mfa(client, test_user)
    login_res = Client().post(
        "/api/auth/token/",
        data={"username": test_user.username, "password": "testpass123"},
        content_type="application/json",
    )
    mfa_token = login_res.json()["mfa_token"]

    res = Client().post(
        "/api/auth/mfa/verify/",
        data={"mfa_token": mfa_token, "code": "000000"},
        content_type="application/json",
    )

    assert res.status_code == 401
    # A mistyped code shouldn't force the user back through the password step.
    assert MfaChallenge.objects.filter(token=mfa_token).exists()


def test_mfa_verify_with_backup_code_is_single_use(client, test_user):
    _, enable_res = _enable_mfa(client, test_user)
    backup_code = enable_res.json()["backup_codes"][0]

    login_res = Client().post(
        "/api/auth/token/",
        data={"username": test_user.username, "password": "testpass123"},
        content_type="application/json",
    )
    res = Client().post(
        "/api/auth/mfa/verify/",
        data={"mfa_token": login_res.json()["mfa_token"], "code": backup_code},
        content_type="application/json",
    )
    assert res.status_code == 200

    login_res2 = Client().post(
        "/api/auth/token/",
        data={"username": test_user.username, "password": "testpass123"},
        content_type="application/json",
    )
    res2 = Client().post(
        "/api/auth/mfa/verify/",
        data={"mfa_token": login_res2.json()["mfa_token"], "code": backup_code},
        content_type="application/json",
    )
    assert res2.status_code == 401


def test_mfa_verify_rejects_unknown_token(db):
    res = Client().post(
        "/api/auth/mfa/verify/",
        data={"mfa_token": "does-not-exist", "code": "123456"},
        content_type="application/json",
    )
    assert res.status_code == 401


def test_mfa_disable_rejects_wrong_password(client, test_user):
    _enable_mfa(client, test_user)
    res = client.post(
        "/api/auth/mfa/disable/",
        data={"password": "wrongpassword"},
        content_type="application/json",
    )
    assert res.status_code == 400
    test_user.refresh_from_db()
    assert test_user.profile.mfa_enabled is True


def test_mfa_disable_clears_secret_and_backup_codes(client, test_user):
    _enable_mfa(client, test_user)
    res = client.post(
        "/api/auth/mfa/disable/",
        data={"password": "testpass123"},
        content_type="application/json",
    )
    assert res.status_code == 200
    test_user.refresh_from_db()
    assert test_user.profile.mfa_enabled is False
    assert test_user.profile.mfa_secret == ""
    assert MfaBackupCode.objects.filter(user=test_user).count() == 0


@pytest.mark.parametrize(
    "path",
    ["/api/auth/mfa/setup/", "/api/auth/mfa/enable/", "/api/auth/mfa/verify/"],
)
def test_mfa_endpoints_are_throttled(path):
    from fininzen import mfa_views
    from fininzen.throttles import MfaRateThrottle

    cls = {
        "/api/auth/mfa/setup/": mfa_views.MfaSetupView,
        "/api/auth/mfa/enable/": mfa_views.MfaEnableView,
        "/api/auth/mfa/verify/": mfa_views.MfaVerifyView,
    }[path]
    assert MfaRateThrottle in cls.throttle_classes


def test_mfa_disable_defines_account_throttle_scope():
    from fininzen import mfa_views

    assert mfa_views.MfaDisableView.throttle_scope == "account"
