"""The single authentication path shared by /authenticate, /verify/* and /authenticate/fusion.

The USER chooses which enrolled modalities to present; buildings only label the session. For every request:

1. Compare the submitted modalities with the user's enrollment profile. A submitted modality that is not enrolled ->
   `ENROLLMENT_REQUIRED` (HTTP 409): it is not authenticated, nothing is decoded or evaluated, and the attempt is audited
   as its own state (it is not a failed authentication).
2. Otherwise authenticate exactly the submitted modalities, each against the ACTIVE template set.
3. Fuse across exactly those modalities with the requested `fusion.config.FusionPolicy` (ALL_REQUIRED by default), write
   the audit row (which keeps the per-modality values) and return ONE decision.

Fusion formula (equal weights, m = submitted + enrolled modalities):

    fusion_similarity = sum(s_m) / |M|
    fusion_distance   = 1 - fusion_similarity           (computed after fusion only)
    fusion_threshold  = mean(t_m)                       (t_m = per-modality threshold used)

`authenticated` is decided by the policy (`ALL_REQUIRED`: every submitted modality must pass its own threshold), not by
comparing fusion_similarity with fusion_threshold - except under WEIGHTED.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

from fastapi import UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from backend.config import Settings
from backend.database.models import STATUS_ACTIVE
from backend.database.schema import AuthenticationDecision, EnrollmentRequiredResponse, ModalityAuthenticationResult
from backend.security_validation import SecurityValidationError
from backend.services import enrollment, get_service_for_modality
from backend.services.base_service import AuthenticationResult
from backend.states import ACCESS_DENIED, ACCESS_GRANTED, ENROLLMENT_REQUIRED
from backend.utils import call_modality_service, decode_biometric_sample, record_authentication_audit
from fusion.config import DEFAULT_FUSION_POLICY, FusionPolicy
from fusion.policy import evaluate_fusion_policy

logger = logging.getLogger("backend.services.authentication")


@dataclass
class AuthenticationOutcome:
    """Internal result. Holds the per-modality values that must not reach production clients."""

    user_id: str
    policy: FusionPolicy
    #: ACCESS_GRANTED / ACCESS_DENIED after an evaluation; ENROLLMENT_REQUIRED when a submitted modality is not enrolled.
    state: str = ACCESS_DENIED
    building_id: str | None = None
    submitted_modalities: list[str] = field(default_factory=list)
    enrolled_modalities: list[str] = field(default_factory=list)
    #: Submitted modalities that are not enrolled (ENROLLMENT_REQUIRED only).
    missing_modalities: list[str] = field(default_factory=list)
    per_modality: dict[str, AuthenticationResult] = field(default_factory=dict)
    fusion_similarity: float = 0.0
    fusion_threshold: float = 0.0
    authenticated: bool = False
    matched_modalities: list[str] = field(default_factory=list)
    failed_modalities: list[str] = field(default_factory=list)
    latency_ms: int = 0
    template_set_version: int = 0


def release_modality_cache(modality: str) -> None:
    """Drop the process-wide cached service/model for one modality.

    The per-modality services are `@lru_cache`d singletons; on a 512MB Render instance a multi-modality request that
    loaded two or three of them would exceed memory. Only call this after that modality's `authenticate(...)` has
    returned (a concurrent request still holding the old service keeps it alive via normal reference counting).
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


def authenticate_samples(
    db: Session,
    settings: Settings,
    *,
    user_id: str,
    application_id: str,
    building_id: str | None,
    uploads: dict[str, UploadFile],
    policy: FusionPolicy = DEFAULT_FUSION_POLICY,
    started_at: float | None = None,
) -> AuthenticationOutcome:
    """Authenticate exactly the modalities in `uploads` (the user's choice) and fuse them."""
    started_at = started_at if started_at is not None else time.perf_counter()
    submitted = sorted(uploads)
    outcome = AuthenticationOutcome(user_id=user_id, policy=policy, building_id=building_id, submitted_modalities=submitted)

    # 1. Enrollment first, before any biometric is touched.
    profile = enrollment.get_user_enrollment_status(db, user_id, application_id)
    outcome.enrolled_modalities = profile.enrolled
    outcome.missing_modalities = enrollment.missing_modalities(profile, submitted)
    if outcome.missing_modalities:
        outcome.state = ENROLLMENT_REQUIRED
        outcome.latency_ms = round((time.perf_counter() - started_at) * 1000)
        record_authentication_audit(
            db,
            user_id=user_id,
            building_id=building_id,
            modality_list=[],  # nothing was evaluated
            similarity_scores={},
            thresholds_used={},
            authenticated=False,
            started_at=started_at,
            template_versions={},
            key_versions={},
            fusion_policy=policy.value,
            authentication_state=ENROLLMENT_REQUIRED,
            submitted_modalities=submitted,
            enrolled_modalities=outcome.enrolled_modalities,
            authenticated_modalities=[],
        )
        return outcome

    # 2. Authenticate exactly the submitted modalities.
    release_models = len(uploads) > 1
    for modality in submitted:
        raw_input = decode_biometric_sample(modality, uploads[modality], settings)
        service = get_service_for_modality(modality)
        try:
            # A multi-modality request fails closed as a whole (422 naming the bad modality) rather than fusing on
            # an incomplete result.
            outcome.per_modality[modality] = call_modality_service(
                service.authenticate, modality, db, raw_input, user_id=user_id, application_id=application_id
            )
        finally:
            del service
            if release_models:
                release_modality_cache(modality)

    # Never mix templates from different sets: every modality was compared with its row of the ACTIVE set.
    set_versions = {r.template_set_version for r in outcome.per_modality.values() if r.template_set_version}
    if len(set_versions) > 1:
        raise SecurityValidationError(
            f"Active template set mismatch for user_id={user_id!r}: modalities matched sets {sorted(set_versions)}."
        )
    outcome.template_set_version = next(iter(set_versions), 0)

    # 3. Fusion over exactly these modalities.
    scores = {m: r.score for m, r in outcome.per_modality.items()}
    thresholds = {m: r.threshold for m, r in outcome.per_modality.items()}
    outcome.fusion_threshold = sum(thresholds.values()) / len(thresholds)
    decision = evaluate_fusion_policy(
        scores=scores,
        individually_authenticated={m: r.authenticated for m, r in outcome.per_modality.items()},
        policy=policy,
        fusion_threshold=outcome.fusion_threshold,
    )
    outcome.fusion_similarity = decision.fused_score
    outcome.authenticated = decision.authenticated
    outcome.state = ACCESS_GRANTED if decision.authenticated else ACCESS_DENIED
    outcome.matched_modalities = decision.matched_modalities
    outcome.failed_modalities = decision.failed_modalities
    outcome.latency_ms = round((time.perf_counter() - started_at) * 1000)

    logger.info(
        "Auth user_id=%s modalities=%s policy=%s authenticated=%s",
        user_id, submitted, policy.value, outcome.authenticated,
    )
    if settings.debug_scores:
        # DEBUG ONLY: the fusion stage. Nothing here reaches a production response.
        logger.info(
            "FUSION-DEBUG building=%s submitted=%s enrolled=%s entering_fusion=%s rejected_before_fusion=%s "
            "matched=%s failed=%s fusion_similarity=%.4f fusion_distance=%.4f fusion_threshold=%.2f "
            "set_version=%s state=%s",
            outcome.building_id, submitted, outcome.enrolled_modalities, sorted(scores),
            sorted(set(submitted) - set(scores)), decision.matched_modalities, decision.failed_modalities,
            decision.fused_score, 1.0 - decision.fused_score, outcome.fusion_threshold,
            outcome.template_set_version, outcome.state,
        )
    record_authentication_audit(
        db,
        user_id=user_id,
        building_id=building_id,
        modality_list=submitted,
        similarity_scores=scores,
        thresholds_used=thresholds,
        authenticated=outcome.authenticated,
        started_at=started_at,
        template_versions={m: r.template_set_version for m, r in outcome.per_modality.items()},
        key_versions={m: r.key_version for m, r in outcome.per_modality.items()},
        # `fusion_score` was historically only recorded for multi-modality requests; `fusion_similarity` is always recorded.
        fusion_score=decision.fused_score if len(uploads) > 1 else None,
        fusion_policy=policy.value if len(uploads) > 1 else None,
        fusion_similarity=decision.fused_score,
        template_set_version=outcome.template_set_version or None,
        template_set_status=STATUS_ACTIVE if outcome.template_set_version else None,
        authentication_state=outcome.state,
        submitted_modalities=submitted,
        enrolled_modalities=outcome.enrolled_modalities,
        authenticated_modalities=outcome.matched_modalities,
    )
    return outcome


def enrollment_required_response(outcome: AuthenticationOutcome) -> JSONResponse:
    """HTTP 409 body for ENROLLMENT_REQUIRED: which submitted modalities are not enrolled."""
    names = " and ".join(m.capitalize() for m in outcome.missing_modalities)
    detail = (
        f"{names} {'is' if len(outcome.missing_modalities) == 1 else 'are'} not registered. "
        f"Complete {names.lower()} enrollment before authenticating with {'it' if len(outcome.missing_modalities) == 1 else 'them'}."
    )
    body = EnrollmentRequiredResponse(
        status=ENROLLMENT_REQUIRED,
        authentication_state=ENROLLMENT_REQUIRED,
        detail=detail,
        user_id=outcome.user_id,
        building_id=outcome.building_id,
        submitted_modalities=outcome.submitted_modalities,
        enrolled_modalities=outcome.enrolled_modalities,
        missing_modalities=outcome.missing_modalities,
    )
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content=body.model_dump(exclude_none=True))


def to_public_response(outcome: AuthenticationOutcome, settings: Settings) -> AuthenticationDecision:
    """Build the public response: one decision, one fusion similarity, one active template set.

    Per-modality similarities / thresholds / distances are added only under DEBUG_SCORES.
    """
    key_versions = {m: r.key_version for m, r in outcome.per_modality.items()}
    response = AuthenticationDecision(
        user_id=outcome.user_id,
        authentication_state=outcome.state,
        status=outcome.state,
        authenticated=outcome.authenticated,
        fusion_similarity=outcome.fusion_similarity,
        fusion_distance=1.0 - outcome.fusion_similarity,
        fusion_threshold=outcome.fusion_threshold,
        fusion_policy=outcome.policy.value,
        matched_modalities=outcome.matched_modalities,
        modalities_used=sorted(outcome.per_modality),
        active_template_set=outcome.template_set_version,
        template_set_version=outcome.template_set_version,
        key_version=max(key_versions.values(), default=0),
        authentication_time_ms=outcome.latency_ms,
        building_id=outcome.building_id,
    )
    if settings.debug_scores:
        response.failed_modalities = outcome.failed_modalities
        response.fused_score = outcome.fusion_similarity
        response.template_version = outcome.template_set_version
        response.template_versions = {m: r.template_set_version for m, r in outcome.per_modality.items()}
        response.key_versions = key_versions
        response.results = {
            m: ModalityAuthenticationResult(
                score=r.score,
                threshold=r.threshold,
                authenticated=r.authenticated,
                distance=r.distance,
                template_version=r.template_set_version,
                key_version=r.key_version,
            )
            for m, r in outcome.per_modality.items()
        }
        if len(outcome.per_modality) == 1:
            (modality, only), = outcome.per_modality.items()
            response.modality = modality
            response.score = only.score
            response.threshold = only.threshold
            response.distance = only.distance
    return response


def respond(outcome: AuthenticationOutcome, settings: Settings) -> AuthenticationDecision | JSONResponse:
    """The HTTP result of an outcome: 409 ENROLLMENT_REQUIRED, or the single fusion decision (200)."""
    if outcome.state == ENROLLMENT_REQUIRED:
        return enrollment_required_response(outcome)
    return to_public_response(outcome, settings)
