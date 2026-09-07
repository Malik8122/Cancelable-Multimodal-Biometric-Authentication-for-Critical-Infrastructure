"""Modality pipelines: preprocessing + embedding model behind one call.

These are the objects the rest of the system (backend services in Phase 2,
fusion in Phase 3, and evaluation/experiments.py) should import - they hide
the fact that face/iris/fingerprint use completely different preprocessing
under the hood, exposing the same `embed(raw_image)` method for all three.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from embeddings.constants import DEFAULT_CHECKPOINTS
from models.face.inference import FaceEmbedder
from models.fingerprint.inference import FingerprintEmbedder
from models.iris.inference import IrisEmbedder
from models.voice.inference import VoiceEmbedder
from preprocessing.face import FacePreprocessor
from preprocessing.fingerprint import FingerprintPreprocessor
from preprocessing.iris import IrisPreprocessor
from preprocessing.voice import TARGET_SAMPLE_RATE, VoicePreprocessor


class ModalityPipeline:
    """Base class: preprocess(raw_image) -> embedder.extract_embedding(...)."""

    def __init__(self, preprocessor, embedder):
        self._preprocessor = preprocessor
        self._embedder = embedder

    def embed(self, raw_image: np.ndarray) -> np.ndarray:
        processed = self._preprocessor.preprocess(raw_image)
        if processed.ndim == 2:
            processed = np.stack([processed] * 3, axis=-1)
        return self._embedder.extract_embedding(processed)

    @property
    def embedding_dim(self) -> int:
        return self._embedder.embedding_dim

    @property
    def is_mock(self) -> bool:
        return self._embedder.mock_mode


class FacePipeline(ModalityPipeline):
    def __init__(self, checkpoint_path: str | Path | None = DEFAULT_CHECKPOINTS["face"], device: str = "cpu"):
        super().__init__(FacePreprocessor(device=device), FaceEmbedder(checkpoint_path=checkpoint_path, device=device))


class IrisPipeline(ModalityPipeline):
    def __init__(self, checkpoint_path: str | Path | None = DEFAULT_CHECKPOINTS["iris"], device: str = "cpu"):
        super().__init__(IrisPreprocessor(), IrisEmbedder(checkpoint_path=checkpoint_path, device=device))


class FingerprintPipeline(ModalityPipeline):
    def __init__(self, checkpoint_path: str | Path | None = DEFAULT_CHECKPOINTS["fingerprint"], device: str = "cpu"):
        super().__init__(FingerprintPreprocessor(), FingerprintEmbedder(checkpoint_path=checkpoint_path, device=device))


class VoicePipeline(ModalityPipeline):
    """Like the pipelines above, but audio needs one extra piece of
    information the base class's single-argument `embed(raw_image)` doesn't
    carry: the input's sample rate (a raw waveform alone doesn't say whether
    it's 16kHz or 44.1kHz). `embed()` is overridden accordingly; the
    constructor shape, `embedding_dim`, and `is_mock` are unchanged.
    """

    def __init__(self, checkpoint_path: str | Path | None = DEFAULT_CHECKPOINTS["voice"], device: str = "cpu"):
        super().__init__(VoicePreprocessor(), VoiceEmbedder(checkpoint_path=checkpoint_path, device=device))

    def embed(self, raw_audio: np.ndarray, sample_rate: int = TARGET_SAMPLE_RATE) -> np.ndarray:
        processed = self._preprocessor.preprocess(raw_audio, sample_rate=sample_rate, training=False)
        if processed.ndim == 2:
            processed = np.stack([processed] * 3, axis=-1)
        return self._embedder.extract_embedding(processed)
