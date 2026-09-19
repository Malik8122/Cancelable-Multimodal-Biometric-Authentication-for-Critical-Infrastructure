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
from preprocessing.face import BLUR_MIN_SHARPNESS, FacePreprocessor
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

    def check_capture(self, image: np.ndarray) -> str:
        """Verdict for one enrollment pose: VALID, NO_FACE or BLURRY (nothing is embedded)."""
        try:
            _, _, sharpness = self._preprocessor.detect_and_align(image)
        except ValueError:
            return "NO_FACE"
        return "BLURRY" if sharpness < BLUR_MIN_SHARPNESS else "VALID"

    def embed_poses(self, captures: list[tuple[str, np.ndarray]]) -> tuple[list[np.ndarray], list[dict]]:
        """Multi-pose enrollment: one embedding per VALID capture, plus a per-pose report.

        Each capture goes through the existing MTCNN detection + alignment; it is rejected only when no face is found
        or the aligned crop is blurry. Valid ones are embedded by the unchanged FaceNet model (the same call
        authentication makes). Returns (embeddings of the valid poses, [{"pose", "status"}, ...] for every capture).
        """
        embeddings: list[np.ndarray] = []
        report: list[dict] = []
        for pose, image in captures:
            try:
                aligned, _, sharpness = self._preprocessor.detect_and_align(image)
            except ValueError:
                report.append({"pose": pose, "status": "NO_FACE"})
                continue
            if sharpness < BLUR_MIN_SHARPNESS:
                report.append({"pose": pose, "status": "BLURRY"})
                continue
            embeddings.append(self._embedder.extract_embedding(aligned))
            report.append({"pose": pose, "status": "VALID"})
        return embeddings, report


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
