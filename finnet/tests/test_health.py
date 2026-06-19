from unittest.mock import patch

import pytest
from django.db import OperationalError
from django.test import Client


@pytest.mark.django_db
def test_health_ok():
    res = Client().get("/api/health/")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"


@pytest.mark.django_db
def test_health_reports_503_when_db_probe_fails():
    """LOW-02: a failing DB probe must surface as 503, not an unhandled 500."""
    with patch(
        "finnet.views.connection.cursor",
        side_effect=OperationalError("database is down"),
    ):
        res = Client().get("/api/health/")

    assert res.status_code == 503
    body = res.json()
    assert body["status"] == "error"
    assert body["database"] == "unavailable"
