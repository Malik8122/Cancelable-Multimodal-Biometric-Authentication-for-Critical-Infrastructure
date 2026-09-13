"""POST /verify/{face,iris,fingerprint}: modality-only verification.

Identical to POST /authenticate except the modality comes from the URL
instead of a form field - each route below is a thin wrapper around the same
`_verify` helper, which itself just calls the same
`backend.services.ModalityService.authenticate` that `/authenticate` uses.
"""

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

logger = logging.getLogger("backend.api.verify")

router = APIRouter()


def _verify(
    modality: str,
    user_id: str,
    application_id: str | None,
    building_id: str | None,
    image: UploadFile,
    db: Session,
    settings: Settings,
) -> AuthenticateResponse:
    started_at = time.perf_counter()
    raw_image = decode_biometric_sample(modality, image, settings)

    resolved_application_id = application_id or settings.application_id
    service = get_service_for_modality(modality)

    result = call_modality_service(
        service.authenticate, modality, db, raw_image, user_id=user_id, application_id=resolved_application_id
    )
    logger.info("Verify/%s user_id=%s authenticated=%s", modality, user_id, result.authenticated)

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


@router.post("/verify/face", response_model=AuthenticateResponse)
def verify_face(
    user_id: str = Form(...),
    application_id: str | None = Form(None),
    building_id: str | None = Form(None),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AuthenticateResponse:
    return _verify("face", user_id, application_id, building_id, image, db, settings)


@router.post("/verify/iris", response_model=AuthenticateResponse)
def verify_iris(
    user_id: str = Form(...),
    application_id: str | None = Form(None),
    building_id: str | None = Form(None),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AuthenticateResponse:
    return _verify("iris", user_id, application_id, building_id, image, db, settings)


@router.post("/verify/fingerprint", response_model=AuthenticateResponse)
def verify_fingerprint(
    user_id: str = Form(...),
    application_id: str | None = Form(None),
    building_id: str | None = Form(None),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AuthenticateResponse:
    return _verify("fingerprint", user_id, application_id, building_id, image, db, settings)


@router.post("/verify/voice", response_model=AuthenticateResponse)
def verify_voice(
    user_id: str = Form(...),
    application_id: str | None = Form(None),
    building_id: str | None = Form(None),
    image: UploadFile = File(..., description="WAV audio file"),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AuthenticateResponse:
    """Named `image` for consistency with the other three `/verify/*` routes'
    shared `_verify` helper - it's actually a WAV audio upload, decoded via
    `decode_biometric_sample`'s voice branch. `docs/BACKEND_API.md` documents
    the field's real content for callers."""
    return _verify("voice", user_id, application_id, building_id, image, db, settings)
