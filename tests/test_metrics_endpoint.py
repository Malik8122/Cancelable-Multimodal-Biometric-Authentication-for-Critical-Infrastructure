"""Offline tests for GET /metrics/{modality}.

Reads the real, already-committed `evaluation/results/*_metrics.csv` files -
no fixtures fabricate metrics here, since the whole point of this endpoint is
to surface real numbers (or their real absence) verbatim.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def _reset_caches():
    from backend.config import get_settings
    from backend.database.session import get_engine, get_session_factory

    get_settings.cache_clear()
    get_engine.cache_clear()
    get_session_factory.cache_clear()


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "test_backend.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    _reset_caches()

    from backend.main import app

    with TestClient(app) as test_client:
        yield test_client

    _reset_caches()


def test_fingerprint_metrics_are_real_and_complete(client):
    response = client.get("/metrics/fingerprint")
    assert response.status_code == 200
    body = response.json()
    assert body["modality"] == "fingerprint"
    assert body["available"] is True
    assert body["metrics"]["accuracy"] == pytest.approx(0.6922877271041898)
    assert body["metrics"]["eer"] == pytest.approx(0.3076835899569982)
    assert body["metrics"]["auc"] == pytest.approx(0.7644474138807971)
    assert "precision" in body["metrics"]
    assert "recall" in body["metrics"]
    assert "far" in body["metrics"]
    assert "frr" in body["metrics"]


def test_voice_metrics_are_real_and_complete(client):
    response = client.get("/metrics/voice")
    assert response.status_code == 200
    body = response.json()
    assert body["available"] is True
    assert body["metrics"]["accuracy"] == pytest.approx(0.9771185086551265)
    assert body["metrics"]["eer"] == pytest.approx(0.022889825855019627)


def test_face_metrics_report_only_what_was_actually_computed(client):
    """Face only ever had accuracy/EER/AUC computed (docs/PROJECT_REPORT.md) -
    precision/recall/F1/FAR/FRR must be absent, not zero-filled."""
    response = client.get("/metrics/face")
    assert response.status_code == 200
    body = response.json()
    assert body["available"] is True
    assert body["metrics"]["accuracy"] == pytest.approx(0.990)
    assert body["metrics"]["eer"] == pytest.approx(0.010)
    assert body["metrics"]["auc"] == pytest.approx(0.999)
    for never_computed_field in ("precision", "recall", "f1", "far", "frr"):
        assert never_computed_field not in body["metrics"]


def test_iris_metrics_are_unavailable_not_fabricated(client):
    """No evaluation/results/iris_metrics.csv exists - the endpoint must say
    so plainly rather than inventing numbers."""
    response = client.get("/metrics/iris")
    assert response.status_code == 200
    body = response.json()
    assert body["modality"] == "iris"
    assert body["available"] is False
    assert body["metrics"] == {}


def test_invalid_modality_is_rejected(client):
    response = client.get("/metrics/retina")
    assert response.status_code == 422
