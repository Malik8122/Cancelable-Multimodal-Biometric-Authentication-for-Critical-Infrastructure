"""Offline tests for evaluation/fingerprint_metrics.py. Synthetic embeddings only."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from evaluation.fingerprint_metrics import (
    run_fingerprint_experiment,
    save_confusion_matrix_csv,
    save_fingerprint_metrics_csv,
    save_roc_csv,
    save_threshold_sweep_csv,
    threshold_sweep_table,
)


@pytest.fixture
def synthetic_subject_embeddings():
    embeddings, labels = [], []
    for subject in range(5):
        rng = np.random.default_rng(subject)
        base = rng.standard_normal(512).astype(np.float32)
        for _ in range(5):
            noise = np.random.default_rng(subject * 10 + _).normal(scale=0.05, size=512).astype(np.float32)
            vector = base + noise
            embeddings.append(vector / np.linalg.norm(vector))
            labels.append(subject)  # int subject ids, like SocofingDataset's val/test labels
    return embeddings, labels


def test_run_fingerprint_experiment_reports_plausible_metrics(synthetic_subject_embeddings):
    embeddings, labels = synthetic_subject_embeddings
    report = run_fingerprint_experiment(embeddings, labels)

    assert report["modality"] == "fingerprint"
    assert 0.0 <= report["eer"] <= 1.0
    assert 0.0 <= report["accuracy"] <= 1.0
    assert 0.0 <= report["precision"] <= 1.0
    assert 0.0 <= report["recall"] <= 1.0
    assert 0.0 <= report["f1"] <= 1.0
    assert report["confusion_matrix"].shape == (2, 2)


def test_run_fingerprint_experiment_requires_genuine_and_impostor_pairs():
    single_subject = [np.random.default_rng(i).standard_normal(512) for i in range(3)]
    with pytest.raises(ValueError):
        run_fingerprint_experiment(single_subject, [1, 1, 1])


def test_threshold_sweep_table_has_requested_row_count(synthetic_subject_embeddings):
    embeddings, labels = synthetic_subject_embeddings
    report = run_fingerprint_experiment(embeddings, labels)

    rows = threshold_sweep_table(report["genuine_scores"], report["impostor_scores"], num_thresholds=11)

    assert len(rows) == 11
    for row in rows:
        assert 0.0 <= row["far"] <= 1.0
        assert 0.0 <= row["frr"] <= 1.0
        assert 0.0 <= row["accuracy"] <= 1.0


def test_save_fingerprint_metrics_csv_writes_scalar_fields(tmp_path: Path, synthetic_subject_embeddings):
    embeddings, labels = synthetic_subject_embeddings
    report = run_fingerprint_experiment(embeddings, labels)
    path = tmp_path / "fingerprint_metrics.csv"

    save_fingerprint_metrics_csv(report, path)

    contents = path.read_text(encoding="utf-8")
    assert "eer" in contents
    assert "precision" in contents


def test_save_roc_csv_writes_curve_points(tmp_path: Path, synthetic_subject_embeddings):
    embeddings, labels = synthetic_subject_embeddings
    report = run_fingerprint_experiment(embeddings, labels)
    path = tmp_path / "fingerprint_roc.csv"

    save_roc_csv(report, path)

    lines = path.read_text(encoding="utf-8").splitlines()
    assert lines[0] == "fpr,tpr,threshold"
    assert len(lines) > 1


def test_save_confusion_matrix_csv_writes_a_2x2_table(tmp_path: Path, synthetic_subject_embeddings):
    embeddings, labels = synthetic_subject_embeddings
    report = run_fingerprint_experiment(embeddings, labels)
    path = tmp_path / "fingerprint_confusion.csv"

    save_confusion_matrix_csv(report, path)

    lines = path.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 3


def test_save_threshold_sweep_csv_writes_all_rows(tmp_path: Path, synthetic_subject_embeddings):
    embeddings, labels = synthetic_subject_embeddings
    report = run_fingerprint_experiment(embeddings, labels)
    rows = threshold_sweep_table(report["genuine_scores"], report["impostor_scores"], num_thresholds=15)
    path = tmp_path / "fingerprint_threshold_sweep.csv"

    save_threshold_sweep_csv(rows, path)

    lines = path.read_text(encoding="utf-8").splitlines()
    assert lines[0] == "threshold,far,frr,accuracy"
    assert len(lines) == 16
