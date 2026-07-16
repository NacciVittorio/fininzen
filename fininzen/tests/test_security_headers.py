import pytest
from django.test import Client


@pytest.mark.django_db
def test_api_responses_are_not_cacheable():
    """Financial JSON must never be reused without revalidation.

    Without freshness information Safari applies heuristic caching, which hid
    writes made from another device until a forced refresh.
    """
    res = Client().get("/api/health/")
    assert res.headers["Cache-Control"] == "no-store, private"


# The guard keys off `request.path` alone, so it runs on these regardless of
# whether a view is mounted (under pytest-django DEBUG is False, so the admin
# isn't). Asserting the CSP header keeps the test honest: it proves the
# middleware ran, rather than passing because nothing ran at all. The assertion
# is that our marker is absent, not that the header is: a mounted admin sets its
# own `never_cache` value, and Caddy — not Django — serves /static/ in
# production.
@pytest.mark.django_db
@pytest.mark.parametrize("path", ["/static/app.css", "/admin/"])
def test_non_api_responses_keep_their_cacheability(path):
    """The guard is scoped to /api/: hashed assets stay cacheable."""
    res = Client().get(path)
    assert "Content-Security-Policy" in res.headers
    assert res.headers.get("Cache-Control") != "no-store, private"
