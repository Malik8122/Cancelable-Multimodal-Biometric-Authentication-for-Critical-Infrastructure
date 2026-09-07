"""Minimal schema migration helper.

A capstone-scope SQLite backend doesn't warrant a full migration framework
(Alembic) - this is a deliberate scope reduction, not an oversight. What's
here covers the two things that actually matter for this project's lifetime:
creating the schema on first run (`ensure_schema`, a thin wrapper around
`backend.database.session.init_db`) and a defensive check that a freshly
created database's tables have the columns the current `models.py` expects,
which catches "someone changed models.py but didn't delete their local
biometric.db" during development.

If this project ever needs real migrations (e.g. a Postgres deployment with
existing production data), that's the point to adopt Alembic rather than
extend this file.
"""

from __future__ import annotations

from sqlalchemy import inspect

from backend.database.models import Base
from backend.database.session import get_engine, init_db


def ensure_schema() -> None:
    """Create any missing tables. Safe to call on every app startup."""
    init_db()


def schema_matches_models() -> bool:
    """True if every table/column `models.py` declares actually exists in the DB.

    Does not check for extra columns (a superset is fine) or type mismatches -
    just presence, which is enough to catch the common "stale local .db file"
    development mistake early with a clear error instead of a confusing
    SQLAlchemy exception mid-request.
    """
    inspector = inspect(get_engine())
    existing_tables = set(inspector.get_table_names())

    for table_name, table in Base.metadata.tables.items():
        if table_name not in existing_tables:
            return False
        existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
        expected_columns = {column.name for column in table.columns}
        if not expected_columns.issubset(existing_columns):
            return False
    return True
