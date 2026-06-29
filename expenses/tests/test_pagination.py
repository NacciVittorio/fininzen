"""LOW-11: global DRF pagination on list endpoints.

List responses are wrapped as {count, next, previous, results} and capped at
PAGE_SIZE (100) so a pathological query can't stream an unbounded result set.
The web client pages through `next` (fetchAllPagesWithFetcher), so the cap never
silently truncates a collection.
"""

from expenses.models import Category


def _make_categories(owner, n):
    Category.objects.bulk_create(
        [
            Category(
                name=f"Cat {i:03d}",
                category_type=Category.EXPENSE,
                owner=owner,
            )
            for i in range(n)
        ]
    )


def test_list_response_is_paginated_and_capped(client, test_user):
    _make_categories(test_user, 150)

    res = client.get("/api/expenses/categories/")
    assert res.status_code == 200
    body = res.json()

    assert set(body) >= {"count", "next", "previous", "results"}
    assert body["count"] == 150
    assert len(body["results"]) == 100  # PAGE_SIZE
    assert body["next"] is not None
    assert body["previous"] is None


def test_pages_do_not_overlap(client, test_user):
    """A deterministic order must keep page boundaries stable (no dup/skip)."""
    _make_categories(test_user, 150)

    page1 = client.get("/api/expenses/categories/").json()["results"]
    page2 = client.get("/api/expenses/categories/?page=2").json()["results"]

    ids1 = [c["id"] for c in page1]
    ids2 = [c["id"] for c in page2]
    assert len(ids2) == 50
    assert not set(ids1) & set(ids2)  # no row appears on two pages
    assert len(set(ids1) | set(ids2)) == 150  # together they cover everything
