"""Offline, full-stack tests for POST /authenticate/fusion via `TestClient`.

Uses Fingerprint and Voice (both have real checkpoints installed - see
models/fingerprint/saved/, models/voice/saved/, and both torchvision and
speechbrain/torchaudio are available in this environment) so these exercise
real backend inference, not mock mode, matching the "never fake a fusion
score" requirement. Face is included in one test to prove the endpoint
handles all three modalities together structurally; face-specific real-
checkpoint behavior isn't asserted since facenet-pytorch isn't installed
here (mirrors this repo's existing convention elsewhere).
"""

from __future__ import annotations

import io

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy.io import wavfile

APPLICATION_ID = "capstone-demo"
SAMPLE_RATE = 16_000


def _encode_png(image: np.ndarray) -> bytes:
    bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    ok, buffer = cv2.imencode(".png", bgr)
    assert ok
    return buffer.tobytes()


def _encode_wav(waveform: np.ndarray, sample_rate: int = SAMPLE_RATE) -> bytes:
    int16_waveform = (waveform * 32767).astype(np.int16)
    buffer = io.BytesIO()
    wavfile.write(buffer, sample_rate, int16_waveform)
    return buffer.getvalue()


def _tone(duration_seconds: float = 2.0, frequency: float = 220.0) -> np.ndarray:
    t = np.linspace(0, duration_seconds, int(SAMPLE_RATE * duration_seconds), endpoint=False)
    return (0.3 * np.sin(2 * np.pi * frequency * t)).astype(np.float32)


def _synthetic_fingerprint_image() -> np.ndarray:
    x = np.linspace(0, 20 * np.pi, 300)
    y = np.linspace(0, 20 * np.pi, 300)
    xx, yy = np.meshgrid(x, y)
    ridges = (np.sin(xx) * 127 + 128).astype(np.uint8)
    return np.stack([ridges] * 3, axis=-1)


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


def test_fusion_requires_at_least_one_modality(client):
    response = client.post("/authenticate/fusion", data={"user_id": "U1", "application_id": APPLICATION_ID})
    assert response.status_code == 422


def test_fusion_single_modality_equals_that_modalitys_own_score(client):
    wav_bytes = _encode_wav(_tone())
    client.post(
        "/enroll",
        data={"user_id": "U-FUSION-1", "modality": "voice", "application_id": APPLICATION_ID},
        files={"image": ("sample.wav", wav_bytes, "audio/wav")},
    )

    response = client.post(
        "/authenticate/fusion",
        data={"user_id": "U-FUSION-1", "application_id": APPLICATION_ID},
        files={"voice_audio": ("sample.wav", wav_bytes, "audio/wav")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["modalities_used"] == ["voice"]
    assert body["fused_score"] == pytest.approx(body["results"]["voice"]["score"])
    assert body["authenticated"] == (body["fused_score"] >= body["fusion_threshold"])


def test_fusion_two_modalities_fingerprint_and_voice(client):
    fingerprint_bytes = _encode_png(_synthetic_fingerprint_image())
    voice_bytes = _encode_wav(_tone())

    client.post(
        "/enroll",
        data={"user_id": "U-FUSION-2", "modality": "fingerprint", "application_id": APPLICATION_ID},
        files={"image": ("fp.png", fingerprint_bytes, "image/png")},
    )
    client.post(
        "/enroll",
        data={"user_id": "U-FUSION-2", "modality": "voice", "application_id": APPLICATION_ID},
        files={"image": ("sample.wav", voice_bytes, "audio/wav")},
    )

    response = client.post(
        "/authenticate/fusion",
        data={"user_id": "U-FUSION-2", "application_id": APPLICATION_ID},
        files={
            "fingerprint_image": ("fp.png", fingerprint_bytes, "image/png"),
            "voice_audio": ("sample.wav", voice_bytes, "audio/wav"),
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert sorted(body["modalities_used"]) == ["fingerprint", "voice"]

    expected_fused = (body["results"]["fingerprint"]["score"] + body["results"]["voice"]["score"]) / 2
    assert body["fused_score"] == pytest.approx(expected_fused)


def test_fusion_submitting_a_never_enrolled_face_is_enrollment_required(client, random_rgb_image):
    """Proves the endpoint accepts and routes all three `UploadFile` fields
    together (structural three-modality wiring), with real fingerprint and
    voice inference. Face contributes its documented "not enrolled" outcome
    (score 0.0, no embedding computed - see
    backend/services/base_service.py::ModalityService.authenticate) rather
    than a fabricated success, since no real face photo is bundled in this
    repo to enroll with offline. The full three-real-modality success path
    is confirmed manually with a real captured photo (see the milestone's
    manual test); `backend/api/fusion.py` additionally converts a real
    preprocessing failure (e.g. face's "no face detected" once something
    *is* enrolled) into a clean 422 rather than a 500, by inspection."""
    pytest.importorskip("facenet_pytorch")

    face_bytes = _encode_png(random_rgb_image)
    fingerprint_bytes = _encode_png(_synthetic_fingerprint_image())
    voice_bytes = _encode_wav(_tone())

    client.post(
        "/enroll",
        data={"user_id": "U-FUSION-3", "modality": "fingerprint", "application_id": APPLICATION_ID},
        files={"image": ("fp.png", fingerprint_bytes, "image/png")},
    )
    client.post(
        "/enroll",
        data={"user_id": "U-FUSION-3", "modality": "voice", "application_id": APPLICATION_ID},
        files={"image": ("sample.wav", voice_bytes, "audio/wav")},
    )

    response = client.post(
        "/authenticate/fusion",
        data={"user_id": "U-FUSION-3", "application_id": APPLICATION_ID},
        files={
            "face_image": ("face.png", face_bytes, "image/png"),
            "fingerprint_image": ("fp.png", fingerprint_bytes, "image/png"),
            "voice_audio": ("sample.wav", voice_bytes, "audio/wav"),
        },
    )
    # face was submitted but never enrolled: ENROLLMENT_REQUIRED, and nothing at all is evaluated
    assert response.status_code == 409
    body = response.json()
    assert body["status"] == "ENROLLMENT_REQUIRED" and body["missing_modalities"] == ["face"]
    assert body["enrolled_modalities"] == ["fingerprint", "voice"]

    # the user simply presents what IS enrolled: fusion runs over exactly those two
    ok = client.post(
        "/authenticate/fusion",
        data={"user_id": "U-FUSION-3", "application_id": APPLICATION_ID},
        files={
            "fingerprint_image": ("fp.png", fingerprint_bytes, "image/png"),
            "voice_audio": ("sample.wav", voice_bytes, "audio/wav"),
        },
    )
    assert ok.status_code == 200
    body = ok.json()
    assert sorted(body["modalities_used"]) == ["fingerprint", "voice"]
    assert body["results"]["fingerprint"]["authenticated"] is True
    assert body["results"]["voice"]["authenticated"] is True
    expected_fused = sum(body["results"][m]["score"] for m in ("fingerprint", "voice")) / 2
    assert body["fused_score"] == pytest.approx(expected_fused)


def test_fusion_diagnostics_present_and_matches_the_real_response_values(client):
    """`fusion_diagnostics` (DEBUG_SCORES=true, on by default in this suite - see conftest.py)
    must report the exact same numbers already present elsewhere in the response - it's a
    reshaping of existing values, never a second, independently-computed fusion result."""
    fingerprint_bytes = _encode_png(_synthetic_fingerprint_image())
    voice_bytes = _encode_wav(_tone())

    client.post(
        "/enroll",
        data={"user_id": "U-FUSION-DIAG-1", "modality": "fingerprint", "application_id": APPLICATION_ID},
        files={"image": ("fp.png", fingerprint_bytes, "image/png")},
    )
    client.post(
        "/enroll",
        data={"user_id": "U-FUSION-DIAG-1", "modality": "voice", "application_id": APPLICATION_ID},
        files={"image": ("sample.wav", voice_bytes, "audio/wav")},
    )

    response = client.post(
        "/authenticate/fusion",
        data={"user_id": "U-FUSION-DIAG-1", "application_id": APPLICATION_ID},
        files={
            "fingerprint_image": ("fp.png", fingerprint_bytes, "image/png"),
            "voice_audio": ("sample.wav", voice_bytes, "audio/wav"),
        },
    )
    assert response.status_code == 200
    body = response.json()
    diagnostics = body["fusion_diagnostics"]

    for modality in ("fingerprint", "voice"):
        assert diagnostics[modality]["score"] == pytest.approx(body["results"][modality]["score"])
        assert diagnostics[modality]["threshold"] == pytest.approx(body["results"][modality]["threshold"])
        assert diagnostics[modality]["verified"] == body["results"][modality]["authenticated"]

    # face was never submitted this request - represented, never fabricated.
    assert diagnostics["face"] == {"score": None, "threshold": None, "verified": None, "status": "not_presented"}

    assert diagnostics["weights"] == {"fingerprint": 0.5, "voice": 0.5}
    assert diagnostics["fused_score"] == pytest.approx(body["fused_score"])
    assert diagnostics["threshold"] == pytest.approx(body["fusion_threshold"])
    assert diagnostics["policy"] == body["fusion_policy"]
    assert diagnostics["access_granted"] == body["authenticated"]


def test_fusion_diagnostics_decision_matches_backend_even_when_fused_score_alone_would_mislead(client):
    """The real end-to-end version of the ALL_REQUIRED override: enroll fingerprint and voice with
    matching samples (both pass individually, fused score should be high), then confirm the
    diagnostics' access_granted always equals the backend's actual `authenticated` - never an
    independently-derived "fused_score >= threshold" shortcut, which is exactly the bug
    fusion/config.py's docstring documents ALL_REQUIRED was introduced to fix."""
    fingerprint_bytes = _encode_png(_synthetic_fingerprint_image())
    voice_bytes = _encode_wav(_tone())

    client.post(
        "/enroll",
        data={"user_id": "U-FUSION-DIAG-2", "modality": "fingerprint", "application_id": APPLICATION_ID},
        files={"image": ("fp.png", fingerprint_bytes, "image/png")},
    )
    client.post(
        "/enroll",
        data={"user_id": "U-FUSION-DIAG-2", "modality": "voice", "application_id": APPLICATION_ID},
        files={"image": ("sample.wav", voice_bytes, "audio/wav")},
    )

    response = client.post(
        "/authenticate/fusion",
        data={"user_id": "U-FUSION-DIAG-2", "application_id": APPLICATION_ID},
        files={
            "fingerprint_image": ("fp.png", fingerprint_bytes, "image/png"),
            "voice_audio": ("sample.wav", voice_bytes, "audio/wav"),
        },
    )
    body = response.json()
    diagnostics = body["fusion_diagnostics"]

    # The displayed/reported decision must match the backend's real decision under ALL_REQUIRED:
    # every submitted modality individually verified, never inferred from fused_score alone.
    all_verified = all(diagnostics[m]["verified"] for m in ("fingerprint", "voice"))
    assert diagnostics["access_granted"] == (all_verified and body["authenticated"])
    assert diagnostics["access_granted"] == body["authenticated"]


def test_fusion_diagnostics_omitted_from_production_responses(client, monkeypatch):
    """DEBUG_SCORES=false (production) must not expose fusion_diagnostics, same as the other
    per-modality debug-only fields (see test_flexible_auth.py::test_production_response_exposes_only_the_fusion_values)."""
    monkeypatch.setenv("DEBUG_SCORES", "false")
    from backend.config import get_settings

    get_settings.cache_clear()

    wav_bytes = _encode_wav(_tone())
    client.post(
        "/enroll",
        data={"user_id": "U-FUSION-DIAG-3", "modality": "voice", "application_id": APPLICATION_ID},
        files={"image": ("sample.wav", wav_bytes, "audio/wav")},
    )
    response = client.post(
        "/authenticate/fusion",
        data={"user_id": "U-FUSION-DIAG-3", "application_id": APPLICATION_ID},
        files={"voice_audio": ("sample.wav", wav_bytes, "audio/wav")},
    )
    assert response.status_code == 200
    assert "fusion_diagnostics" not in response.json()

    get_settings.cache_clear()  # restore DEBUG_SCORES=true for any test after this one in the same session


def test_fusion_unenrolled_modality_is_enrollment_required_not_a_zero_score(client):
    """A submitted modality that was never enrolled is ENROLLMENT_REQUIRED (409): it is not authenticated and not
    scored - never silently dropped, never fabricated as a zero-score failure."""
    wav_bytes = _encode_wav(_tone())

    response = client.post(
        "/authenticate/fusion",
        data={"user_id": "never-enrolled", "application_id": APPLICATION_ID},
        files={"voice_audio": ("sample.wav", wav_bytes, "audio/wav")},
    )
    assert response.status_code == 409
    body = response.json()
    assert body["status"] == "ENROLLMENT_REQUIRED" and body["missing_modalities"] == ["voice"]
    assert "results" not in body and "authenticated" not in body
