"""Fingerprint embedding model: ResNet50 (ImageNet-pretrained) + projection head.

DeepPrint substitute (see section 26 of the master project prompt / README
"Model Decisions" for full justification): DeepPrint has no public
pretrained weights or pip-installable reference implementation, which makes
it impractical to reproduce reliably within a capstone timeline. A
ResNet50 backbone fine-tuned with an ArcFace-style angular-margin loss is a
well-documented, reproducible alternative that still yields a fixed-length
discriminative fingerprint embedding.

Fine-tuning happens in `models/fingerprint/train.py` (invoked from
`kaggle_kernels/fingerprint_training/`); the resulting checkpoint is saved to
models/fingerprint/saved/. The backbone architecture itself lives in
`models/fingerprint/model.py` - see that module's docstring for why (freezing
individual named ResNet50 layers) and for the accuracy-upgrade context
(512-dim embedding, upgraded projection head - this is a breaking change
versus the previously-committed 256-dim checkpoint, which must be retrained).

Input: the enhanced fingerprint image produced by
`preprocessing/fingerprint.py::FingerprintPreprocessor.preprocess()` - already
ImageNet mean/std normalized float32, not a raw 0-255 image.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from models.common.base_embedder import BaseEmbedder
from models.fingerprint.config import FingerprintConfig
from models.fingerprint.model import FingerprintEmbeddingNet

FINGERPRINT_EMBEDDING_DIM = 512


class FingerprintEmbedder(BaseEmbedder):
    embedding_dim = FINGERPRINT_EMBEDDING_DIM

    def __init__(self, checkpoint_path: str | Path | None = None, mock_mode: bool = False, device: str = "cpu"):
        self.device = device
        self._model = None
        super().__init__(checkpoint_path=checkpoint_path, mock_mode=mock_mode)

    def _build_model(self):
        return FingerprintEmbeddingNet(FingerprintConfig(embedding_dim=self.embedding_dim)).to(self.device)

    def _load_checkpoint(self, checkpoint_path: Path) -> None:
        import torch

        self._model = self._build_model()
        state_dict = torch.load(checkpoint_path, map_location=self.device)
        self._model.load_state_dict(state_dict)
        self._model.eval()

    def _extract_embedding_impl(self, image: np.ndarray) -> np.ndarray:
        """`image` is already ImageNet-normalized float32 (see
        `preprocessing/fingerprint.py::FingerprintPreprocessor.preprocess()`) -
        no additional /255 or mean/std normalization needed here, unlike the
        pre-upgrade version of this method.
        """
        import torch

        tensor = torch.from_numpy(image).permute(2, 0, 1).float().unsqueeze(0).to(self.device)
        with torch.no_grad():
            embedding = self._model(tensor)
        return embedding.squeeze(0).cpu().numpy()
