"""POST /authenticate/fusion: combine per-modality authentication into one backend-computed decision.

Calls each *present* modality's already-existing
`backend.services.ModalityService.authenticate` (the same one `/authenticate`
and `/verify/{modality}` use) - no duplicated inference logic - and combines
the resulting scores via `fusion/score_fusion.py::fuse_scores`, a documented
baseline (equal-weighted average over whichever modalities were supplied),
not an optimized fusion strategy. The fusion score and final decision are
both computed here, server-side; nothing about biometric similarity is ever
computed by a caller.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from backend.config import Settings, get_settings
from backend.database.schema import FusionAuthenticateResponse, ModalityAuthenticationResult
from backend.database.session import get_db
from backend.services import get_service_for_modality
from backend.utils import call_modality_service, decode_biometric_sample
from fusion.score_fusion import fuse_scores

logger = logging.getLogger("backend.api.fusion")

router = APIRouter()


@router.post("/authenticate/fusion", response_model=FusionAuthenticateResponse)
def authenticate_fusion(
    user_id: str = Form(...),
    application_id: str | None = Form(None),
    face_image: UploadFile | None = File(None),
    fingerprint_image: UploadFile | None = File(None),
    voice_audio: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> FusionAuthenticateResponse:
    """At least one of `face_image`, `fingerprint_image`, `voice_audio` is
    required; any subset (all 7 non-empty combinations of the 3 modalities)
    is valid, matching the spec's "Face only / Fingerprint only / Voice only
    / any pair / all three" requirement."""
    uploads: dict[str, UploadFile | None] = {
        "face": face_image,
        "fingerprint": fingerprint_image,
        "voice": voice_audio,
    }
    provided = {modality: upload for modality, upload in uploads.items() if upload is not None}
    if not provided:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one of face_image, fingerprint_image, voice_audio is required.",
        )

    resolved_application_id = application_id or settings.application_id

    per_modality_results: dict[str, ModalityAuthenticationResult] = {}
    scores: dict[str, float] = {}
    for modality, upload in provided.items():
        raw_input = decode_biometric_sample(modality, upload, settings)
        service = get_service_for_modality(modality)
        # A multi-modality request fails closed as a whole (422 naming the
        # bad modality) rather than silently fusing on an incomplete result
        # - see backend/utils.py::call_modality_service.
        result = call_modality_service(
            service.authenticate, modality, db, raw_input, user_id=user_id, application_id=resolved_application_id
        )
        per_modality_results[modality] = ModalityAuthenticationResult(
            score=result.score, threshold=result.threshold, authenticated=result.authenticated
        )
        scores[modality] = result.score

    fused_score = fuse_scores(scores)
    authenticated = fused_score >= settings.match_threshold

    logger.info(
        "Fusion user_id=%s modalities=%s fused_score=%.4f authenticated=%s",
        user_id, sorted(provided), fused_score, authenticated,
    )

    return FusionAuthenticateResponse(
        user_id=user_id,
        modalities_used=sorted(provided),
        results=per_modality_results,
        fused_score=fused_score,
        fusion_threshold=settings.match_threshold,
        authenticated=authenticated,
    )
