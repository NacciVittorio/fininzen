"""Thin wrappers around DRF's stock authentication classes that also stamp
UserProfile.last_activity_at. See touch_last_activity in fininzen.permissions
for why this lives here rather than in a permission class or middleware."""

from django.conf import settings
from django.utils import timezone
from drf_spectacular.extensions import OpenApiAuthenticationExtension
from drf_spectacular.plumbing import build_bearer_security_scheme_object
from rest_framework.authentication import BaseAuthentication, SessionAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication

from fininzen.api_tokens import TOKEN_PREFIX, hash_token
from fininzen.models import ApiToken
from fininzen.permissions import touch_last_activity


class TouchingJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            touch_last_activity(result[0])
        return result


class TouchingSessionAuthentication(SessionAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            touch_last_activity(result[0])
        return result


class ApiTokenAuthentication(BaseAuthentication):
    """Authenticates `Authorization: Bearer fnz_...` requests against ApiToken.

    Distinguished from a JWT bearer token by the `fnz_` prefix, so both can
    share the Authorization header without ambiguity — a non-matching prefix
    just returns None (falls through to TouchingJWTAuthentication) rather
    than raising.
    """

    keyword = "Bearer"

    def authenticate(self, request):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith(f"{self.keyword} "):
            return None
        raw = auth_header[len(self.keyword) + 1 :].strip()
        if not raw.startswith(TOKEN_PREFIX):
            return None
        token = (
            ApiToken.objects.select_related("owner")
            .filter(token_hash=hash_token(raw), revoked_at__isnull=True)
            .first()
        )
        if token is None:
            raise AuthenticationFailed("Invalid or revoked API token.")
        if not token.owner.is_active:
            raise AuthenticationFailed("Account disabled.")
        ApiToken.objects.filter(pk=token.pk).update(last_used_at=timezone.now())
        return (token.owner, token)

    def authenticate_header(self, request):
        return self.keyword


# drf-spectacular special-cases JWTAuthentication/SessionAuthentication by exact
# class path to render securitySchemes (jwtAuth/cookieAuth) — it doesn't walk
# subclasses, so our wrappers above need their own extensions mirroring the
# built-in ones (drf_spectacular.contrib.rest_framework_simplejwt.SimpleJWTScheme
# and drf_spectacular.authentication.SessionScheme) or the schema silently loses
# both security schemes.
class TouchingJWTScheme(OpenApiAuthenticationExtension):
    target_class = "fininzen.authentication.TouchingJWTAuthentication"
    name = "jwtAuth"

    def get_security_definition(self, auto_schema):
        from rest_framework_simplejwt.settings import api_settings

        return build_bearer_security_scheme_object(
            header_name=getattr(api_settings, "AUTH_HEADER_NAME", "HTTP_AUTHORIZATION"),
            token_prefix=api_settings.AUTH_HEADER_TYPES[0],
            bearer_format="JWT",
        )


class TouchingSessionScheme(OpenApiAuthenticationExtension):
    target_class = "fininzen.authentication.TouchingSessionAuthentication"
    name = "cookieAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "apiKey",
            "in": "cookie",
            "name": settings.SESSION_COOKIE_NAME,
        }


class ApiTokenScheme(OpenApiAuthenticationExtension):
    target_class = "fininzen.authentication.ApiTokenAuthentication"
    name = "apiTokenAuth"

    def get_security_definition(self, auto_schema):
        return build_bearer_security_scheme_object(
            header_name="HTTP_AUTHORIZATION",
            token_prefix="Bearer",
            bearer_format="Opaque",
        )
