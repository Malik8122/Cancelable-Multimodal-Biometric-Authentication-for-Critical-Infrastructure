"""Offline tests for Voice's backend integration (Phase 3A, Step 2).

Voice was added as a modality after Phase 2's backend was built, so it never
had a `backend/services/voice_service.py` or a `/verify/voice` route until
this integration - these tests exist specifically to prove that gap is
closed: the real trained checkpoint loads (not mock mode), the
`_VoicePipelineAdapter` correctly bridges `VoicePipeline`'s two-argument
`embed(waveform, sample_rate)` to `ModalityService`'s single-argument
`embed(raw_image)` contract, and the full enroll -> verify flow works
end-to-end through the actual HTTP API, mirroring `tests/test_backend_api.py`'s
fixture/pattern exactly (iris there, voice here).
"""

from __future__ import annotations

import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy.io import wavfile

APPLICATION_ID = "capstone-demo"
SAMPLE_RATE = 16_000


def _encode_wav(waveform: np.ndarray, sample_rate: int = SAMPLE_RATE) -> bytes:
    int16_waveform = (waveform * 32767).astype(np.int16)
    buffer = io.BytesIO()
    wavfile.write(buffer, sample_rate, int16_waveform)
    return buffer.getvalue()


def _tone(duration_seconds: float = 2.0, frequency: float = 220.0, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    t = np.linspace(0, duration_seconds, int(sample_rate * duration_seconds), endpoint=False)
    return (0.3 * np.sin(2 * np.pi * frequency * t)).astype(np.float32)


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


def test_voice_pipeline_adapter_bridges_the_two_argument_embed_call():
    """No speechbrain/torchaudio needed - proves the adapter's wiring itself
    is correct, independent of whether the real backbone is installed."""
    from backend.services.voice_service import _VoicePipelineAdapter
    from embeddings.pipelines import VoicePipeline

    adapter = _VoicePipelineAdapter(VoicePipeline(checkpoint_path=None))  # mock mode
    assert adapter.is_mock is True
    assert adapter.embedding_dim == 192

    embedding = adapter.embed((_tone(), SAMPLE_RATE))
    assert embedding.shape == (192,)
    assert np.isclose(np.linalg.norm(embedding), 1.0, atol=1e-5)


def test_get_voice_service_loads_the_real_checkpoint_not_mock_mode():
    """Per the integration requirement: /verify/voice must not silently fall
    back to mock mode. This fails loudly if the committed checkpoint is ever
    missing or fails to load, rather than passing accidentally."""
    pytest.importorskip("speechbrain", reason="speechbrain not installed in this environment")
    pytest.importorskip("torchaudio", reason="torchaudio not installed in this environment")
    from backend.services.voice_service import get_voice_service

    service = get_voice_service()
    assert service.modality == "voice"
    assert service.pipeline.is_mock is False, "voice checkpoint failed to load - falling back to mock mode"
    assert service.pipeline.embedding_dim == 192


def test_enroll_then_verify_voice_via_the_real_api(client):
    """Full HTTP round-trip: POST /enroll (modality=voice) -> POST /verify/voice,
    using the real trained checkpoint - confirms decode_biometric_sample's
    voice branch, the adapter, and the route wiring all work together."""
    pytest.importorskip("speechbrain", reason="speechbrain not installed in this environment")
    pytest.importorskip("torchaudio", reason="torchaudio not installed in this environment")

    wav_bytes = _encode_wav(_tone())

    enroll_response = client.post(
        "/enroll",
        data={"user_id": "U-VOICE-API", "modality": "voice", "application_id": APPLICATION_ID},
        files={"image": ("sample.wav", wav_bytes, "audio/wav")},
    )
    assert enroll_response.status_code == 200
    assert enroll_response.json()["modality"] == "voice"

    verify_response = client.post(
        "/verify/voice",
        data={"user_id": "U-VOICE-API", "application_id": APPLICATION_ID},
        files={"image": ("sample.wav", wav_bytes, "audio/wav")},
    )
    assert verify_response.status_code == 200
    body = verify_response.json()
    assert body["modality"] == "voice"
    assert body["authenticated"] is True
    assert body["score"] >= body["threshold"]


def test_verify_voice_without_enrollment_returns_not_authenticated(client):
    pytest.importorskip("speechbrain", reason="speechbrain not installed in this environment")
    pytest.importorskip("torchaudio", reason="torchaudio not installed in this environment")

    response = client.post(
        "/verify/voice",
        data={"user_id": "never-enrolled", "application_id": APPLICATION_ID},
        files={"image": ("sample.wav", _encode_wav(_tone()), "audio/wav")},
    )
    assert response.status_code == 200
    assert response.json()["authenticated"] is False


def test_enroll_voice_rejects_a_non_audio_content_type(client):
    response = client.post(
        "/enroll",
        data={"user_id": "U-VOICE-API", "modality": "voice", "application_id": APPLICATION_ID},
        files={"image": ("notes.txt", b"not audio", "text/plain")},
    )
    assert response.status_code == 415


def test_enroll_voice_rejects_a_corrupt_wav_file(client):
    response = client.post(
        "/enroll",
        data={"user_id": "U-VOICE-API", "modality": "voice", "application_id": APPLICATION_ID},
        files={"image": ("broken.wav", b"not actually a wav file", "audio/wav")},
    )
    assert response.status_code == 400
