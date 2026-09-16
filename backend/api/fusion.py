"""POST /authenticate/fusion: combine per-modality authentication into one backend-computed decision.

Calls each *present* modality's already-existing
`backend.services.ModalityService.authenticate` (the same one `/authenticate`
and `/verify/{modality}` use) - no duplicated inference logic - then decides
`authenticated` via `fusion/policy.py::evaluate_fusion_policy`, per a
configurable `fusion.config.FusionPolicy`. Nothing about biometric
similarity or the accept/reject decision is ever computed by a caller.

Security-hardening note: the old behavior (a plain weighted average of
whichever modalities were submitted) let one strong match compensate for
another modality that individually failed its own threshold - e.g. Face=1.0
+ Fingerprint=0.82 (individually a fail at threshold=0.9) averaged to 0.91,
clearing the fusion threshold anyway. `ALL_REQUIRED` (the new default) fixes
this: every submitted modality must individually pass. `WEIGHTED` is still
available for callers that want it, but now vetoes on any per-modality score
below `fusion.config.DEFAULT_WEIGHTED_FLOOR` rather than averaging blindly.
"""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from backend.config import Settings, get_settings
from backend.database.schema import FusionAuthenticateResponse, ModalityAuthenticationResult
from backend.database.session import get_db
from backend.services import get_service_for_modality
from backend.utils import call_modality_service, decode_biometric_sample, record_authentication_audit
from fusion.config import ALL_POLICIES, DEFAULT_FUSION_POLICY, FusionPolicy
from fusion.policy import evaluate_fusion_policy

logger = logging.getLogger("backend.api.fusion")

router = APIRouter()


def _release_modality_cache(modality: str) -> None:
    """Drop the process-wide cached service/model for one modality.

    `get_face_service`/`get_fingerprint_service`/`get_voice_service`
    (`backend/services/*.py`) are `@lru_cache`d singletons that otherwise
    stay resident for the process's entire life once loaded - on a 512MB
    Render Free instance, a multi-modality fusion request that loads two or
    three of them sequentially can push resident memory over the limit (see
    docs/AUTHENTICATION_RELIABILITY_REPORT.md's Render OOM investigation).
    This must only ever be called from `authenticate_fusion` below, and only
    *after* that modality's `service.authenticate(...)` call has already
    returned - never while it might still be executing. `cache_clear()`
    alone doesn't force anything to happen immediately (a concurrently
    running request already holding a reference to the old service object
    keeps it alive via normal reference counting until it finishes; this is
    exactly what makes clearing the cache here safe rather than disruptive)
    - it only ensures *this* request no longer holds the process-wide
    reference, so the object becomes eligible for reclamation once nothing
    else references it either.
    """
    if modality == "face":
        from backend.services.face_service import get_face_service

        get_face_service.cache_clear()
    elif modality == "fingerprint":
        from backend.services.fingerprint_service import get_fingerprint_service

        get_fingerprint_service.cache_clear()
    elif modality == "voice":
        from backend.services.voice_service import get_voice_service

        get_voice_service.cache_clear()


@router.post("/authenticate/fusion", response_model=FusionAuthenticateResponse)
def authenticate_fusion(
    user_id: str = Form(...),
    application_id: str | None = Form(None),
    building_id: str | None = Form(None),
    fusion_policy: str | None = Form(None),
    face_image: UploadFile | None = File(None),
    fingerprint_image: UploadFile | None = File(None),
    voice_audio: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> FusionAuthenticateResponse:
    """At least one of `face_image`, `fingerprint_image`, `voice_audio` is
    required; any subset (all 7 non-empty combinations of the 3 modalities)
    is valid, matching the spec's "Face only / Fingerprint only / Voice only
    / any pair / all three" requirement.

    `fusion_policy` (optional; one of `fusion.config.ALL_POLICIES`) defaults
    to `ALL_REQUIRED` - the secure default. `AT_LEAST_TWO` is only valid when
    exactly three modalities are submitted.
    """
    started_at = time.perf_counter()

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

    policy_name = fusion_policy or DEFAULT_FUSION_POLICY.value
    if policy_name not in ALL_POLICIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported fusion_policy {policy_name!r}; expected one of {ALL_POLICIES}",
        )
    policy = FusionPolicy(policy_name)
    if policy == FusionPolicy.AT_LEAST_TWO and len(provided) != 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="fusion_policy=AT_LEAST_TWO requires all three modalities (face, fingerprint, voice) to be submitted.",
        )

    resolved_application_id = application_id or settings.application_id

    per_modality_results: dict[str, ModalityAuthenticationResult] = {}
    scores: dict[str, float] = {}
    individually_authenticated: dict[str, bool] = {}
    thresholds_used: dict[str, float] = {}
    template_versions: dict[str, int] = {}
    key_versions: dict[str, int] = {}

    for modality, upload in provided.items():
        raw_input = decode_biometric_sample(modality, upload, settings)
        service = get_service_for_modality(modality)
        try:
            # A multi-modality request fails closed as a whole (422 naming
            # the bad modality) rather than silently fusing on an incomplete
            # result - see backend/utils.py::call_modality_service.
            result = call_modality_service(
                service.authenticate, modality, db, raw_input, user_id=user_id, application_id=resolved_application_id
            )
        finally:
            # Release this modality's cached service/model whether
            # authenticate() succeeded or raised - so a multi-modality
            # request never needs more than one modality's model resident in
            # memory at a time, on either path. Without this `finally`, an
            # exception other than the ValueError `call_modality_service`
            # already translates above would skip straight past the release
            # below, leaving that modality's model cached anyway - not worse
            # than before H2 existed, but not covered by it either. `del
            # service` drops this request's own reference alongside clearing
            # the process-wide cache, exactly as before - only *when* this
            # runs changed (guaranteed on every exit path, not just success).
            # See _release_modality_cache's docstring for why this can't
            # disrupt a concurrently running request.
            del service
            _release_modality_cache(modality)

        per_modality_results[modality] = ModalityAuthenticationResult(
            score=result.score,
            threshold=result.threshold,
            authenticated=result.authenticated,
            distance=result.distance,
            template_version=result.template_version,
            key_version=result.key_version,
        )
        scores[modality] = result.score
        individually_authenticated[modality] = result.authenticated
        thresholds_used[modality] = result.threshold
        template_versions[modality] = result.template_version
        key_versions[modality] = result.key_version

    # The fusion "threshold" reported alongside `fused_score` is the
    # equal-weighted average of the per-modality thresholds actually used
    # (each already resolved per-modality by backend/threshold_loader.py) -
    # informative even under ALL_REQUIRED/AT_LEAST_TWO, where it isn't what
    # decided `authenticated`.
    fusion_threshold = sum(thresholds_used.values()) / len(thresholds_used)

    decision = evaluate_fusion_policy(
        scores=scores,
        individually_authenticated=individually_authenticated,
        policy=policy,
        fusion_threshold=fusion_threshold,
    )

    logger.info(
        "Fusion user_id=%s modalities=%s policy=%s fused_score=%.4f authenticated=%s",
        user_id, sorted(provided), policy.value, decision.fused_score, decision.authenticated,
    )

    record_authentication_audit(
        db,
        user_id=user_id,
        building_id=building_id,
        modality_list=sorted(provided),
        similarity_scores=scores,
        thresholds_used=thresholds_used,
        authenticated=decision.authenticated,
        started_at=started_at,
        template_versions=template_versions,
        key_versions=key_versions,
        fusion_score=decision.fused_score,
        fusion_policy=policy.value,
    )

    return FusionAuthenticateResponse(
        user_id=user_id,
        modalities_used=sorted(provided),
        results=per_modality_results,
        fused_score=decision.fused_score,
        fusion_threshold=fusion_threshold,
        authenticated=decision.authenticated,
        fusion_policy=policy.value,
        required_modalities=sorted(provided),
        matched_modalities=decision.matched_modalities,
        failed_modalities=decision.failed_modalities,
    )
