"""
Regression tests for grants endpoint security.

#46 — email enumeration: unknown email must return 400, not 404
#90 — ViewAsMixin read-only grant blocks writes
"""

import pytest
from decimal import Decimal
from datetime import date
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import Client
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from expenses.models import Category, Expense
from fininzen.models import DataAccessGrant


@pytest.fixture
def known_user(db):
    return User.objects.create_user(
        username="known@test.com", email="known@test.com", password="Pass!123abc"
    )


@pytest.fixture
def user_a(test_user):
    """Owner of data (already the global test_user fixture)."""
    return test_user


@pytest.fixture
def user_b(db):
    return User.objects.create_user(
        username="viewer", email="viewer@test.com", password="viewpass123"
    )


@pytest.fixture
def read_grant(user_a, user_b):
    return DataAccessGrant.objects.create(
        owner=user_a, grantee=user_b, permission="read"
    )


@pytest.fixture
def client_b(user_b):
    c = Client()
    c.force_login(user_b)
    return c


@pytest.fixture
def expense_cat_a(user_a):
    return Category.objects.create(
        name="Food", category_type=Category.EXPENSE, owner=user_a
    )


@pytest.fixture
def expense_a(user_a, expense_cat_a):
    return Expense.objects.create(
        description="Lunch",
        amount=Decimal("12.00"),
        category=expense_cat_a,
        date=date(2026, 5, 1),
        owner=user_a,
    )


def test_grants_unknown_email_returns_400(client):
    """Unknown email must not return 404 (would confirm email non-existence)."""
    res = client.post(
        "/api/auth/grants/",
        data={"email": "nobody@nowhere.com", "permission": "read"},
        content_type="application/json",
    )
    assert res.status_code == 400
    assert res.json().get("error") == "user_not_found"


def test_grants_unknown_email_does_not_return_404(client):
    """Explicit: 404 response leaks email existence — must not happen."""
    res = client.post(
        "/api/auth/grants/",
        data={"email": "nobody@nowhere.com", "permission": "read"},
        content_type="application/json",
    )
    assert res.status_code != 404


def test_grants_known_user_creates_grant(client, test_user, known_user):
    """Valid email still creates a grant correctly."""
    res = client.post(
        "/api/auth/grants/",
        data={"email": known_user.email, "permission": "read"},
        content_type="application/json",
    )
    assert res.status_code in (200, 201)


def test_grants_email_enumeration_is_rate_limited(client):
    """HIGH-02: the grant endpoint must throttle authenticated email probing.

    GrantRateThrottle previously extended AnonRateThrottle, which no-ops on
    authenticated requests — leaving enumeration via repeated POSTs unbounded.
    With UserRateThrottle (scope 'grant' = 20/min) the 21st probe is rejected.
    """
    last_status = None
    try:
        for _ in range(21):
            res = client.post(
                "/api/auth/grants/",
                data={"email": "nobody@nowhere.com", "permission": "read"},
                content_type="application/json",
            )
            last_status = res.status_code
    finally:
        cache.clear()
    assert last_status == 429


# ── ViewAsMixin: read-only grant blocks writes ────────────────────────────────


class TestViewAsReadOnlyBlocksWrites:
    """user_b has a read grant on user_a; calls with X-View-As: user_a.id."""

    def test_read_grant_blocks_post(self, client_b, user_a, read_grant, expense_cat_a):
        res = client_b.post(
            "/api/expenses/",
            data={
                "description": "Injected",
                "amount": "9.99",
                "category": expense_cat_a.id,
                "date": "2026-05-01",
            },
            content_type="application/json",
            HTTP_X_VIEW_AS=str(user_a.id),
        )
        assert res.status_code == 403

    def test_read_grant_blocks_patch(self, client_b, user_a, read_grant, expense_a):
        res = client_b.patch(
            f"/api/expenses/{expense_a.id}/",
            data={"description": "Tampered"},
            content_type="application/json",
            HTTP_X_VIEW_AS=str(user_a.id),
        )
        assert res.status_code == 403

    def test_read_grant_blocks_delete(self, client_b, user_a, read_grant, expense_a):
        res = client_b.delete(
            f"/api/expenses/{expense_a.id}/",
            HTTP_X_VIEW_AS=str(user_a.id),
        )
        assert res.status_code == 403

    def test_read_grant_allows_get(self, client_b, user_a, read_grant, expense_a):
        res = client_b.get(
            "/api/expenses/",
            HTTP_X_VIEW_AS=str(user_a.id),
        )
        assert res.status_code == 200


# ── AUDIT H6 — ViewAs resolution rejects and logs invalid requests ────────────


def test_viewas_unknown_owner_logs_warning(client):
    """X-View-As referring to a non-existent owner must emit a WARNING log."""
    from unittest.mock import patch

    with patch("fininzen.mixins.logger") as mock_logger:
        res = client.get("/api/expenses/", HTTP_X_VIEW_AS="999999")
    assert res.status_code == 403
    assert mock_logger.warning.called
    call_args = mock_logger.warning.call_args[0]
    assert "ViewAs: rejected" in call_args[0]


def test_viewas_no_grant_existing_user_logs_warning(client, known_user):
    """X-View-As targeting an existing user without grant must also warn."""
    from unittest.mock import patch

    with patch("fininzen.mixins.logger") as mock_logger:
        res = client.get("/api/expenses/", HTTP_X_VIEW_AS=str(known_user.id))
    assert res.status_code == 403
    assert mock_logger.warning.called
    call_args = mock_logger.warning.call_args[0]
    assert "ViewAs: rejected" in call_args[0]


def test_viewas_is_resolved_after_jwt_authentication(
    user_a, user_b, read_grant, expense_a
):
    jwt_client = APIClient()
    access = RefreshToken.for_user(user_b).access_token
    jwt_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    res = jwt_client.get("/api/expenses/", HTTP_X_VIEW_AS=str(user_a.id))

    assert res.status_code == 200
    assert [row["id"] for row in res.json()["results"]] == [expense_a.id]


def test_viewas_malformed_header_returns_400(client):
    res = client.get("/api/expenses/", HTTP_X_VIEW_AS="not-an-id")
    assert res.status_code == 400


def test_valid_viewas_requests_do_not_consume_attempt_throttle(
    client_b, user_a, read_grant, expense_a
):
    cache.clear()
    for _ in range(35):
        res = client_b.get("/api/expenses/", HTTP_X_VIEW_AS=str(user_a.id))
        assert res.status_code == 200


def test_invalid_viewas_attempts_are_throttled(client):
    cache.clear()
    for _ in range(30):
        res = client.get("/api/expenses/", HTTP_X_VIEW_AS="999999")
        assert res.status_code == 403
    res = client.get("/api/expenses/", HTTP_X_VIEW_AS="999999")
    assert res.status_code == 429


def test_personal_profile_is_blocked_under_viewas(client_b, user_a, read_grant):
    res = client_b.get("/api/auth/profile/", HTTP_X_VIEW_AS=str(user_a.id))
    assert res.status_code == 403


def test_personal_grants_are_blocked_under_viewas(client_b, user_a, read_grant):
    res = client_b.get("/api/auth/grants/", HTTP_X_VIEW_AS=str(user_a.id))
    assert res.status_code == 403
