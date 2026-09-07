"""POST /revoke-template: rotate a user's key and regenerate their protected template.

Requires a fresh image, not just `user_id`/`modality`: a protected template
is a deliberately lossy transform (see
`template_protection/biohash.py`'s non-invertibility discussion), so there is
no way to derive "the same biometric under a new key" from the old stored
template alone - only from re-capturing the biometric. See
docs/BACKEND_API.md for this explicitly documented, since it differs from
what a caller might assume from the spec's short `revoke_template(...)`
example.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from backend.config import Settings, get_settings
from backend.database.schema import RevokeResponse
from backend.database.session import get_db
from backend.services import get_service_for_modality
from backend.utils import decode_image, validate_upload

logger = logging.getLogger("backend.api.revoke")

router = APIRouter()


@router.post("/revoke-template", response_model=RevokeResponse)
def revoke_template_endpoint(
    user_id: str = Form(...),
    modality: str = Form(...),
    application_id: str | None = Form(None),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> RevokeResponse:
    contents = image.file.read()
    validate_upload(image, contents, settings)
    raw_image = decode_image(contents)

    resolved_application_id = application_id or settings.application_id
    service = get_service_for_modality(modality)

    revocation = service.revoke(db, raw_image, user_id=user_id, application_id=resolved_application_id)
    logger.info(
        "Revoked user_id=%s modality=%s old_key_version=%d new_key_version=%d",
        user_id, modality, revocation.old_key_version, revocation.new_key_version,
    )

    return RevokeResponse(
        success=True,
        user_id=user_id,
        modality=modality,
        old_key_version=revocation.old_key_version,
        new_key_version=revocation.new_key_version,
        template_id=revocation.template.template_id,
    )
