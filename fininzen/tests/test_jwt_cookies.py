"""HIGH-21: refresh-token-in-httpOnly-cookie flow."""

import pytest
from django.contrib.auth.models import User
from django.test import Client

from fininzen.jwt_cookies import (
    CSRF_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    REFRESH_COOKIE_PATH,
)


@pytest.fixture
def password_user(db):
    return User.objects.create_user(
        username="cookie@test.com", email="cookie@test.com", password="pw-12345678"
    )


def _login(client, username="cookie@test.com", password="pw-12345678"):
    return client.post(
        "/api/auth/token/",
        data={"username": username, "password": password},
        content_type="application/json",
    )


def test_login_puts_refresh_in_cookie_not_body(password_user):
    client = Client()
    res = _login(client)
    assert res.status_code == 200
    body = res.json()
    assert body.get("access")
    assert "refresh" not in body  # never exposed to JS
    assert REFRESH_COOKIE_NAME in res.cookies
    assert res.cookies[REFRESH_COOKIE_NAME]["httponly"]
    assert CSRF_COOKIE_NAME in res.cookies
    assert not res.cookies[CSRF_COOKIE_NAME]["httponly"]  # double-submit token


def test_refresh_cookie_is_scoped_to_configured_path(password_user):
    # The refresh cookie must be pinned to the browser-visible auth path. If it
    # silently defaulted to "/" (or drifted from the path the frontend calls),
    # the browser would stop re-sending it and token refresh would break — the
    # exact failure mode the /fininzen/api prefix introduces.
    client = Client()
    res = _login(client)
    assert res.cookies[REFRESH_COOKIE_NAME]["path"] == REFRESH_COOKIE_PATH


def test_refresh_via_cookie_with_csrf_rotates(password_user):
    client = Client()
    _login(client)
    csrf = client.cookies[CSRF_COOKIE_NAME].value
    res = client.post(
        "/api/auth/token/refresh/",
        content_type="application/json",
        HTTP_X_CSRF_TOKEN=csrf,
    )
    assert res.status_code == 200
    body = res.json()
    assert body.get("access")
    assert "refresh" not in body
    # Rotation issues a fresh refresh cookie.
    assert REFRESH_COOKIE_NAME in res.cookies


def test_refresh_without_csrf_header_is_forbidden(password_user):
    client = Client()
    _login(client)
    res = client.post("/api/auth/token/refresh/", content_type="application/json")
    assert res.status_code == 403


def test_refresh_with_mismatched_csrf_is_forbidden(password_user):
    client = Client()
    _login(client)
    res = client.post(
        "/api/auth/token/refresh/",
        content_type="application/json",
        HTTP_X_CSRF_TOKEN="not-the-cookie-value",
    )
    assert res.status_code == 403


def test_demo_login_puts_refresh_in_cookie_not_body(db):
    client = Client()
    res = client.post("/api/auth/demo/")
    assert res.status_code == 200
    body = res.json()
    assert body.get("access")
    assert body.get("is_demo") is True
    assert "refresh" not in body
    assert REFRESH_COOKIE_NAME in client.cookies


def test_logout_clears_cookie(password_user):
    client = Client()
    _login(client)
    csrf = client.cookies[CSRF_COOKIE_NAME].value
    res = client.post(
        "/api/auth/logout/",
        content_type="application/json",
        HTTP_X_CSRF_TOKEN=csrf,
    )
    assert res.status_code == 205
    # Cookie is expired/cleared in the response.
    assert res.cookies[REFRESH_COOKIE_NAME].value == ""


# ── Mobile (native app) flow: refresh travels in the JSON body, no cookie ──────


def _mobile_login(client, username="cookie@test.com", password="pw-12345678"):
    return client.post(
        "/api/auth/token/",
        data={"username": username, "password": password},
        content_type="application/json",
        HTTP_X_CLIENT="mobile",
    )


def test_mobile_login_returns_refresh_in_body_no_cookie(password_user):
    client = Client()
    res = _mobile_login(client)
    assert res.status_code == 200
    body = res.json()
    assert body.get("access")
    # The native client stores the refresh itself (Keychain), so it must be in
    # the body and must NOT be set as a cookie.
    assert body.get("refresh")
    assert REFRESH_COOKIE_NAME not in res.cookies


def test_mobile_refresh_via_body_rotates_without_csrf(password_user):
    client = Client()
    refresh = _mobile_login(client).json()["refresh"]
    res = client.post(
        "/api/auth/token/refresh/",
        data={"refresh": refresh},
        content_type="application/json",
        HTTP_X_CLIENT="mobile",
    )
    assert res.status_code == 200
    body = res.json()
    assert body.get("access")
    # Rotation returns a fresh refresh in the body (ROTATE_REFRESH_TOKENS).
    assert body.get("refresh")
    assert REFRESH_COOKIE_NAME not in res.cookies


def test_mobile_refresh_without_token_is_unauthorized(password_user):
    client = Client()
    res = client.post(
        "/api/auth/token/refresh/",
        data={},
        content_type="application/json",
        HTTP_X_CLIENT="mobile",
    )
    assert res.status_code == 401


def test_mobile_demo_login_returns_refresh_in_body(db):
    client = Client()
    res = client.post("/api/auth/demo/", HTTP_X_CLIENT="mobile")
    assert res.status_code == 200
    body = res.json()
    assert body.get("access")
    assert body.get("is_demo") is True
    assert body.get("refresh")
    assert REFRESH_COOKIE_NAME not in client.cookies


def test_mobile_logout_with_body_refresh(password_user):
    client = Client()
    refresh = _mobile_login(client).json()["refresh"]
    res = client.post(
        "/api/auth/logout/",
        data={"refresh": refresh},
        content_type="application/json",
        HTTP_X_CLIENT="mobile",
    )
    assert res.status_code == 205
    # The blacklisted refresh can no longer be used to mint a new access token.
    reuse = client.post(
        "/api/auth/token/refresh/",
        data={"refresh": refresh},
        content_type="application/json",
        HTTP_X_CLIENT="mobile",
    )
    assert reuse.status_code == 401
