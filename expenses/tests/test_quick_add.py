import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from expenses.models import Expense
from expenses.services import FALLBACK_CATEGORY_NAME
from fininzen.api_tokens import generate_token, hash_token
from fininzen.models import ApiToken


@pytest.fixture
def api_token(test_user):
    raw = generate_token()
    ApiToken.objects.create(
        owner=test_user, label="Shortcut", token_hash=hash_token(raw), prefix=raw[:12]
    )
    return raw


@pytest.fixture
def token_client(api_token):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {api_token}")
    return c


def _post(client, payload):
    return client.post("/api/expenses/quick-add/", data=payload, format="json")


def test_quick_add_happy_path(token_client, test_user, expense_cat):
    res = _post(
        token_client,
        {"amount": "12.50", "merchant": "Bar Centrale", "category": "Food"},
    )
    assert res.status_code == 201
    expense = Expense.objects.get(owner=test_user)
    assert expense.amount == 12.50
    assert expense.category == expense_cat
    assert expense.description == "Bar Centrale"
    assert expense.date == timezone.localdate()


def test_quick_add_category_case_insensitive(token_client, test_user, expense_cat):
    res = _post(token_client, {"amount": "5", "category": "fOOd"})
    assert res.status_code == 201
    assert Expense.objects.get(owner=test_user).category == expense_cat


def test_quick_add_unmatched_category_falls_back(token_client, test_user):
    res = _post(token_client, {"amount": "5", "category": "Nonexistent"})
    assert res.status_code == 201
    expense = Expense.objects.get(owner=test_user)
    assert expense.category.name == FALLBACK_CATEGORY_NAME


def test_quick_add_missing_category_falls_back(token_client, test_user):
    res = _post(token_client, {"amount": "5"})
    assert res.status_code == 201
    expense = Expense.objects.get(owner=test_user)
    assert expense.category.name == FALLBACK_CATEGORY_NAME


def test_quick_add_zero_amount_rejected(token_client):
    res = _post(token_client, {"amount": "0"})
    assert res.status_code == 400
    assert not Expense.objects.exists()


def test_quick_add_missing_amount_rejected(token_client):
    res = _post(token_client, {})
    assert res.status_code == 400


def test_quick_add_date_defaults_to_today(token_client, test_user):
    _post(token_client, {"amount": "5"})
    expense = Expense.objects.get(owner=test_user)
    assert expense.date == timezone.localdate()


def test_quick_add_explicit_date_used(token_client, test_user):
    _post(token_client, {"amount": "5", "date": "2026-01-15"})
    expense = Expense.objects.get(owner=test_user)
    assert str(expense.date) == "2026-01-15"


def test_quick_add_rejects_jwt_auth(test_user, expense_cat):
    client = APIClient()
    access = str(RefreshToken.for_user(test_user).access_token)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    res = _post(client, {"amount": "5", "category": "Food"})
    assert res.status_code == 401
    assert not Expense.objects.exists()


def test_quick_add_rejects_session_auth(client, expense_cat):
    res = client.post(
        "/api/expenses/quick-add/",
        data={"amount": "5", "category": "Food"},
        content_type="application/json",
    )
    assert res.status_code == 401
    assert not Expense.objects.exists()


def test_quick_add_revoked_token_rejected(token_client, test_user):
    ApiToken.objects.filter(owner=test_user).update(revoked_at=timezone.now())
    res = _post(token_client, {"amount": "5"})
    assert res.status_code == 401
    assert not Expense.objects.exists()


def test_quick_add_wrong_scope_rejected(test_user):
    raw = generate_token()
    ApiToken.objects.create(
        owner=test_user,
        label="x",
        token_hash=hash_token(raw),
        prefix=raw[:12],
        scope="something:else",
    )
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw}")
    res = _post(client, {"amount": "5"})
    assert res.status_code == 403
    assert not Expense.objects.exists()


def test_quick_add_view_as_without_grant_rejected(test_user, db):
    # ViewAsMixin.check_permissions runs for every action on ExpenseViewSet
    # (quick-add included) and rejects an X-View-As header with no matching
    # DataAccessGrant, before quick-add's own logic ever runs.
    other = User.objects.create_user(username="other@test.com", password="pw")
    raw = generate_token()
    ApiToken.objects.create(
        owner=test_user, label="x", token_hash=hash_token(raw), prefix=raw[:12]
    )
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw}")
    res = client.post(
        "/api/expenses/quick-add/",
        data={"amount": "5"},
        format="json",
        HTTP_X_VIEW_AS=str(other.id),
    )
    assert res.status_code == 403
    assert not Expense.objects.exists()


def test_quick_add_ignores_view_as_even_with_valid_grant(test_user, db):
    # Even when a real grant exists, quick-add uses request.user (the token
    # owner) directly rather than get_effective_user()/ViewAsMixin's
    # resolved view_as_user, so the expense still lands on the token owner.
    from fininzen.models import DataAccessGrant

    other = User.objects.create_user(username="other@test.com", password="pw")
    DataAccessGrant.objects.create(owner=other, grantee=test_user, permission="full")
    raw = generate_token()
    ApiToken.objects.create(
        owner=test_user, label="x", token_hash=hash_token(raw), prefix=raw[:12]
    )
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw}")
    res = client.post(
        "/api/expenses/quick-add/",
        data={"amount": "5"},
        format="json",
        HTTP_X_VIEW_AS=str(other.id),
    )
    assert res.status_code == 201
    expense = Expense.objects.get()
    assert expense.owner_id == test_user.id


def test_quick_add_demo_user_blocked(db):
    demo = User.objects.create_user(username="demo@demo.com", password="pw")
    raw = generate_token()
    ApiToken.objects.create(
        owner=demo, label="x", token_hash=hash_token(raw), prefix=raw[:12]
    )
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw}")
    res = client.post("/api/expenses/quick-add/", data={"amount": "5"}, format="json")
    assert res.status_code == 403
