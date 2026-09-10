"""Backend configuration, loaded from environment variables / a `.env` file.

No path or secret in this module is hardcoded as a literal default that would
actually work in production: `master_secret` has **no default at all** (a
missing `MASTER_SECRET` fails fast at startup rather than silently running
with a guessable key), and every other setting's default is either a
clearly-local development value (`sqlite:///./biometric.db`) or reuses a
value already defined elsewhere in the repo (`embeddings.constants.DEFAULT_CHECKPOINTS`)
rather than a second, possibly-drifting copy of it.

See `.env.example` for the variables this reads and
`docs/BACKEND_API.md`/README for how tests supply `MASTER_SECRET` without a
real `.env` file.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from embeddings.constants import DEFAULT_CHECKPOINTS
from template_protection.biohash import DEFAULT_OUTPUT_BITS


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    #: Server-side secret all HKDF key derivation is rooted in
    #: (see template_protection/hkdf_keys.py::derive_key). Required - there
    #: is no safe default for a value whose entire purpose is to be secret.
    master_secret: str

    #: SQLAlchemy database URL. SQLite by default, matching the spec's scope
    #: ("SQLite via SQLAlchemy") - swapping this to Postgres/MySQL later
    #: needs no code change beyond this URL and the SQLite-specific
    #: `connect_args` in backend/database/session.py.
    database_url: str = "sqlite:///./biometric.db"

    #: Default application ID used when a request doesn't specify one -
    #: primarily for local/demo use; real multi-tenant use should always pass
    #: an explicit application_id per request.
    application_id: str = "capstone-demo"

    #: Per-modality checkpoint paths, defaulting to the same
    #: `embeddings/constants.py::DEFAULT_CHECKPOINTS` locations the Colab/Kaggle
    #: training pipelines already write to - keeps one source of truth for
    #: "where does modality X's checkpoint live" rather than a second,
    #: independently-drifting copy of that mapping.
    face_model_path: Path = DEFAULT_CHECKPOINTS["face"]
    iris_model_path: Path = DEFAULT_CHECKPOINTS["iris"]
    fingerprint_model_path: Path = DEFAULT_CHECKPOINTS["fingerprint"]
    voice_model_path: Path = DEFAULT_CHECKPOINTS["voice"]

    #: Default protected-template length in bits (see
    #: template_protection/biohash.py::DEFAULT_OUTPUT_BITS for why 128 is
    #: safe across every modality's embedding dimension).
    template_bits: int = DEFAULT_OUTPUT_BITS

    #: Upload validation (spec: "reject oversized uploads", "validate
    #: uploaded file types").
    max_upload_size_bytes: int = 5_000_000
    allowed_content_types: tuple[str, ...] = ("image/png", "image/jpeg", "image/jpg", "image/bmp")
    #: Voice's uploads are audio, not images - browsers/tools report WAV
    #: under several different MIME strings, so all the common ones are
    #: accepted rather than picking one and rejecting the others.
    allowed_audio_content_types: tuple[str, ...] = ("audio/wav", "audio/wave", "audio/x-wav", "audio/vnd.wave")

    #: Acceptance threshold for `template_protection.matcher.accept`'s Hamming
    #: similarity score (1.0 = identical templates, 0.0 = fully opposite).
    #: 0.9 is a conservative starting point for a 128-bit template; real
    #: deployments should tune this from `evaluation/privacy_metrics.py`'s
    #: EER output on their own enrolled population rather than trusting this
    #: default blindly.
    match_threshold: float = 0.9


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance for FastAPI's `Depends(get_settings)`.

    `lru_cache` means `.env` is only read once per process; tests that need a
    different `MASTER_SECRET`/database mid-run should call
    `get_settings.cache_clear()` after `monkeypatch.setenv(...)` (see
    tests/conftest.py).
    """
    return Settings()
