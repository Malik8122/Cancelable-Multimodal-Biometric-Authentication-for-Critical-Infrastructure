"""Recognition performance metrics shared across all modalities and phases.

Used by the Colab notebooks (Experiment 1: individual modality performance)
and later by evaluation/experiments.py (Experiment 2/3: protected-template
and fusion performance).
"""

from __future__ import annotations

import numpy as np


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    a_norm, b_norm = np.linalg.norm(a), np.linalg.norm(b)
    if a_norm == 0 or b_norm == 0:
        return 0.0
    return float(np.dot(a, b) / (a_norm * b_norm))


def compute_far_frr(
    genuine_scores: np.ndarray,
    impostor_scores: np.ndarray,
    threshold: float,
) -> tuple[float, float]:
    """False Accept Rate / False Reject Rate at a given similarity threshold.

    Scores are assumed to be similarities in [-1, 1] or [0, 1] where higher
    means "more likely genuine".
    """
    far = float(np.mean(impostor_scores >= threshold)) if len(impostor_scores) else 0.0
    frr = float(np.mean(genuine_scores < threshold)) if len(genuine_scores) else 0.0
    return far, frr


def compute_eer(genuine_scores: np.ndarray, impostor_scores: np.ndarray) -> tuple[float, float]:
    """Equal Error Rate: the threshold where FAR ~= FRR, and that rate.

    Returns (eer, threshold_at_eer).
    """
    thresholds = np.unique(np.concatenate([genuine_scores, impostor_scores]))
    best_gap = float("inf")
    best_eer, best_threshold = 1.0, 0.0
    for threshold in thresholds:
        far, frr = compute_far_frr(genuine_scores, impostor_scores, threshold)
        gap = abs(far - frr)
        if gap < best_gap:
            best_gap = gap
            best_eer, best_threshold = (far + frr) / 2, float(threshold)
    return best_eer, best_threshold


def accuracy_at_threshold(
    genuine_scores: np.ndarray,
    impostor_scores: np.ndarray,
    threshold: float,
) -> float:
    correct = np.sum(genuine_scores >= threshold) + np.sum(impostor_scores < threshold)
    total = len(genuine_scores) + len(impostor_scores)
    return float(correct / total) if total else 0.0
