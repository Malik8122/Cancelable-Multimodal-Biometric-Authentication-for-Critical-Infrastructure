"""Checkpoint save/load round-trip for the upgraded fingerprint architecture.

Mirrors tests/test_voice_checkpoint.py's pattern: a dependency-free .h5
round-trip via a tiny stand-in net, then the real FingerprintEmbedder .pt
loading path - guarded by `pytest.importorskip("torchvision")` so it skips
cleanly if that optional dependency isn't installed, per this repo's
existing convention for Face/Fingerprint's real checkpoints.
"""

from __future__ import annotations

import numpy as np
import pytest
import torch
import torch.nn as nn

from models.common.checkpoint_io import load_h5_as_state_dict, save_state_dict_as_h5
from models.fingerprint.inference import FINGERPRINT_EMBEDDING_DIM, FingerprintEmbedder


class _TinyFingerprintNet(nn.Module):
    """Stand-in for the real ResNet50 backbone - same .pt/.h5 round-trip
    guarantees without needing torchvision installed."""

    def __init__(self):
        super().__init__()
        self.fc = nn.Linear(2048, FINGERPRINT_EMBEDDING_DIM)

    def forward(self, x):
        return self.fc(x.mean(dim=[2, 3]))


def test_pt_and_h5_checkpoint_round_trip(tmp_path):
    model = _TinyFingerprintNet()
    original_state_dict = model.state_dict()

    pt_path = tmp_path / "fingerprint_embedder.pt"
    h5_path = tmp_path / "fingerprint_embedder.h5"
    torch.save(original_state_dict, pt_path)
    save_state_dict_as_h5(original_state_dict, h5_path)

    assert pt_path.exists()
    assert h5_path.exists()

    restored_from_pt = torch.load(pt_path)
    restored_from_h5 = load_h5_as_state_dict(h5_path)

    for key in original_state_dict:
        torch.testing.assert_close(restored_from_pt[key], original_state_dict[key])
        torch.testing.assert_close(restored_from_h5[key], original_state_dict[key])


def test_fingerprint_embedder_falls_back_to_mock_mode_without_a_checkpoint():
    embedder = FingerprintEmbedder(checkpoint_path=None)
    assert embedder.mock_mode is True


def test_fingerprint_embedder_falls_back_to_mock_mode_for_a_missing_checkpoint_path(tmp_path):
    embedder = FingerprintEmbedder(checkpoint_path=tmp_path / "does_not_exist.pt")
    assert embedder.mock_mode is True


def test_real_checkpoint_loads_and_runs_inference(tmp_path):
    """Only runs with torchvision available; skips cleanly otherwise."""
    pytest.importorskip("torchvision", reason="torchvision not installed in this environment")

    from models.fingerprint.model import FingerprintEmbeddingNet

    model = FingerprintEmbeddingNet()
    checkpoint_path = tmp_path / "fingerprint_embedder.pt"
    torch.save(model.state_dict(), checkpoint_path)

    embedder = FingerprintEmbedder(checkpoint_path=checkpoint_path)
    assert embedder.mock_mode is False

    image = np.random.default_rng(0).standard_normal((224, 224, 3)).astype(np.float32)
    embedding = embedder.extract_embedding(image)

    assert embedding.shape == (FINGERPRINT_EMBEDDING_DIM,)
    assert np.isclose(np.linalg.norm(embedding), 1.0, atol=1e-5)
