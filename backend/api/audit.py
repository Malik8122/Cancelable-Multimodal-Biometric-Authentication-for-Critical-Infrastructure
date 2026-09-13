"""GET /audit/{user_id}, GET /audit/system, DELETE /audit/{user_id}.

Server-side authentication history, backed by
`backend.database.models.AuditLog` (metadata only - see that model's
docstring for exactly what "metadata only" excludes: no raw image/audio, no
embedding, no protected template, ever).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.database import audit as audit_crud
from backend.database.schema import AuditHistoryResponse, AuditLogEntry, DeleteAuditResponse, SystemAuditResponse
from backend.database.session import get_db

logger = logging.getLogger("backend.api.audit")

router = APIRouter()


def _to_entry(row) -> AuditLogEntry:
    return AuditLogEntry(
        audit_id=row.audit_id,
        timestamp=row.timestamp,
        user_id=row.user_id,
        building_id=row.building_id,
        modality_list=row.modality_list,
        similarity_scores=row.similarity_scores,
        thresholds_used=row.thresholds_used,
        fusion_score=row.fusion_score,
        fusion_policy=row.fusion_policy,
        authenticated=row.authenticated,
        latency_ms=row.latency_ms,
        template_versions=row.template_versions,
        key_versions=row.key_versions,
    )


@router.get("/audit/system", response_model=SystemAuditResponse)
def get_system_audit(
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
) -> SystemAuditResponse:
    """Latest authentication attempts across every user, newest first."""
    rows = audit_crud.get_system_history(db, limit=limit)
    return SystemAuditResponse(entries=[_to_entry(row) for row in rows])


@router.get("/audit/{user_id}", response_model=AuditHistoryResponse)
def get_user_audit(
    user_id: str,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> AuditHistoryResponse:
    """Paginated authentication history for one user, newest first."""
    rows = audit_crud.get_history_for_user(db, user_id, limit=limit, offset=offset)
    total = audit_crud.count_for_user(db, user_id)
    return AuditHistoryResponse(
        user_id=user_id,
        total=total,
        limit=limit,
        offset=offset,
        entries=[_to_entry(row) for row in rows],
    )


@router.delete("/audit/{user_id}", response_model=DeleteAuditResponse)
def delete_user_audit(user_id: str, db: Session = Depends(get_db)) -> DeleteAuditResponse:
    entries_deleted = audit_crud.delete_history_for_user(db, user_id)
    logger.info("Deleted audit history user_id=%s entries_deleted=%d", user_id, entries_deleted)
    return DeleteAuditResponse(success=True, user_id=user_id, entries_deleted=entries_deleted)
