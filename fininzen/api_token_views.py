"""
fininzen/api_token_views.py — management endpoints for ApiToken (Settings page).

Endpoints:
  GET  /api/auth/api-tokens/       — list the caller's tokens (never the raw token/hash)
  POST /api/auth/api-tokens/       — { label } → create a token, raw value shown once
  DELETE /api/auth/api-tokens/{id}/ — soft-revoke (sets revoked_at, doesn't delete the row)

Only reachable via JWT/session auth (the default authentication classes) — an
ApiToken itself can never be used to create or revoke other tokens.
"""

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from fininzen.api_tokens import generate_token, hash_token, token_prefix
from fininzen.models import ApiToken
from fininzen.permissions import IsNotDemoUser
from fininzen.throttles import ApiTokenManageRateThrottle


def _token_to_dict(token):
    return {
        "id": token.pk,
        "label": token.label,
        "prefix": token.prefix,
        "scope": token.scope,
        "created_at": token.created_at,
        "last_used_at": token.last_used_at,
        "revoked_at": token.revoked_at,
    }


class ApiTokenListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsNotDemoUser]
    throttle_classes = [ApiTokenManageRateThrottle]

    def get(self, request):
        tokens = ApiToken.objects.filter(owner=request.user).order_by("-created_at")
        return Response([_token_to_dict(t) for t in tokens])

    def post(self, request):
        label = (request.data.get("label") or "").strip()
        if not label:
            return Response(
                {"detail": "label is required."}, status=status.HTTP_400_BAD_REQUEST
            )
        if len(label) > 64:
            return Response(
                {"detail": "label must be at most 64 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw = generate_token()
        token = ApiToken.objects.create(
            owner=request.user,
            label=label,
            token_hash=hash_token(raw),
            prefix=token_prefix(raw),
        )
        return Response(
            {**_token_to_dict(token), "token": raw}, status=status.HTTP_201_CREATED
        )


class ApiTokenDetailView(APIView):
    permission_classes = [IsAuthenticated, IsNotDemoUser]
    throttle_classes = [ApiTokenManageRateThrottle]

    def delete(self, request, pk):
        token = get_object_or_404(ApiToken, pk=pk, owner=request.user)
        if token.revoked_at is None:
            token.revoked_at = timezone.now()
            token.save(update_fields=["revoked_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
