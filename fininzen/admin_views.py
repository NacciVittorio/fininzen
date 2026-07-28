"""
fininzen/admin_views.py — Admin portal: user approval/rejection, role
management, and a basic overview. All endpoints require IsAdmin.
"""

from django.contrib.auth.models import User
from django.db.models import Count
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from fininzen.models import UserProfile
from fininzen.permissions import IsAdmin


def _blacklist_outstanding_tokens(user):
    """Revoke a rejected user's outstanding refresh tokens.

    Login is already blocked going forward (ApprovalGatedTokenObtainPairSerializer),
    but a refresh token issued before rejection would otherwise still mint new
    access tokens for the rest of its 30-day lifetime.
    """
    from rest_framework_simplejwt.token_blacklist.models import (
        BlacklistedToken,
        OutstandingToken,
    )

    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


class AdminUserSerializer(serializers.ModelSerializer):
    email = serializers.CharField(source="user.email", read_only=True)
    date_joined = serializers.DateTimeField(source="user.date_joined", read_only=True)
    is_active = serializers.BooleanField(source="user.is_active", read_only=True)

    class Meta:
        model = UserProfile
        fields = [
            "user_id",
            "email",
            "name",
            "status",
            "role",
            "approved_at",
            "date_joined",
            "is_active",
        ]
        read_only_fields = fields


class AdminUserViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """
    GET  /api/admin/users/               — list, ?status=pending|approved|rejected, ?role=user|admin
    GET  /api/admin/users/{id}/          — detail
    POST /api/admin/users/{id}/approve/  — approve a pending/rejected user
    POST /api/admin/users/{id}/reject/   — reject a pending/approved user
    POST /api/admin/users/{id}/set_role/ — { "role": "admin" | "user" }
    """

    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = AdminUserSerializer
    queryset = UserProfile.objects.select_related("user").order_by(
        "-user__date_joined"
    )

    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get("status")
        if status_filter in dict(UserProfile.STATUS_CHOICES):
            qs = qs.filter(status=status_filter)
        role_filter = self.request.query_params.get("role")
        if role_filter in dict(UserProfile.ROLE_CHOICES):
            qs = qs.filter(role=role_filter)
        return qs

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        profile = self.get_object()
        profile.status = UserProfile.STATUS_APPROVED
        profile.approved_at = timezone.now()
        profile.approved_by = request.user
        profile.save(update_fields=["status", "approved_at", "approved_by"])
        return Response(AdminUserSerializer(profile).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        profile = self.get_object()
        if profile.user_id == request.user.id:
            return Response(
                {"error": "cannot_reject_self"}, status=status.HTTP_400_BAD_REQUEST
            )
        profile.status = UserProfile.STATUS_REJECTED
        profile.save(update_fields=["status"])
        _blacklist_outstanding_tokens(profile.user)
        return Response(AdminUserSerializer(profile).data)

    @action(detail=True, methods=["post"])
    def set_role(self, request, pk=None):
        profile = self.get_object()
        new_role = request.data.get("role")
        if new_role not in dict(UserProfile.ROLE_CHOICES):
            return Response(
                {"error": "invalid_role"}, status=status.HTTP_400_BAD_REQUEST
            )
        if profile.user_id == request.user.id and new_role != UserProfile.ROLE_ADMIN:
            other_admins_exist = (
                UserProfile.objects.filter(role=UserProfile.ROLE_ADMIN)
                .exclude(pk=profile.pk)
                .exists()
            )
            if not other_admins_exist:
                return Response(
                    {"error": "cannot_remove_last_admin"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        profile.role = new_role
        profile.save(update_fields=["role"])
        return Response(AdminUserSerializer(profile).data)


class AdminOverviewView(APIView):
    """GET /api/admin/overview/ — user counts only.

    status/role are plain CharFields (no application-level encryption), so
    these are safe DB-level Count() aggregates. Don't extend this to sum
    encrypted columns (expenses/portfolio notes use EncryptedTextField) —
    those can't be aggregated in SQL and would need a Python-side decrypt+sum.
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        by_status = dict(
            UserProfile.objects.values("status")
            .annotate(n=Count("id"))
            .values_list("status", "n")
        )
        by_role = dict(
            UserProfile.objects.values("role")
            .annotate(n=Count("id"))
            .values_list("role", "n")
        )
        return Response(
            {
                "total_users": User.objects.count(),
                "by_status": {
                    s: by_status.get(s, 0) for s, _ in UserProfile.STATUS_CHOICES
                },
                "by_role": {r: by_role.get(r, 0) for r, _ in UserProfile.ROLE_CHOICES},
                "pending_count": by_status.get(UserProfile.STATUS_PENDING, 0),
            }
        )
