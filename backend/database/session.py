"""SQLAlchemy engine/session setup for the FastAPI backend.

FastAPI runs synchronous ("def", not "async def") path operations in a
threadpool (see backend/api/*.py), so more than one request can be in flight
on different threads at once. Two things follow from that:

- The engine needs `connect_args={"check_same_thread": False}` for SQLite -
  its default same-thread check would otherwise reject a connection used
  from a different thread than the one that created it.
- Sessions are created per-request (`get_db`, a FastAPI dependency generator)
  rather than shared as a module-level global, so concurrent requests never
  share a `Session` object across threads.

The engine itself is built lazily (on first use, via `get_engine()`) rather
than at import time, specifically so importing this module never triggers
`backend.config.get_settings()` before a caller (a test fixture, or real
startup after `.env` is in place) has had a chance to supply `MASTER_SECRET` -
an eager module-level engine would fail at import time in exactly that
ordering.
"""

from __future__ import annotations

from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.config import get_settings
from backend.database.models import Base


@lru_cache
def get_engine() -> Engine:
    settings = get_settings()
    connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
    return create_engine(settings.database_url, connect_args=connect_args)


@lru_cache
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, autocommit=False)


def init_db() -> None:
    """Create every table that doesn't already exist. Called once at app startup."""
    Base.metadata.create_all(bind=get_engine())


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: one Session per request, always closed afterward."""
    db = get_session_factory()()
    try:
        yield db
    finally:
        db.close()
