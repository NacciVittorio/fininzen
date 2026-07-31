"""
fininzen/admin_views.py — Admin portal: user approval/rejection, role
management, record-count/health/integrity reporting, and an audit log. All
endpoints require IsAdmin.
"""

import glob
import os
from datetime import timezone as dt_timezone
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.contrib.auth.models import User
from django.db.models import Count, Max, Min
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from fininzen.models import (
    AdminActionLog,
    MfaBackupCode,
    UserProfile,
    WebAuthnCredential,
)
from fininzen.permissions import DEMO_USERNAME, IsAdmin
from portfolio.integrity import collect_integrity_issues
from portfolio.models import Asset, FXRateHistory

# Application models counted by /api/admin/stats/records/, mirroring the
# COPY_ORDER list in migrate_sqlite_to_postgres.py (minus auth.User, already
# covered by AdminOverviewView).
RECORD_COUNT_MODELS = [
    "portfolio.InvestmentType",
    "portfolio.ContributionSource",
    "portfolio.Asset",
    "expenses.Category",
    "expenses.RecurringExpense",
    "expenses.Expense",
    "portfolio.RecurringInvestmentPlan",
    "portfolio.AssetTransaction",
    "portfolio.AssetContributionSource",
    "portfolio.AssetPriceHistory",
    "portfolio.PortfolioSnapshot",
    "portfolio.FXRateHistory",
    "portfolio.AllocationTarget",
    "portfolio.DashboardSummary",
    "portfolio.FireSettings",
    "expenses.ExpenseDescriptionSuggestion",
    "expenses.Budget",
    "fininzen.UserProfile",
    "fininzen.DataAccessGrant",
]


def _blacklist_outstanding_tokens(user):
    """Revoke a user's outstanding refresh tokens.

    Login is already blocked going forward (ApprovalGatedTokenObtainPairSerializer
    for rejection, User.is_active for deactivation), but a refresh token issued
    earlier would otherwise still mint new access tokens for the rest of its
    30-day lifetime.
    """
    from rest_framework_simplejwt.token_blacklist.models import (
        BlacklistedToken,
        OutstandingToken,
    )

    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


def _log_admin_action(actor, action_name, target_user=None, **metadata):
    AdminActionLog.objects.create(
        actor=actor,
        action=action_name,
        target_user=target_user,
        metadata=metadata,
    )


class AdminUserSerializer(serializers.ModelSerializer):
    email = serializers.CharField(source="user.email", read_only=True)
    date_joined = serializers.DateTimeField(source="user.date_joined", read_only=True)
    is_active = serializers.BooleanField(source="user.is_active", read_only=True)
    last_login = serializers.DateTimeField(source="user.last_login", read_only=True)
    webauthn_credential_count = serializers.SerializerMethodField()

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
            "last_login",
            "last_activity_at",
            "mfa_enabled",
            "webauthn_credential_count",
        ]
        read_only_fields = fields

    def get_webauthn_credential_count(self, obj):
        return WebAuthnCredential.objects.filter(user_id=obj.user_id).count()


class AdminUserViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """
    GET  /api/admin/users/               — list, ?status=pending|approved|rejected, ?role=user|admin
    GET  /api/admin/users/{id}/          — detail
    POST /api/admin/users/{id}/approve/  — approve a pending/rejected user
    POST /api/admin/users/{id}/reject/   — reject a pending/approved user
    POST /api/admin/users/{id}/set_role/ — { "role": "admin" | "user" }
    POST /api/admin/users/{id}/set_active/ — { "is_active": bool }
    POST /api/admin/users/{id}/disable_mfa/ — force-disable TOTP MFA (account recovery)
    POST /api/admin/users/{id}/clear_webauthn/ — remove all WebAuthn/passkey credentials
    """

    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = AdminUserSerializer
    # The serializer's "user_id" field (and every action URL below) identifies
    # a row by the linked auth.User's id, NOT UserProfile's own pk — those are
    # separate auto-increment sequences that only look aligned when every User
    # ever created got exactly one UserProfile in lockstep (never true once a
    # superuser or the demo account exists without a profile). Without this,
    # get_object() resolves the URL id against UserProfile.pk and silently
    # fetches the wrong profile.
    lookup_field = "user_id"
    lookup_url_kwarg = "pk"
    queryset = (
        UserProfile.objects.select_related("user")
        .exclude(user__username=DEMO_USERNAME)
        .order_by("-user__date_joined")
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
        _log_admin_action(request.user, "approve_user", profile.user)
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
        _log_admin_action(request.user, "reject_user", profile.user)
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
        old_role = profile.role
        profile.role = new_role
        profile.save(update_fields=["role"])
        _log_admin_action(
            request.user, "set_role", profile.user, old_role=old_role, new_role=new_role
        )
        return Response(AdminUserSerializer(profile).data)

    @action(detail=True, methods=["post"])
    def set_active(self, request, pk=None):
        profile = self.get_object()
        new_active = request.data.get("is_active")
        if not isinstance(new_active, bool):
            return Response(
                {"error": "invalid_is_active"}, status=status.HTTP_400_BAD_REQUEST
            )
        if profile.user_id == request.user.id and not new_active:
            return Response(
                {"error": "cannot_deactivate_self"}, status=status.HTTP_400_BAD_REQUEST
            )
        user = profile.user
        user.is_active = new_active
        user.save(update_fields=["is_active"])
        if not new_active:
            _blacklist_outstanding_tokens(user)
        _log_admin_action(
            request.user,
            "set_active",
            user,
            is_active=new_active,
        )
        return Response(AdminUserSerializer(profile).data)

    @action(detail=True, methods=["post"])
    def disable_mfa(self, request, pk=None):
        profile = self.get_object()
        if profile.user_id == request.user.id:
            return Response(
                {"error": "use_personal_mfa_settings"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not profile.mfa_enabled:
            return Response(
                {"error": "mfa_not_enabled"}, status=status.HTTP_400_BAD_REQUEST
            )
        profile.mfa_enabled = False
        profile.mfa_secret = ""
        profile.save(update_fields=["mfa_enabled", "mfa_secret"])
        MfaBackupCode.objects.filter(user=profile.user).delete()
        _blacklist_outstanding_tokens(profile.user)
        _log_admin_action(request.user, "disable_mfa", profile.user)
        return Response(AdminUserSerializer(profile).data)

    @action(detail=True, methods=["post"])
    def clear_webauthn(self, request, pk=None):
        profile = self.get_object()
        if profile.user_id == request.user.id:
            return Response(
                {"error": "use_personal_mfa_settings"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        deleted, _ = WebAuthnCredential.objects.filter(user=profile.user).delete()
        if not deleted:
            return Response(
                {"error": "no_webauthn_credentials"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        _blacklist_outstanding_tokens(profile.user)
        _log_admin_action(
            request.user, "clear_webauthn", profile.user, credentials_removed=deleted
        )
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


class AdminRecordStatsView(APIView):
    """GET /api/admin/stats/records/ — per-model row counts.

    Simple visual report: absolute counts, including the shared demo
    account's rows (not filtered out — this is about DB size, not per-user
    stats). Reuses the model list from migrate_sqlite_to_postgres.COPY_ORDER.
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        counts = {}
        for label in RECORD_COUNT_MODELS:
            model = apps.get_model(label)
            counts[label] = model.objects.count()
        return Response(counts)


class AdminAuditLogEntrySerializer(serializers.ModelSerializer):
    actor_email = serializers.CharField(source="actor.email", read_only=True)
    target_email = serializers.CharField(
        source="target_user.email", read_only=True, default=None
    )

    class Meta:
        model = AdminActionLog
        fields = [
            "id",
            "actor_email",
            "action",
            "target_email",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields


class AdminAuditLogView(mixins.ListModelMixin, viewsets.GenericViewSet):
    """GET /api/admin/audit-log/ — admin action history, newest first.

    ?actor=<user_id> ?target_user=<user_id> ?action=<name>
    """

    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = AdminAuditLogEntrySerializer
    queryset = AdminActionLog.objects.select_related("actor", "target_user")

    def get_queryset(self):
        qs = super().get_queryset()
        actor_id = self.request.query_params.get("actor")
        if actor_id:
            qs = qs.filter(actor_id=actor_id)
        target_id = self.request.query_params.get("target_user")
        if target_id:
            qs = qs.filter(target_user_id=target_id)
        action_filter = self.request.query_params.get("action")
        if action_filter:
            qs = qs.filter(action=action_filter)
        return qs


class AdminHealthView(APIView):
    """GET /api/admin/health/ — operational freshness signals.

    Reads only data already persisted by existing jobs (Asset.last_price_update,
    FXRateHistory rows, the backup directory on disk) — no journalctl/systemd
    access from the web process.
    """

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        price_freshness = Asset.objects.filter(
            tracking_type=Asset.AUTO, is_archived=False
        ).aggregate(oldest=Min("last_price_update"), newest=Max("last_price_update"))
        fx_freshness = FXRateHistory.objects.aggregate(newest=Max("date"))
        return Response(
            {
                "prices": {
                    "oldest_update": price_freshness["oldest"],
                    "newest_update": price_freshness["newest"],
                },
                "fx": {
                    "newest_date": fx_freshness["newest"],
                },
                "backup": self._latest_backup(),
            }
        )

    def _latest_backup(self):
        backup_dir = Path(settings.BACKUP_DIR)
        if not backup_dir.is_dir():
            return None
        candidates = glob.glob(str(backup_dir / "fininzen_*.sqlite3.gz*"))
        if not candidates:
            return None
        latest = max(candidates, key=os.path.getmtime)
        return {
            "file": os.path.basename(latest),
            "modified_at": timezone.datetime.fromtimestamp(
                os.path.getmtime(latest), tz=dt_timezone.utc
            ),
        }


class AdminIntegrityView(APIView):
    """GET /api/admin/health/integrity/ — same checks as the
    audit_domain_integrity management command, for the admin UI."""

    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response(collect_integrity_issues())
