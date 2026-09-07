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
