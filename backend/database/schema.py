"""Pydantic request/response models for the HTTP API.

Kept separate from `models.py` (the SQLAlchemy ORM layer) so the wire format
can evolve independently of the storage schema - e.g. `EnrollResponse` never
exposes `protected_template` at all, even though the ORM row has it.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class EnrollResponse(BaseModel):
    """Result of enrolling one modality into the user's template sets. Never carries template bytes."""

    success: bool
    user_id: str
    modality: str
    #: How many template sets this modality's templates were written into.
    templates_created: int
    active_template_set_version: int
    standby_template_set_versions: list[int] = Field(default_factory=list)
    #: Legacy fields describing this modality's template in the ACTIVE set.
    template_version: int
    key_version: int
    template_id: str
    #: Voice (two recordings): EXCELLENT / GOOD (or FAIR when the user chose to continue) - how consistent the two
    #: recordings were. None for other enrollments.
    recording_quality: str | None = None
    #: Face five-pose enrollment: the verdict for each pose (VALID / NO_FACE / BLURRY) and how many were valid (the
    #: centroid was averaged over those). None for other enrollments.
    poses_valid: int | None = None
    pose_results: list["PoseResult"] | None = None


class PoseResult(BaseModel):
    pose: str
    status: str


EnrollResponse.model_rebuild()


class FacePoseCheckResponse(BaseModel):
    """Verdict for ONE captured pose, so the UI can ask for an immediate retake. Stores nothing."""

    pose: str
    status: str
    valid: bool
    detail: str | None = None


class AuthenticationDecision(BaseModel):
    """The one public authentication response (`/authenticate`, `/verify/*`, `/authenticate/fusion`).

    One decision, one fusion similarity, one template set version. The
    fields after the first group are populated only when the backend runs with
    `DEBUG_SCORES=true` (routes use `response_model_exclude_none`, so they are
    absent from production responses); the values are always audit-logged.
    """

    user_id: str
    #: ACCESS_GRANTED or ACCESS_DENIED here (ENROLLMENT_REQUIRED is a separate 409 body,
    #: `EnrollmentRequiredResponse`, because no authentication took place).
    authentication_state: str
    #: Same value as `authentication_state` (kept for compatibility).
    status: str
    authenticated: bool
    fusion_similarity: float
    #: 1 - fusion_similarity, computed after fusion (never per modality).
    fusion_distance: float
    #: Mean of the per-modality thresholds actually used (informational under
    #: ALL_REQUIRED / AT_LEAST_TWO, where each modality's own pass/fail decides).
    fusion_threshold: float
    fusion_policy: str
    matched_modalities: list[str] = Field(default_factory=list)
    modalities_used: list[str] = Field(default_factory=list)
    #: Version of the ACTIVE template set that was matched, and the highest HKDF
    #: key version among the modalities' templates in it.
    #: The ACTIVE template set that matched (`template_set_version` is the same number, kept for compatibility).
    active_template_set: int = 0
    template_set_version: int = 0
    key_version: int = 0
    authentication_time_ms: int = 0
    #: The facility label of this session (context only - it never changes which modalities are evaluated).
    building_id: str | None = None
    #: The user's human-readable name - present ONLY when access was granted (a denied attempt learns nothing about
    #: whose account it tried). Never used for any biometric computation or key derivation.
    display_name: str | None = None

    # --- debug-only (DEBUG_SCORES=true); None => omitted from the JSON ---
    template_version: int | None = None
    template_versions: dict[str, int] | None = None
    key_versions: dict[str, int] | None = None
    modality: str | None = None
    score: float | None = None
    threshold: float | None = None
    distance: float | None = None
    fused_score: float | None = None
    results: dict[str, "ModalityAuthenticationResult"] | None = None
    failed_modalities: list[str] | None = None
    #: Local-development observability only (fusion/diagnostics.py::build_fusion_diagnostics) -
    #: per-modality score/threshold/status, the fusion weights actually applied, the fused score,
    #: threshold, policy, and final access_granted - all read from the same values this response's
    #: other DEBUG_SCORES-only fields already carry, never recomputed. Never the raw image,
    #: embedding, protected template, or any key material.
    fusion_diagnostics: dict | None = None


class ModalityAuthenticationResult(BaseModel):
    """DEBUG ONLY: one modality's internal result (`DEBUG_SCORES=true`).

    `score`/`threshold` are on the fusion scale (higher = better). `metric*` is the modality's own decision metric
    (backend/services/modality_metrics.py): "cosine_estimate" (face, higher = better), "euclidean_estimate" (voice,
    LOWER = better) or "hamming" - the two estimates are calibrated estimates derived from the template Hamming
    comparison, not exact embedding metrics. `hamming_*` is the template comparison itself. Never an embedding,
    template or key.
    """

    score: float
    threshold: float
    authenticated: bool
    distance: float = 0.0
    metric: str = ""
    metric_value: float = 0.0
    metric_threshold: float = 0.0
    metric_higher_is_better: bool = True
    metric_uncertainty: float = 0.0
    hamming_similarity: float = 0.0
    hamming_distance_bits: int = 0
    template_bits: int = 0
    template_version: int = 0
    key_version: int = 0
    #: True only when a per-modality result exists at all: `call_modality_service` fails the whole
    #: request closed (422) before this object is built if no face was detected in the capture, so
    #: reaching this point tautologically means detection + embedding both succeeded.
    face_detected: bool = True
    embedding_generated: bool = True
    #: Whether this modality's embedder is running on the real trained checkpoint (False) or the
    #: deterministic mock fallback (True) - see `models/common/base_embedder.py`.
    mock_embedder: bool = False
    #: Stored template's lifecycle status (e.g. "ACTIVE"), "" if nothing was enrolled.
    template_status: str = ""


AuthenticationDecision.model_rebuild()

#: Backward-compatible names for the single-modality and fusion routes.
AuthenticateResponse = AuthenticationDecision
FusionAuthenticateResponse = AuthenticationDecision


class RevokeResponse(BaseModel):
    """Revocation retires the whole ACTIVE template set and activates the next STANDBY set."""

    success: bool
    user_id: str
    revoked_template_set_version: int
    new_active_template_set_version: int
    remaining_standby_template_sets: int


class TemplateSetInfo(BaseModel):
    """One template set's lifecycle metadata. Never includes template bytes."""

    template_set_version: int
    status: str
    modalities: list[str]
    key_versions: dict[str, int]
    template_group_id: str | None = None
    created_at: datetime | None = None
    activated_at: datetime | None = None
    revoked_at: datetime | None = None
    revoked_reason: str | None = None


class TemplateSetPoolResponse(BaseModel):
    user_id: str
    application_id: str
    pool_size: int
    active_template_set_version: int | None = None
    standby_count: int
    sets: list[TemplateSetInfo] = Field(default_factory=list)


class ActivateResponse(BaseModel):
    success: bool
    user_id: str
    previous_active_template_set_version: int | None = None
    new_active_template_set_version: int
    remaining_standby_template_sets: int


class GenerateSetResponse(BaseModel):
    success: bool
    user_id: str
    new_template_set_version: int
    standby_template_set_versions: list[int] = Field(default_factory=list)
    active_template_set_version: int


class EnrolledModality(BaseModel):
    modality: str
    application_id: str
    template_version: int
    key_version: int
    created_at: datetime


class UserModalitiesResponse(BaseModel):
    user_id: str
    enrolled_modalities: list[EnrolledModality] = Field(default_factory=list)


class DeleteUserResponse(BaseModel):
    success: bool
    user_id: str
    templates_deleted: int


class ErrorResponse(BaseModel):
    detail: str


class AuditLogEntry(BaseModel):
    audit_id: str
    timestamp: datetime
    user_id: str
    building_id: str | None = None
    modality_list: list[str]
    fusion_similarity: float | None = None
    fusion_policy: str | None = None
    template_set_version: int | None = None
    template_set_status: str | None = None
    #: ACCESS_GRANTED / ACCESS_DENIED / ENROLLMENT_REQUIRED
    authentication_state: str
    submitted_modalities: list[str] | None = None
    enrolled_modalities: list[str] | None = None
    authenticated_modalities: list[str] | None = None
    authenticated: bool
    latency_ms: int
    template_versions: dict[str, int]
    key_versions: dict[str, int]
    # --- internal per-modality values; only present with DEBUG_SCORES=true ---
    similarity_scores: dict[str, float] | None = None
    thresholds_used: dict[str, float] | None = None
    face_similarity: float | None = None
    fingerprint_similarity: float | None = None
    voice_similarity: float | None = None
    fusion_score: float | None = None


class AuditHistoryResponse(BaseModel):
    user_id: str
    total: int
    limit: int
    offset: int
    entries: list[AuditLogEntry] = Field(default_factory=list)


class SystemAuditResponse(BaseModel):
    entries: list[AuditLogEntry] = Field(default_factory=list)


class DeleteAuditResponse(BaseModel):
    success: bool
    user_id: str
    entries_deleted: int


class SystemHealthResponse(BaseModel):
    backend: str
    database: str
    face_model: str
    fingerprint_model: str
    voice_model: str
    template_protection: str
    fusion_policy: str
    thresholds_loaded: bool
    audit_logging: bool
    template_pool_size: int = 4
    #: "ok" / "no_fingerprint_recorded" / "mismatch" / "no_templates_yet" - whether the currently
    #: configured MASTER_SECRET matches the one that protected this database's existing templates
    #: (backend/key_continuity.py). Never the secret or the fingerprint itself.
    key_continuity: str = "ok"


class EnrollmentStatusResponse(BaseModel):
    """User Enrollment Profile: which modalities the user has enrolled (for one application)."""

    user_id: str
    application_id: str
    #: {"face": bool, "fingerprint": bool, "voice": bool} - enrolled or not.
    modalities: dict[str, bool]
    #: NOT_REGISTERED / REGISTERED / UPDATED / RETRY_REQUIRED (voice only) per modality.
    statuses: dict[str, str]
    #: The user's display name, or the "User <short id>" fallback; `has_display_name` says which.
    display_name: str = ""
    has_display_name: bool = False


class CreateUserRequest(BaseModel):
    """POST /users and POST /user/{id}/display-name. The name is validated by backend/display_names.py."""

    display_name: str


class UserProfileResponse(BaseModel):
    """A user's internal id and display name. The id is what every other endpoint takes; the name is only a label."""

    user_id: str
    display_name: str


class BuildingResponse(BaseModel):
    """A building: authentication context only. No biometric policy."""

    id: str
    name: str
    description: str
    clearance_level: str


class EnrollmentRequiredResponse(BaseModel):
    """The HTTP 409 body when a SUBMITTED modality is not enrolled. Nothing was verified."""

    status: str
    authentication_state: str
    #: Human-readable message (also under the standard `detail` key so generic clients show it).
    detail: str
    user_id: str
    building_id: str | None = None
    submitted_modalities: list[str]
    enrolled_modalities: list[str]
    missing_modalities: list[str]
