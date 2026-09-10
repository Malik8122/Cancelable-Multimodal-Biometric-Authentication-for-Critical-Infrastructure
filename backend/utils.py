"""Upload validation and logging setup shared across backend/api/*.py.

Nothing in this module - or anywhere else in backend/ - ever logs a template,
an embedding, or raw image bytes: log statements are limited to identifiers
(user_id, modality, application_id) and outcomes (accepted/rejected,
counts), per the spec's "never log templates, never print embeddings."
"""

from __future__ import annotations

import logging

import cv2
import numpy as np
from fastapi import HTTPException, UploadFile, status

from backend.config import Settings

logger = logging.getLogger("backend")


def validate_upload(
    file: UploadFile,
    contents: bytes,
    settings: Settings,
    allowed_content_types: tuple[str, ...] | None = None,
) -> None:
    """Reject an upload that fails content-type or size checks.

    `contents` is passed in (already read by the caller) rather than read
    again here, so a single `UploadFile.read()` call is the only I/O -
    reading twice would either double the work or require seeking, and
    `UploadFile`'s underlying stream isn't guaranteed seekable in every
    deployment.

    `allowed_content_types` defaults to `settings.allowed_content_types`
    (images); voice's route passes `settings.allowed_audio_content_types`
    instead - same validation, different acceptable MIME set.
    """
    allowed_content_types = allowed_content_types or settings.allowed_content_types
    if file.content_type not in allowed_content_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported content type {file.content_type!r}; expected one of {allowed_content_types}",
        )
    if len(contents) > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Upload exceeds the {settings.max_upload_size_bytes}-byte limit",
        )


def decode_image(contents: bytes) -> np.ndarray:
    """Decode uploaded image bytes into an RGB `np.ndarray` (H, W, 3), uint8.

    OpenCV decodes to BGR by default; every `preprocessing/*.py` module
    (and thus `embeddings.pipelines.ModalityPipeline.embed`) expects RGB,
    matching `models/common/base_embedder.py`'s documented input contract.
    """
    buffer = np.frombuffer(contents, dtype=np.uint8)
    bgr_image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if bgr_image is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not decode the uploaded file as an image")
    return cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)


def decode_biometric_sample(modality: str, file: UploadFile, settings: Settings):
    """Read, validate, and decode one uploaded biometric sample for `modality`.

    Voice needs different upload validation (audio MIME types, via
    `decode_audio`) than the three image modalities (face/iris/fingerprint,
    via `decode_image`) - this is the one place that branches on modality,
    so `backend/api/enroll.py`, `authenticate.py`, and `verify.py` share it
    instead of each re-implementing the same `if modality == "voice"` check.

    Returns whatever `ModalityService.enroll`/`.authenticate` expect as their
    `raw_image` argument for that modality: an `(H, W, 3)` array for the
    image modalities, or a `(waveform, sample_rate)` tuple for voice (see
    `backend/services/voice_service.py::_VoicePipelineAdapter`).
    """
    contents = file.file.read()
    if modality == "voice":
        validate_upload(file, contents, settings, allowed_content_types=settings.allowed_audio_content_types)
        return decode_audio(contents)
    validate_upload(file, contents, settings)
    return decode_image(contents)


def decode_audio(contents: bytes) -> tuple[np.ndarray, int]:
    """Decode uploaded WAV bytes into a (float32 waveform, sample_rate) pair.

    Voice's counterpart to `decode_image` - delegates to
    `preprocessing.voice.load_wav_bytes` rather than re-implementing WAV
    parsing here, same "backend/api/*.py never duplicates preprocessing"
    rule every other modality already follows.
    """
    from preprocessing.voice import load_wav_bytes

    try:
        return load_wav_bytes(contents)
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Could not decode the uploaded file as a WAV audio file"
        ) from error
