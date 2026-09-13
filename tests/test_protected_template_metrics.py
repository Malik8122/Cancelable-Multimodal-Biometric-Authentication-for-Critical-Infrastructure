"""Integration test: real embedder output -> protected-template calibration -> CSV/JSON.

tests/test_threshold_calibration.py already covers the calibration *math*
against synthetic embeddings directly. This file instead runs the layer
above that: real `FingerprintEmbedder` inference (the real trained
checkpoint, guarded by `pytest.importorskip` like the rest of this suite)
on synthetic images, proving the real embedder's output is actually
compatible end-to-end with `evaluation/threshold_calibration.py` and the
Bug-2 CSV schema - not that the resulting numbers are biometrically
meaningful (they aren't: synthetic ridge patterns aren't real fingerprints
with genuine identity variation - see the module's own docstring on this).
"""

from __future__ import annotations

import csv
from pathlib import Path

import numpy as np
import pytest

from evaluation.threshold_calibration import calibrate_modality_threshold, save_protected_metrics_csv, save_threshold_json

MASTER_SECRET = "unit-test-master-secret-not-for-production"
APPLICATION_ID = "capstone-demo"

EXPECTED_CSV_COLUMNS = ["threshold", "accuracy", "far", "frr", "eer", "tp", "fp", "tn", "fn"]


def _synthetic_fingerprint_image(frequency: float, seed: int) -> np.ndarray:
    """A distinct ridge-like pattern per (frequency, seed) pair, so different
    "identities" produce genuinely different real embeddings - not the same
    image reused, which would make every genuine/impostor pair identical."""
    rng = np.random.default_rng(seed)
    x = np.linspace(0, frequency * np.pi, 300)
    y = np.linspace(0, frequency * np.pi, 300)
    xx, _ = np.meshgrid(x, y)
    noise = rng.normal(scale=8, size=xx.shape)
    ridges = (np.sin(xx) * 100 + 128 + noise).clip(0, 255).astype(np.uint8)
    return np.stack([ridges] * 3, axis=-1)


@pytest.fixture
def real_fingerprint_embeddings_and_labels():
    pytest.importorskip("torchvision", reason="torchvision not installed in this environment")
    from embeddings.constants import DEFAULT_CHECKPOINTS
    from models.fingerprint.inference import FingerprintEmbedder
    from preprocessing.fingerprint import FingerprintPreprocessor

    embedder = FingerprintEmbedder(checkpoint_path=DEFAULT_CHECKPOINTS["fingerprint"])
    assert embedder.mock_mode is False, "expected the real trained fingerprint checkpoint to load"
    preprocessor = FingerprintPreprocessor()

    embeddings, labels = [], []
    for identity, frequency in enumerate([10, 16, 22]):
        for sample in range(3):
            image = _synthetic_fingerprint_image(frequency, seed=identity * 10 + sample)
            processed = preprocessor.preprocess(image)
            embeddings.append(embedder.extract_embedding(processed))
            labels.append(f"identity-{identity}")
    return embeddings, labels


def test_real_embedder_output_calibrates_end_to_end(real_fingerprint_embeddings_and_labels):
    embeddings, labels = real_fingerprint_embeddings_and_labels
    report = calibrate_modality_threshold(embeddings, labels, MASTER_SECRET, APPLICATION_ID, modality="fingerprint")

    assert report["num_genuine_pairs"] == 3 * 3  # C(3,2) per identity * 3 identities
    assert report["num_impostor_pairs"] > 0
    assert 0.5 <= report["threshold"] <= 1.0
    assert 0.0 <= report["eer"] <= 1.0


def test_protected_metrics_csv_has_the_bug2_required_columns(tmp_path: Path, real_fingerprint_embeddings_and_labels):
    embeddings, labels = real_fingerprint_embeddings_and_labels
    report = calibrate_modality_threshold(embeddings, labels, MASTER_SECRET, APPLICATION_ID, modality="fingerprint")
    csv_path = tmp_path / "fingerprint_protected_metrics.csv"

    save_protected_metrics_csv(report, csv_path)

    with open(csv_path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        assert reader.fieldnames == EXPECTED_CSV_COLUMNS
        rows = list(reader)

    assert len(rows) == len(report["sweep"])
    for row in rows:
        # Every declared column round-trips through the file as a real value,
        # not blank/placeholder.
        for column in EXPECTED_CSV_COLUMNS:
            assert row[column] != ""
        assert int(row["tp"]) + int(row["fn"]) == report["num_genuine_pairs"]
        assert int(row["tn"]) + int(row["fp"]) == report["num_impostor_pairs"]


def test_threshold_json_and_protected_csv_agree_on_the_picked_threshold(tmp_path: Path, real_fingerprint_embeddings_and_labels):
    embeddings, labels = real_fingerprint_embeddings_and_labels
    report = calibrate_modality_threshold(embeddings, labels, MASTER_SECRET, APPLICATION_ID, modality="fingerprint")

    json_path = tmp_path / "fingerprint_threshold.json"
    csv_path = tmp_path / "fingerprint_protected_metrics.csv"
    save_threshold_json(report, json_path)
    save_protected_metrics_csv(report, csv_path)

    import json

    saved_threshold = json.loads(json_path.read_text(encoding="utf-8"))["threshold"]
    with open(csv_path, newline="", encoding="utf-8") as handle:
        csv_thresholds = {float(row["threshold"]) for row in csv.DictReader(handle)}

    assert saved_threshold in csv_thresholds
