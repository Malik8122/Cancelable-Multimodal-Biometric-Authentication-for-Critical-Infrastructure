"""Pydantic request/response models for the HTTP API.

Kept separate from `models.py` (the SQLAlchemy ORM layer) so the wire format
can evolve independently of the storage schema - e.g. `EnrollResponse` never
exposes `protected_template` at all, even though the ORM row has it.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class EnrollResponse(BaseModel):
    success: bool
    user_id: str
    modality: str
    template_version: int
    key_version: int
    template_id: str


class AuthenticateResponse(BaseModel):
    user_id: str
    modality: str
    score: float
    threshold: float
    authenticated: bool
    #: 1 - score (fraction of differing bits) - the Hamming-distance
    #: complement of `score`, exposed for debugging/evaluation per the
    #: hardening sprint's "per-modality score validation" requirement.
    distance: float = 0.0
    #: Which `template_protection.biohash.TEMPLATE_FORMAT_VERSION` /
    #: HKDF `key_version` the stored template being compared against was
    #: generated under - 0 when nothing is enrolled (no stored template to
    #: report a version for).
    template_version: int = 0
    key_version: int = 0


class ModalityAuthenticationResult(BaseModel):
    """One modality's contribution to a `POST /authenticate/fusion` response."""

    score: float
    threshold: float
    authenticated: bool
    distance: float = 0.0
    template_version: int = 0
    key_version: int = 0


class FusionAuthenticateResponse(BaseModel):
    user_id: str
    modalities_used: list[str]
    results: dict[str, ModalityAuthenticationResult]
    fused_score: float
    fusion_threshold: float
    authenticated: bool
    #: Which `fusion.config.FusionPolicy` decided `authenticated` - see
    #: fusion/policy.py::evaluate_fusion_policy.
    fusion_policy: str = "WEIGHTED"
    #: The modalities actually submitted this request (same set as
    #: `modalities_used` - kept as a separate field because the hardening
    #: spec asks for it under this exact name).
    required_modalities: list[str] = Field(default_factory=list)
    #: Modalities whose own `authenticated` was True / False this request.
    matched_modalities: list[str] = Field(default_factory=list)
    failed_modalities: list[str] = Field(default_factory=list)


class RevokeRequest(BaseModel):
    user_id: str
    modality: str
    application_id: str | None = None


class RevokeResponse(BaseModel):
    success: bool
    user_id: str
    modality: str
    old_key_version: int
    new_key_version: int
    template_id: str


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
    similarity_scores: dict[str, float]
    thresholds_used: dict[str, float]
    fusion_score: float | None = None
    fusion_policy: str | None = None
    authenticated: bool
    latency_ms: int
    template_versions: dict[str, int]
    key_versions: dict[str, int]


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
