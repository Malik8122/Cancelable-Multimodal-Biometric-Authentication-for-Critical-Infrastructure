"""SQLAlchemy ORM models: users and their protected biometric templates.

`ProtectedTemplate.protected_template` is the *only* biometric-derived data
ever persisted, and it holds exactly what
`template_protection.biohash.generate_template` returns, packed to bytes
(see `template_protection.utils.pack_bits`) - never a raw image, never a raw
`BaseEmbedder.extract_embedding()` output. `output_bits` is stored purely as
metadata needed to unpack those bytes back into a bit array (see
`template_protection.utils.unpack_bits`), not as anything that reveals
embedding content.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, LargeBinary, String, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    #: Caller-supplied external identifier (e.g. "U001" from the spec's
    #: examples), not an auto-incrementing surrogate key - this is what
    #: `user_id` means everywhere in the API and in template_protection's
    #: key derivation.
    id: Mapped[str] = mapped_column(String, primary_key=True)
    username: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    templates: Mapped[list["ProtectedTemplate"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class ProtectedTemplate(Base):
    __tablename__ = "protected_templates"

    template_id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    modality: Mapped[str] = mapped_column(String, index=True)
    application_id: Mapped[str] = mapped_column(String, index=True)

    #: template_protection.biohash.TEMPLATE_FORMAT_VERSION at generation time -
    #: bumped only if the transform algorithm itself changes, independent of
    #: key_version below.
    template_version: Mapped[int] = mapped_column(Integer)

    #: Which HKDF key_version produced this template (see
    #: template_protection/hkdf_keys.py) - bumped on every
    #: `/revoke-template` call for this (user, modality, application).
    key_version: Mapped[int] = mapped_column(Integer)

    #: Bit-length of `protected_template` before packing, needed to unpack it
    #: back into a bit array (template_protection.utils.unpack_bits).
    output_bits: Mapped[int] = mapped_column(Integer)

    #: The protected template itself, packed to bytes
    #: (template_protection.utils.pack_bits). Never a raw image or embedding.
    protected_template: Mapped[bytes] = mapped_column(LargeBinary)

    #: Revoking a template deactivates the old row rather than deleting it,
    #: so there's an audit trail of past key rotations; only one row per
    #: (user_id, modality, application_id) may be active at a time. That is
    #: primarily enforced here at the schema level (the partial unique index
    #: below) - backend/database/crud.py::save_template's read-then-insert
    #: sequence isn't itself atomic under concurrent requests (FastAPI runs
    #: sync routes in a threadpool), so without this index two racing
    #: enroll/revoke calls for the same (user, modality, application) could
    #: each insert their own "active" row. With it, the second insert raises
    #: `IntegrityError` instead of silently leaving two active rows behind -
    #: turning a silent correctness bug into a loud, retryable one.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    user: Mapped["User"] = relationship(back_populates="templates")

    __table_args__ = (
        # `text(...)`, not the `is_active` column expression, because at
        # class-body evaluation time `is_active` above is still a bare
        # `MappedColumn` construct, not yet a compilable SQL expression -
        # raw SQL text sidesteps that ordering issue entirely.
        Index(
            "ux_one_active_template_per_context",
            "user_id",
            "modality",
            "application_id",
            unique=True,
            sqlite_where=text("is_active = 1"),
        ),
    )
