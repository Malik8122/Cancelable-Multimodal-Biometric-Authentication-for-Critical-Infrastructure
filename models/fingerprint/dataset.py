"""SOCOFing dataset loading with a genuinely subject-disjoint train/val/test split.

**The bug this fixes**: the previous training notebook
(`kaggle_kernels/fingerprint_training/fingerprint-embedding-training.ipynb`,
pre-upgrade) split each *subject's own images* 70/15/15, so every subject
appeared in train, val, *and* test - identity leakage for a verification
task, since the model could implicitly "know" validation/test subjects from
training on their other fingerprints. `subject_disjoint_split` below instead
assigns each *subject* entirely to exactly one split.

**Consequence**: validation/test subjects are never seen during training, so
the ArcFace classification head has no class for them. Val/test images are
therefore labeled by their *raw subject id* (not a train-time class index),
and `models/fingerprint/train.py` evaluates them via genuine/impostor
cosine-similarity pairs (`evaluation/experiments.py::build_genuine_impostor_scores`),
not classification accuracy - the same pattern already used for Iris/
Fingerprint/Voice's Experiment 1 elsewhere in this repo.

No hardcoded Kaggle path - `root_dir` is a constructor argument, exactly like
`models/voice/dataset.py::VoxCelebDataset`.
"""

from __future__ import annotations

import glob
import os
import re
from pathlib import Path
from typing import Literal

import cv2
import numpy as np

from models.fingerprint.config import FingerprintConfig
from preprocessing.fingerprint import FINGERPRINT_INPUT_SIZE, FingerprintPreprocessor, imagenet_normalize

_SUBJECT_PATTERN = re.compile(r"^(\d+)__")


def discover_socofing_real_images(root_dir: str | Path) -> list[tuple[Path, int]]:
    """Find every (image_path, subject_id) pair under SOCOFing's "Real" folder.

    Matches the current training notebook's approach exactly: SOCOFing
    filenames encode subject id, hand, and finger (e.g.
    `1__M_Left_index_finger.BMP`); only the unaltered "Real" split is used
    (the altered/obliterated splits are a separate, harder task outside this
    upgrade's scope, same as before).
    """
    root_dir = Path(root_dir)
    real_dir_candidates = glob.glob(os.path.join(str(root_dir), "**", "Real"), recursive=True)
    if not real_dir_candidates:
        raise ValueError(f"Could not find a 'Real' folder under {root_dir} - check the SOCOFing dataset path.")
    real_dir = Path(real_dir_candidates[0])

    items: list[tuple[Path, int]] = []
    for filename in sorted(os.listdir(real_dir)):
        match = _SUBJECT_PATTERN.match(filename)
        if not match:
            continue
        items.append((real_dir / filename, int(match.group(1))))

    if not items:
        raise ValueError(f"No SOCOFing-shaped filenames (e.g. '1__M_Left_index_finger.BMP') found under {real_dir}.")
    return items


def subject_disjoint_split(
    subject_ids: list[int],
    split: tuple[float, float, float] = (0.70, 0.15, 0.15),
    seed: int = 42,
) -> tuple[set[int], set[int], set[int]]:
    """Assign every subject id to exactly one of train/val/test - never split within a subject.

    Deterministic given `seed`: unique subject ids are sorted (for a
    reproducible starting order independent of dict/set iteration), then
    shuffled with `np.random.default_rng(seed)` before slicing by fraction -
    shuffling first avoids any systematic bias from subject-id order (e.g.
    enrollment/collection order) rather than assigning by raw numeric range.
    """
    unique_ids = sorted(set(subject_ids))
    rng = np.random.default_rng(seed)
    shuffled = np.array(unique_ids)
    rng.shuffle(shuffled)

    train_fraction, val_fraction, _test_fraction = split
    n_total = len(shuffled)
    n_train = int(round(n_total * train_fraction))
    n_val = int(round(n_total * val_fraction))

    train_ids = set(shuffled[:n_train].tolist())
    val_ids = set(shuffled[n_train : n_train + n_val].tolist())
    test_ids = set(shuffled[n_train + n_val :].tolist())
    return train_ids, val_ids, test_ids


def build_augmentation_pipeline():
    """Albumentations pipeline for training only - see module docstring for why
    it runs on `FingerprintPreprocessor.enhance()`'s uint8 output, before
    ImageNet normalization, not after.

    Deliberately excludes any horizontal/vertical flip (a mirrored
    fingerprint is a different, invalid ridge pattern) and any color
    augmentation beyond brightness/contrast, per the spec this upgrade
    implements. Rotation/translation/scale are combined into one `Affine`
    call (more efficient than three separate geometric transforms); Elastic/
    GridDistortion are configured "light" (small alpha/distort_limit) since
    fingerprint ridge topology is sensitive to strong non-rigid warping.
    """
    import albumentations as A

    return A.Compose(
        [
            A.Affine(rotate=(-12, 12), translate_percent=(-0.05, 0.05), scale=(0.9, 1.1), p=0.8),
            A.RandomBrightnessContrast(brightness_limit=0.15, contrast_limit=0.15, p=0.5),
            A.GaussNoise(std_range=(0.03, 0.08), p=0.2),
            A.MotionBlur(blur_limit=(3, 5), p=0.15),
            A.ElasticTransform(alpha=1.0, sigma=30.0, p=0.2),
            A.GridDistortion(num_steps=3, distort_limit=0.1, p=0.2),
            A.RandomCrop(height=200, width=200, p=0.5),
            A.Resize(height=FINGERPRINT_INPUT_SIZE, width=FINGERPRINT_INPUT_SIZE, p=1.0),
        ]
    )


class SocofingDataset:
    """PyTorch-`Dataset`-compatible SOCOFing loader with a subject-disjoint split.

    Does not import `torch` at module load time - only `__getitem__`
    converts to a tensor - matching every other lazy-import boundary in this
    project (see `models/voice/dataset.py::VoxCelebDataset`).
    """

    def __init__(
        self,
        root_dir: str | Path,
        mode: Literal["train", "val", "test"] = "train",
        config: FingerprintConfig | None = None,
    ):
        self.root_dir = Path(root_dir)
        self.mode = mode
        self.config = config or FingerprintConfig()
        self.preprocessor = FingerprintPreprocessor()
        self._augment = build_augmentation_pipeline() if mode == "train" else None

        all_items = discover_socofing_real_images(self.root_dir)
        train_ids, val_ids, test_ids = subject_disjoint_split(
            [subject_id for _, subject_id in all_items],
            split=self.config.train_val_test_split,
            seed=self.config.split_seed,
        )
        selected_ids = {"train": train_ids, "val": val_ids, "test": test_ids}[mode]
        self._items = [(path, subject_id) for path, subject_id in all_items if subject_id in selected_ids]

        if mode == "train":
            # Only the train split needs a dense 0..N-1 class index (for the
            # ArcFace head); val/test subjects have no class - see module docstring.
            self.subject_to_label = {subject_id: label for label, subject_id in enumerate(sorted(train_ids))}
            self.num_classes = len(self.subject_to_label)
        else:
            self.subject_to_label = None
            self.num_classes = 0

    def __len__(self) -> int:
        return len(self._items)

    def __getitem__(self, index: int):
        import torch

        path, subject_id = self._items[index]
        image = cv2.cvtColor(cv2.imread(str(path)), cv2.COLOR_BGR2RGB)
        enhanced = self.preprocessor.enhance(image)

        if self._augment is not None:
            enhanced = self._augment(image=enhanced)["image"]

        normalized = imagenet_normalize(enhanced)
        tensor = torch.from_numpy(normalized).permute(2, 0, 1).float()

        label = self.subject_to_label[subject_id] if self.mode == "train" else subject_id
        return tensor, label
