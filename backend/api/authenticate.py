"""POST /authenticate: preprocess -> embed -> transform -> compare against the stored template."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from backend.config import Settings, get_settings
from backend.database.schema import AuthenticateResponse
from backend.database.session import get_db
from backend.services import get_service_for_modality
from backend.utils import decode_image, validate_upload

logger = logging.getLogger("backend.api.authenticate")

router = APIRouter()


@router.post("/authenticate", response_model=AuthenticateResponse)
def authenticate(
    user_id: str = Form(...),
    modality: str = Form(...),
    application_id: str | None = Form(None),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AuthenticateResponse:
    contents = image.file.read()
    validate_upload(image, contents, settings)
    raw_image = decode_image(contents)

    resolved_application_id = application_id or settings.application_id
    service = get_service_for_modality(modality)

    result = service.authenticate(db, raw_image, user_id=user_id, application_id=resolved_application_id)
    logger.info("Authenticate user_id=%s modality=%s authenticated=%s", user_id, modality, result.authenticated)

    return AuthenticateResponse(
        user_id=user_id,
        modality=modality,
        score=result.score,
        threshold=result.threshold,
        authenticated=result.authenticated,
    )
