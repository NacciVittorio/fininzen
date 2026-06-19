"""
fininzen/views.py — Auth views: registration, JWT token, data-sharing grants.
"""

import logging
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.db import connection
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.generics import CreateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import (
    TokenObtainPairView as _BaseTokenView,
    TokenRefreshView as _BaseRefreshView,
)

from fininzen.jwt_cookies import (
    REFRESH_COOKIE_NAME,
    CsrfError,
    clear_auth_cookies,
    set_auth_cookies,
    verify_csrf,
)

from fininzen.models import (
    DataAccessGrant,
    ENABLED_FEATURE_KEYS,
    TRANSACTION_PREFERENCE_KEYS,
    UserProfile,
    normalize_enabled_features,
    normalize_transaction_preferences,
)
from fininzen.demo_seed import (
    DEMO_EMAIL,
    DEMO_SEED_VERSION,
    demo_month_key,
    ensure_demo_seed,
)
from fininzen.permissions import DEMO_USERNAME, IsNotDemoUser
from fininzen.throttles import (
    GrantRateThrottle,
    LoginRateThrottle,
    RegisterRateThrottle,
)
from fininzen.mixins import require_personal_context

logger = logging.getLogger(__name__)


class TokenObtainPairView(_BaseTokenView):
    throttle_classes = [LoginRateThrottle]

    def post(self, request, *args, **kwargs):
        # HIGH-21: keep the access token in the body (SPA holds it in memory),
        # move the refresh token into an httpOnly cookie.
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200 and "refresh" in response.data:
            set_auth_cookies(response, response.data.pop("refresh"))
        return response


class CookieTokenRefreshView(_BaseRefreshView):
    """Refresh the access token using the httpOnly refresh cookie.

    Reads the refresh token from the cookie (never the body), enforces the
    double-submit CSRF token, and rotates the refresh cookie on success.
    """

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        try:
            verify_csrf(request)
        except CsrfError:
            return Response(
                {"detail": "CSRF verification failed."},
                status=status.HTTP_403_FORBIDDEN,
            )
        token = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if not token:
            return Response(
                {"detail": "No refresh cookie."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        serializer = self.get_serializer(data={"refresh": token})
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken):
            response = Response(
                {"detail": "Refresh token invalid or expired."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            return clear_auth_cookies(response)
        data = dict(serializer.validated_data)
        new_refresh = data.pop("refresh", None)
        response = Response(data)
        if new_refresh:
            set_auth_cookies(response, new_refresh)
        return response


class LogoutView(APIView):
    """Clear the refresh cookie and blacklist the token (CSRF-protected)."""

    permission_classes = [AllowAny]

    def post(self, request):
        try:
            verify_csrf(request)
        except CsrfError:
            return Response(
                {"detail": "CSRF verification failed."},
                status=status.HTTP_403_FORBIDDEN,
            )
        token = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if token:
            try:
                RefreshToken(token).blacklist()
            except (TokenError, InvalidToken):
                pass
        response = Response(status=status.HTTP_205_RESET_CONTENT)
        return clear_auth_cookies(response)


class UserRegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["email", "password", "password2"]

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate(self, data):
        if data["password"] != data["password2"]:
            raise serializers.ValidationError({"password2": "Passwords do not match."})
        validate_password(data["password"])
        return data

    def create(self, validated_data):
        validated_data.pop("password2")
        user = User.objects.create_user(
            username=validated_data["email"],
            email=validated_data["email"],
            password=validated_data["password"],
        )
        try:
            from portfolio.services import ensure_default_contribution_sources

            ensure_default_contribution_sources(user)
        except Exception:
            logger.exception(
                "UserRegisterSerializer: contribution sources setup failed"
            )
        return user


class RegisterView(CreateAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [RegisterRateThrottle]
    serializer_class = UserRegisterSerializer


class DemoLoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        from portfolio.models import Asset, InvestmentType

        with transaction.atomic():
            demo_user, _created = User.objects.select_for_update().get_or_create(
                username=DEMO_EMAIL,
                defaults={"email": DEMO_EMAIL},
            )
            should_seed, _ = ensure_demo_seed(demo_user, Asset, InvestmentType)
            if should_seed:
                logger.info(
                    "DemoLoginView: seeding demo data for user=%s month=%s version=%s",
                    DEMO_EMAIL,
                    demo_month_key(),
                    DEMO_SEED_VERSION,
                )

        refresh = RefreshToken.for_user(demo_user)
        response = Response(
            {
                "access": str(refresh.access_token),
                "is_demo": True,
            }
        )
        return set_auth_cookies(response, refresh)


class HealthView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        # LOW-02: probe the DB as a real dependency. A failed probe must surface
        # as 503 (not an unhandled 500) so orchestrators / uptime checks read the
        # service as unhealthy rather than erroring.
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except Exception:
            logger.exception("health check: database probe failed")
            return Response(
                {"status": "error", "database": "unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"status": "ok", "database": "ok"})


# ── Grant helpers ──────────────────────────────────────────────────────────────


def _grant_to_dict(grant, perspective="given"):
    """Serialise a DataAccessGrant from the owner's or grantee's perspective."""
    if perspective == "given":
        return {
            "id": grant.id,
            "grantee_id": grant.grantee_id,
            "grantee_email": grant.grantee.email,
            "permission": grant.permission,
            "created_at": grant.created_at.isoformat(),
        }
    return {
        "id": grant.id,
        "owner_id": grant.owner_id,
        "owner_email": grant.owner.email,
        "permission": grant.permission,
        "created_at": grant.created_at.isoformat(),
    }


class GrantsView(APIView):
    """
    GET  /api/auth/grants/       — grants dati e ricevuti dall'utente corrente
    POST /api/auth/grants/       — { email, permission } → crea grant
    """

    permission_classes = [IsAuthenticated, IsNotDemoUser]
    throttle_classes = [GrantRateThrottle]

    def get(self, request):
        require_personal_context(request)
        given = DataAccessGrant.objects.filter(owner=request.user).select_related(
            "grantee"
        )
        received = DataAccessGrant.objects.filter(grantee=request.user).select_related(
            "owner"
        )
        return Response(
            {
                "given": [_grant_to_dict(g, "given") for g in given],
                "received": [_grant_to_dict(g, "received") for g in received],
            }
        )

    def post(self, request):
        require_personal_context(request)
        email = request.data.get("email", "").strip().lower()
        permission = request.data.get("permission", "read")

        if not email:
            return Response(
                {"error": "email richiesta"}, status=status.HTTP_400_BAD_REQUEST
            )
        if permission not in ("read", "write", "full"):
            return Response(
                {"error": "permission non valido"}, status=status.HTTP_400_BAD_REQUEST
            )

        grantee = User.objects.filter(email__iexact=email).first()
        if not grantee:
            return Response(
                {"error": "user_not_found"}, status=status.HTTP_400_BAD_REQUEST
            )
        if grantee == request.user:
            return Response(
                {"error": "Non puoi condividere con te stesso"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        grant, created = DataAccessGrant.objects.update_or_create(
            owner=request.user,
            grantee=grantee,
            defaults={"permission": permission},
        )
        logger.info(
            "GrantsView POST: owner=%s grantee=%s permission=%s created=%s",
            request.user,
            grantee,
            permission,
            created,
        )
        return Response(
            _grant_to_dict(grant, "given"),
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class GrantDetailView(APIView):
    """
    PATCH  /api/auth/grants/{id}/  — { permission } → aggiorna livello
    DELETE /api/auth/grants/{id}/  — revoca accesso
    """

    permission_classes = [IsAuthenticated, IsNotDemoUser]
    throttle_classes = [GrantRateThrottle]

    def _get_own_grant(self, request, pk):
        return get_object_or_404(DataAccessGrant, pk=pk, owner=request.user)

    def patch(self, request, pk):
        require_personal_context(request)
        grant = self._get_own_grant(request, pk)
        permission = request.data.get("permission")
        if permission not in ("read", "write", "full"):
            return Response(
                {"error": "permission non valido"}, status=status.HTTP_400_BAD_REQUEST
            )
        grant.permission = permission
        grant.save(update_fields=["permission"])
        grant.refresh_from_db()
        return Response(_grant_to_dict(grant, "given"))

    def delete(self, request, pk):
        require_personal_context(request)
        grant = self._get_own_grant(request, pk)
        grant.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserProfileSerializer(serializers.ModelSerializer):
    email = serializers.SerializerMethodField(read_only=True)
    privacy_preferences = serializers.JSONField(required=False)
    enabled_features = serializers.JSONField(required=False)
    dashboard_config = serializers.JSONField(required=False)
    dashboard_preferences = serializers.JSONField(required=False)
    transaction_preferences = serializers.JSONField(required=False)

    class Meta:
        model = UserProfile
        fields = [
            "email",
            "name",
            "decimal_separator",
            "privacy_preferences",
            "enabled_features",
            "dashboard_config",
            "dashboard_preferences",
            "transaction_preferences",
            "accounting_month_start_day",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["enabled_features"] = normalize_enabled_features(
            data.get("enabled_features")
        )
        data["transaction_preferences"] = normalize_transaction_preferences(
            data.get("transaction_preferences")
        )
        return data

    def get_email(self, obj):
        return obj.user.email

    def validate_privacy_preferences(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("privacy_preferences must be an object.")
        return value

    def validate_enabled_features(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("enabled_features must be an object.")
        invalid_keys = sorted(set(value) - set(ENABLED_FEATURE_KEYS))
        if invalid_keys:
            raise serializers.ValidationError(
                f"Unknown feature keys: {', '.join(invalid_keys)}."
            )
        invalid_values = sorted(
            key for key, enabled in value.items() if not isinstance(enabled, bool)
        )
        if invalid_values:
            raise serializers.ValidationError(
                f"Feature values must be boolean: {', '.join(invalid_values)}."
            )
        return {key: value[key] for key in ENABLED_FEATURE_KEYS if key in value}

    def validate_dashboard_config(self, value):
        # Shape-only validation: the canonical section catalog lives in the
        # frontend (DASH_DEFAULT / RETIRED_DASH_SECTION_IDS), which merges and
        # filters on load. Here we only enforce the [{id: str, visible: bool}]
        # shape and silently drop malformed entries.
        if not isinstance(value, list):
            raise serializers.ValidationError("dashboard_config must be a list.")
        cleaned = []
        for item in value:
            if (
                isinstance(item, dict)
                and isinstance(item.get("id"), str)
                and isinstance(item.get("visible"), bool)
            ):
                cleaned.append({"id": item["id"], "visible": item["visible"]})
        return cleaned

    def validate_dashboard_preferences(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError(
                "dashboard_preferences must be an object."
            )
        return value

    def validate_transaction_preferences(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError(
                "transaction_preferences must be an object."
            )
        invalid_keys = sorted(set(value) - set(TRANSACTION_PREFERENCE_KEYS))
        if invalid_keys:
            raise serializers.ValidationError(
                f"Unknown preference keys: {', '.join(invalid_keys)}."
            )
        invalid_values = sorted(
            key for key, enabled in value.items() if not isinstance(enabled, bool)
        )
        if invalid_values:
            raise serializers.ValidationError(
                f"Preference values must be boolean: {', '.join(invalid_values)}."
            )
        return {key: value[key] for key in TRANSACTION_PREFERENCE_KEYS if key in value}

    def validate_accounting_month_start_day(self, value):
        if not 1 <= value <= 31:
            raise serializers.ValidationError("Must be between 1 and 31.")
        return value


class ProfileView(APIView):
    """GET/PATCH /api/auth/profile/ — legge/aggiorna le preferenze utente persistenti."""

    permission_classes = [IsAuthenticated, IsNotDemoUser]

    def get(self, request):
        require_personal_context(request)
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        logger.debug(
            "ProfileView GET: user=%s separator=%s",
            request.user,
            profile.decimal_separator,
        )
        return Response(UserProfileSerializer(profile).data)

    def patch(self, request):
        require_personal_context(request)
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        # email is read-only — strip it if sent
        data = {k: v for k, v in request.data.items() if k != "email"}
        if isinstance(data.get("dashboard_preferences"), dict):
            current = (
                profile.dashboard_preferences
                if isinstance(profile.dashboard_preferences, dict)
                else {}
            )
            data["dashboard_preferences"] = {
                **current,
                **data["dashboard_preferences"],
            }
        # Merge transaction_preferences so a partial PATCH (e.g. only the
        # cashflow toggle) doesn't clobber the other keys.
        if isinstance(data.get("transaction_preferences"), dict):
            current = (
                profile.transaction_preferences
                if isinstance(profile.transaction_preferences, dict)
                else {}
            )
            data["transaction_preferences"] = {
                **current,
                **data["transaction_preferences"],
            }
        serializer = UserProfileSerializer(profile, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        logger.info(
            "ProfileView PATCH: user=%s separator=%s name=%s",
            request.user,
            serializer.instance.decimal_separator,
            serializer.instance.name,
        )
        return Response(UserProfileSerializer(serializer.instance).data)


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class ChangePasswordView(APIView):
    """POST /api/auth/change-password/ — cambia password dell'utente autenticato."""

    permission_classes = [IsAuthenticated, IsNotDemoUser]
    # HIGH-04: this endpoint verifies old_password, so rate-limit it to blunt
    # brute-force of the current password (scope shared with AccountView).
    throttle_scope = "account"

    def post(self, request):
        require_personal_context(request)
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(serializer.validated_data["old_password"]):
            return Response(
                {"old_password": ["Password corrente non corretta."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.set_password(serializer.validated_data["new_password"])
        user.save()
        logger.info("ChangePasswordView: user=%s changed password", user)
        return Response({"detail": "Password aggiornata."}, status=status.HTTP_200_OK)


class DeleteAccountSerializer(serializers.Serializer):
    password = serializers.CharField(required=True, write_only=True)
    confirm = serializers.CharField(required=True, write_only=True)

    def validate_confirm(self, value):
        if value != "DELETE":
            raise serializers.ValidationError("Confirmation must be DELETE.")
        return value


class AccountView(APIView):
    """DELETE /api/auth/account/ — elimina definitivamente utente e dati associati."""

    permission_classes = [IsAuthenticated, IsNotDemoUser]
    # HIGH-04: throttle the destructive, password-verifying account endpoint via
    # the global ScopedRateThrottle (keyed by user pk when authenticated).
    throttle_scope = "account"

    def delete(self, request):
        from fininzen.mixins import resolve_view_as

        if resolve_view_as(request):
            return Response(
                {"error": "delete_viewas_disabled"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if request.user.username == DEMO_USERNAME:
            return Response(
                {"error": "demo_account_delete_disabled"},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = DeleteAccountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not request.user.check_password(serializer.validated_data["password"]):
            return Response(
                {"password": ["Password corrente non corretta."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user_id = request.user.id
        username = request.user.username
        with transaction.atomic():
            request.user.delete()
            from portfolio.models import DashboardSummary, FireSettings

            DashboardSummary.objects.filter(owner_id=user_id).delete()
            FireSettings.objects.filter(owner_id=user_id).delete()
        logger.warning(
            "AccountView DELETE: deleted user_id=%s username=%s", user_id, username
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
