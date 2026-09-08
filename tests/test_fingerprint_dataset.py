"""Offline tests for models/fingerprint/dataset.py.

Builds a tiny synthetic, on-disk SOCOFing-shaped directory (a "Real" folder
with `{subject}__M_Left_index_finger.BMP`-style filenames) in tmp_path - no
real SOCOFing download, no network.
"""

from __future__ import annotations

import cv2
import numpy as np
import pytest

from models.fingerprint.config import FingerprintConfig
from models.fingerprint.dataset import (
    SocofingDataset,
    discover_socofing_real_images,
    subject_disjoint_split,
)

NUM_SUBJECTS = 20
IMAGES_PER_SUBJECT = 6
FINGERS = ("index", "middle", "ring", "little", "thumb", "forefinger")


@pytest.fixture
def synthetic_socofing_dir(tmp_path):
    real_dir = tmp_path / "SOCOFing" / "Real"
    real_dir.mkdir(parents=True)
    rng = np.random.default_rng(0)
    for subject in range(1, NUM_SUBJECTS + 1):
        for i in range(IMAGES_PER_SUBJECT):
            image = rng.integers(0, 256, size=(96, 96, 3), dtype=np.uint8)
            filename = f"{subject}__M_Left_{FINGERS[i % len(FINGERS)]}_finger.BMP"
            cv2.imwrite(str(real_dir / filename), image)
    return tmp_path


def test_discover_socofing_real_images_finds_every_file(synthetic_socofing_dir):
    items = discover_socofing_real_images(synthetic_socofing_dir)
    assert len(items) == NUM_SUBJECTS * IMAGES_PER_SUBJECT
    assert {subject_id for _, subject_id in items} == set(range(1, NUM_SUBJECTS + 1))


def test_discover_raises_when_no_real_folder(tmp_path):
    with pytest.raises(ValueError):
        discover_socofing_real_images(tmp_path)


def test_subject_disjoint_split_covers_every_subject_exactly_once():
    subject_ids = list(range(1, 601))  # matches SOCOFing's real 600-subject count

    train_ids, val_ids, test_ids = subject_disjoint_split(subject_ids, split=(0.7, 0.15, 0.15), seed=42)

    assert train_ids | val_ids | test_ids == set(subject_ids)
    assert train_ids.isdisjoint(val_ids)
    assert train_ids.isdisjoint(test_ids)
    assert val_ids.isdisjoint(test_ids)
    assert len(train_ids) == pytest.approx(420, abs=1)
    assert len(val_ids) == pytest.approx(90, abs=1)
    assert len(test_ids) == pytest.approx(90, abs=1)


def test_subject_disjoint_split_is_deterministic_under_the_same_seed():
    subject_ids = list(range(1, 101))

    first = subject_disjoint_split(subject_ids, seed=42)
    second = subject_disjoint_split(subject_ids, seed=42)

    assert first == second


def test_subject_disjoint_split_differs_across_seeds():
    subject_ids = list(range(1, 101))

    a = subject_disjoint_split(subject_ids, seed=1)
    b = subject_disjoint_split(subject_ids, seed=2)

    assert a != b


def test_dataset_splits_are_subject_disjoint_end_to_end(synthetic_socofing_dir):
    config = FingerprintConfig(split_seed=42, train_val_test_split=(0.7, 0.15, 0.15))
    train_ds = SocofingDataset(synthetic_socofing_dir, mode="train", config=config)
    val_ds = SocofingDataset(synthetic_socofing_dir, mode="val", config=config)
    test_ds = SocofingDataset(synthetic_socofing_dir, mode="test", config=config)

    train_subjects = {subject_id for _, subject_id in train_ds._items}
    val_subjects = {subject_id for _, subject_id in val_ds._items}
    test_subjects = {subject_id for _, subject_id in test_ds._items}

    assert train_subjects.isdisjoint(val_subjects)
    assert train_subjects.isdisjoint(test_subjects)
    assert val_subjects.isdisjoint(test_subjects)
    assert len(train_ds) + len(val_ds) + len(test_ds) == NUM_SUBJECTS * IMAGES_PER_SUBJECT


def test_train_split_labels_are_dense_class_indices(synthetic_socofing_dir):
    train_ds = SocofingDataset(synthetic_socofing_dir, mode="train")
    assert train_ds.num_classes == len(train_ds.subject_to_label)
    assert set(train_ds.subject_to_label.values()) == set(range(train_ds.num_classes))


def test_val_and_test_labels_are_raw_subject_ids_not_class_indices(synthetic_socofing_dir):
    val_ds = SocofingDataset(synthetic_socofing_dir, mode="val")
    assert val_ds.subject_to_label is None

    _, label = val_ds[0]
    _, subject_id = val_ds._items[0]
    assert label == subject_id


def test_getitem_returns_normalized_tensor_and_label(synthetic_socofing_dir):
    import torch

    train_ds = SocofingDataset(synthetic_socofing_dir, mode="train")

    tensor, label = train_ds[0]

    assert isinstance(tensor, torch.Tensor)
    assert tensor.shape == (3, 224, 224)
    assert tensor.dtype == torch.float32
    assert isinstance(label, int)


def test_train_mode_applies_augmentation_val_mode_does_not(synthetic_socofing_dir):
    train_ds = SocofingDataset(synthetic_socofing_dir, mode="train")
    val_ds = SocofingDataset(synthetic_socofing_dir, mode="val")

    assert train_ds._augment is not None
    assert val_ds._augment is None


def test_augmentation_pipeline_excludes_flips():
    from models.fingerprint.dataset import build_augmentation_pipeline

    pipeline = build_augmentation_pipeline()
    transform_names = {type(t).__name__ for t in pipeline.transforms}
    assert "HorizontalFlip" not in transform_names
    assert "VerticalFlip" not in transform_names
