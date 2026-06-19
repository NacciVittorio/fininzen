import pytest
from django.core.cache import cache
from django.test import Client
from django.contrib.auth.models import User


@pytest.fixture(autouse=True)
def _clear_cache():
    """Isolate the per-process LocMemCache between tests.

    Several endpoints now use the cache for cross-request guards (the manual-
    asset reconcile TTL, HIGH-17) and rate-limit scopes. Without a reset a guard
    armed by one test would silently skip work expected by the next, making
    order-dependent failures. Clearing before each test keeps them independent.
    """
    cache.clear()
    yield


@pytest.fixture
def test_user(db):
    return User.objects.create_user(
        username="testuser", email="test@test.com", password="testpass123"
    )


@pytest.fixture
def client(test_user):
    c = Client()
    c.force_login(test_user)
    return c
