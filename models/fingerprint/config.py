"""All fingerprint-accuracy-upgrade hyperparameters in one place.

Mirrors `models/voice/config.py::VoiceConfig`'s shape: previously Fingerprint
(like Face/Iris) hardcoded a handful of constants directly in its training
notebook, but this upgrade introduces enough independently-tunable knobs
(ArcFace margin/scale/label-smoothing, AdamW settings, a warmup+cosine
schedule, P/K batch sampling, which backbone layers are frozen, early
stopping, hard-negative mining) that a single config object is worth the
extra structure, consistent with the precedent already set for Voice.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass
class FingerprintConfig:
    # --- Model ---
    embedding_dim: int = 512
    #: Named ResNet50 submodules to freeze; everything else (layer2/3/4 +
    #: the projection head) is fine-tuned. See models/fingerprint/model.py.
    frozen_backbone_layers: tuple[str, ...] = ("conv1", "bn1", "layer1")

    # --- ArcFace head (models/fingerprint/losses.py) ---
    arcface_margin: float = 0.5
    arcface_scale: float = 64.0
    label_smoothing: float = 0.1

    # --- Hard-negative mining (models/fingerprint/losses.py) ---
    #: Epoch at which the auxiliary hard-negative penalty turns on (0-indexed
    #: epoch count) - disabled entirely before this.
    hard_negative_start_epoch: int = 10
    hard_negative_margin: float = 0.3
    hard_negative_weight: float = 0.1

    # --- Optimizer (AdamW) ---
    learning_rate: float = 3e-4
    weight_decay: float = 1e-4
    betas: tuple[float, float] = (0.9, 0.999)
    grad_clip_norm: float = 1.0
    mixed_precision: bool = True

    # --- Scheduler: warmup + cosine annealing, stepped once per epoch ---
    warmup_epochs: int = 3
    total_epochs: int = 30
    min_lr: float = 1e-6

    # --- Balanced P/K batch sampling (models/fingerprint/sampler.py) ---
    identities_per_batch: int = 16
    samples_per_identity: int = 4

    # --- Early stopping (on validation EER, not loss) ---
    early_stopping_patience: int = 5

    # --- Dataset split (models/fingerprint/dataset.py) ---
    train_val_test_split: tuple[float, float, float] = (0.70, 0.15, 0.15)
    split_seed: int = 42

    @property
    def batch_size(self) -> int:
        """Derived, not stored independently, so it can never drift from P*K (16*4=64)."""
        return self.identities_per_batch * self.samples_per_identity

    _TUPLE_FIELDS = ("frozen_backbone_layers", "betas", "train_val_test_split")

    def to_json(self, path: str | Path) -> None:
        Path(path).write_text(json.dumps(asdict(self), indent=2), encoding="utf-8")

    @classmethod
    def from_json(cls, path: str | Path) -> "FingerprintConfig":
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
        for field_name in cls._TUPLE_FIELDS:
            if field_name in raw:
                raw[field_name] = tuple(raw[field_name])
        return cls(**raw)
