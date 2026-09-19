"""Plain CRUD functions over `backend/database/models.py`.

Every function takes a `Session` explicitly (from `backend/database/session.py::get_db`)
rather than reading a global - usable both from `backend/services/*.py` (one
session per HTTP request) and directly from tests.

Template sets (docs/MULTI_TEMPLATE_ARCHITECTURE.md): a user's credential for
one application is a pool of TEMPLATE SETS. A set (identified by
`template_set_version`) holds one protected template per enrolled modality.
Exactly one set is ACTIVE; the others are STANDBY or REVOKED. Activation and
revocation always move a whole set, in one transaction, so face / fingerprint
/ voice templates change status together and a set is never mixed with
another.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.database.models import (
    STATUS_ACTIVE,
    STATUS_REVOKED,
    STATUS_STANDBY,
    EnrollmentEvent,
    ProtectedTemplate,
    User,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ConcurrentEnrollmentError(RuntimeError):
    """Two racing requests both tried to change the active template set (mapped to HTTP 409).

    The partial unique indexes on `models.py::ProtectedTemplate` turn the
    second, non-atomic read-then-write into an `IntegrityError`, which this
    wraps into a retryable backend-layer error.
    """


class TemplatePoolExhaustedError(RuntimeError):
    """No STANDBY template set is left to promote / no room for another set (mapped to HTTP 409)."""


class TemplateNotFoundError(LookupError):
    """Nothing enrolled / no such standby set (mapped to HTTP 404)."""


@dataclass(frozen=True)
class PoolEntry:
    """One template to persist: the HKDF key version it was generated under, and its packed bits."""

    key_version: int
    protected_template: bytes


@dataclass(frozen=True)
class TemplateSetSummary:
    """Metadata of one template set (never template bytes)."""

    version: int
    status: str
    modalities: list[str]
    key_versions: dict[str, int]
    group_id: str | None
    created_at: datetime | None
    activated_at: datetime | None
    revoked_at: datetime | None
    revoked_reason: str | None


# ----------------------------------------------------------------------------- users


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


# ----------------------------------------------------------------------------- reads


def get_active_template(db: Session, user_id: str, modality: str, application_id: str) -> ProtectedTemplate | None:
    """The modality's row inside the ACTIVE template set (the only one authentication reads)."""
    statement = select(ProtectedTemplate).where(
        ProtectedTemplate.user_id == user_id,
        ProtectedTemplate.modality == modality,
        ProtectedTemplate.application_id == application_id,
        ProtectedTemplate.is_active.is_(True),
    )
    return db.execute(statement).scalar_one_or_none()


def get_set_rows(db: Session, user_id: str, application_id: str) -> list[ProtectedTemplate]:
    """Every template row (any set, any status, any modality) for one (user, application)."""
    statement = (
        select(ProtectedTemplate)
        .where(ProtectedTemplate.user_id == user_id, ProtectedTemplate.application_id == application_id)
        .order_by(ProtectedTemplate.template_set_version, ProtectedTemplate.modality, ProtectedTemplate.key_version)
    )
    return list(db.execute(statement).scalars().all())


def get_active_set_rows(db: Session, user_id: str, application_id: str) -> list[ProtectedTemplate]:
    return [row for row in get_set_rows(db, user_id, application_id) if row.is_active]


def max_key_version(db: Session, user_id: str, modality: str, application_id: str) -> int:
    """Highest key_version ever used for this (user, modality, application), revoked rows included (0 if none).

    Revoked key versions are never reused, so a compromised key can't come
    back through re-enrollment or a newly generated set.
    """
    statement = select(func.max(ProtectedTemplate.key_version)).where(
        ProtectedTemplate.user_id == user_id,
        ProtectedTemplate.modality == modality,
        ProtectedTemplate.application_id == application_id,
    )
    return db.execute(statement).scalar_one() or 0


def next_key_version(db: Session, user_id: str, modality: str, application_id: str) -> int:
    return max_key_version(db, user_id, modality, application_id) + 1


def max_set_version(db: Session, user_id: str, application_id: str) -> int:
    statement = select(func.max(ProtectedTemplate.template_set_version)).where(
        ProtectedTemplate.user_id == user_id, ProtectedTemplate.application_id == application_id
    )
    return db.execute(statement).scalar_one() or 0


def _group_by_set(rows: list[ProtectedTemplate]) -> dict[int, list[ProtectedTemplate]]:
    grouped: dict[int, list[ProtectedTemplate]] = {}
    for row in rows:
        grouped.setdefault(row.template_set_version, []).append(row)
    return grouped


def _set_status(rows: list[ProtectedTemplate]) -> str:
    return rows[0].template_set_status


def live_set_versions(db: Session, user_id: str, application_id: str) -> list[int]:
    """Versions of the ACTIVE and STANDBY sets, ascending."""
    grouped = _group_by_set(get_set_rows(db, user_id, application_id))
    return sorted(version for version, rows in grouped.items() if _set_status(rows) != STATUS_REVOKED)


def standby_set_versions(db: Session, user_id: str, application_id: str) -> list[int]:
    """STANDBY set versions in promotion order: oldest (lowest version) first."""
    grouped = _group_by_set(get_set_rows(db, user_id, application_id))
    return sorted(version for version, rows in grouped.items() if _set_status(rows) == STATUS_STANDBY)


def get_template_sets(db: Session, user_id: str, application_id: str) -> list[TemplateSetSummary]:
    summaries = []
    for version, rows in sorted(_group_by_set(get_set_rows(db, user_id, application_id)).items()):
        key_versions: dict[str, int] = {}
        for row in rows:
            key_versions[row.modality] = max(key_versions.get(row.modality, 0), row.key_version)
        first = rows[0]
        summaries.append(
            TemplateSetSummary(
                version=version,
                status=first.template_set_status,
                modalities=sorted({row.modality for row in rows}),
                key_versions=key_versions,
                group_id=first.template_group_id,
                created_at=first.template_set_created_at or first.created_at,
                activated_at=first.template_set_activated_at,
                revoked_at=first.template_set_revoked_at,
                revoked_reason=next((row.revoked_reason for row in rows if row.template_set_revoked_at), None),
            )
        )
    return summaries


def record_enrollment_event(db: Session, *, user_id: str, application_id: str, modality: str, outcome: str) -> None:
    db.add(EnrollmentEvent(user_id=user_id, application_id=application_id, modality=modality, outcome=outcome))
    db.commit()


def last_enrollment_outcome(db: Session, user_id: str, application_id: str, modality: str) -> str | None:
    statement = (
        select(EnrollmentEvent.outcome)
        .where(
            EnrollmentEvent.user_id == user_id,
            EnrollmentEvent.application_id == application_id,
            EnrollmentEvent.modality == modality,
        )
        .order_by(EnrollmentEvent.created_at.desc())
        .limit(1)
    )
    return db.execute(statement).scalar_one_or_none()


def get_application_ids(db: Session, user_id: str) -> list[str]:
    statement = (
        select(ProtectedTemplate.application_id)
        .where(ProtectedTemplate.user_id == user_id)
        .distinct()
        .order_by(ProtectedTemplate.application_id)
    )
    return list(db.execute(statement).scalars().all())


# ----------------------------------------------------------------------------- writes


def _commit_or_conflict(db: Session, user_id: str, application_id: str) -> None:
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise ConcurrentEnrollmentError(
            f"Another request already changed the template sets of user_id={user_id!r}, "
            f"application_id={application_id!r} concurrently; retry."
        ) from error


def plan_enrollment_sets(db: Session, user_id: str, application_id: str, pool_size: int) -> list[int]:
    """Which template set versions the next modality enrollment must write into.

    The existing live (ACTIVE + STANDBY) sets, so a newly enrolled or
    re-enrolled modality joins every set that can still authenticate; for a
    user with no live sets, `pool_size` brand-new sets (versions continue
    after the highest ever used).
    """
    live = live_set_versions(db, user_id, application_id)
    if live:
        return live
    start = max_set_version(db, user_id, application_id) + 1
    return list(range(start, start + pool_size))


def _row_status_for_set(set_status: str) -> str:
    return STATUS_ACTIVE if set_status == STATUS_ACTIVE else STATUS_STANDBY


def save_modality_templates(
    db: Session,
    *,
    user_id: str,
    application_id: str,
    modality: str,
    template_version: int,
    output_bits: int,
    entries: dict[int, PoolEntry],
) -> list[ProtectedTemplate]:
    """Write one modality's template into each set in `entries` ({set_version: entry}).

    Sets that already exist keep their status and metadata (the new row joins
    them, replacing - as REVOKED, reason "re-enrolled" - any live template
    this modality already had there). Sets that don't exist yet are created:
    the lowest new version ACTIVE if the user has no ACTIVE set, the rest
    STANDBY. One transaction.
    """
    if not entries:
        raise ValueError("At least one template set entry is required.")

    all_rows = get_set_rows(db, user_id, application_id)
    grouped = _group_by_set(all_rows)
    has_active_set = any(_set_status(rows) == STATUS_ACTIVE for rows in grouped.values())

    now = _now()
    for row in all_rows:
        if row.modality == modality and row.template_set_version in entries and row.template_status != STATUS_REVOKED:
            row.template_status = STATUS_REVOKED
            row.is_active = False
            row.revoked_time = now
            row.revoked_reason = "re-enrolled"
    db.flush()

    created: list[ProtectedTemplate] = []
    new_versions = sorted(version for version in entries if version not in grouped)
    first_new_is_active = not has_active_set
    for version in sorted(entries):
        entry = entries[version]
        if version in grouped:
            reference = grouped[version][0]
            set_status = reference.template_set_status
            set_created, set_activated, set_revoked = (
                reference.template_set_created_at,
                reference.template_set_activated_at,
                reference.template_set_revoked_at,
            )
            group_id = reference.template_group_id
        else:
            is_active_set = first_new_is_active and version == new_versions[0]
            set_status = STATUS_ACTIVE if is_active_set else STATUS_STANDBY
            set_created, set_activated, set_revoked = now, (now if is_active_set else None), None
            group_id = str(uuid4())
        row_status = STATUS_REVOKED if set_status == STATUS_REVOKED else _row_status_for_set(set_status)
        row = ProtectedTemplate(
            user_id=user_id,
            application_id=application_id,
            modality=modality,
            template_version=template_version,
            key_version=entry.key_version,
            output_bits=output_bits,
            protected_template=entry.protected_template,
            is_active=row_status == STATUS_ACTIVE,
            template_status=row_status,
            activation_time=set_activated if row_status == STATUS_ACTIVE else None,
            template_group_id=group_id,
            template_index=version,
            template_set_version=version,
            template_set_status=set_status,
            template_set_created_at=set_created,
            template_set_activated_at=set_activated,
            template_set_revoked_at=set_revoked,
        )
        db.add(row)
        created.append(row)
    _commit_or_conflict(db, user_id, application_id)
    for row in created:
        db.refresh(row)
    return created


def append_template_set(
    db: Session,
    *,
    user_id: str,
    application_id: str,
    template_version: int,
    output_bits: int,
    entries: dict[str, PoolEntry],
) -> int:
    """Add one complete new STANDBY template set ({modality: entry}); returns its version."""
    if get_active_set_rows(db, user_id, application_id) == []:
        raise TemplateNotFoundError(f"No active template set for user_id={user_id!r}.")
    version = max_set_version(db, user_id, application_id) + 1
    now = _now()
    group_id = str(uuid4())
    for modality, entry in sorted(entries.items()):
        db.add(
            ProtectedTemplate(
                user_id=user_id,
                application_id=application_id,
                modality=modality,
                template_version=template_version,
                key_version=entry.key_version,
                output_bits=output_bits,
                protected_template=entry.protected_template,
                is_active=False,
                template_status=STATUS_STANDBY,
                template_group_id=group_id,
                template_index=version,
                template_set_version=version,
                template_set_status=STATUS_STANDBY,
                template_set_created_at=now,
            )
        )
    _commit_or_conflict(db, user_id, application_id)
    return version


def _retire_set(rows: list[ProtectedTemplate], reason: str) -> None:
    now = _now()
    for row in rows:
        row.template_set_status = STATUS_REVOKED
        row.template_set_revoked_at = now
        if row.template_status != STATUS_REVOKED:
            row.template_status = STATUS_REVOKED
            row.is_active = False
            row.revoked_time = now
            row.revoked_reason = reason


def _activate_set(rows: list[ProtectedTemplate]) -> None:
    now = _now()
    for row in rows:
        row.template_set_status = STATUS_ACTIVE
        row.template_set_activated_at = now
        if row.template_status != STATUS_REVOKED:
            row.template_status = STATUS_ACTIVE
            row.is_active = True
            row.activation_time = now


def revoke_active_set_and_promote(
    db: Session, user_id: str, application_id: str, reason: str = "revoked by user"
) -> tuple[int, int]:
    """ACTIVE set -> REVOKED and the oldest STANDBY set -> ACTIVE, for every modality at once.

    Returns (revoked_version, promoted_version). Raises `TemplateNotFoundError`
    with nothing enrolled and `TemplatePoolExhaustedError` with no STANDBY set;
    in the latter case nothing changes, so the ACTIVE set keeps working.
    """
    grouped = _group_by_set(get_set_rows(db, user_id, application_id))
    active_version = next((v for v, rows in grouped.items() if _set_status(rows) == STATUS_ACTIVE), None)
    if active_version is None:
        raise TemplateNotFoundError(f"No active template set for user_id={user_id!r}.")
    standby = sorted(v for v, rows in grouped.items() if _set_status(rows) == STATUS_STANDBY)
    if not standby:
        raise TemplatePoolExhaustedError("Template set pool exhausted. Re-enrollment required.")
    promoted_version = standby[0]

    _retire_set(grouped[active_version], reason)
    db.flush()
    _activate_set(grouped[promoted_version])
    _commit_or_conflict(db, user_id, application_id)
    return active_version, promoted_version


def activate_standby_set(db: Session, user_id: str, application_id: str, version: int) -> tuple[int | None, int]:
    """Make STANDBY set `version` the ACTIVE one; the previous ACTIVE set becomes REVOKED.

    Never demotes to STANDBY, so a retired key can't be resurrected. Returns
    (previous_active_version_or_None, new_active_version).
    """
    grouped = _group_by_set(get_set_rows(db, user_id, application_id))
    if version not in grouped or _set_status(grouped[version]) != STATUS_STANDBY:
        raise TemplateNotFoundError(f"No STANDBY template set with version {version} for user_id={user_id!r}.")
    previous = next((v for v, rows in grouped.items() if _set_status(rows) == STATUS_ACTIVE), None)
    if previous is not None:
        _retire_set(grouped[previous], "superseded by manual activation")
        db.flush()
    _activate_set(grouped[version])
    _commit_or_conflict(db, user_id, application_id)
    return previous, version


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
    """Legacy single-template path: one new ACTIVE set (version 1 if none) holding just this modality.

    Kept for callers/tests that predate template sets; enrollment goes through
    `save_modality_templates`.
    """
    previous = get_active_template(db, user_id, modality, application_id)
    version = previous.template_set_version if previous else max(max_set_version(db, user_id, application_id), 1)
    rows = save_modality_templates(
        db,
        user_id=user_id,
        application_id=application_id,
        modality=modality,
        template_version=template_version,
        output_bits=output_bits,
        entries={version: PoolEntry(key_version=key_version, protected_template=protected_template)},
    )
    return rows[0]


def get_templates_for_user(db: Session, user_id: str, active_only: bool = True) -> list[ProtectedTemplate]:
    statement = select(ProtectedTemplate).where(ProtectedTemplate.user_id == user_id)
    if active_only:
        statement = statement.where(ProtectedTemplate.is_active.is_(True))
    return list(db.execute(statement).scalars().all())


def delete_user_templates(db: Session, user_id: str) -> int:
    """Delete a user and every protected template they own; returns how many templates were removed."""
    user = get_user(db, user_id)
    if user is None:
        return 0
    templates_deleted = len(user.templates)
    db.execute(delete(EnrollmentEvent).where(EnrollmentEvent.user_id == user_id))
    db.delete(user)
    db.commit()
    return templates_deleted
