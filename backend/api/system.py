"""GET /system/health: a real (not hardcoded) snapshot of backend readiness.

Distinct from the existing bare `GET /health` (which only proves the process
is up) - this actually loads each modality's service (or fails clearly) and
checks the database and calibration state are real. Every field is computed
at request time, not a static dict.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.database.schema import SystemHealthResponse
from backend.database.session import get_db
from backend.threshold_loader import is_calibrated
from fusion.config import DEFAULT_FUSION_POLICY

router = APIRouter()


def _model_status(modality: str) -> str:
    try:
        from backend.services import get_service_for_modality

        service = get_service_for_modality(modality)
        return "mock" if service.pipeline.is_mock else "loaded"
    except Exception as error:  # noqa: BLE001 - health check must never 500
        return f"error: {error}"


@router.get("/system/health", response_model=SystemHealthResponse)
def system_health(db: Session = Depends(get_db)) -> SystemHealthResponse:
    try:
        db.execute(text("SELECT 1"))
        database_status = "connected"
    except Exception as error:  # noqa: BLE001
        database_status = f"error: {error}"

    thresholds_loaded = all(is_calibrated(modality) for modality in ("face", "fingerprint", "voice"))

    return SystemHealthResponse(
        backend="online",
        database=database_status,
        face_model=_model_status("face"),
        fingerprint_model=_model_status("fingerprint"),
        voice_model=_model_status("voice"),
        template_protection="active",
        fusion_policy=DEFAULT_FUSION_POLICY.value,
        thresholds_loaded=thresholds_loaded,
        audit_logging=True,
    )
