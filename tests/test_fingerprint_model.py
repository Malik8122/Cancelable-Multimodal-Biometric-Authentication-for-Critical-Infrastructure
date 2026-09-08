"""Offline tests for models/fingerprint/model.py + the updated inference.py.

Mock-mode shape/normalization tests need no optional dependency (they're
also covered generically by tests/test_embedders.py's parametrized
EMBEDDER_CASES). The real-backbone tests here (frozen/trainable layer split,
projection head structure) need `torchvision` and skip cleanly when it isn't
installed, matching this repo's existing convention for Face/Fingerprint's
real checkpoints.
"""

from __future__ import annotations

import numpy as np
import pytest

from models.fingerprint.inference import FINGERPRINT_EMBEDDING_DIM, FingerprintEmbedder


def test_embedding_dimension_is_512():
    assert FINGERPRINT_EMBEDDING_DIM == 512


def test_mock_mode_embedding_has_new_dimension():
    embedder = FingerprintEmbedder(checkpoint_path=None)
    embedding = embedder.extract_embedding(np.random.default_rng(0).standard_normal((224, 224, 3)).astype(np.float32))

    assert embedding.shape == (512,)
    assert np.isclose(np.linalg.norm(embedding), 1.0, atol=1e-5)


def test_freeze_backbone_layers_freezes_only_the_named_layers():
    pytest.importorskip("torchvision", reason="torchvision not installed in this environment")
    from models.fingerprint.model import FingerprintEmbeddingNet, freeze_backbone_layers

    model = FingerprintEmbeddingNet()
    freeze_backbone_layers(model, frozen_names=("conv1", "bn1", "layer1"))

    for name in ("conv1", "bn1", "layer1"):
        submodule = getattr(model, name)
        assert all(not p.requires_grad for p in submodule.parameters()), f"{name} should be frozen"

    for name in ("layer2", "layer3", "layer4"):
        submodule = getattr(model, name)
        assert all(p.requires_grad for p in submodule.parameters()), f"{name} should be trainable"

    assert all(p.requires_grad for p in model.projection.parameters())


def test_projection_head_output_dimension_matches_config():
    pytest.importorskip("torchvision", reason="torchvision not installed in this environment")
    import torch

    from models.fingerprint.config import FingerprintConfig
    from models.fingerprint.model import FingerprintEmbeddingNet

    model = FingerprintEmbeddingNet(FingerprintConfig(embedding_dim=512))
    model.eval()

    batch = torch.randn(2, 3, 224, 224)
    with torch.no_grad():
        embeddings = model(batch)

    assert embeddings.shape == (2, 512)
    norms = torch.linalg.norm(embeddings, dim=1)
    torch.testing.assert_close(norms, torch.ones(2), atol=1e-5, rtol=0)


def test_real_checkpoint_state_dict_round_trips_through_the_new_architecture(tmp_path):
    """Confirms the new (named-submodule) architecture's own state_dict saves
    and loads into a fresh instance of itself - the old 256-dim checkpoint is
    a separate, expected incompatibility (see model.py's module docstring),
    not something this test claims to bridge."""
    pytest.importorskip("torchvision", reason="torchvision not installed in this environment")
    import torch

    from models.fingerprint.model import FingerprintEmbeddingNet

    model = FingerprintEmbeddingNet()
    checkpoint_path = tmp_path / "fingerprint_embedder.pt"
    torch.save(model.state_dict(), checkpoint_path)

    embedder = FingerprintEmbedder(checkpoint_path=checkpoint_path)
    assert embedder.mock_mode is False

    embedding = embedder.extract_embedding(np.random.default_rng(1).standard_normal((224, 224, 3)).astype(np.float32))
    assert embedding.shape == (512,)
    assert np.isclose(np.linalg.norm(embedding), 1.0, atol=1e-5)
