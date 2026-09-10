"""FastAPI application entrypoint.

Run locally with:

    uvicorn backend.main:app --reload

See docs/BACKEND_API.md for the full endpoint reference.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.api import authenticate, enroll, revoke, user, verify
from backend.database.crud import ConcurrentEnrollmentError
from backend.database.session import init_db

logging.basicConfig(level=logging.INFO)


def _resolve_cors_origins() -> list[str]:
    """Read `CORS_ALLOWED_ORIGINS` (comma-separated) directly from the
    environment rather than via `backend.config.get_settings()`.

    CORS middleware has to be registered at import time - Starlette builds
    its middleware stack on the app's first request and raises if
    `add_middleware` is called afterwards, so this can't be deferred into
    the `lifespan` startup hook either. `get_settings()` requires
    `MASTER_SECRET` to be set; calling it here, at module-import time, would
    make importing this module fail during pytest collection (which happens
    before the `test_master_secret` autouse fixture in `tests/conftest.py`
    has a chance to set it). Every other setting is still read the normal
    lazy way, via `Depends(get_settings)` inside request handlers - this is
    the one deliberate exception, for this one structural reason.
    """
    raw = os.environ.get("CORS_ALLOWED_ORIGINS")
    if not raw:
        return ["http://localhost:5173"]
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Cancelable Multimodal Biometric Authentication API",
    description=(
        "Enrollment, authentication, and revocation over cancelable "
        "(non-invertible-by-design) biometric templates. Only protected "
        "templates are ever persisted - see docs/TEMPLATE_PROTECTION.md."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# Phase 3A dashboard runs on a different origin (Vite dev server) than this
# API - explicit allow-list, never "*", since this API handles biometric
# templates. See backend/config.py::Settings.cors_allowed_origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_resolve_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

app.include_router(enroll.router, tags=["enrollment"])
app.include_router(authenticate.router, tags=["authentication"])
app.include_router(verify.router, tags=["verification"])
app.include_router(revoke.router, tags=["revocation"])
app.include_router(user.router, tags=["user"])


@app.exception_handler(ConcurrentEnrollmentError)
def handle_concurrent_enrollment(_request: Request, exc: ConcurrentEnrollmentError) -> JSONResponse:
    """Two racing enroll/revoke requests for the same context -> 409, not a bare 500.

    See backend/database/crud.py::ConcurrentEnrollmentError and
    backend/database/models.py's partial unique index for why this can
    happen at all under FastAPI's threadpooled sync routes.
    """
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"detail": str(exc)})


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
