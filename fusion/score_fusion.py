"""Baseline multimodal score fusion.

Deliberately a simple, explicitly-documented **baseline** - a configurable
weighted average over whichever modalities were actually tested - not an
optimized or learned fusion strategy. `docs/ARCHITECTURE.md` already
anticipated this module ("fusion/score_fusion.py (configurable weighted
multimodal fusion)"); this is that module, built to the standard the rest of
this project holds itself to: state what it does and doesn't claim, rather
than presenting a first-pass baseline as more sophisticated than it is.

Used by `backend/api/fusion.py::authenticate_fusion` - this module itself
contains no biometric inference, no database access, and no knowledge of
HTTP; it only combines numbers it's handed.
"""

from __future__ import annotations


def fuse_scores(scores: dict[str, float], weights: dict[str, float] | None = None) -> float:
    """Weighted average of `scores`, renormalized over whichever modalities are present.

    Rules:
    1. Only modalities actually present in `scores` are included - a
       modality that wasn't tested is never treated as a zero score.
    2. `weights` only needs entries for modalities you want to weight
       differently from equal; any modality in `scores` without a matching
       entry in `weights` defaults to `1.0` before renormalization. Weights
       for modalities *not* present in `scores` are ignored.
    3. Equal weights (every present modality at `1.0`) are the default.
    4. Weights are renormalized so they sum to 1 over the present
       modalities - the caller doesn't need to pre-normalize.
    5. Deterministic: the same `scores`/`weights` always produce the same
       output.
    6. No biometric inference logic lives here - `scores` must already be
       computed elsewhere (each modality's own `ModalityService.authenticate`).

    Example: `fuse_scores({"face": 0.90, "fingerprint": 0.70, "voice": 0.95})`
    with equal weights returns `(0.90 + 0.70 + 0.95) / 3`.
    """
    if not scores:
        raise ValueError("fuse_scores requires at least one modality score.")

    weights = weights or {}
    resolved_weights = {modality: weights.get(modality, 1.0) for modality in scores}
    total_weight = sum(resolved_weights.values())
    if total_weight <= 0:
        raise ValueError("The sum of weights for the supplied modalities must be positive.")

    weighted_sum = sum(scores[modality] * resolved_weights[modality] for modality in scores)
    return weighted_sum / total_weight
