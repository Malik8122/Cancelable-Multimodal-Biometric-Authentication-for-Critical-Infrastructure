"""Fingerprint embedding model: ResNet50 (ImageNet-pretrained) + projection head.

DeepPrint substitute (see section 26 of the master project prompt / README
"Model Decisions" for full justification): DeepPrint has no public
pretrained weights or pip-installable reference implementation, which makes
it impractical to reproduce reliably within a capstone timeline. A
ResNet50 backbone fine-tuned with an ArcFace-style angular-margin loss is a
well-documented, reproducible alternative that still yields a fixed-length
discriminative fingerprint embedding.

Fine-tuning happens in notebooks/03_fingerprint_training_and_testing.ipynb;
the resulting checkpoint is saved to models/fingerprint/saved/.

Input: the enhanced fingerprint image produced by preprocessing/fingerprint.py.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from models.common.base_embedder import BaseEmbedder

FINGERPRINT_EMBEDDING_DIM = 256


class FingerprintEmbeddingNet:
    def __new__(cls):
        import torch.nn as nn
        import torchvision.models as tv_models

        class _Net(nn.Module):
            def __init__(self):
                super().__init__()
                backbone = tv_models.resnet50(weights=tv_models.ResNet50_Weights.IMAGENET1K_V2)
                self.backbone = nn.Sequential(*list(backbone.children())[:-1])
                self.projection = nn.Linear(2048, FINGERPRINT_EMBEDDING_DIM)

            def forward(self, x):
                features = self.backbone(x).flatten(1)
                return self.projection(features)

        return _Net()


class FingerprintEmbedder(BaseEmbedder):
    embedding_dim = FINGERPRINT_EMBEDDING_DIM

    def __init__(self, checkpoint_path: str | Path | None = None, mock_mode: bool = False, device: str = "cpu"):
        self.device = device
        self._model = None
        super().__init__(checkpoint_path=checkpoint_path, mock_mode=mock_mode)

    def _load_checkpoint(self, checkpoint_path: Path) -> None:
        import torch

        self._model = FingerprintEmbeddingNet().to(self.device)
        state_dict = torch.load(checkpoint_path, map_location=self.device)
        self._model.load_state_dict(state_dict)
        self._model.eval()

    def _extract_embedding_impl(self, image: np.ndarray) -> np.ndarray:
        import torch

        tensor = torch.from_numpy(image).permute(2, 0, 1).float() / 255.0
        tensor = (tensor - 0.5) / 0.5
        tensor = tensor.unsqueeze(0).to(self.device)
        with torch.no_grad():
            embedding = self._model(tensor)
        return embedding.squeeze(0).cpu().numpy()
