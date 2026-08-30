"""Face embedding model: InceptionResnetV1 pretrained on VGGFace2.

Produces a 512-dimensional embedding from an already-aligned 160x160 face
crop (see preprocessing/face.py). The pretrained VGGFace2 weights are strong
enough to use as a frozen feature extractor; models/face/saved/ holds any
fine-tuned checkpoint produced by notebooks/01_face_training_and_testing.ipynb.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from models.common.base_embedder import BaseEmbedder

FACE_EMBEDDING_DIM = 512


class FaceEmbedder(BaseEmbedder):
    embedding_dim = FACE_EMBEDDING_DIM

    def __init__(self, checkpoint_path: str | Path | None = None, mock_mode: bool = False, device: str = "cpu"):
        self.device = device
        self._model = None
        super().__init__(checkpoint_path=checkpoint_path, mock_mode=mock_mode)

    def _build_model(self):
        from facenet_pytorch import InceptionResnetV1

        # 'vggface2' pretrained weights are downloaded automatically by
        # facenet-pytorch on first use and cached under ~/.cache/torch.
        return InceptionResnetV1(pretrained="vggface2").eval().to(self.device)

    def _load_checkpoint(self, checkpoint_path: Path) -> None:
        import torch

        self._model = self._build_model()
        state_dict = torch.load(checkpoint_path, map_location=self.device)
        self._model.load_state_dict(state_dict)
        self._model.eval()

    def _extract_embedding_impl(self, image: np.ndarray) -> np.ndarray:
        import torch

        tensor = torch.from_numpy(image).permute(2, 0, 1).float()
        tensor = (tensor - 127.5) / 128.0  # match facenet-pytorch's expected normalization
        tensor = tensor.unsqueeze(0).to(self.device)
        with torch.no_grad():
            embedding = self._model(tensor)
        return embedding.squeeze(0).cpu().numpy()
