"""Tests for fusion/policy.py and fusion/config.py.

The first test (`test_all_required_blocks_the_compensatory_averaging_bug`)
directly reproduces the audit finding this sprint fixes: under the old plain
weighted-average fusion, Face=1.0 (pass) + Fingerprint=0.82 (individually a
fail at threshold=0.9) averaged to 0.91 and cleared the fusion threshold
anyway. `ALL_REQUIRED` (the new default) must refuse that.
"""

from __future__ import annotations

import pytest

from fusion.config import DEFAULT_WEIGHTED_FLOOR, FusionPolicy
from fusion.policy import evaluate_fusion_policy


def test_all_required_blocks_the_compensatory_averaging_bug():
    """Face passes, Fingerprint individually fails - the exact scenario the
    audit flagged as insecure under plain weighted averaging."""
    scores = {"face": 1.0, "fingerprint": 0.82}
    individually_authenticated = {"face": True, "fingerprint": False}

    decision = evaluate_fusion_policy(scores, individually_authenticated, FusionPolicy.ALL_REQUIRED, fusion_threshold=0.9)

    assert decision.fused_score == pytest.approx(0.91)  # the average alone would have passed 0.9
    assert decision.authenticated is False  # ALL_REQUIRED refuses anyway
    assert decision.failed_modalities == ["fingerprint"]
    assert decision.matched_modalities == ["face"]


def test_all_required_passes_when_every_submitted_modality_passes():
    scores = {"face": 0.95, "voice": 0.92}
    individually_authenticated = {"face": True, "voice": True}

    decision = evaluate_fusion_policy(scores, individually_authenticated, FusionPolicy.ALL_REQUIRED, fusion_threshold=0.9)

    assert decision.authenticated is True
    assert decision.failed_modalities == []
    assert decision.matched_modalities == ["face", "voice"]


def test_all_required_ignores_a_modality_that_was_never_submitted():
    """Omitted modalities must never enter the decision at all - not as a
    pass, not as a fail."""
    scores = {"face": 0.95, "voice": 0.92}
    individually_authenticated = {"face": True, "voice": True}

    decision = evaluate_fusion_policy(scores, individually_authenticated, FusionPolicy.ALL_REQUIRED, fusion_threshold=0.9)

    assert "fingerprint" not in decision.matched_modalities
    assert "fingerprint" not in decision.failed_modalities


def test_at_least_two_requires_exactly_three_modalities():
    scores = {"face": 0.95, "voice": 0.92}
    individually_authenticated = {"face": True, "voice": True}

    with pytest.raises(ValueError, match="AT_LEAST_TWO"):
        evaluate_fusion_policy(scores, individually_authenticated, FusionPolicy.AT_LEAST_TWO, fusion_threshold=0.9)


def test_at_least_two_passes_with_two_of_three_matches():
    scores = {"face": 0.95, "fingerprint": 0.6, "voice": 0.92}
    individually_authenticated = {"face": True, "fingerprint": False, "voice": True}

    decision = evaluate_fusion_policy(scores, individually_authenticated, FusionPolicy.AT_LEAST_TWO, fusion_threshold=0.9)

    assert decision.authenticated is True
    assert decision.failed_modalities == ["fingerprint"]


def test_at_least_two_fails_with_only_one_of_three_matches():
    scores = {"face": 0.95, "fingerprint": 0.6, "voice": 0.55}
    individually_authenticated = {"face": True, "fingerprint": False, "voice": False}

    decision = evaluate_fusion_policy(scores, individually_authenticated, FusionPolicy.AT_LEAST_TWO, fusion_threshold=0.9)

    assert decision.authenticated is False


def test_weighted_still_vetoes_on_a_score_below_the_floor():
    """The old bug's exact numbers, under WEIGHTED: averaging alone would
    pass, but a score below the floor must veto regardless."""
    scores = {"face": 1.0, "fingerprint": 0.3}  # 0.3 is below DEFAULT_WEIGHTED_FLOOR (0.5)
    individually_authenticated = {"face": True, "fingerprint": False}

    decision = evaluate_fusion_policy(
        scores, individually_authenticated, FusionPolicy.WEIGHTED, fusion_threshold=0.6, weighted_floor=DEFAULT_WEIGHTED_FLOOR
    )

    assert decision.fused_score == pytest.approx(0.65)  # clears fusion_threshold=0.6 on average alone
    assert decision.authenticated is False  # but the floor veto still blocks it


def test_weighted_passes_when_average_clears_threshold_and_nothing_is_below_floor():
    scores = {"face": 0.95, "fingerprint": 0.85}
    individually_authenticated = {"face": True, "fingerprint": False}

    decision = evaluate_fusion_policy(scores, individually_authenticated, FusionPolicy.WEIGHTED, fusion_threshold=0.89)

    assert decision.fused_score == pytest.approx(0.9)
    assert decision.authenticated is True


def test_evaluate_fusion_policy_rejects_empty_scores():
    with pytest.raises(ValueError):
        evaluate_fusion_policy({}, {}, FusionPolicy.ALL_REQUIRED, fusion_threshold=0.9)
