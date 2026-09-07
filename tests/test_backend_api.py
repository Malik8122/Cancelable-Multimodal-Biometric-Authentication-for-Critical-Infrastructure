"""Offline, full-stack tests for the FastAPI backend via `TestClient`.

Uses the "iris" modality throughout (BaseEmbedder's mock-mode fallback - see
docs/ROADMAP.md) so these run without facenet-pytorch/torchvision installed,
matching this repo's existing convention (tests/test_preprocessing.py) of
skipping real-checkpoint-dependent tests rather than requiring every
optional ML dependency to be present.

Each test gets its own temporary, file-based SQLite database (a real
in-memory `:memory:` DB would be a *different* database per pooled
connection under FastAPI's threadpooled sync routes, breaking a
enroll-then-authenticate flow across two requests) via the `client` fixture,
which also resets every `lru_cache`d settings/engine singleton so tests don't
leak state into each other.
"""

from __future__ import annotations

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

APPLICATION_ID = "capstone-demo"


def _encode_png(image: np.ndarray) -> bytes:
    bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    ok, buffer = cv2.imencode(".png", bgr)
    assert ok
    return buffer.tobytes()


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


def _enroll(client: TestClient, image_bytes: bytes, user_id: str = "U001", modality: str = "iris"):
    return client.post(
        "/enroll",
        data={"user_id": user_id, "modality": modality, "application_id": APPLICATION_ID},
        files={"image": ("sample.png", image_bytes, "image/png")},
    )


def test_health():
    from backend.main import app

    with TestClient(app) as test_client:
        response = test_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_enroll_returns_success_and_template_metadata(client, synthetic_eye_image):
    response = _enroll(client, _encode_png(synthetic_eye_image))
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["user_id"] == "U001"
    assert body["modality"] == "iris"
    assert body["key_version"] == 1
    assert body["template_version"] >= 1


def test_authenticate_after_enroll_succeeds(client, synthetic_eye_image):
    image_bytes = _encode_png(synthetic_eye_image)
    _enroll(client, image_bytes)

    response = client.post(
        "/authenticate",
        data={"user_id": "U001", "modality": "iris", "application_id": APPLICATION_ID},
        files={"image": ("sample.png", image_bytes, "image/png")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["authenticated"] is True
    assert body["score"] >= body["threshold"]


def test_authenticate_without_enrollment_returns_not_authenticated(client, synthetic_eye_image):
    response = client.post(
        "/authenticate",
        data={"user_id": "never-enrolled", "modality": "iris", "application_id": APPLICATION_ID},
        files={"image": ("sample.png", _encode_png(synthetic_eye_image), "image/png")},
    )
    assert response.status_code == 200
    assert response.json()["authenticated"] is False


def test_verify_iris_matches_authenticate_behavior(client, synthetic_eye_image):
    image_bytes = _encode_png(synthetic_eye_image)
    _enroll(client, image_bytes)

    response = client.post(
        "/verify/iris",
        data={"user_id": "U001", "application_id": APPLICATION_ID},
        files={"image": ("sample.png", image_bytes, "image/png")},
    )
    assert response.status_code == 200
    assert response.json()["authenticated"] is True


def test_revoke_template_rotates_key_version(client, synthetic_eye_image):
    image_bytes = _encode_png(synthetic_eye_image)
    _enroll(client, image_bytes)

    response = client.post(
        "/revoke-template",
        data={"user_id": "U001", "modality": "iris", "application_id": APPLICATION_ID},
        files={"image": ("sample.png", image_bytes, "image/png")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["old_key_version"] == 1
    assert body["new_key_version"] == 2

    # Re-authenticating still succeeds (re-derives under the new key_version).
    auth_response = client.post(
        "/authenticate",
        data={"user_id": "U001", "modality": "iris", "application_id": APPLICATION_ID},
        files={"image": ("sample.png", image_bytes, "image/png")},
    )
    assert auth_response.json()["authenticated"] is True


def test_get_user_returns_enrolled_modalities(client, synthetic_eye_image):
    _enroll(client, _encode_png(synthetic_eye_image))

    response = client.get("/user/U001")
    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] == "U001"
    assert len(body["enrolled_modalities"]) == 1
    assert body["enrolled_modalities"][0]["modality"] == "iris"


def test_get_user_returns_404_for_unknown_user(client):
    response = client.get("/user/nobody")
    assert response.status_code == 404


def test_delete_user_removes_templates(client, synthetic_eye_image):
    _enroll(client, _encode_png(synthetic_eye_image))

    delete_response = client.delete("/user/U001")
    assert delete_response.status_code == 200
    assert delete_response.json()["templates_deleted"] == 1

    assert client.get("/user/U001").status_code == 404


def test_delete_user_is_idempotent_for_missing_user(client):
    response = client.delete("/user/nobody")
    assert response.status_code == 200
    assert response.json()["templates_deleted"] == 0


def test_enroll_rejects_unsupported_content_type(client):
    response = client.post(
        "/enroll",
        data={"user_id": "U001", "modality": "iris", "application_id": APPLICATION_ID},
        files={"image": ("notes.txt", b"not an image", "text/plain")},
    )
    assert response.status_code == 415


def test_enroll_rejects_oversized_upload(tmp_path, monkeypatch, synthetic_eye_image):
    db_path = tmp_path / "test_backend.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("MAX_UPLOAD_SIZE_BYTES", "10")
    _reset_caches()

    from backend.main import app

    with TestClient(app) as test_client:
        response = _enroll(test_client, _encode_png(synthetic_eye_image))

    _reset_caches()
    assert response.status_code == 413


def test_enroll_rejects_unsupported_modality(client, synthetic_eye_image):
    response = _enroll(client, _encode_png(synthetic_eye_image), modality="retina")
    assert response.status_code == 422
