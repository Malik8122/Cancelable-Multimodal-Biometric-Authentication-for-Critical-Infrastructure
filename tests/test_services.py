"""Offline tests for backend/services/*.py, exercised directly (no HTTP layer).

Uses the repo's existing synthetic-image fixtures (tests/conftest.py) so
these run without a GPU or a downloaded dataset - face and fingerprint use
their real trained checkpoints (models/{face,fingerprint}/saved/), iris runs
in BaseEmbedder's mock-mode fallback (no checkpoint trained yet, see
docs/ROADMAP.md).

Loading the real face/fingerprint checkpoints needs `facenet-pytorch` /
`torchvision` respectively - optional, heavy ML dependencies not every dev
environment has installed (see tests/test_preprocessing.py for the same
`pytest.importorskip` convention already used elsewhere in this repo).
"""

from __future__ import annotations

import pytest

from backend.services.iris_service import get_iris_service

APPLICATION_ID = "capstone-demo"


def _get_face_service():
    pytest.importorskip("facenet_pytorch", reason="facenet-pytorch not installed in this environment")
    from backend.services.face_service import get_face_service

    return get_face_service()


def _get_fingerprint_service():
    pytest.importorskip("torchvision", reason="torchvision not installed in this environment")
    from backend.services.fingerprint_service import get_fingerprint_service

    return get_fingerprint_service()


def test_enroll_then_authenticate_with_the_same_image_succeeds(db_session, synthetic_fingerprint_image):
    # Uses fingerprint (not face) as the real-checkpoint modality here: face's
    # real preprocessing (MTCNN via facenet-pytorch) correctly rejects any
    # synthetic image as "no face detected" (see
    # tests/test_preprocessing.py::test_face_preprocessing_requires_facenet_pytorch_and_detects_no_face_on_noise),
    # so it can't exercise a real enroll/authenticate roundtrip offline.
    service = _get_fingerprint_service()

    pool = service.enroll(db_session, synthetic_fingerprint_image, user_id="U001", application_id=APPLICATION_ID)
    enrolled = pool[0]
    assert enrolled.modality == "fingerprint"
    assert enrolled.key_version == 1
    assert enrolled.is_active is True
    assert len(pool) == 4

    result = service.authenticate(db_session, synthetic_fingerprint_image, user_id="U001", application_id=APPLICATION_ID)
    assert result.authenticated is True
    assert result.score >= result.threshold


def test_authenticate_without_enrollment_fails_closed(db_session, synthetic_fingerprint_image):
    service = _get_fingerprint_service()
    result = service.authenticate(
        db_session, synthetic_fingerprint_image, user_id="never-enrolled", application_id=APPLICATION_ID
    )
    assert result.authenticated is False
    assert result.score == 0.0


def test_revoke_promotes_the_next_set_and_the_same_biometric_still_authenticates(db_session, synthetic_fingerprint_image):
    from backend.database import crud

    service = _get_fingerprint_service()
    pool = service.enroll(db_session, synthetic_fingerprint_image, user_id="U001", application_id=APPLICATION_ID)
    original_bytes = pool[0].protected_template

    revoked, promoted = crud.revoke_active_set_and_promote(db_session, "U001", APPLICATION_ID)
    assert (revoked, promoted) == (1, 2)
    summaries = {s.version: s.status for s in crud.get_template_sets(db_session, "U001", APPLICATION_ID)}
    assert summaries == {1: "REVOKED", 2: "ACTIVE", 3: "STANDBY", 4: "STANDBY"}

    active = crud.get_active_template(db_session, "U001", "fingerprint", APPLICATION_ID)
    assert active.template_set_version == 2 and active.key_version == 2 and active.is_active is True
    # a different key over the same embedding: genuinely different template bits
    assert active.protected_template != original_bytes

    result = service.authenticate(db_session, synthetic_fingerprint_image, user_id="U001", application_id=APPLICATION_ID)
    assert result.authenticated is True
    assert result.key_version == 2 and result.template_set_version == 2


def test_revoke_without_a_prior_enrollment_is_not_found(db_session):
    import pytest as _pytest

    from backend.database import crud

    with _pytest.raises(crud.TemplateNotFoundError):
        crud.revoke_active_set_and_promote(db_session, "U004", APPLICATION_ID)
    assert crud.get_user(db_session, "U004") is None


def test_iris_service_runs_end_to_end_in_mock_mode(db_session, synthetic_eye_image):
    """No trained iris checkpoint exists yet - this proves enrollment/authentication
    still works end-to-end against BaseEmbedder's mock-mode fallback."""
    service = get_iris_service()
    assert service.pipeline.is_mock is True

    service.enroll(db_session, synthetic_eye_image, user_id="U002", application_id=APPLICATION_ID)
    result = service.authenticate(db_session, synthetic_eye_image, user_id="U002", application_id=APPLICATION_ID)
    assert result.authenticated is True


def test_fingerprint_service_enroll_and_authenticate(db_session, synthetic_fingerprint_image):
    service = _get_fingerprint_service()
    service.enroll(db_session, synthetic_fingerprint_image, user_id="U003", application_id=APPLICATION_ID)
    result = service.authenticate(db_session, synthetic_fingerprint_image, user_id="U003", application_id=APPLICATION_ID)
    assert result.authenticated is True


def test_get_face_service_returns_the_same_cached_instance():
    service = _get_face_service()
    assert service is _get_face_service()


def test_get_iris_service_returns_the_same_cached_instance():
    assert get_iris_service() is get_iris_service()


def test_concurrent_active_template_insert_is_rejected_at_the_db_level(db_session, synthetic_eye_image, monkeypatch):
    """Two racing requests both read 'no template sets yet' before either commits, then both
    try to create the ACTIVE set. Reproduced deterministically by making the second
    `save_modality_templates` see no existing rows, so its insert collides with the first
    call's committed ACTIVE row at the DB level (partial unique indexes on `ProtectedTemplate`).
    That collision, and its ConcurrentEnrollmentError, are what is under test - the patch only
    forces the timing."""
    from backend.database import crud
    from backend.database.crud import ConcurrentEnrollmentError

    get_iris_service().enroll(db_session, synthetic_eye_image, user_id="U005", application_id=APPLICATION_ID)

    monkeypatch.setattr(crud, "get_set_rows", lambda *args, **kwargs: [])
    with pytest.raises(ConcurrentEnrollmentError):
        crud.save_modality_templates(
            db_session,
            user_id="U005",
            application_id=APPLICATION_ID,
            modality="iris",
            template_version=1,
            output_bits=128,
            entries={1: crud.PoolEntry(key_version=99, protected_template=b"\x00")},
        )
