"""Offline tests for models/fingerprint/sampler.py::BalancedBatchSampler."""

from __future__ import annotations

from collections import Counter

import pytest

from models.fingerprint.sampler import BalancedBatchSampler


def _synthetic_labels(num_identities: int, images_per_identity: int) -> list[int]:
    labels = []
    for identity in range(num_identities):
        labels.extend([identity] * images_per_identity)
    return labels


def test_every_batch_has_exactly_p_identities_and_k_samples():
    labels = _synthetic_labels(num_identities=40, images_per_identity=10)
    sampler = BalancedBatchSampler(labels, p=16, k=4, seed=0)

    for batch_indices in sampler:
        assert len(batch_indices) == 16 * 4
        batch_labels = [labels[i] for i in batch_indices]
        counts = Counter(batch_labels)
        assert len(counts) == 16  # exactly 16 distinct identities
        assert all(count == 4 for count in counts.values())  # exactly 4 each


def test_batch_size_matches_spec_default():
    labels = _synthetic_labels(num_identities=40, images_per_identity=10)
    sampler = BalancedBatchSampler(labels, p=16, k=4, seed=0)

    first_batch = next(iter(sampler))
    assert len(first_batch) == 64


def test_len_is_num_identities_floor_divided_by_p():
    labels = _synthetic_labels(num_identities=40, images_per_identity=10)
    sampler = BalancedBatchSampler(labels, p=16, k=4)
    assert len(sampler) == 40 // 16


def test_raises_when_fewer_identities_than_p():
    labels = _synthetic_labels(num_identities=5, images_per_identity=10)
    with pytest.raises(ValueError):
        BalancedBatchSampler(labels, p=16, k=4)


def test_handles_identities_with_fewer_than_k_samples_via_replacement():
    labels = _synthetic_labels(num_identities=16, images_per_identity=2)  # only 2 images, k=4 requested
    sampler = BalancedBatchSampler(labels, p=16, k=4, seed=0)

    batch = next(iter(sampler))
    assert len(batch) == 64
    # Every one of the 2 available samples per identity must appear (possibly repeated).
    batch_labels = [labels[i] for i in batch]
    assert set(batch_labels) == set(range(16))


def test_iteration_is_deterministic_under_a_fixed_seed():
    labels = _synthetic_labels(num_identities=40, images_per_identity=10)
    sampler = BalancedBatchSampler(labels, p=16, k=4, seed=123)

    first_pass = list(sampler)
    second_pass = list(sampler)

    assert first_pass == second_pass


def test_no_seed_gives_different_batches_across_iterations():
    labels = _synthetic_labels(num_identities=40, images_per_identity=10)
    sampler = BalancedBatchSampler(labels, p=16, k=4, seed=None)

    first_pass = list(sampler)
    second_pass = list(sampler)

    assert first_pass != second_pass
