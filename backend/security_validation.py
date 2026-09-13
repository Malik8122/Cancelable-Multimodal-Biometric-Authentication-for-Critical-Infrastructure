"""Runtime security invariant checks, run on every authentication attempt.

Distinct from a normal "no match" (which is an expected, everyday outcome
with `authenticated=False`): everything checked here is a *should-never-
happen* structural invariant about the cryptographic/template-protection
pipeline itself - if one of these is ever false, something is wrong with the
backend's own state (a corrupted row, a config drift, a code regression),
not with the caller's biometric sample. `ModalityService.authenticate`
(backend/services/base_service.py) runs this before trusting a comparison
result; a failure here always fails closed (never authenticates), and is
mapped to a 500 by `backend/main.py`'s exception handler rather than a
normal 200/`authenticated: false` - the caller should be able to tell "you
weren't recognized" apart from "the backend's security invariants broke".
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from backend.config import Settings
from backend.database.models import ProtectedTemplate
from template_protection.biohash import TEMPLATE_FORMAT_VERSION
from template_protection.hkdf_keys import KeyMaterial, SEED_LENGTH_BYTES


class SecurityValidationError(RuntimeError):
    """A required security invariant did not hold; the caller must not be authenticated."""


@dataclass(frozen=True)
class SecurityValidationReport:
    """One row per check, so a failure is diagnosable rather than a bare bool."""

    checks: dict[str, bool]

    @property
    def ok(self) -> bool:
        return all(self.checks.values())

    def failed_checks(self) -> list[str]:
        return [name for name, passed in self.checks.items() if not passed]


def validate_master_secret(settings: Settings) -> bool:
    """A non-empty secret was actually loaded - `Settings.master_secret` has
    no default (backend/config.py), so this mainly guards against it somehow
    being set to an empty string via `.env`."""
    return bool(settings.master_secret) and len(settings.master_secret) > 0


def validate_key_material(key: KeyMaterial) -> bool:
    """HKDF actually ran and produced three independent, full-length seeds
    (see template_protection/hkdf_keys.py::derive_key) - not all-zero, not
    truncated, not accidentally identical to each other."""
    seeds = (key.projection_seed, key.permutation_seed, key.threshold_seed)
    if any(len(seed) != SEED_LENGTH_BYTES for seed in seeds):
        return False
    if any(seed == b"\x00" * SEED_LENGTH_BYTES for seed in seeds):
        return False
    return len({seeds[0], seeds[1], seeds[2]}) == 3


def validate_protected_template_bits(template_bits: np.ndarray, expected_output_bits: int) -> bool:
    """BioHash actually ran and produced a bit vector of the expected length
    (see template_protection/biohash.py::generate_template) - catches a
    silently-mismatched `output_bits` before it corrupts a comparison."""
    return template_bits.ndim == 1 and template_bits.shape[0] == expected_output_bits


def validate_stored_template(stored: ProtectedTemplate) -> bool:
    """The row `crud.get_active_template` returned is actually usable:
    active, a template-format version this codebase knows how to unpack, a
    positive key_version, and a protected_template blob whose packed byte
    length is consistent with its own declared `output_bits` (see
    template_protection/utils.py::pack_bits - `ceil(output_bits / 8)` bytes)."""
    if not stored.is_active:
        return False
    if stored.template_version != TEMPLATE_FORMAT_VERSION:
        return False
    if stored.key_version < 1:
        return False
    expected_bytes = (stored.output_bits + 7) // 8
    return len(stored.protected_template) == expected_bytes


def validate_authentication(
    *,
    settings: Settings,
    stored: ProtectedTemplate,
    key: KeyMaterial,
    candidate_template_bits: np.ndarray,
) -> SecurityValidationReport:
    """Run every check for one authentication attempt against `stored`.

    Called from `ModalityService.authenticate` after the candidate template
    has been generated but before its score is trusted - see
    backend/services/base_service.py.
    """
    checks = {
        "master_secret_loaded": validate_master_secret(settings),
        "hkdf_key_material_valid": validate_key_material(key),
        "biohash_template_valid": validate_protected_template_bits(candidate_template_bits, stored.output_bits),
        "stored_template_valid": validate_stored_template(stored),
    }
    return SecurityValidationReport(checks=checks)


def assert_valid(report: SecurityValidationReport, *, modality: str, user_id: str) -> None:
    """Raise `SecurityValidationError` if any check failed - the fail-closed entry point."""
    if not report.ok:
        raise SecurityValidationError(
            f"Security validation failed for modality={modality!r} user_id={user_id!r}: "
            f"{', '.join(report.failed_checks())}"
        )
