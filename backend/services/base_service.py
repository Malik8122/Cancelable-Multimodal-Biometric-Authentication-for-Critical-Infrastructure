"""Shared enroll/authenticate/revoke logic, parameterized by modality.

Face, iris, and fingerprint enrollment/authentication are identical *except*
for which `embeddings.pipelines.ModalityPipeline` does the preprocessing +
embedding - so that difference is the only thing `face_service.py`,
`iris_service.py`, and `fingerprint_service.py` each supply; everything else
(deriving keys, generating/storing/comparing protected templates) lives here
once.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sqlalchemy.orm import Session

from backend.config import Settings
from backend.database import crud
from backend.database.models import ProtectedTemplate
from embeddings.pipelines import ModalityPipeline
from template_protection.biohash import TEMPLATE_FORMAT_VERSION, generate_template
from template_protection.hkdf_keys import derive_key
from template_protection.matcher import accept, compare
from template_protection.revoke import revoke_template
from template_protection.utils import pack_bits, unpack_bits


@dataclass(frozen=True)
class AuthenticationResult:
    score: float
    threshold: float
    authenticated: bool


@dataclass(frozen=True)
class RevocationResult:
    old_key_version: int
    new_key_version: int
    template: ProtectedTemplate


class ModalityService:
    """Enroll/authenticate/revoke for one biometric modality.

    `pipeline` does preprocessing + embedding
    (`embeddings.pipelines.{Face,Iris,Fingerprint}Pipeline`) - this class
    never re-implements or duplicates that; it only ever calls
    `pipeline.embed(raw_image)`.
    """

    def __init__(self, modality: str, pipeline: ModalityPipeline, settings: Settings):
        self.modality = modality
        self.pipeline = pipeline
        self.settings = settings

    def enroll(self, db: Session, raw_image: np.ndarray, user_id: str, application_id: str) -> ProtectedTemplate:
        """Preprocess -> embed -> derive key -> generate + store a protected template.

        Always starts a fresh `key_version` sequence position via
        `crud.next_key_version` rather than reusing key_version=1 blindly, so
        re-enrolling after a revocation naturally continues the same
        rotation history instead of colliding with an old, deactivated
        template's key_version.
        """
        crud.get_or_create_user(db, user_id)
        embedding = self.pipeline.embed(raw_image)

        key_version = crud.next_key_version(db, user_id, self.modality, application_id)
        key = derive_key(
            self.settings.master_secret,
            application_id=application_id,
            user_id=user_id,
            modality=self.modality,
            key_version=key_version,
        )
        template_bits = generate_template(embedding, key, output_bits=self.settings.template_bits)

        return crud.save_template(
            db,
            user_id=user_id,
            modality=self.modality,
            application_id=application_id,
            template_version=TEMPLATE_FORMAT_VERSION,
            key_version=key_version,
            output_bits=self.settings.template_bits,
            protected_template=pack_bits(template_bits),
        )

    def authenticate(self, db: Session, raw_image: np.ndarray, user_id: str, application_id: str) -> AuthenticationResult:
        """Preprocess -> embed -> regenerate the template under the stored key_version -> compare.

        Returns `score=0.0, authenticated=False` (rather than raising) when
        nothing is enrolled for this (user, modality, application) - a
        missing enrollment and a failed match are both "not authenticated"
        from the caller's point of view.
        """
        stored = crud.get_active_template(db, user_id, self.modality, application_id)
        if stored is None:
            return AuthenticationResult(score=0.0, threshold=self.settings.match_threshold, authenticated=False)

        embedding = self.pipeline.embed(raw_image)
        key = derive_key(
            self.settings.master_secret,
            application_id=application_id,
            user_id=user_id,
            modality=self.modality,
            key_version=stored.key_version,
        )
        candidate_template = generate_template(embedding, key, output_bits=stored.output_bits)
        stored_template = unpack_bits(stored.protected_template, num_bits=stored.output_bits)

        score = compare(candidate_template, stored_template, metric="hamming")
        authenticated = accept(score, threshold=self.settings.match_threshold, metric="hamming")
        return AuthenticationResult(score=score, threshold=self.settings.match_threshold, authenticated=authenticated)

    def revoke(self, db: Session, raw_image: np.ndarray, user_id: str, application_id: str) -> RevocationResult:
        """Rotate the key for (user, modality, application) and store the resulting new template.

        A fresh biometric capture (`raw_image`) is required: a protected
        template is a deliberately lossy transform of the embedding (see
        template_protection/biohash.py's non-invertibility discussion), so
        there is no way to derive "the same biometric under a new key" from
        an old *template* alone - only from the embedding again.

        Ensures the `User` row exists (mirroring `enroll`), so that revoking
        a user_id that was never `/enroll`ed doesn't insert a
        `ProtectedTemplate` referencing a nonexistent user - which would
        otherwise be unreachable through `GET`/`DELETE /user/{id}` (both key
        off the `User` row) while still being live for `/authenticate`.
        """
        crud.get_or_create_user(db, user_id)

        # crud.next_key_version already encodes "1 if nothing active, else
        # active.key_version + 1"; reusing it here (rather than re-deriving
        # the same rule from a second get_active_template call) keeps this
        # single rule in one place.
        new_key_version = crud.next_key_version(db, user_id, self.modality, application_id)
        old_key_version = new_key_version - 1

        embedding = self.pipeline.embed(raw_image)
        new_template_bits = revoke_template(
            embedding,
            self.settings.master_secret,
            application_id=application_id,
            user_id=user_id,
            modality=self.modality,
            new_key_version=new_key_version,
            output_bits=self.settings.template_bits,
        )
        saved = crud.save_template(
            db,
            user_id=user_id,
            modality=self.modality,
            application_id=application_id,
            template_version=TEMPLATE_FORMAT_VERSION,
            key_version=new_key_version,
            output_bits=self.settings.template_bits,
            protected_template=pack_bits(new_template_bits),
        )
        return RevocationResult(old_key_version=old_key_version, new_key_version=new_key_version, template=saved)
