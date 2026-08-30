"""Iris embedding model: ResNet18 (ImageNet-pretrained) + projection head.

No off-the-shelf pretrained iris-embedding model exists publicly, so we use
an ImageNet-pretrained ResNet18 backbone (fast enough to fine-tune on a
single Colab GPU) with a small trainable projection head producing a
256-dimensional embedding. Fine-tuning happens in
notebooks/02_iris_training_and_testing.ipynb using an ArcFace-style
angular-margin loss; the resulting checkpoint is saved to
models/iris/saved/.

Input: the normalized iris strip produced by preprocessing/iris.py,
replicated to 3 channels for the ImageNet backbone.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from models.common.base_embedder import BaseEmbedder

IRIS_EMBEDDING_DIM = 256


class IrisEmbeddingNet:
    """Thin wrapper so this module has no hard torch.nn import at module load time."""

    def __new__(cls):
        import torch.nn as nn
        import torchvision.models as tv_models

        class _Net(nn.Module):
            def __init__(self):
                super().__init__()
                backbone = tv_models.resnet18(weights=tv_models.ResNet18_Weights.IMAGENET1K_V1)
                self.backbone = nn.Sequential(*list(backbone.children())[:-1])  # drop the ImageNet FC head
                self.projection = nn.Linear(512, IRIS_EMBEDDING_DIM)

            def forward(self, x):
                features = self.backbone(x).flatten(1)
                return self.projection(features)

        return _Net()


class IrisEmbedder(BaseEmbedder):
    embedding_dim = IRIS_EMBEDDING_DIM

    def __init__(self, checkpoint_path: str | Path | None = None, mock_mode: bool = False, device: str = "cpu"):
        self.device = device
        self._model = None
        super().__init__(checkpoint_path=checkpoint_path, mock_mode=mock_mode)

    def _load_checkpoint(self, checkpoint_path: Path) -> None:
        import torch

        self._model = IrisEmbeddingNet().to(self.device)
        state_dict = torch.load(checkpoint_path, map_location=self.device)
        self._model.load_state_dict(state_dict)
        self._model.eval()

    def _extract_embedding_impl(self, image: np.ndarray) -> np.ndarray:
        import torch

        if image.ndim == 2:
            image = np.stack([image] * 3, axis=-1)
        tensor = torch.from_numpy(image).permute(2, 0, 1).float() / 255.0
        tensor = (tensor - 0.5) / 0.5
        tensor = tensor.unsqueeze(0).to(self.device)
        with torch.no_grad():
            embedding = self._model(tensor)
        return embedding.squeeze(0).cpu().numpy()
