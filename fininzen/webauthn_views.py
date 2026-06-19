"""
fininzen/webauthn_views.py — WebAuthn (Face ID / Touch ID) endpoints.

Endpoints:
  POST /api/auth/webauthn/register/challenge/  — issue a registration challenge (auth required)
  POST /api/auth/webauthn/register/verify/     — verify attestation + store credential (auth required)
  POST /api/auth/webauthn/auth/challenge/      — issue an authentication challenge (open)
  POST /api/auth/webauthn/auth/verify/         — verify assertion + return JWT tokens (open)
"""

import json
import logging
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from webauthn import (
    generate_registration_options,
    verify_registration_response,
    generate_authentication_options,
    verify_authentication_response,
    options_to_json,
    base64url_to_bytes,
)
from webauthn.helpers.structs import (
    AuthenticatorAttachment,
    AuthenticatorSelectionCriteria,
    UserVerificationRequirement,
    ResidentKeyRequirement,
    PublicKeyCredentialDescriptor,
    AttestationConveyancePreference,
    RegistrationCredential,
    AuthenticationCredential,
)
from webauthn.helpers.exceptions import WebAuthnException

from fininzen.models import WebAuthnCredential, WebAuthnChallenge
from fininzen.permissions import IsNotDemoUser
from fininzen.throttles import WebAuthnRateThrottle
from fininzen.jwt_cookies import set_auth_cookies

logger = logging.getLogger(__name__)

# Malformed client payloads surface as these: WebAuthn verification errors
# (all subclass WebAuthnException), bad base64 in rawId (binascii.Error ⊂
# ValueError), and parse_raw on junk input (AttributeError). Catching this
# tuple — instead of a bare `Exception` — turns garbage input into a 4xx while
# letting genuine infra/programming errors propagate (and be logged) as 500s.
_WEBAUTHN_INPUT_ERRORS = (WebAuthnException, ValueError, TypeError, AttributeError)

RP_ID = settings.WEBAUTHN_RP_ID
RP_NAME = settings.WEBAUTHN_RP_NAME
ORIGIN = settings.WEBAUTHN_ORIGIN
CHALLENGE_TTL = settings.WEBAUTHN_CHALLENGE_TTL


def _purge_expired_challenges(user):
    cutoff = timezone.now() - timedelta(seconds=CHALLENGE_TTL)
    WebAuthnChallenge.objects.filter(user=user, created_at__lt=cutoff).delete()


class WebAuthnRegisterChallengeView(APIView):
    permission_classes = [IsAuthenticated, IsNotDemoUser]

    def post(self, request):
        user = request.user
        _purge_expired_challenges(user)

        existing = WebAuthnCredential.objects.filter(user=user).values_list(
            "credential_id", flat=True
        )
        exclude = [PublicKeyCredentialDescriptor(id=bytes(cid)) for cid in existing]

        options = generate_registration_options(
            rp_id=RP_ID,
            rp_name=RP_NAME,
            user_id=str(user.id).encode(),
            user_name=user.email,
            user_display_name=user.get_full_name() or user.email,
            exclude_credentials=exclude,
            authenticator_selection=AuthenticatorSelectionCriteria(
                authenticator_attachment=AuthenticatorAttachment.PLATFORM,
                user_verification=UserVerificationRequirement.REQUIRED,
                resident_key=ResidentKeyRequirement.PREFERRED,
            ),
            attestation=AttestationConveyancePreference.NONE,
        )

        # Store the challenge so we can verify it in the next request
        WebAuthnChallenge.objects.filter(
            user=user, purpose=WebAuthnChallenge.REGISTER
        ).delete()
        WebAuthnChallenge.objects.create(
            user=user,
            challenge=options.challenge,
            purpose=WebAuthnChallenge.REGISTER,
        )

        # Python 3.12 + py-webauthn 2.x: str-enum coercion can strip the enum
        # identity from authenticator_attachment so .value raises AttributeError.
        if (
            options.authenticator_selection
            and options.authenticator_selection.authenticator_attachment is not None
            and not hasattr(
                options.authenticator_selection.authenticator_attachment, "value"
            )
        ):
            options.authenticator_selection.authenticator_attachment = (
                AuthenticatorAttachment(
                    options.authenticator_selection.authenticator_attachment
                )
            )

        return Response(json.loads(options_to_json(options)))


class WebAuthnRegisterVerifyView(APIView):
    permission_classes = [IsAuthenticated, IsNotDemoUser]

    def post(self, request):
        user = request.user
        _purge_expired_challenges(user)

        try:
            pending = WebAuthnChallenge.objects.get(
                user=user, purpose=WebAuthnChallenge.REGISTER
            )
        except WebAuthnChallenge.DoesNotExist:
            return Response(
                {"detail": "No pending registration challenge. Request a new one."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        challenge_bytes = bytes(pending.challenge)
        pending.delete()

        try:
            credential = RegistrationCredential.parse_raw(json.dumps(request.data))
            verification = verify_registration_response(
                credential=credential,
                expected_challenge=challenge_bytes,
                expected_rp_id=RP_ID,
                expected_origin=ORIGIN,
                require_user_verification=True,
            )
        except _WEBAUTHN_INPUT_ERRORS as exc:
            logger.warning(
                "WebAuthn register verify failed for user %s: %s", user.id, exc
            )
            return Response(
                {"detail": "Registration verification failed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        credential_id = verification.credential_id
        if WebAuthnCredential.objects.filter(credential_id=credential_id).exists():
            return Response(
                {"detail": "Credential already registered."},
                status=status.HTTP_409_CONFLICT,
            )

        WebAuthnCredential.objects.create(
            user=user,
            credential_id=credential_id,
            public_key=verification.credential_public_key,
            sign_count=verification.sign_count,
        )

        return Response({"status": "ok"})


class WebAuthnAuthChallengeView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [WebAuthnRateThrottle]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        if not email:
            return Response(
                {"detail": "email is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            # Don't reveal whether the email exists — return empty options
            return Response({"allowCredentials": [], "challenge": ""})

        # A disabled account must not receive a usable challenge; mirror the
        # non-enumeration response used for unknown emails.
        if not user.is_active:
            return Response({"allowCredentials": [], "challenge": ""})

        _purge_expired_challenges(user)
        credentials = WebAuthnCredential.objects.filter(user=user)
        if not credentials.exists():
            return Response({"allowCredentials": [], "challenge": ""})

        allow = [
            PublicKeyCredentialDescriptor(id=bytes(c.credential_id))
            for c in credentials
        ]
        options = generate_authentication_options(
            rp_id=RP_ID,
            allow_credentials=allow,
            user_verification=UserVerificationRequirement.REQUIRED,
        )

        WebAuthnChallenge.objects.filter(
            user=user, purpose=WebAuthnChallenge.AUTHENTICATE
        ).delete()
        WebAuthnChallenge.objects.create(
            user=user,
            challenge=options.challenge,
            purpose=WebAuthnChallenge.AUTHENTICATE,
        )

        return Response(json.loads(options_to_json(options)))


class WebAuthnAuthVerifyView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [WebAuthnRateThrottle]

    def post(self, request):
        email = (request.data.get("email") or "").strip().lower()
        if not email:
            return Response(
                {"detail": "email is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return Response(
                {"detail": "Authentication failed."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # A disabled account must never be issued tokens (the standard
        # TokenObtainPairView enforces this); same generic 401 to avoid
        # revealing the account state.
        if not user.is_active:
            return Response(
                {"detail": "Authentication failed."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        _purge_expired_challenges(user)

        try:
            pending = WebAuthnChallenge.objects.get(
                user=user, purpose=WebAuthnChallenge.AUTHENTICATE
            )
        except WebAuthnChallenge.DoesNotExist:
            return Response(
                {"detail": "No pending authentication challenge."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        challenge_bytes = bytes(pending.challenge)

        try:
            raw_id = base64url_to_bytes(request.data.get("rawId", ""))
        except (ValueError, TypeError) as exc:
            # Malformed rawId (bad base64) — log the unexpected branch so a
            # client bug doesn't vanish behind a silent 401.
            logger.warning(
                "WebAuthn auth verify: malformed rawId for user %s: %s", user.id, exc
            )
            pending.delete()
            return Response(
                {"detail": "Authentication failed."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            stored = WebAuthnCredential.objects.get(user=user, credential_id=raw_id)
        except WebAuthnCredential.DoesNotExist:
            # Expected failure (unknown credential) — not an error worth a warning.
            pending.delete()
            return Response(
                {"detail": "Authentication failed."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        pending.delete()

        try:
            credential = AuthenticationCredential.parse_raw(json.dumps(request.data))
            verification = verify_authentication_response(
                credential=credential,
                expected_challenge=challenge_bytes,
                expected_rp_id=RP_ID,
                expected_origin=ORIGIN,
                credential_public_key=bytes(stored.public_key),
                credential_current_sign_count=stored.sign_count,
                require_user_verification=True,
            )
        except _WEBAUTHN_INPUT_ERRORS as exc:
            logger.warning("WebAuthn auth verify failed for user %s: %s", user.id, exc)
            return Response(
                {"detail": "Authentication failed."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        stored.sign_count = verification.new_sign_count
        stored.last_used_at = timezone.now()
        stored.save(update_fields=["sign_count", "last_used_at"])

        refresh = RefreshToken.for_user(user)
        response = Response({"access": str(refresh.access_token)})
        return set_auth_cookies(response, refresh)


class WebAuthnCredentialsView(APIView):
    """List and delete stored WebAuthn credentials (for Settings page)."""

    permission_classes = [IsAuthenticated, IsNotDemoUser]

    def get(self, request):
        creds = WebAuthnCredential.objects.filter(user=request.user).order_by(
            "created_at"
        )
        return Response(
            [
                {
                    "id": c.pk,
                    "created_at": c.created_at,
                    "last_used_at": c.last_used_at,
                }
                for c in creds
            ]
        )

    def delete(self, request):
        pk = request.data.get("id")
        deleted, _ = WebAuthnCredential.objects.filter(
            user=request.user, pk=pk
        ).delete()
        if not deleted:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
