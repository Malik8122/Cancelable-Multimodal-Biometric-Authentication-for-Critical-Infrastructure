"""Fingerprint training loss: ArcFace head + label smoothing + hard-negative mining.

`build_arcface_head` reuses, rather than reimplements, the ArcFace math
already shared by every modality's training in
`models/common/arcface.py::ArcMarginProduct` - the same rationale as
`models/voice/losses.py::build_arcface_head`.

Label smoothing doesn't get its own hand-rolled function: PyTorch's
`nn.CrossEntropyLoss` has supported `label_smoothing` natively since 1.10, so
reimplementing it would just be a second, harder-to-trust copy of a solved
problem - `build_criterion` below is a one-line factory around it purely for
naming symmetry with `build_arcface_head`.

Hard-negative mining (Part 10 of the accuracy-upgrade spec) is the one piece
that genuinely needs new code: ArcFace is a softmax/classification loss, not
a triplet loss, so it has no native "negative" concept to mine. The
interpretation implemented here - after a configurable start epoch, find the
highest-similarity *impostor* pairs within a batch and add a small hinge
penalty pushing them apart - is a documented design choice for this project,
not a standard named technique with its own literature citation.
"""

from __future__ import annotations

from models.common.arcface import ArcMarginProduct
from models.fingerprint.config import FingerprintConfig


def build_arcface_head(num_classes: int, config: FingerprintConfig | None = None) -> ArcMarginProduct:
    """ArcFace head sized for `num_classes` training-split subjects, using `config`'s margin/scale."""
    config = config or FingerprintConfig()
    return ArcMarginProduct(
        in_features=config.embedding_dim,
        out_features=num_classes,
        s=config.arcface_scale,
        m=config.arcface_margin,
    )


def build_criterion(config: FingerprintConfig | None = None):
    """`nn.CrossEntropyLoss` configured with `config.label_smoothing` - see module docstring."""
    import torch.nn as nn

    config = config or FingerprintConfig()
    return nn.CrossEntropyLoss(label_smoothing=config.label_smoothing)


def hard_negative_penalty(embeddings, labels, margin: float, weight: float):
    """Auxiliary loss pushing apart the hardest (highest-similarity) impostor pairs in a batch.

    `embeddings` (already L2-normalized by the model, but re-normalized here
    defensively) and `labels` are one training batch. For every pair of
    samples with *different* labels, penalize cosine similarity above
    `margin` with a hinge term; identical-label (genuine) pairs are excluded
    entirely - this only discourages *confusable impostors*, it never
    penalizes genuine similarity. Returns a zero tensor (not `None`, so
    callers can always add it to the main loss unconditionally) when the
    batch has fewer than 2 samples or contains no impostor pairs at all
    (e.g. a single-identity batch, which `BalancedBatchSampler` should never
    actually produce, but this stays correct either way).
    """
    import torch
    import torch.nn.functional as F

    if embeddings.shape[0] < 2:
        return embeddings.new_zeros(())

    normalized = F.normalize(embeddings, dim=1)
    similarity = normalized @ normalized.T

    same_label = labels.unsqueeze(0) == labels.unsqueeze(1)
    impostor_mask = ~same_label
    impostor_mask.fill_diagonal_(False)

    if not impostor_mask.any():
        return embeddings.new_zeros(())

    impostor_similarities = similarity[impostor_mask]
    hinge = torch.clamp(impostor_similarities - margin, min=0.0)
    return weight * hinge.mean()
