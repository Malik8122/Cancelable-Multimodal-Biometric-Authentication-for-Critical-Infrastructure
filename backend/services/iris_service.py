"""Iris biometric service: wraps `embeddings.pipelines.IrisPipeline`.

No trained checkpoint exists yet for iris (see docs/ROADMAP.md) - `IrisPipeline`
transparently falls back to `BaseEmbedder`'s mock-mode embedding in that case
(models/common/base_embedder.py). `ModalityService` doesn't need to know
this; `ModalityPipeline.is_mock` is available for callers (e.g.
`backend/api/enroll.py`) that want to warn a caller their enrollment is
running on a non-biometrically-meaningful mock embedding.
"""

from __future__ import annotations

from functools import lru_cache

from backend.config import get_settings
from backend.services.base_service import ModalityService
from embeddings.pipelines import IrisPipeline


@lru_cache
def get_iris_service() -> ModalityService:
    settings = get_settings()
    pipeline = IrisPipeline(checkpoint_path=settings.iris_model_path)
    return ModalityService(modality="iris", pipeline=pipeline, settings=settings)
