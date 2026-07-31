"""
fininzen/mfa_views.py — TOTP (RFC 6238) multi-factor authentication endpoints.

Endpoints:
  POST /api/auth/mfa/setup/    — generate a pending secret + QR code (auth required)
  POST /api/auth/mfa/enable/   — confirm possession, flip mfa_enabled, issue backup codes
  POST /api/auth/mfa/disable/  — password-confirmed, clears secret + backup codes
  POST /api/auth/mfa/verify/   — mid-login: exchange {mfa_token, code} for JWT tokens

Login integration: ApprovalGatedTokenObtainPairSerializer.validate (fininzen/views.py)
short-circuits token issuance for mfa_enabled users, creating an MfaChallenge instead
of minting tokens — that challenge is what /verify/ consumes.
"""

import base64
import io
import logging
import secrets
from datetime import timedelta

import pyotp
import qrcode
import qrcode.image.svg
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import serializers, status
from rest_framework_simplejwt.tokens import RefreshToken

from fininzen import crypto
from fininzen.models import MfaBackupCode, MfaChallenge, UserProfile
from fininzen.permissions import IsNotDemoUser
from fininzen.throttles import MfaRateThrottle
from fininzen.jwt_cookies import set_auth_cookies
from fininzen.mixins import require_personal_context

logger = logging.getLogger(__name__)

MFA_CHALLENGE_TTL = 300  # seconds — mirrors WEBAUTHN_CHALLENGE_TTL
BACKUP_CODE_COUNT = 8
ISSUER_NAME = "Fininzen"


def _purge_expired_challenges():
    cutoff = timezone.now() - timedelta(seconds=MFA_CHALLENGE_TTL)
    MfaChallenge.objects.filter(created_at__lt=cutoff).delete()


def _generate_backup_codes(user):
    MfaBackupCode.objects.filter(user=user).delete()
    codes = [secrets.token_hex(5).upper() for _ in range(BACKUP_CODE_COUNT)]
    MfaBackupCode.objects.bulk_create(
        MfaBackupCode(user=user, code_hash=crypto.blind_index(code)) for code in codes
    )
    return codes


def _verify_code(profile, code):
    """True if `code` is a valid current TOTP or an unused backup code (consumed)."""
    code = (code or "").strip()
    if not code:
        return False
    if pyotp.TOTP(profile.mfa_secret).verify(code, valid_window=1):
        return True
    code_hash = crypto.blind_index(code.upper())
    backup = MfaBackupCode.objects.filter(
        user=profile.user, code_hash=code_hash, used_at__isnull=True
    ).first()
    if backup:
        backup.used_at = timezone.now()
        backup.save(update_fields=["used_at"])
        return True
    return False


class MfaSetupView(APIView):
    permission_classes = [IsAuthenticated, IsNotDemoUser]
    throttle_classes = [MfaRateThrottle]

    def post(self, request):
        require_personal_context(request)
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.mfa_enabled:
            return Response(
                {"detail": "MFA is already enabled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        secret = pyotp.random_base32()
        profile.mfa_secret = secret
        profile.save(update_fields=["mfa_secret"])

        uri = pyotp.TOTP(secret).provisioning_uri(
            name=request.user.email, issuer_name=ISSUER_NAME
        )
        img = qrcode.make(uri, image_factory=qrcode.image.svg.SvgImage)
        buf = io.BytesIO()
        img.save(buf)
        qr_svg_base64 = base64.b64encode(buf.getvalue()).decode("ascii")

        return Response({"secret": secret, "qr_svg_base64": qr_svg_base64})


class MfaEnableSerializer(serializers.Serializer):
    code = serializers.CharField(required=True)


class MfaEnableView(APIView):
    permission_classes = [IsAuthenticated, IsNotDemoUser]
    throttle_classes = [MfaRateThrottle]

    def post(self, request):
        require_personal_context(request)
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.mfa_enabled:
            return Response(
                {"detail": "MFA is already enabled."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not profile.mfa_secret:
            return Response(
                {"detail": "Call /mfa/setup/ first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = MfaEnableSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not pyotp.TOTP(profile.mfa_secret).verify(
            serializer.validated_data["code"], valid_window=1
        ):
            return Response(
                {"code": ["Codice non valido."]}, status=status.HTTP_400_BAD_REQUEST
            )

        profile.mfa_enabled = True
        profile.save(update_fields=["mfa_enabled"])
        backup_codes = _generate_backup_codes(request.user)
        logger.info("MfaEnableView: user=%s enabled MFA", request.user.id)
        return Response({"backup_codes": backup_codes})


class MfaDisableSerializer(serializers.Serializer):
    password = serializers.CharField(required=True, write_only=True)


class MfaDisableView(APIView):
    """Password-confirmed, like ChangePasswordView — shares its throttle scope."""

    permission_classes = [IsAuthenticated, IsNotDemoUser]
    throttle_scope = "account"

    def post(self, request):
        require_personal_context(request)
        serializer = MfaDisableSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not request.user.check_password(serializer.validated_data["password"]):
            return Response(
                {"password": ["Password corrente non corretta."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.mfa_enabled = False
        profile.mfa_secret = ""
        profile.save(update_fields=["mfa_enabled", "mfa_secret"])
        MfaBackupCode.objects.filter(user=request.user).delete()
        logger.info("MfaDisableView: user=%s disabled MFA", request.user.id)
        return Response({"detail": "MFA disattivata."})


class MfaVerifySerializer(serializers.Serializer):
    mfa_token = serializers.CharField(required=True)
    code = serializers.CharField(required=True)


class MfaVerifyView(APIView):
    """Mid-login: exchange a password-verified MfaChallenge + TOTP/backup code for JWTs."""

    permission_classes = [AllowAny]
    throttle_classes = [MfaRateThrottle]

    def post(self, request):
        _purge_expired_challenges()
        serializer = MfaVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            challenge = MfaChallenge.objects.get(
                token=serializer.validated_data["mfa_token"]
            )
        except MfaChallenge.DoesNotExist:
            return Response(
                {"detail": "MFA challenge invalid or expired."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user = challenge.user
        profile = getattr(user, "profile", None)
        if not profile or not profile.mfa_enabled:
            challenge.delete()
            return Response(
                {"detail": "MFA is not enabled for this account."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not _verify_code(profile, serializer.validated_data["code"]):
            # Deliberately NOT deleting the challenge on a wrong code: a mistyped
            # 6-digit code is common and shouldn't force the user back through
            # the password step. It still expires via MFA_CHALLENGE_TTL, and
            # MfaRateThrottle bounds guess attempts.
            return Response(
                {"code": ["Codice non valido."]}, status=status.HTTP_401_UNAUTHORIZED
            )

        challenge.delete()
        refresh = RefreshToken.for_user(user)
        response = Response({"access": str(refresh.access_token)})
        return set_auth_cookies(response, refresh)
