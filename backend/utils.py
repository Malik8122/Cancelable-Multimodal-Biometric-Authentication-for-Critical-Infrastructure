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


def validate_upload(file: UploadFile, contents: bytes, settings: Settings) -> None:
    """Reject an upload that fails content-type or size checks.

    `contents` is passed in (already read by the caller) rather than read
    again here, so a single `UploadFile.read()` call is the only I/O -
    reading twice would either double the work or require seeking, and
    `UploadFile`'s underlying stream isn't guaranteed seekable in every
    deployment.
    """
    if file.content_type not in settings.allowed_content_types:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported content type {file.content_type!r}; expected one of {settings.allowed_content_types}",
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
