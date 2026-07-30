"""Thin wrappers around DRF's stock authentication classes that also stamp
UserProfile.last_activity_at. See touch_last_activity in fininzen.permissions
for why this lives here rather than in a permission class or middleware."""

from django.conf import settings
from drf_spectacular.extensions import OpenApiAuthenticationExtension
from drf_spectacular.plumbing import build_bearer_security_scheme_object
from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication

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
