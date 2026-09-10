"""POST /enroll: preprocess -> embed -> transform -> store a protected template.

Declared as a plain `def` route (not `async def`): the underlying service
call runs real preprocessing (OpenCV) and embedding (PyTorch) inference,
both CPU-bound. FastAPI runs sync path operations in a threadpool
automatically, so this doesn't block the event loop without needing a
manual `run_in_executor` call.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from backend.config import Settings, get_settings
from backend.database.schema import EnrollResponse
from backend.database.session import get_db
from backend.services import get_service_for_modality
from backend.utils import decode_biometric_sample

logger = logging.getLogger("backend.api.enroll")

router = APIRouter()


@router.post("/enroll", response_model=EnrollResponse)
def enroll(
    user_id: str = Form(...),
    modality: str = Form(...),
    application_id: str | None = Form(None),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> EnrollResponse:
    raw_image = decode_biometric_sample(modality, image, settings)

    resolved_application_id = application_id or settings.application_id
    service = get_service_for_modality(modality)

    if service.pipeline.is_mock:
        logger.warning("Enrolling user_id=%s modality=%s against a MOCK embedding - not biometrically meaningful", user_id, modality)

    template = service.enroll(db, raw_image, user_id=user_id, application_id=resolved_application_id)
    logger.info("Enrolled user_id=%s modality=%s key_version=%d", user_id, modality, template.key_version)

    return EnrollResponse(
        success=True,
        user_id=user_id,
        modality=modality,
        template_version=template.template_version,
        key_version=template.key_version,
        template_id=template.template_id,
    )
