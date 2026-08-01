import pytest
from django.contrib.auth.models import User
from django.test import Client
from django.utils import timezone

from fininzen.api_tokens import generate_token, hash_token
from fininzen.authentication import ApiTokenAuthentication
from fininzen.models import ApiToken


# --- model / hashing -------------------------------------------------------


def test_token_hash_unique_constraint(db, test_user):
    raw = generate_token()
    ApiToken.objects.create(
        owner=test_user, label="a", token_hash=hash_token(raw), prefix=raw[:12]
    )
    with pytest.raises(Exception):
        ApiToken.objects.create(
            owner=test_user, label="b", token_hash=hash_token(raw), prefix=raw[:12]
        )


def test_revoked_token_excluded_from_lookup(db, test_user):
    raw = generate_token()
    token = ApiToken.objects.create(
        owner=test_user, label="a", token_hash=hash_token(raw), prefix=raw[:12]
    )
    token.revoked_at = timezone.now()
    token.save(update_fields=["revoked_at"])
    assert not ApiToken.objects.filter(
        token_hash=hash_token(raw), revoked_at__isnull=True
    ).exists()


# --- ApiTokenAuthentication --------------------------------------------------


class _FakeRequest:
    def __init__(self, header):
        self.headers = {"Authorization": header} if header else {}


def test_authenticate_no_header_returns_none(db):
    assert ApiTokenAuthentication().authenticate(_FakeRequest(None)) is None


def test_authenticate_non_bearer_token_returns_none(db, test_user):
    access = _jwt_for(test_user)
    result = ApiTokenAuthentication().authenticate(_FakeRequest(f"Bearer {access}"))
    assert result is None


def test_authenticate_unknown_token_raises(db):
    from rest_framework.exceptions import AuthenticationFailed

    with pytest.raises(AuthenticationFailed):
        ApiTokenAuthentication().authenticate(_FakeRequest("Bearer fnz_doesnotexist"))


def test_authenticate_revoked_token_raises(db, test_user):
    from rest_framework.exceptions import AuthenticationFailed

    raw = generate_token()
    token = ApiToken.objects.create(
        owner=test_user, label="a", token_hash=hash_token(raw), prefix=raw[:12]
    )
    token.revoked_at = timezone.now()
    token.save(update_fields=["revoked_at"])
    with pytest.raises(AuthenticationFailed):
        ApiTokenAuthentication().authenticate(_FakeRequest(f"Bearer {raw}"))


def test_authenticate_success_stamps_last_used(db, test_user):
    raw = generate_token()
    token = ApiToken.objects.create(
        owner=test_user, label="a", token_hash=hash_token(raw), prefix=raw[:12]
    )
    assert token.last_used_at is None
    user, auth = ApiTokenAuthentication().authenticate(_FakeRequest(f"Bearer {raw}"))
    assert user == test_user
    assert auth.pk == token.pk
    token.refresh_from_db()
    assert token.last_used_at is not None


def _jwt_for(user):
    from rest_framework_simplejwt.tokens import RefreshToken

    return str(RefreshToken.for_user(user).access_token)


# --- management endpoints ---------------------------------------------------


def test_create_token_returns_raw_value_once(client):
    res = client.post(
        "/api/auth/api-tokens/",
        data={"label": "iPhone"},
        content_type="application/json",
    )
    assert res.status_code == 201
    body = res.json()
    assert body["token"].startswith("fnz_")
    assert body["label"] == "iPhone"
    assert "token_hash" not in body


def test_create_token_requires_label(client):
    res = client.post("/api/auth/api-tokens/", data={}, content_type="application/json")
    assert res.status_code == 400


def test_list_tokens_never_includes_raw_or_hash(client, test_user):
    raw = generate_token()
    ApiToken.objects.create(
        owner=test_user, label="a", token_hash=hash_token(raw), prefix=raw[:12]
    )
    res = client.get("/api/auth/api-tokens/")
    assert res.status_code == 200
    body = res.json()
    assert len(body) == 1
    assert "token" not in body[0]
    assert "token_hash" not in body[0]


def test_revoke_token_is_soft_delete(client, test_user):
    raw = generate_token()
    token = ApiToken.objects.create(
        owner=test_user, label="a", token_hash=hash_token(raw), prefix=raw[:12]
    )
    res = client.delete(f"/api/auth/api-tokens/{token.pk}/")
    assert res.status_code == 204
    token.refresh_from_db()
    assert token.revoked_at is not None


def test_revoke_token_cannot_target_other_users(client, test_user, db):
    other = User.objects.create_user(username="other@test.com", password="pw")
    raw = generate_token()
    token = ApiToken.objects.create(
        owner=other, label="a", token_hash=hash_token(raw), prefix=raw[:12]
    )
    res = client.delete(f"/api/auth/api-tokens/{token.pk}/")
    assert res.status_code == 404
    token.refresh_from_db()
    assert token.revoked_at is None


def test_demo_user_cannot_create_token(db):
    demo = User.objects.create_user(username="demo@demo.com", password="pw")
    c = Client()
    c.force_login(demo)
    res = c.post(
        "/api/auth/api-tokens/", data={"label": "x"}, content_type="application/json"
    )
    assert res.status_code == 403


def test_api_token_manage_endpoints_are_throttled():
    from fininzen.api_token_views import ApiTokenDetailView, ApiTokenListCreateView
    from fininzen.throttles import ApiTokenManageRateThrottle

    assert ApiTokenManageRateThrottle in ApiTokenListCreateView.throttle_classes
    assert ApiTokenManageRateThrottle in ApiTokenDetailView.throttle_classes
