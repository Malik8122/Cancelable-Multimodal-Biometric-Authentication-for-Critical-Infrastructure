"""POST /authenticate: preprocess -> embed -> transform -> compare against the stored template."""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from backend.config import Settings, get_settings
from backend.database.schema import AuthenticateResponse
from backend.database.session import get_db
from backend.services import get_service_for_modality
from backend.utils import call_modality_service, decode_biometric_sample, record_authentication_audit

logger = logging.getLogger("backend.api.authenticate")

router = APIRouter()


@router.post("/authenticate", response_model=AuthenticateResponse)
def authenticate(
    user_id: str = Form(...),
    modality: str = Form(...),
    application_id: str | None = Form(None),
    building_id: str | None = Form(None),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AuthenticateResponse:
    started_at = time.perf_counter()
    raw_image = decode_biometric_sample(modality, image, settings)

    resolved_application_id = application_id or settings.application_id
    service = get_service_for_modality(modality)

    result = call_modality_service(
        service.authenticate, modality, db, raw_image, user_id=user_id, application_id=resolved_application_id
    )
    logger.info("Authenticate user_id=%s modality=%s authenticated=%s", user_id, modality, result.authenticated)

    record_authentication_audit(
        db,
        user_id=user_id,
        building_id=building_id,
        modality_list=[modality],
        similarity_scores={modality: result.score},
        thresholds_used={modality: result.threshold},
        authenticated=result.authenticated,
        started_at=started_at,
        template_versions={modality: result.template_version},
        key_versions={modality: result.key_version},
    )

    return AuthenticateResponse(
        user_id=user_id,
        modality=modality,
        score=result.score,
        threshold=result.threshold,
        authenticated=result.authenticated,
        distance=result.distance,
        template_version=result.template_version,
        key_version=result.key_version,
    )
