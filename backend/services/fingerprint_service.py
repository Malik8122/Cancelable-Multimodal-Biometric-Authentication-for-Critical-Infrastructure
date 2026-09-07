"""Fingerprint biometric service: wraps `embeddings.pipelines.FingerprintPipeline`."""

from __future__ import annotations

from functools import lru_cache

from backend.config import get_settings
from backend.services.base_service import ModalityService
from embeddings.pipelines import FingerprintPipeline


@lru_cache
def get_fingerprint_service() -> ModalityService:
    settings = get_settings()
    pipeline = FingerprintPipeline(checkpoint_path=settings.fingerprint_model_path)
    return ModalityService(modality="fingerprint", pipeline=pipeline, settings=settings)
