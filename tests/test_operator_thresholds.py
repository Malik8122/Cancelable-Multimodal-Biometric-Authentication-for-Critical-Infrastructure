"""Per-modality authentication thresholds as configured in evaluation/results/*_threshold.json.

Face and voice were denying genuine users at the 0.90 fallback: 0.90 on the 256-bit protected-template Hamming similarity means an
embedding cosine of ~0.95 between the enrolled and the live capture, which real webcam / microphone captures rarely reach (a real user
scored face 0.754-0.820 and voice 0.797-0.879). The operator set face and voice to 0.80 and rejected lowering face further (a lower face threshold would also accept synthetic images). Fingerprint and iris are unchanged (fallback 0.90).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

RESULTS = Path(__file__).resolve().parents[1] / "evaluation" / "results"


@pytest.fixture(autouse=True)
def _fresh_threshold_cache():
    from backend import threshold_loader

    threshold_loader.clear_cache()
    yield
    threshold_loader.clear_cache()


def test_face_and_voice_use_0_8_and_the_others_keep_the_0_9_fallback():
    from backend.threshold_loader import get_modality_threshold

    assert get_modality_threshold("face", 0.9) == 0.8
    assert get_modality_threshold("voice", 0.9) == 0.8
    assert get_modality_threshold("fingerprint", 0.9) == 0.9
    assert get_modality_threshold("iris", 0.9) == 0.9


@pytest.mark.parametrize("modality", ["face", "voice"])
def test_the_files_say_they_are_operator_specified_not_a_measured_calibration(modality):
    report = json.loads((RESULTS / f"{modality}_threshold.json").read_text(encoding="utf-8"))
    assert report["threshold"] == 0.8 and report["source"] == "operator-specified"
    assert report["far"] is None and report["frr"] is None and report["eer"] is None  # nothing was measured: nothing is claimed
    assert "Delete this file to restore the 0.90 fallback" in report["note"]


def test_the_threshold_a_modality_is_judged_against_is_the_configured_one(db_session):
    """A protected-template similarity between 0.80 and 0.90 is now a match for face; for fingerprint it is not."""
    from backend.config import get_settings
    from backend.services.base_service import ModalityService
    from template_protection.matcher import accept

    class Stub:
        is_mock = False

        def embed(self, raw):
            return raw

    settings = get_settings()
    face = ModalityService("face", Stub(), settings)
    fingerprint = ModalityService("fingerprint", Stub(), settings)
    import numpy as np

    rng = np.random.default_rng(0)
    base = rng.standard_normal(512)
    base /= np.linalg.norm(base)
    noise = rng.standard_normal(512)
    noise -= (noise @ base) * base
    noise /= np.linalg.norm(noise)
    live = 0.93 * base + np.sqrt(1 - 0.93**2) * noise  # embedding cosine 0.93 -> template similarity ~0.88-0.89

    for service in (face, fingerprint):
        service.enroll(db_session, base, "u", "app")
    face_result = face.authenticate(db_session, live, "u", "app")
    fingerprint_result = fingerprint.authenticate(db_session, live, "u", "app")
    assert face_result.threshold == 0.8 and fingerprint_result.threshold == 0.9
    assert 0.8 <= face_result.score < 0.9 and face_result.authenticated is True  # would have been denied at 0.90
    assert accept(fingerprint_result.score, 0.9) is False and fingerprint_result.authenticated is False


def test_an_unrelated_person_is_still_far_below_the_threshold(db_session):
    """Impostor-level embeddings (cosine ~0.3 or less) give template similarity ~0.64 or less - under the 0.80 face threshold."""
    import numpy as np

    from backend.config import get_settings
    from backend.services.base_service import ModalityService

    class Stub:
        is_mock = False

        def embed(self, raw):
            return raw

    service = ModalityService("face", Stub(), get_settings())
    rng = np.random.default_rng(1)
    enrolled = rng.standard_normal(512)
    service.enroll(db_session, enrolled, "u", "app")
    scores = [service.authenticate(db_session, rng.standard_normal(512), "u", "app").score for _ in range(20)]
    assert max(scores) < 0.65 and all(s < 0.8 for s in scores)


def test_metrics_endpoint_reports_only_what_was_measured(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from backend.config import get_settings
    from backend.database.session import get_engine, get_session_factory

    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'm.db'}")
    for fn in (get_settings, get_engine, get_session_factory):
        fn.cache_clear()
    from backend.main import app

    with TestClient(app) as client:
        body = client.get("/metrics/face").json()
        health = client.get("/system/health").json()
    for fn in (get_settings, get_engine, get_session_factory):
        fn.cache_clear()
    assert body["calibrated"] is True and body["metrics"]["calibrated_threshold"] == 0.8
    assert not {"calibrated_far", "calibrated_frr", "calibrated_eer", "calibrated_auc"} & set(body["metrics"])  # no invented numbers
    assert health["thresholds_loaded"] is False  # fingerprint (and iris) are still uncalibrated
