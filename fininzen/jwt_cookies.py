"""HIGH-21: refresh-token-in-httpOnly-cookie helpers.

The access token stays short-lived and is returned in the JSON body (the SPA
keeps it in memory only). The refresh token is never exposed to JavaScript:
it travels in an httpOnly, SameSite=Lax cookie scoped to the auth endpoints.
Because the access token is sent via the Authorization header (not a cookie),
the authenticated API surface is immune to CSRF; the only cookie-authenticated
endpoints are refresh and logout, which additionally enforce a double-submit
CSRF token (a readable cookie that must be echoed back in a request header).
"""

import secrets
from datetime import timedelta

from django.conf import settings

REFRESH_COOKIE_NAME = "fn_refresh"
CSRF_COOKIE_NAME = "fn_csrf"
CSRF_HEADER_NAME = "X-CSRF-Token"
# The httpOnly refresh cookie is scoped to the auth endpoints so it is not
# attached to every /api/* request (only refresh/logout need it). The path is
# the *browser-visible* one (see settings.REFRESH_COOKIE_PATH): behind the
# Next.js app Caddy strips a `/fininzen` prefix before Django, so the cookie
# must be scoped to `/fininzen/api/auth/` even though Django routes `/api/auth/`.
REFRESH_COOKIE_PATH = getattr(settings, "REFRESH_COOKIE_PATH", "/api/auth/")
# The CSRF cookie must be readable by the SPA (served at "/") to echo it back as
# a header, so it is path "/". It carries no secret — just the double-submit
# nonce — so a broad path is fine.
CSRF_COOKIE_PATH = "/"


class CsrfError(Exception):
    """Raised when the double-submit CSRF token is missing or mismatched."""


def _refresh_max_age() -> int:
    lifetime = settings.SIMPLE_JWT.get("REFRESH_TOKEN_LIFETIME", timedelta(days=30))
    return int(lifetime.total_seconds())


def _cookie_secure() -> bool:
    # Mirror the session/CSRF cookie policy so all auth cookies share one source
    # of truth: secure in production, plain over http in dev/tests so the cookie
    # is actually stored. SESSION_COOKIE_SECURE already folds in the
    # DJANGO_SECURE_COOKIES opt-out used by plain-HTTP LAN deploys (see settings).
    if settings.DEBUG:
        return False
    return getattr(settings, "SESSION_COOKIE_SECURE", True)


def set_auth_cookies(response, refresh_token):
    """Attach the httpOnly refresh cookie + the readable CSRF cookie."""
    secure = _cookie_secure()
    max_age = _refresh_max_age()
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        str(refresh_token),
        max_age=max_age,
        httponly=True,
        secure=secure,
        samesite="Lax",
        path=REFRESH_COOKIE_PATH,
    )
    response.set_cookie(
        CSRF_COOKIE_NAME,
        secrets.token_urlsafe(32),
        max_age=max_age,
        httponly=False,
        secure=secure,
        samesite="Lax",
        path=CSRF_COOKIE_PATH,
    )
    return response


def clear_auth_cookies(response):
    response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH)
    response.delete_cookie(CSRF_COOKIE_NAME, path=CSRF_COOKIE_PATH)
    return response


def verify_csrf(request):
    """Validate the double-submit token on cookie-authenticated requests."""
    cookie = request.COOKIES.get(CSRF_COOKIE_NAME)
    header = request.headers.get(CSRF_HEADER_NAME)
    if not cookie or not header or not secrets.compare_digest(cookie, header):
        raise CsrfError()
