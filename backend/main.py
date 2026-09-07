"""FastAPI application entrypoint.

Run locally with:

    uvicorn backend.main:app --reload

See docs/BACKEND_API.md for the full endpoint reference.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from backend.api import authenticate, enroll, revoke, user, verify
from backend.database.crud import ConcurrentEnrollmentError
from backend.database.session import init_db

logging.basicConfig(level=logging.INFO)


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
