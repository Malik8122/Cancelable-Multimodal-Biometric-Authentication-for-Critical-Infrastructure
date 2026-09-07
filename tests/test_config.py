"""Offline tests for backend/config.py.

Relies on the autouse `test_master_secret` fixture in tests/conftest.py to
supply MASTER_SECRET via the environment (never hardcoded in source).
"""

from __future__ import annotations

import pytest

from backend.config import Settings, get_settings


def test_settings_loads_master_secret_from_environment():
    settings = get_settings()
    assert settings.master_secret == "unit-test-master-secret-not-for-production"


def test_settings_has_sensible_defaults():
    settings = get_settings()
    assert settings.database_url == "sqlite:///./biometric.db"
    assert settings.application_id == "capstone-demo"
    assert settings.template_bits == 128
    assert 0.0 < settings.match_threshold <= 1.0


def test_settings_model_paths_default_to_embeddings_constants():
    from embeddings.constants import DEFAULT_CHECKPOINTS

    settings = get_settings()
    assert settings.face_model_path == DEFAULT_CHECKPOINTS["face"]
    assert settings.iris_model_path == DEFAULT_CHECKPOINTS["iris"]
    assert settings.fingerprint_model_path == DEFAULT_CHECKPOINTS["fingerprint"]


def test_settings_raises_without_master_secret(monkeypatch):
    monkeypatch.delenv("MASTER_SECRET", raising=False)
    with pytest.raises(Exception):
        Settings(_env_file=None)


def test_get_settings_is_cached():
    assert get_settings() is get_settings()
