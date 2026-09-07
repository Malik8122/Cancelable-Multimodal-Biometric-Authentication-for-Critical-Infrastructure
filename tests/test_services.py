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


def test_enroll_then_authenticate_with_the_same_image_succeeds(db_session, random_rgb_image):
    service = _get_face_service()

    enrolled = service.enroll(db_session, random_rgb_image, user_id="U001", application_id=APPLICATION_ID)
    assert enrolled.modality == "face"
    assert enrolled.key_version == 1
    assert enrolled.is_active is True

    result = service.authenticate(db_session, random_rgb_image, user_id="U001", application_id=APPLICATION_ID)
    assert result.authenticated is True
    assert result.score >= result.threshold


def test_authenticate_without_enrollment_fails_closed(db_session, random_rgb_image):
    service = _get_face_service()
    result = service.authenticate(db_session, random_rgb_image, user_id="never-enrolled", application_id=APPLICATION_ID)
    assert result.authenticated is False
    assert result.score == 0.0


def test_revoke_bumps_key_version_and_regenerates_the_template(db_session, random_rgb_image):
    from backend.database import crud

    service = _get_face_service()
    original = service.enroll(db_session, random_rgb_image, user_id="U001", application_id=APPLICATION_ID)
    original_bytes = original.protected_template

    revocation = service.revoke(db_session, random_rgb_image, user_id="U001", application_id=APPLICATION_ID)
    assert revocation.old_key_version == 1
    assert revocation.new_key_version == 2
    assert revocation.template.key_version == 2
    assert revocation.template.is_active is True

    # The stored template content actually changed - proves rotation
    # regenerated the template, not just bumped a version number.
    assert revocation.template.protected_template != original_bytes

    # The old (key_version=1) row is no longer the active one.
    active = crud.get_active_template(db_session, "U001", "face", APPLICATION_ID)
    assert active.key_version == 2
    assert active.template_id == revocation.template.template_id

    # Authenticating again re-derives the key from the *current*
    # (post-rotation) key_version, so the same biometric still authenticates.
    result = service.authenticate(db_session, random_rgb_image, user_id="U001", application_id=APPLICATION_ID)
    assert result.authenticated is True


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


def test_revoke_without_a_prior_enrollment_still_creates_the_user_row(db_session, synthetic_eye_image):
    """Regression test: revoke() must create the User row like enroll() does,
    or the resulting ProtectedTemplate is orphaned - reachable by
    /authenticate but invisible to (and undeletable via) /user/{id}."""
    from backend.database import crud

    service = get_iris_service()
    assert crud.get_user(db_session, "U004") is None

    revocation = service.revoke(db_session, synthetic_eye_image, user_id="U004", application_id=APPLICATION_ID)
    assert revocation.old_key_version == 0
    assert revocation.new_key_version == 1

    user = crud.get_user(db_session, "U004")
    assert user is not None
    assert crud.get_templates_for_user(db_session, "U004") == [revocation.template]

    deleted_count = crud.delete_user_templates(db_session, "U004")
    assert deleted_count == 1


def test_concurrent_active_template_insert_is_rejected_at_the_db_level(db_session, synthetic_eye_image, monkeypatch):
    """Simulates two racing requests both reading 'no active template yet'
    before either commits, then both trying to insert their own active row -
    exactly the race crud.save_template's read-then-deactivate-then-insert
    sequence can't prevent on its own (see its docstring): the second call's
    `get_active_template` read happens before the first call's insert is
    visible to it, so it doesn't know to deactivate anything.

    Reproduced deterministically here by patching `get_active_template` to
    always report "nothing active" for the second `save_template` call, so
    it skips deactivation and its insert collides with the first call's
    already-committed active row at the DB level. That collision, and its
    ConcurrentEnrollmentError, are the real thing under test - the patch
    only forces the timing.
    """
    from backend.database import crud
    from backend.database.crud import ConcurrentEnrollmentError

    get_iris_service().enroll(db_session, synthetic_eye_image, user_id="U005", application_id=APPLICATION_ID)

    monkeypatch.setattr(crud, "get_active_template", lambda *args, **kwargs: None)
    with pytest.raises(ConcurrentEnrollmentError):
        crud.save_template(
            db_session,
            user_id="U005",
            modality="iris",
            application_id=APPLICATION_ID,
            template_version=1,
            key_version=2,
            output_bits=128,
            protected_template=b"\x00",
        )
