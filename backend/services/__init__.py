"""Per-modality services wiring embeddings/pipelines.py + template_protection/ + the database together.

See base_service.py::ModalityService for the shared enroll/authenticate/revoke
logic, and face_service.py/iris_service.py/fingerprint_service.py for the
three thin, modality-specific instantiations `backend/api/*.py` depends on.
"""

from __future__ import annotations

from fastapi import HTTPException, status

from backend.services.base_service import ModalityService

_SUPPORTED_MODALITIES = ("face", "iris", "fingerprint")


def get_service_for_modality(modality: str) -> ModalityService:
    """Resolve a modality name (as it arrives in an API request) to its service.

    Each per-modality module (face_service.py etc.) only constructs its
    pipeline on first actual use (see their `lru_cache`d `get_*_service`
    functions), so requesting "iris" here never triggers loading the face or
    fingerprint checkpoint.
    """
    if modality == "face":
        from backend.services.face_service import get_face_service

        return get_face_service()
    if modality == "iris":
        from backend.services.iris_service import get_iris_service

        return get_iris_service()
    if modality == "fingerprint":
        from backend.services.fingerprint_service import get_fingerprint_service

        return get_fingerprint_service()

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"Unsupported modality {modality!r}; expected one of {_SUPPORTED_MODALITIES}",
    )
