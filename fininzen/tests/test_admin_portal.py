"""Registration-approval gate, admin roles, and the admin portal API."""

import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from django.core.management import call_command
from django.test import Client
from rest_framework.test import APIClient

from fininzen.models import UserProfile


@pytest.fixture(autouse=True)
def _clear_cache():
    """Isolate throttle state (login/register scopes) between tests."""
    cache.clear()
    yield
    cache.clear()


def _login(username, password):
    return APIClient().post(
        "/api/auth/token/",
        data={"username": username, "password": password},
        format="json",
    )


@pytest.fixture
def pending_user(db):
    user = User.objects.create_user(
        username="pending@test.com", email="pending@test.com", password="Pass!123abc"
    )
    UserProfile.objects.create(user=user)
    return user


@pytest.fixture
def approved_user(db):
    user = User.objects.create_user(
        username="approved@test.com",
        email="approved@test.com",
        password="Pass!123abc",
    )
    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.status = UserProfile.STATUS_APPROVED
    profile.save(update_fields=["status"])
    return user


@pytest.fixture
def admin_user(db):
    user = User.objects.create_user(
        username="admin@test.com", email="admin@test.com", password="Pass!123abc"
    )
    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.status = UserProfile.STATUS_APPROVED
    profile.role = UserProfile.ROLE_ADMIN
    profile.save(update_fields=["status", "role"])
    return user


@pytest.fixture
def admin_client(admin_user):
    c = Client()
    c.force_login(admin_user)
    return c


# ── Registration → pending, login gate ──────────────────────────────────────


def test_register_creates_pending_user(db):
    res = APIClient().post(
        "/api/auth/register/",
        data={
            "email": "newcomer@test.com",
            "password": "SuperSecret123!",
            "password2": "SuperSecret123!",
        },
        format="json",
    )

    assert res.status_code == 201
    user = User.objects.get(email="newcomer@test.com")
    profile = UserProfile.objects.get(user=user)
    assert profile.status == UserProfile.STATUS_PENDING
    assert profile.role == UserProfile.ROLE_USER


def test_pending_user_cannot_login(pending_user):
    res = _login("pending@test.com", "Pass!123abc")

    assert res.status_code == 403
    assert res.json()["code"] == "account_pending"


def test_rejected_user_cannot_login(pending_user):
    profile = UserProfile.objects.get(user=pending_user)
    profile.status = UserProfile.STATUS_REJECTED
    profile.save(update_fields=["status"])

    res = _login("pending@test.com", "Pass!123abc")

    assert res.status_code == 403
    assert res.json()["code"] == "account_rejected"


def test_approved_user_can_login(approved_user):
    res = _login("approved@test.com", "Pass!123abc")

    assert res.status_code == 200
    assert res.json()["access"]


def test_user_without_profile_can_login(db):
    """Edge case: a bare User with no UserProfile at all defaults to approved."""
    User.objects.create_user(
        username="noprofile@test.com",
        email="noprofile@test.com",
        password="Pass!123abc",
    )

    res = _login("noprofile@test.com", "Pass!123abc")

    assert res.status_code == 200


def test_bad_credentials_return_401_not_403(approved_user):
    res = _login("approved@test.com", "wrong-password")

    assert res.status_code == 401


# ── Admin permission gate ────────────────────────────────────────────────────


def test_non_admin_cannot_list_admin_users(client, test_user):
    res = client.get("/api/admin/users/")

    assert res.status_code == 403


def test_anonymous_cannot_list_admin_users(db):
    res = APIClient().get("/api/admin/users/")

    assert res.status_code == 401


def test_admin_can_list_users(admin_client, pending_user):
    res = admin_client.get("/api/admin/users/")

    assert res.status_code == 200
    emails = {row["email"] for row in res.json()["results"]}
    assert "pending@test.com" in emails


def test_admin_can_filter_users_by_status(admin_client, pending_user, approved_user):
    res = admin_client.get("/api/admin/users/?status=approved")

    emails = {row["email"] for row in res.json()["results"]}
    assert "approved@test.com" in emails
    assert "pending@test.com" not in emails


# ── Approve / reject ─────────────────────────────────────────────────────────


def test_admin_can_approve_pending_user(admin_client, admin_user, pending_user):
    profile, _ = UserProfile.objects.get_or_create(user=pending_user)

    res = admin_client.post(f"/api/admin/users/{pending_user.id}/approve/")

    assert res.status_code == 200
    profile.refresh_from_db()
    assert profile.status == UserProfile.STATUS_APPROVED
    assert profile.approved_at is not None
    assert profile.approved_by_id == admin_user.id

    login_res = _login("pending@test.com", "Pass!123abc")
    assert login_res.status_code == 200


def test_admin_can_reject_pending_user(admin_client, pending_user):
    profile, _ = UserProfile.objects.get_or_create(user=pending_user)

    res = admin_client.post(f"/api/admin/users/{pending_user.id}/reject/")

    assert res.status_code == 200
    profile.refresh_from_db()
    assert profile.status == UserProfile.STATUS_REJECTED


def test_admin_cannot_reject_self(admin_client, admin_user):
    res = admin_client.post(f"/api/admin/users/{admin_user.id}/reject/")

    assert res.status_code == 400
    assert res.json()["error"] == "cannot_reject_self"


def test_reject_blacklists_outstanding_refresh_token(admin_client, approved_user):
    from fininzen.jwt_cookies import CSRF_COOKIE_NAME

    login_client = Client()
    login_res = login_client.post(
        "/api/auth/token/",
        data={"username": "approved@test.com", "password": "Pass!123abc"},
        content_type="application/json",
    )
    assert login_res.status_code == 200
    csrf = login_client.cookies[CSRF_COOKIE_NAME].value

    reject_res = admin_client.post(f"/api/admin/users/{approved_user.id}/reject/")
    assert reject_res.status_code == 200

    refresh_res = login_client.post(
        "/api/auth/token/refresh/",
        content_type="application/json",
        HTTP_X_CSRF_TOKEN=csrf,
    )
    assert refresh_res.status_code == 401


# ── Roles ─────────────────────────────────────────────────────────────────────


def test_admin_can_set_role(admin_client, approved_user):
    profile = UserProfile.objects.get(user=approved_user)

    res = admin_client.post(
        f"/api/admin/users/{approved_user.id}/set_role/",
        data={"role": "admin"},
        content_type="application/json",
    )

    assert res.status_code == 200
    profile.refresh_from_db()
    assert profile.role == UserProfile.ROLE_ADMIN


def test_admin_cannot_demote_last_admin(admin_client, admin_user):
    profile = UserProfile.objects.get(user=admin_user)

    res = admin_client.post(
        f"/api/admin/users/{admin_user.id}/set_role/",
        data={"role": "user"},
        content_type="application/json",
    )

    assert res.status_code == 400
    assert res.json()["error"] == "cannot_remove_last_admin"
    profile.refresh_from_db()
    assert profile.role == UserProfile.ROLE_ADMIN


def test_admin_can_demote_self_when_another_admin_exists(admin_client, admin_user):
    other_admin = User.objects.create_user(
        username="admin2@test.com", email="admin2@test.com", password="Pass!123abc"
    )
    other_profile, _ = UserProfile.objects.get_or_create(user=other_admin)
    other_profile.status = UserProfile.STATUS_APPROVED
    other_profile.role = UserProfile.ROLE_ADMIN
    other_profile.save(update_fields=["status", "role"])

    profile = UserProfile.objects.get(user=admin_user)
    res = admin_client.post(
        f"/api/admin/users/{admin_user.id}/set_role/",
        data={"role": "user"},
        content_type="application/json",
    )

    assert res.status_code == 200
    profile.refresh_from_db()
    assert profile.role == UserProfile.ROLE_USER


def test_set_role_rejects_invalid_value(admin_client, approved_user):
    res = admin_client.post(
        f"/api/admin/users/{approved_user.id}/set_role/",
        data={"role": "superadmin"},
        content_type="application/json",
    )

    assert res.status_code == 400
    assert res.json()["error"] == "invalid_role"


# ── Overview ──────────────────────────────────────────────────────────────────


def test_overview_counts_users_by_status_and_role(
    admin_client, admin_user, pending_user, approved_user
):
    res = admin_client.get("/api/admin/overview/")

    assert res.status_code == 200
    data = res.json()
    assert data["total_users"] == 3
    assert data["by_status"]["pending"] == 1
    assert data["by_status"]["approved"] == 2
    assert data["by_role"]["admin"] == 1
    assert data["pending_count"] == 1


def test_non_admin_cannot_view_overview(client, test_user):
    res = client.get("/api/admin/overview/")

    assert res.status_code == 403


# ── Bootstrap management command ─────────────────────────────────────────────


def test_promote_admin_command_promotes_and_approves(pending_user):
    call_command("promote_admin", "pending@test.com")

    profile = UserProfile.objects.get(user=pending_user)
    assert profile.role == UserProfile.ROLE_ADMIN
    assert profile.status == UserProfile.STATUS_APPROVED


def test_promote_admin_command_unknown_email_raises(db):
    from django.core.management.base import CommandError

    with pytest.raises(CommandError):
        call_command("promote_admin", "nobody@test.com")


# ── Actions must key off the User id, not UserProfile's own pk ──────────────
# The two are separate auto-increment sequences that only coincide by luck in
# a from-scratch fixture. Any User created without a matching UserProfile
# (e.g. a superuser, or the demo account) permanently desyncs them for every
# row created afterwards — exactly what happened in manual QA against a real
# dev database.


@pytest.fixture
def desynced_approved_user(db, admin_user):
    """An approved user whose UserProfile.pk deliberately differs from
    user.id — mirrors a User created with no profile at all (a superuser via
    createsuperuser, or the demo account), which consumes a User-table id
    without consuming a UserProfile-table one and permanently shifts every
    id created afterwards out of lockstep."""
    User.objects.create_user(
        username="profileless@test.com",
        email="profileless@test.com",
        password="Pass!123abc",
    )

    user = User.objects.create_user(
        username="desynced@test.com",
        email="desynced@test.com",
        password="Pass!123abc",
    )
    profile = UserProfile.objects.create(user=user, status=UserProfile.STATUS_APPROVED)
    assert profile.pk != user.id, "fixture failed to desync the two sequences"
    return user


def test_admin_can_disable_user_when_pk_and_user_id_diverge(
    admin_client, desynced_approved_user
):
    res = admin_client.post(
        f"/api/admin/users/{desynced_approved_user.id}/set_active/",
        data={"is_active": False},
        content_type="application/json",
    )

    assert res.status_code == 200
    desynced_approved_user.refresh_from_db()
    assert desynced_approved_user.is_active is False


def test_admin_can_approve_user_when_pk_and_user_id_diverge(
    admin_client, desynced_approved_user
):
    profile = UserProfile.objects.get(user=desynced_approved_user)
    profile.status = UserProfile.STATUS_PENDING
    profile.save(update_fields=["status"])

    res = admin_client.post(f"/api/admin/users/{desynced_approved_user.id}/approve/")

    assert res.status_code == 200
    profile.refresh_from_db()
    assert profile.status == UserProfile.STATUS_APPROVED


# ── Enable / disable ──────────────────────────────────────────────────────────


def test_admin_can_disable_and_enable_user(admin_client, approved_user):
    res = admin_client.post(
        f"/api/admin/users/{approved_user.id}/set_active/",
        data={"is_active": False},
        content_type="application/json",
    )

    assert res.status_code == 200
    approved_user.refresh_from_db()
    assert approved_user.is_active is False
    assert _login("approved@test.com", "Pass!123abc").status_code == 401

    res = admin_client.post(
        f"/api/admin/users/{approved_user.id}/set_active/",
        data={"is_active": True},
        content_type="application/json",
    )

    assert res.status_code == 200
    approved_user.refresh_from_db()
    assert approved_user.is_active is True
    assert _login("approved@test.com", "Pass!123abc").status_code == 200


def test_admin_cannot_deactivate_self(admin_client, admin_user):
    res = admin_client.post(
        f"/api/admin/users/{admin_user.id}/set_active/",
        data={"is_active": False},
        content_type="application/json",
    )

    assert res.status_code == 400
    assert res.json()["error"] == "cannot_deactivate_self"


def test_set_active_rejects_invalid_value(admin_client, approved_user):
    res = admin_client.post(
        f"/api/admin/users/{approved_user.id}/set_active/",
        data={"is_active": "not-a-bool"},
        content_type="application/json",
    )

    assert res.status_code == 400
    assert res.json()["error"] == "invalid_is_active"


def test_disable_blacklists_outstanding_refresh_token(admin_client, approved_user):
    from fininzen.jwt_cookies import CSRF_COOKIE_NAME

    login_client = Client()
    login_res = login_client.post(
        "/api/auth/token/",
        data={"username": "approved@test.com", "password": "Pass!123abc"},
        content_type="application/json",
    )
    assert login_res.status_code == 200
    csrf = login_client.cookies[CSRF_COOKIE_NAME].value

    res = admin_client.post(
        f"/api/admin/users/{approved_user.id}/set_active/",
        data={"is_active": False},
        content_type="application/json",
    )
    assert res.status_code == 200

    refresh_res = login_client.post(
        "/api/auth/token/refresh/",
        content_type="application/json",
        HTTP_X_CSRF_TOKEN=csrf,
    )
    assert refresh_res.status_code == 401


# ── Demo account is never manageable via the admin portal ───────────────────


def test_demo_user_excluded_from_admin_list(admin_client):
    from fininzen.permissions import DEMO_USERNAME

    demo_user = User.objects.create_user(
        username=DEMO_USERNAME, email=DEMO_USERNAME, password="Pass!123abc"
    )
    UserProfile.objects.get_or_create(user=demo_user)

    res = admin_client.get("/api/admin/users/")

    emails = {row["email"] for row in res.json()["results"]}
    assert DEMO_USERNAME not in emails


# ── last_login / last_activity_at ────────────────────────────────────────────


def test_admin_user_serializer_includes_login_and_activity_timestamps(
    admin_client, approved_user
):
    res = admin_client.get("/api/admin/users/")

    row = next(r for r in res.json()["results"] if r["email"] == "approved@test.com")
    assert "last_login" in row
    assert "last_activity_at" in row


def test_last_activity_is_stamped_on_authenticated_request(approved_user):
    profile = UserProfile.objects.get(user=approved_user)
    assert profile.last_activity_at is None

    c = Client()
    c.force_login(approved_user)
    res = c.get("/api/auth/profile/")

    assert res.status_code == 200
    profile.refresh_from_db()
    assert profile.last_activity_at is not None


def test_last_activity_is_throttled_within_interval(approved_user):
    c = Client()
    c.force_login(approved_user)
    c.get("/api/auth/profile/")
    profile = UserProfile.objects.get(user=approved_user)
    first_stamp = profile.last_activity_at

    c.get("/api/auth/profile/")
    profile.refresh_from_db()
    assert profile.last_activity_at == first_stamp


# ── Record-count report ──────────────────────────────────────────────────────


def test_record_stats_returns_model_counts(admin_client):
    res = admin_client.get("/api/admin/stats/records/")

    assert res.status_code == 200
    data = res.json()
    assert "expenses.Expense" in data
    assert "portfolio.Asset" in data
    assert data["expenses.Expense"] == 0


def test_non_admin_cannot_view_record_stats(client, test_user):
    res = client.get("/api/admin/stats/records/")

    assert res.status_code == 403


# ── Audit log ─────────────────────────────────────────────────────────────────


def test_admin_actions_are_logged(admin_client, pending_user):
    from fininzen.models import AdminActionLog

    profile, _ = UserProfile.objects.get_or_create(user=pending_user)
    admin_client.post(f"/api/admin/users/{pending_user.id}/approve/")

    assert AdminActionLog.objects.filter(
        action="approve_user", target_user=pending_user
    ).exists()


def test_audit_log_endpoint_lists_entries(admin_client, approved_user):
    admin_client.post(
        f"/api/admin/users/{approved_user.id}/set_role/",
        data={"role": "admin"},
        content_type="application/json",
    )

    res = admin_client.get("/api/admin/audit-log/")

    assert res.status_code == 200
    actions = {row["action"] for row in res.json()["results"]}
    assert "set_role" in actions


def test_audit_log_filters_by_action(admin_client, pending_user, approved_user):
    admin_client.post(f"/api/admin/users/{pending_user.id}/approve/")
    admin_client.post(
        f"/api/admin/users/{approved_user.id}/set_active/",
        data={"is_active": False},
        content_type="application/json",
    )

    res = admin_client.get("/api/admin/audit-log/?action=set_active")

    actions = {row["action"] for row in res.json()["results"]}
    assert actions == {"set_active"}


def test_non_admin_cannot_view_audit_log(client, test_user):
    res = client.get("/api/admin/audit-log/")

    assert res.status_code == 403


# ── System health & integrity ─────────────────────────────────────────────────


def test_admin_health_endpoint_reports_no_backup_when_dir_empty(
    admin_client, settings, tmp_path
):
    settings.BACKUP_DIR = tmp_path

    res = admin_client.get("/api/admin/health/")

    assert res.status_code == 200
    data = res.json()
    assert "prices" in data
    assert "fx" in data
    assert data["backup"] is None


def test_admin_health_endpoint_finds_latest_backup(admin_client, settings, tmp_path):
    (tmp_path / "fininzen_20260101_030000.sqlite3.gz").write_bytes(b"x")
    settings.BACKUP_DIR = tmp_path

    res = admin_client.get("/api/admin/health/")

    assert res.status_code == 200
    assert res.json()["backup"]["file"] == "fininzen_20260101_030000.sqlite3.gz"


def test_non_admin_cannot_view_health(client, test_user):
    res = client.get("/api/admin/health/")

    assert res.status_code == 403


def test_admin_integrity_endpoint_returns_zero_on_clean_db(admin_client):
    res = admin_client.get("/api/admin/health/integrity/")

    assert res.status_code == 200
    data = res.json()
    assert all(v == 0 for v in data.values())


def test_non_admin_cannot_view_integrity(client, test_user):
    res = client.get("/api/admin/health/integrity/")

    assert res.status_code == 403
