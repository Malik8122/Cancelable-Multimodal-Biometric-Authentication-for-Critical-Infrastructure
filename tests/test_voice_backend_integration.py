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


def test_recapture_with_small_noise_is_no_longer_catastrophically_unstable(client):
    """Regression test for the authentication-debug-sprint bug: before fixing
    `preprocessing/voice.py::VoicePreprocessor._trim_silence`'s overlapping-
    frame duplication, a genuine same-speaker "recapture" (the same tone plus
    a tiny 1% amount of noise, standing in for real sensor/mic variation)
    produced a similarity score of ~0.13-0.59 depending on noise level - once
    even *negative* (-0.18) - because the unstable, duplicated intermediate
    waveform meant the final center-cropped segment could end up almost
    unrelated to the original. This doesn't assert a pass against the
    (separately tracked, uncalibrated) match threshold - see
    tests/test_authentication_debug_sprint.py for why that's a distinct,
    not-yet-resolved gap - only that the fix restores basic stability: a
    small perturbation must produce a *clearly correlated* result, not one
    indistinguishable from (or worse than) chance.
    """
    pytest.importorskip("speechbrain", reason="speechbrain not installed in this environment")
    pytest.importorskip("torchaudio", reason="torchaudio not installed in this environment")

    base = _tone(4.0)
    rng = np.random.default_rng(5)
    recaptured = base + rng.normal(scale=0.01 * np.std(base), size=base.shape).astype(np.float32)

    enroll_response = client.post(
        "/enroll",
        data={"user_id": "U-VOICE-STABILITY", "modality": "voice", "application_id": APPLICATION_ID},
        files={"image": ("sample.wav", _encode_wav(base), "audio/wav")},
    )
    assert enroll_response.status_code == 200

    verify_response = client.post(
        "/verify/voice",
        data={"user_id": "U-VOICE-STABILITY", "application_id": APPLICATION_ID},
        files={"image": ("recapture.wav", _encode_wav(recaptured), "audio/wav")},
    )
    assert verify_response.status_code == 200
    body = verify_response.json()
    # 0.5 is the Hamming-similarity midpoint (statistically-unrelated bit
    # strings average ~0.5, see template_protection/biohash.py) - a genuine
    # recapture must land clearly above that, not at-or-below chance.
    assert body["score"] > 0.5, f"genuine recapture score collapsed to {body['score']} - the trim_silence bug may have regressed"


def test_genuine_recapture_authenticates_with_the_calibrated_threshold(client):
    """Now that evaluation/results/voice_threshold.json exists (a real,
    same-key, ROC-anchored calibration - see
    docs/AUTHENTICATION_RELIABILITY_REPORT.md and
    scripts/calibrate_protected_thresholds.py), a genuine second capture with
    a realistic amount of variation should not just be "stable" (the
    previous test's claim) but should actually clear the real threshold and
    authenticate - the actual "genuine user must authenticate successfully"
    requirement this reliability sprint set out to satisfy for voice.

    Uses a broadband, envelope-shaped noise signal rather than a pure tone -
    a pure sine wave is spectrally sparse in a way this real ECAPA-TDNN model
    handles unpredictably (see scripts/calibrate_protected_thresholds.py's
    and docs/AUTHENTICATION_RELIABILITY_REPORT.md's investigation notes);
    broadband noise is a fairer, more speech-like stand-in.
    """
    pytest.importorskip("speechbrain", reason="speechbrain not installed in this environment")
    pytest.importorskip("torchaudio", reason="torchaudio not installed in this environment")
    from scipy.signal import butter, lfilter

    sr = SAMPLE_RATE
    t = np.linspace(0, 4.0, sr * 4, endpoint=False)
    b, a = butter(4, [300 / (sr / 2), 3400 / (sr / 2)], btype="band")
    rng = np.random.default_rng(7)
    base = lfilter(b, a, rng.standard_normal(len(t))).astype(np.float32)
    envelope = (0.6 + 0.4 * np.sin(2 * np.pi * 2 * t)).astype(np.float32)
    base = base * envelope
    base = (base / np.std(base) * 0.1).astype(np.float32)
    recaptured = base + np.random.default_rng(8).normal(scale=0.01 * np.std(base), size=base.shape).astype(np.float32)

    enroll_response = client.post(
        "/enroll",
        data={"user_id": "U-VOICE-GENUINE", "modality": "voice", "application_id": APPLICATION_ID},
        files={"image": ("sample.wav", _encode_wav(base), "audio/wav")},
    )
    assert enroll_response.status_code == 200

    verify_response = client.post(
        "/verify/voice",
        data={"user_id": "U-VOICE-GENUINE", "application_id": APPLICATION_ID},
        files={"image": ("recapture.wav", _encode_wav(recaptured), "audio/wav")},
    )
    assert verify_response.status_code == 200
    body = verify_response.json()
    assert body["authenticated"] is True, f"genuine recapture (score={body['score']}, threshold={body['threshold']}) was denied"


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
