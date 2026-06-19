import pytest
from django.contrib.auth.models import User
from django.test import Client

from finnet.models import WebAuthnChallenge


def test_webauthn_register_challenge_returns_serializable_options(client, test_user):
    res = client.post(
        "/api/auth/webauthn/register/challenge/",
        content_type="application/json",
    )

    assert res.status_code == 200

    data = res.json()
    assert data["authenticatorSelection"]["authenticatorAttachment"] == "platform"
    assert data["user"]["name"] == test_user.email
    assert data["user"]["id"]
    assert data["challenge"]

    pending = WebAuthnChallenge.objects.get(
        user=test_user, purpose=WebAuthnChallenge.REGISTER
    )
    assert pending.challenge


def test_webauthn_register_challenge_blocked_for_demo(db):
    demo = User.objects.create_user(username="demo@demo.com", password="pw")
    c = Client()
    c.force_login(demo)
    res = c.post(
        "/api/auth/webauthn/register/challenge/",
        content_type="application/json",
    )
    # IsNotDemoUser blocks the write — demo must not register passkeys.
    assert res.status_code == 403
    assert not WebAuthnChallenge.objects.filter(user=demo).exists()


def test_webauthn_auth_challenge_inactive_user_returns_empty(db):
    user = User.objects.create_user(
        username="inactive@test.com", email="inactive@test.com", password="pw"
    )
    user.is_active = False
    user.save(update_fields=["is_active"])
    res = Client().post(
        "/api/auth/webauthn/auth/challenge/",
        data={"email": "inactive@test.com"},
        content_type="application/json",
    )
    assert res.status_code == 200
    body = res.json()
    assert body["allowCredentials"] == []
    assert body["challenge"] == ""
    # No challenge row is created for a disabled account.
    assert not WebAuthnChallenge.objects.filter(user=user).exists()


def test_webauthn_auth_verify_blocks_inactive_user(db):
    user = User.objects.create_user(
        username="off@test.com", email="off@test.com", password="pw"
    )
    user.is_active = False
    user.save(update_fields=["is_active"])
    res = Client().post(
        "/api/auth/webauthn/auth/verify/",
        data={"email": "off@test.com", "rawId": ""},
        content_type="application/json",
    )
    # Disabled accounts never get JWTs, even with a registered passkey.
    assert res.status_code == 401
    assert "access" not in res.json()


@pytest.mark.parametrize(
    "path",
    [
        "/api/auth/webauthn/auth/challenge/",
        "/api/auth/webauthn/auth/verify/",
    ],
)
def test_webauthn_auth_endpoints_are_throttled(path):
    view = __import__("finnet.webauthn_views", fromlist=["WebAuthnAuthChallengeView"])
    from finnet.throttles import WebAuthnRateThrottle

    cls = (
        view.WebAuthnAuthChallengeView
        if "challenge" in path
        else view.WebAuthnAuthVerifyView
    )
    assert WebAuthnRateThrottle in cls.throttle_classes
