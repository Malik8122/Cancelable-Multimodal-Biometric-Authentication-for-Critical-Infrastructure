"""Fingerprint-specific evaluation report for the SOCOFing accuracy upgrade.

Mirrors `evaluation/voice_metrics.py`'s shape exactly, reusing the same
shared primitives (`evaluation/metrics.py`, `evaluation/roc.py`,
`evaluation/experiments.py::build_genuine_impostor_scores`). The one thing
this file adds beyond `voice_metrics.py` is `threshold_sweep_table` - a
row-per-threshold FAR/FRR/accuracy table, which the accuracy-upgrade spec
asks for explicitly ("Threshold sweep table").

As documented in `models/fingerprint/dataset.py`, `embeddings`/`labels` here
should come from the **subject-disjoint validation or test split** - the
model's ArcFace head never saw these identities during training, so this is
a genuine open-set verification evaluation, not classification accuracy on
known classes.
"""

from __future__ import annotations

import csv
from pathlib import Path

import numpy as np

from evaluation.experiments import build_genuine_impostor_scores
from evaluation.metrics import accuracy_at_threshold, compute_eer, compute_far_frr, confusion_matrix_at_threshold, precision_recall_f1
from evaluation.roc import compute_roc


def run_fingerprint_experiment(embeddings: list[np.ndarray], labels: list) -> dict:
    """Full fingerprint evaluation report: accuracy, precision/recall/F1, FAR/FRR, EER, ROC/AUC.

    `labels` are subject ids (int or str) - only used to determine which
    pairs are genuine (same subject) vs. impostor (different subject), never
    fed to a classifier here.
    """
    genuine_scores, impostor_scores = build_genuine_impostor_scores(embeddings, [str(label) for label in labels])
    if len(genuine_scores) == 0 or len(impostor_scores) == 0:
        raise ValueError(
            "Need at least one genuine pair and one impostor pair to evaluate fingerprint; "
            "make sure the sample set has multiple images per subject and multiple subjects."
        )

    eer, eer_threshold = compute_eer(genuine_scores, impostor_scores)
    accuracy = accuracy_at_threshold(genuine_scores, impostor_scores, eer_threshold)
    far, frr = compute_far_frr(genuine_scores, impostor_scores, eer_threshold)
    prf1 = precision_recall_f1(genuine_scores, impostor_scores, eer_threshold)
    roc = compute_roc(genuine_scores, impostor_scores)
    confusion = confusion_matrix_at_threshold(genuine_scores, impostor_scores, eer_threshold)

    return {
        "modality": "fingerprint",
        "num_samples": len(embeddings),
        "num_genuine_pairs": len(genuine_scores),
        "num_impostor_pairs": len(impostor_scores),
        "eer": eer,
        "eer_threshold": eer_threshold,
        "accuracy": accuracy,
        "far": far,
        "frr": frr,
        "precision": prf1["precision"],
        "recall": prf1["recall"],
        "f1": prf1["f1"],
        "auc": roc["auc"],
        "roc": roc,
        "confusion_matrix": confusion,
        "genuine_scores": genuine_scores,
        "impostor_scores": impostor_scores,
    }


def threshold_sweep_table(genuine_scores: np.ndarray, impostor_scores: np.ndarray, num_thresholds: int = 21) -> list[dict]:
    """FAR/FRR/accuracy at `num_thresholds` evenly-spaced thresholds spanning both score distributions.

    One row per threshold - the "threshold sweep table" the spec asks for,
    useful for picking a real deployment threshold rather than trusting the
    EER point blindly.
    """
    all_scores = np.concatenate([genuine_scores, impostor_scores])
    thresholds = np.linspace(all_scores.min(), all_scores.max(), num_thresholds)

    rows = []
    for threshold in thresholds:
        far, frr = compute_far_frr(genuine_scores, impostor_scores, float(threshold))
        accuracy = accuracy_at_threshold(genuine_scores, impostor_scores, float(threshold))
        rows.append({"threshold": float(threshold), "far": far, "frr": frr, "accuracy": accuracy})
    return rows


def save_fingerprint_metrics_csv(report: dict, path: str | Path) -> None:
    """Write the scalar metrics from `run_fingerprint_experiment`'s report to a CSV."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    scalar_fields = (
        "modality", "num_samples", "num_genuine_pairs", "num_impostor_pairs",
        "eer", "eer_threshold", "accuracy", "far", "frr", "precision", "recall", "f1", "auc",
    )
    with open(path, "w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["metric", "value"])
        for field in scalar_fields:
            writer.writerow([field, report[field]])


def save_roc_csv(report: dict, path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    roc = report["roc"]
    with open(path, "w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["fpr", "tpr", "threshold"])
        for fpr, tpr, threshold in zip(roc["fpr"], roc["tpr"], roc["thresholds"]):
            writer.writerow([fpr, tpr, threshold])


def save_confusion_matrix_csv(report: dict, path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    matrix = report["confusion_matrix"]
    with open(path, "w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["", "predicted_impostor", "predicted_genuine"])
        writer.writerow(["actual_impostor", matrix[0][0], matrix[0][1]])
        writer.writerow(["actual_genuine", matrix[1][0], matrix[1][1]])


def save_threshold_sweep_csv(rows: list[dict], path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(["threshold", "far", "frr", "accuracy"])
        for row in rows:
            writer.writerow([row["threshold"], row["far"], row["frr"], row["accuracy"]])
