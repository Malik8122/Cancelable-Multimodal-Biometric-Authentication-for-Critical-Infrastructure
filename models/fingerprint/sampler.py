"""Balanced P/K batch sampling for ArcFace training.

ArcFace (and metric-learning losses generally) benefit from multiple
positives *and* negatives inside every batch - a single plain-random batch
over SOCOFing's ~10-images-per-subject "Real" split can easily contain only
one sample for many subjects, giving the loss nothing to contrast for them.
`BalancedBatchSampler` instead guarantees every batch has exactly `p`
identities x `k` samples each (default 16 x 4 = 64, per the accuracy-upgrade
spec).
"""

from __future__ import annotations

from collections import defaultdict

import numpy as np


class BalancedBatchSampler:
    """Yields batches of `p` identities x `k` samples/identity as lists of dataset indices.

    Not `torch.utils.data.Sampler` by inheritance (no hard `torch` import at
    module load time, matching this project's lazy-import convention) - it
    satisfies the same protocol PyTorch's `DataLoader(batch_sampler=...)`
    expects: `__iter__` yields one list of indices per batch, `__len__` is
    the number of batches per epoch.

    Identities are shuffled each epoch (`np.random.default_rng`, reseeded per
    `__iter__` call unless a fixed `seed` is given, so training - not
    evaluation - gets fresh batches epoch to epoch). Samples for an identity
    are drawn without replacement when it has >= `k` remaining unused images
    this epoch, and with replacement (repeating an image) only if it has
    fewer than `k` total - unusual for SOCOFing's "Real" split (~10
    images/subject) but keeps this correct for any dataset shape.
    """

    def __init__(self, labels: list[int], p: int = 16, k: int = 4, seed: int | None = None):
        self.p = p
        self.k = k
        self.seed = seed
        self._indices_by_label: dict[int, list[int]] = defaultdict(list)
        for index, label in enumerate(labels):
            self._indices_by_label[label].append(index)
        self._labels = sorted(self._indices_by_label)
        if len(self._labels) < p:
            raise ValueError(f"BalancedBatchSampler needs at least p={p} distinct identities, got {len(self._labels)}.")

    def __len__(self) -> int:
        return len(self._labels) // self.p

    def __iter__(self):
        rng = np.random.default_rng(self.seed)
        shuffled_labels = list(self._labels)
        rng.shuffle(shuffled_labels)

        for batch_start in range(0, len(shuffled_labels) - self.p + 1, self.p):
            batch_identities = shuffled_labels[batch_start : batch_start + self.p]
            batch_indices: list[int] = []
            for label in batch_identities:
                available = self._indices_by_label[label]
                if len(available) >= self.k:
                    chosen = rng.choice(available, size=self.k, replace=False)
                else:
                    chosen = rng.choice(available, size=self.k, replace=True)
                batch_indices.extend(int(i) for i in chosen)
            yield batch_indices
