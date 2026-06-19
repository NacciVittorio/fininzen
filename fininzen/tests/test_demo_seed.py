from django.utils import timezone

from fininzen.demo_seed import DEMO_EMAIL, DEMO_SEED_STATE_KEY, DEMO_SEED_VERSION
from fininzen.models import DemoSeedState


def _seed_calls(monkeypatch):
    calls = []

    def fake_seed(user, asset_model, investment_type_model, *, month_key=None):
        calls.append(
            {
                "user": user.username,
                "month_key": month_key,
                "asset_model": asset_model.__name__,
                "investment_type_model": investment_type_model.__name__,
            }
        )

    monkeypatch.setattr("expenses.services.seed_demo_for_user", fake_seed)
    monkeypatch.setattr("fininzen.demo_seed.demo_seed_is_complete", lambda user: True)
    return calls


def test_demo_login_seeds_once_per_month(client, monkeypatch):
    calls = _seed_calls(monkeypatch)
    current_month = timezone.localdate().strftime("%Y-%m")

    res = client.post("/api/auth/demo/")
    assert res.status_code == 200
    assert res.json()["is_demo"] is True

    res = client.post("/api/auth/demo/")
    assert res.status_code == 200

    assert len(calls) == 1
    assert calls[0]["user"] == DEMO_EMAIL
    assert calls[0]["month_key"] == current_month

    state = DemoSeedState.objects.get(key=DEMO_SEED_STATE_KEY)
    assert state.last_seeded_month == current_month
    assert state.seed_version == DEMO_SEED_VERSION
    assert state.last_seeded_at is not None


def test_demo_login_reseeds_when_month_changes(client, monkeypatch):
    calls = _seed_calls(monkeypatch)
    current_month = timezone.localdate().strftime("%Y-%m")
    DemoSeedState.objects.update_or_create(
        key=DEMO_SEED_STATE_KEY,
        defaults={
            "last_seeded_month": "2026-05",
            "seed_version": DEMO_SEED_VERSION,
        },
    )

    res = client.post("/api/auth/demo/")
    assert res.status_code == 200
    assert len(calls) == 1
    assert calls[0]["month_key"] == current_month


def test_demo_login_reseeds_when_dataset_is_incomplete(client, monkeypatch):
    calls = []
    current_month = timezone.localdate().strftime("%Y-%m")

    def fake_seed(user, asset_model, investment_type_model, *, month_key=None):
        calls.append(month_key)

    monkeypatch.setattr("expenses.services.seed_demo_for_user", fake_seed)
    monkeypatch.setattr("fininzen.demo_seed.demo_seed_is_complete", lambda user: False)
    DemoSeedState.objects.update_or_create(
        key=DEMO_SEED_STATE_KEY,
        defaults={
            "last_seeded_month": "2026-06",
            "seed_version": DEMO_SEED_VERSION,
        },
    )

    res = client.post("/api/auth/demo/")
    assert res.status_code == 200
    assert calls == [current_month]
