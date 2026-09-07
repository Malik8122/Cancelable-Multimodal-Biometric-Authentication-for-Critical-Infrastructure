"""GET /user/{id}: enrolled modalities. DELETE /user/{id}: delete a user's protected templates."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import crud
from backend.database.schema import DeleteUserResponse, EnrolledModality, UserModalitiesResponse
from backend.database.session import get_db

logger = logging.getLogger("backend.api.user")

router = APIRouter()


@router.get("/user/{user_id}", response_model=UserModalitiesResponse)
def get_user_modalities(user_id: str, db: Session = Depends(get_db)) -> UserModalitiesResponse:
    user = crud.get_user(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No such user: {user_id!r}")

    templates = crud.get_templates_for_user(db, user_id, active_only=True)
    return UserModalitiesResponse(
        user_id=user_id,
        enrolled_modalities=[
            EnrolledModality(
                modality=template.modality,
                application_id=template.application_id,
                template_version=template.template_version,
                key_version=template.key_version,
                created_at=template.created_at,
            )
            for template in templates
        ],
    )


@router.delete("/user/{user_id}", response_model=DeleteUserResponse)
def delete_user(user_id: str, db: Session = Depends(get_db)) -> DeleteUserResponse:
    templates_deleted = crud.delete_user_templates(db, user_id)
    logger.info("Deleted user_id=%s templates_deleted=%d", user_id, templates_deleted)
    return DeleteUserResponse(success=True, user_id=user_id, templates_deleted=templates_deleted)
