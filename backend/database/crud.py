"""Plain CRUD functions over `backend/database/models.py`.

Every function takes a `Session` explicitly (from `backend/database/session.py::get_db`)
rather than reading a global - keeps these functions usable both from
`backend/services/*.py` (one session per HTTP request) and directly from
tests (tests/test_database.py) without any FastAPI machinery involved.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.database.models import ProtectedTemplate, User


class ConcurrentEnrollmentError(RuntimeError):
    """Raised when two racing requests both tried to become the active template.

    FastAPI runs sync routes (enroll/authenticate/revoke-template) in a
    threadpool, so two requests for the same (user_id, modality,
    application_id) can run concurrently. `save_template`'s
    read-then-deactivate-then-insert isn't atomic, so both could otherwise
    insert an "active" row; the partial unique index on
    `models.py::ProtectedTemplate` (`ux_one_active_template_per_context`)
    turns the second insert into an `IntegrityError`, which this wraps into a
    clearer, backend-layer-specific error `backend/api/*.py` can map to a
    `409 Conflict` instead of a bare 500.
    """


def get_or_create_user(db: Session, user_id: str, username: str | None = None) -> User:
    user = db.get(User, user_id)
    if user is not None:
        return user
    user = User(id=user_id, username=username)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user(db: Session, user_id: str) -> User | None:
    return db.get(User, user_id)


def get_active_template(db: Session, user_id: str, modality: str, application_id: str) -> ProtectedTemplate | None:
    statement = select(ProtectedTemplate).where(
        ProtectedTemplate.user_id == user_id,
        ProtectedTemplate.modality == modality,
        ProtectedTemplate.application_id == application_id,
        ProtectedTemplate.is_active.is_(True),
    )
    return db.execute(statement).scalar_one_or_none()


def next_key_version(db: Session, user_id: str, modality: str, application_id: str) -> int:
    """The key_version a *new* enrollment/revocation for this context should use.

    1 if nothing is enrolled yet for (user, modality, application); otherwise
    one more than whatever the current active template's key_version is.
    """
    active = get_active_template(db, user_id, modality, application_id)
    return 1 if active is None else active.key_version + 1


def save_template(
    db: Session,
    *,
    user_id: str,
    modality: str,
    application_id: str,
    template_version: int,
    key_version: int,
    output_bits: int,
    protected_template: bytes,
) -> ProtectedTemplate:
    """Insert a new active protected template, deactivating any prior active one.

    Deactivating (rather than deleting) the previous row is what makes
    `/revoke-template` verifiably invalidate the old template - see
    docs/TEMPLATE_PROTECTION.md's revocation workflow - while keeping an
    audit trail of past key rotations. Only one row per
    (user_id, modality, application_id) may be active at a time; this
    function's read-then-deactivate-then-insert sequence is the normal path
    to that, backed by a DB-level partial unique index
    (`models.py::ProtectedTemplate.ux_one_active_template_per_context`) as a
    guardrail against two concurrent requests racing past the read step
    together - see `ConcurrentEnrollmentError`.
    """
    previous_active = get_active_template(db, user_id, modality, application_id)
    if previous_active is not None:
        previous_active.is_active = False
        db.add(previous_active)

    template = ProtectedTemplate(
        user_id=user_id,
        modality=modality,
        application_id=application_id,
        template_version=template_version,
        key_version=key_version,
        output_bits=output_bits,
        protected_template=protected_template,
        is_active=True,
    )
    db.add(template)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise ConcurrentEnrollmentError(
            f"Another request already enrolled an active {modality!r} template for "
            f"user_id={user_id!r}, application_id={application_id!r} concurrently; retry."
        ) from error
    db.refresh(template)
    return template


def get_templates_for_user(db: Session, user_id: str, active_only: bool = True) -> list[ProtectedTemplate]:
    statement = select(ProtectedTemplate).where(ProtectedTemplate.user_id == user_id)
    if active_only:
        statement = statement.where(ProtectedTemplate.is_active.is_(True))
    return list(db.execute(statement).scalars().all())


def delete_user_templates(db: Session, user_id: str) -> int:
    """Delete a user and every protected template they own; returns how many templates were removed.

    Deletes the `User` row (cascading to `ProtectedTemplate` via
    `models.py::User.templates`'s `cascade="all, delete-orphan"`) rather than
    templates alone, matching the spec's `DELETE /user/{id}` semantics.
    """
    user = get_user(db, user_id)
    if user is None:
        return 0
    templates_deleted = len(user.templates)
    db.delete(user)
    db.commit()
    return templates_deleted
