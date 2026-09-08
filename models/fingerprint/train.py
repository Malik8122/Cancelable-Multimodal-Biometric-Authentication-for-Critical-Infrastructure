"""Fingerprint training loop: AdamW + warmup/cosine schedule + AMP + gradient
clipping + label-smoothed ArcFace (+ hard-negative mining after epoch 10) +
balanced P/K batch sampling + early stopping on validation EER.

An importable script (`if __name__ == "__main__":` at the bottom), not
notebook-only code - `kaggle_kernels/fingerprint_training/fingerprint-embedding-training.ipynb`
imports and calls `train()` rather than duplicating the training loop
inline, matching `models/voice/train.py`'s shape and this project's "avoid
notebook-only code inside training modules" convention.

Requires `torchvision` and a SOCOFing directory - not fully exercisable on a
dev machine without a GPU/dataset; it's run on Kaggle GPU the same way
`models/voice/train.py` is.

**Validation uses pairwise verification, not classification accuracy**: the
subject-disjoint split (`models/fingerprint/dataset.py`) means validation
subjects have no class in the ArcFace head, so `train()` extracts raw
embeddings for the validation split each epoch and scores them via
`evaluation/fingerprint_metrics.py::run_fingerprint_experiment` (genuine/
impostor cosine-similarity pairs) - training accuracy, by contrast, is plain
softmax accuracy on the *train* split, where every class is known.
"""

from __future__ import annotations

import json
import logging
import math
from csv import DictWriter
from pathlib import Path

from models.common.checkpoint_io import save_state_dict_as_h5
from models.fingerprint.config import FingerprintConfig
from models.fingerprint.dataset import SocofingDataset
from models.fingerprint.losses import build_arcface_head, build_criterion, hard_negative_penalty
from models.fingerprint.model import FingerprintEmbeddingNet, freeze_backbone_layers
from models.fingerprint.sampler import BalancedBatchSampler
from models.fingerprint.utils import detect_device
from evaluation.fingerprint_metrics import run_fingerprint_experiment

logger = logging.getLogger("models.fingerprint.train")


def _warmup_cosine_lr_multiplier(epoch: int, warmup_epochs: int, total_epochs: int, min_lr_ratio: float) -> float:
    """LR multiplier (relative to `config.learning_rate`) for `epoch` (0-indexed).

    Linear warmup for `warmup_epochs`, then cosine decay from 1.0 down to
    `min_lr_ratio` over the remaining epochs - stepped once per epoch (Part 8
    of the accuracy-upgrade spec), not per batch.
    """
    if warmup_epochs > 0 and epoch < warmup_epochs:
        return (epoch + 1) / warmup_epochs
    remaining = max(1, total_epochs - warmup_epochs)
    progress = min(1.0, (epoch - warmup_epochs) / remaining)
    cosine = 0.5 * (1 + math.cos(math.pi * progress))
    return min_lr_ratio + (1 - min_lr_ratio) * cosine


class _EpochMetricsCsv:
    """Appends one row per epoch to a CSV, rewriting the whole file each time
    (simplest correct approach for a handful of epochs; avoids tracking
    whether the header's already been written across process restarts)."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._rows: list[dict] = []

    def log(self, **fields) -> None:
        self._rows.append(fields)
        with open(self.path, "w", newline="", encoding="utf-8") as csv_file:
            writer = DictWriter(csv_file, fieldnames=list(self._rows[0].keys()))
            writer.writeheader()
            writer.writerows(self._rows)


def _extract_embeddings(model, dataset, device: str, batch_size: int = 64):
    import torch
    from torch.utils.data import DataLoader

    loader = DataLoader(dataset, batch_size=batch_size, shuffle=False)
    model.eval()
    embeddings, labels = [], []
    with torch.no_grad():
        for batch, batch_labels in loader:
            batch = batch.to(device)
            embeddings.extend(model(batch).cpu().numpy())
            labels.extend(batch_labels.tolist())
    return embeddings, labels


def train(
    dataset_root: str | Path,
    output_dir: str | Path,
    config: FingerprintConfig | None = None,
    device: str | None = None,
) -> Path:
    """Fine-tune the fingerprint embedding backbone; returns the best (lowest-EER) checkpoint's path.

    Saves `best_model.pt` (lowest validation EER, not lowest loss - Part 9)
    and `last_model.pt` every epoch (Part 12), then the canonical
    `fingerprint_embedder.pt`/`.h5`/`fingerprint_config.json` (Part 13) at
    the end, plus `metrics.csv` (Part 11) and `training_history.json`
    (Part 12) throughout/at the end.
    """
    import torch
    from torch.optim import AdamW
    from torch.optim.lr_scheduler import LambdaLR
    from torch.utils.data import DataLoader

    config = config or FingerprintConfig()
    device = device or detect_device()
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    train_dataset = SocofingDataset(dataset_root, mode="train", config=config)
    val_dataset = SocofingDataset(dataset_root, mode="val", config=config)

    sampler_labels = [train_dataset.subject_to_label[subject_id] for _, subject_id in train_dataset._items]
    train_sampler = BalancedBatchSampler(sampler_labels, p=config.identities_per_batch, k=config.samples_per_identity)
    train_loader = DataLoader(train_dataset, batch_sampler=train_sampler)

    model = FingerprintEmbeddingNet(config).to(device)
    freeze_backbone_layers(model, config.frozen_backbone_layers)
    arc_head = build_arcface_head(train_dataset.num_classes, config).to(device)
    criterion = build_criterion(config)

    trainable_params = [p for p in model.parameters() if p.requires_grad] + list(arc_head.parameters())
    optimizer = AdamW(trainable_params, lr=config.learning_rate, weight_decay=config.weight_decay, betas=config.betas)
    scheduler = LambdaLR(
        optimizer,
        lr_lambda=lambda epoch: _warmup_cosine_lr_multiplier(
            epoch, config.warmup_epochs, config.total_epochs, config.min_lr / config.learning_rate
        ),
    )
    scaler = torch.amp.GradScaler(device, enabled=config.mixed_precision and device == "cuda")

    best_eer = float("inf")
    epochs_without_improvement = 0
    best_checkpoint_path = output_dir / "best_model.pt"
    last_checkpoint_path = output_dir / "last_model.pt"
    metrics_csv = _EpochMetricsCsv(output_dir / "metrics.csv")
    history: list[dict] = []

    for epoch in range(config.total_epochs):
        model.train()
        arc_head.train()
        train_loss_sum, train_correct, train_total = 0.0, 0, 0

        for batch, labels in train_loader:
            batch, labels = batch.to(device), labels.to(device)
            optimizer.zero_grad()

            with torch.autocast(device_type=device, enabled=config.mixed_precision and device == "cuda"):
                embeddings = model(batch)
                logits = arc_head(embeddings, labels)
                loss = criterion(logits, labels)
                if epoch >= config.hard_negative_start_epoch:
                    loss = loss + hard_negative_penalty(
                        embeddings, labels, config.hard_negative_margin, config.hard_negative_weight
                    )

            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(trainable_params, config.grad_clip_norm)
            scaler.step(optimizer)
            scaler.update()

            train_loss_sum += loss.item() * batch.size(0)
            # Accuracy is measured on the *plain* cosine similarity to each
            # class's (normalized) ArcFace weight vector, not on `logits`
            # directly. `logits` has ArcFace's margin subtracted from the
            # true class's angle before scaling - with margin=0.5/scale=64,
            # empirically confirmed on real embeddings that even a
            # moderately (not yet near-perfectly) separated embedding gets
            # zero argmax accuracy on that margin-shifted logit, staying at
            # 0.0 for many epochs regardless of real, ongoing improvement.
            # This makes plain `logits.argmax()` accuracy useless as a
            # training-progress signal until convergence is nearly complete,
            # so it is not what gets reported (the loss itself still trains
            # correctly on the margin-shifted logits - only this metric's
            # *reporting* basis changes).
            with torch.no_grad():
                cosine_similarities = torch.nn.functional.linear(
                    torch.nn.functional.normalize(embeddings), torch.nn.functional.normalize(arc_head.weight)
                )
                train_correct += (cosine_similarities.argmax(1) == labels).sum().item()
            train_total += batch.size(0)

        scheduler.step()

        train_loss = train_loss_sum / max(train_total, 1)
        train_accuracy = train_correct / max(train_total, 1)

        val_embeddings, val_labels = _extract_embeddings(model, val_dataset, device)
        val_report = run_fingerprint_experiment(val_embeddings, val_labels)

        logger.info(
            "epoch=%d train_loss=%.4f train_acc=%.4f val_eer=%.4f val_acc=%.4f val_auc=%.4f",
            epoch, train_loss, train_accuracy, val_report["eer"], val_report["accuracy"], val_report["auc"],
        )

        epoch_metrics = {
            "epoch": epoch,
            "train_loss": train_loss,
            "train_accuracy": train_accuracy,
            "val_accuracy": val_report["accuracy"],
            "val_precision": val_report["precision"],
            "val_recall": val_report["recall"],
            "val_f1": val_report["f1"],
            "val_far": val_report["far"],
            "val_frr": val_report["frr"],
            "val_auc": val_report["auc"],
            "val_eer": val_report["eer"],
            "learning_rate": optimizer.param_groups[0]["lr"],
        }
        metrics_csv.log(**epoch_metrics)
        history.append(epoch_metrics)

        torch.save(model.state_dict(), last_checkpoint_path)
        if val_report["eer"] < best_eer:
            best_eer = val_report["eer"]
            epochs_without_improvement = 0
            torch.save(model.state_dict(), best_checkpoint_path)
        else:
            epochs_without_improvement += 1
            # Never stop before `min_epochs_before_early_stopping` - see that
            # field's docstring in config.py for why a short patience window
            # starting from a cold-start ArcFace head can trigger before the
            # model has had any real chance to learn.
            if (
                epoch >= config.min_epochs_before_early_stopping
                and epochs_without_improvement >= config.early_stopping_patience
            ):
                logger.info("Early stopping at epoch=%d (best_val_eer=%.4f)", epoch, best_eer)
                break

    final_state_dict = torch.load(best_checkpoint_path, map_location=device)
    canonical_pt_path = output_dir / "fingerprint_embedder.pt"
    canonical_h5_path = output_dir / "fingerprint_embedder.h5"
    torch.save(final_state_dict, canonical_pt_path)
    save_state_dict_as_h5(final_state_dict, canonical_h5_path)
    config.to_json(output_dir / "fingerprint_config.json")
    (output_dir / "training_history.json").write_text(json.dumps(history, indent=2), encoding="utf-8")

    return canonical_pt_path


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO)

    parser = argparse.ArgumentParser(description="Fine-tune the Fingerprint (ResNet50 + ArcFace) embedding model.")
    parser.add_argument("--dataset-root", required=True, help="SOCOFing root directory (e.g. /kaggle/input/socofing).")
    parser.add_argument("--output-dir", default="models/fingerprint/saved", help="Where checkpoints are written.")
    args = parser.parse_args()

    train(args.dataset_root, args.output_dir)
