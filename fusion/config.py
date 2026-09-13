"""Fusion decision policies.

The audit finding this fixes: `fuse_scores`'s plain weighted average let one
strong modality compensate for another that individually failed its own
threshold - e.g. Face=1.0 (pass) + Fingerprint=0.82 (individually a fail at
threshold=0.9) averaged to 0.91, which cleared the fusion threshold even
though Fingerprint's own result said "no match". `fusion/policy.py` is where
that decision actually gets made now; this module only defines the available
policies and their tunable parameters.
"""

from __future__ import annotations

from enum import Enum


class FusionPolicy(str, Enum):
    #: Every submitted modality must individually pass its own threshold.
    #: The new default - the secure, "AND" behavior a multi-factor system is
    #: generally expected to have.
    ALL_REQUIRED = "ALL_REQUIRED"

    #: Valid only when exactly three modalities are submitted: at least two
    #: of the three must individually pass. A middle ground between
    #: ALL_REQUIRED's strictness and WEIGHTED's compensatory averaging.
    AT_LEAST_TWO = "AT_LEAST_TWO"

    #: The original weighted-average behavior (`fusion/score_fusion.py::fuse_scores`),
    #: but no longer unconditionally: any submitted modality scoring below
    #: `weighted_floor` vetoes authentication regardless of the average, so a
    #: strong modality can no longer fully compensate for a very weak one.
    WEIGHTED = "WEIGHTED"


#: Policy used when a request doesn't specify one. Deliberately the
#: strictest option - the bug this sprint fixes was `WEIGHTED` being the
#: *only* option, so the safe default changes rather than staying opt-in.
DEFAULT_FUSION_POLICY = FusionPolicy.ALL_REQUIRED

#: WEIGHTED mode's per-modality minimum: any present modality scoring below
#: this vetoes authentication before the average is even considered. 0.5 is
#: the Hamming-similarity midpoint (statistically-unrelated bit strings
#: average ~0.5 - see template_protection/biohash.py's non-invertibility
#: discussion), i.e. "no better than chance" - a conservative floor a real
#: deployment should tighten once per-modality calibration
#: (evaluation/threshold_calibration.py) data exists.
DEFAULT_WEIGHTED_FLOOR = 0.5

ALL_POLICIES: tuple[str, ...] = tuple(policy.value for policy in FusionPolicy)
