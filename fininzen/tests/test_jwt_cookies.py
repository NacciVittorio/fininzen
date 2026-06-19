"""HIGH-21: refresh-token-in-httpOnly-cookie flow."""

import pytest
from django.contrib.auth.models import User
from django.test import Client

from fininzen.jwt_cookies import CSRF_COOKIE_NAME, REFRESH_COOKIE_NAME


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
