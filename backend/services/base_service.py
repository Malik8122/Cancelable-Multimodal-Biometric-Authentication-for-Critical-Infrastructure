"""Shared enroll/authenticate logic, parameterized by modality.

Template-set architecture (docs/MULTI_TEMPLATE_ARCHITECTURE.md): a user's
credential is a pool of TEMPLATE SETS (version 1..N); each set holds one
protected template per enrolled modality. `enroll(modality)` embeds the
sample ONCE and writes that modality's template into every planned set - set v
under its own HKDF key_version - so after face, fingerprint and voice are all
enrolled, every set contains all three. `authenticate` only ever reads the
modality's row inside the ACTIVE set. Revocation / activation / new-set
generation move whole sets and live in `backend/database/crud.py` and
`backend/services/template_sets.py` (they need no model).

Face, iris, fingerprint, and voice are identical *except* for which
`embeddings.pipelines.ModalityPipeline` does the preprocessing + embedding -
the only thing `face_service.py` etc. supply.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
from sqlalchemy.orm import Session

from backend.config import Settings
from backend.database import crud
from backend.database.models import ProtectedTemplate
from backend.security_validation import assert_valid, validate_authentication
from backend.services.face_debug import log_authentication_diagnostics, log_enrollment_pose_diagnostics
from backend.services.face_enrollment import MIN_VALID_POSES, FaceCaptureRejected
from backend.services.recording_quality import FAIR, FAIR_MESSAGE, POOR, POOR_MESSAGE, classify, cosine_similarity
from backend.threshold_loader import get_modality_threshold
from embeddings.centroid import centroid_embedding
from embeddings.pipelines import ModalityPipeline
from template_protection.biohash import TEMPLATE_FORMAT_VERSION, generate_template
from template_protection.hkdf_keys import derive_key
from template_protection.matcher import accept, compare
from template_protection.utils import pack_bits, unpack_bits

logger = logging.getLogger("backend.services.base_service")


@dataclass(frozen=True)
class AuthenticationResult:
    score: float
    threshold: float
    authenticated: bool
    #: 1 - score. INTERNAL: per-modality values never leave the backend unless
    #: `Settings.debug_scores` is on (they are always audit-logged).
    distance: float = 0.0
    #: BioHash format version of the stored template (0 when nothing is enrolled).
    template_version: int = 0
    key_version: int = 0
    #: Version of the ACTIVE template set that was compared (0 when nothing is enrolled).
    template_set_version: int = 0
    #: Diagnostic only (DEBUG_SCORES): whether the pipeline's embedder is the real trained
    #: checkpoint (False) or the deterministic mock fallback (True, when no checkpoint is on disk).
    mock_embedder: bool = False
    #: Diagnostic only (DEBUG_SCORES): the stored template's lifecycle status (e.g. "ACTIVE"),
    #: "" when nothing was enrolled for this modality.
    template_status: str = ""


class EnrollmentInconsistent(RuntimeError):
    """POOR band: the two recordings are too dissimilar (cosine < 0.60) - different speakers or too noisy.

    Raised BEFORE anything is stored: nothing (no ACTIVE, no STANDBY template) exists for this modality afterwards,
    so it stays NOT ENROLLED (or keeps its previous enrollment) and can never authenticate.
    """

    def __init__(self, modality: str, similarity: float):
        super().__init__(f"{POOR_MESSAGE} Nothing was enrolled - please record again.")
        self.modality = modality
        self.similarity = similarity
        self.quality = POOR


class LowQualityWarning(RuntimeError):
    """FAIR band (0.60 <= cosine < 0.75): usable, but below the recommended quality.

    Raised BEFORE anything is stored. The caller may repeat the enrollment with `accept_low_quality=True` to continue
    (the templates are then stored), or the user can re-record.
    """

    def __init__(self, modality: str, similarity: float):
        super().__init__(FAIR_MESSAGE)
        self.modality = modality
        self.similarity = similarity
        self.quality = FAIR


def build_entry(
    settings: Settings, embedding: np.ndarray, *, user_id: str, application_id: str, modality: str, key_version: int
) -> crud.PoolEntry:
    """One protected template from `embedding` under HKDF key `key_version`."""
    key = derive_key(
        settings.master_secret,
        application_id=application_id,
        user_id=user_id,
        modality=modality,
        key_version=key_version,
    )
    bits = generate_template(embedding, key, output_bits=settings.template_bits)
    return crud.PoolEntry(key_version=key_version, protected_template=pack_bits(bits))


class ModalityService:
    """Enroll/authenticate for one biometric modality.

    `pipeline` does preprocessing + embedding - this class never
    re-implements that; it only ever calls `pipeline.embed(raw_image)`.
    """

    def __init__(self, modality: str, pipeline: ModalityPipeline, settings: Settings):
        self.modality = modality
        self.pipeline = pipeline
        self.settings = settings

    def embed(self, raw_image: np.ndarray) -> np.ndarray:
        return self.pipeline.embed(raw_image)

    def check_capture(self, raw_image: np.ndarray) -> str:
        """Verdict for one enrollment capture (face: VALID / NO_FACE / BLURRY). Modalities without a check: VALID."""
        checker = getattr(self.pipeline, "check_capture", None)
        return "VALID" if checker is None else checker(raw_image)

    def enroll_poses(
        self, db: Session, captures: list[tuple[str, np.ndarray]], user_id: str, application_id: str
    ) -> tuple[list[ProtectedTemplate], list[dict]]:
        """One-time multi-pose enrollment (face): embeddings -> centroid -> templates. Returns (rows, per-pose report).

        Every capture is detected + aligned + embedded (blurry / faceless ones are rejected and reported). The valid
        embeddings are averaged and L2-normalized into a CENTROID (`embeddings/centroid.py`), the temporary
        embeddings are discarded at once, and the T1-T4 template sets are generated from the centroid ALONE through
        the unchanged HKDF + BioHash path. Only the protected templates are stored. `FaceCaptureRejected` (nothing
        stored) when fewer than `MIN_VALID_POSES` captures are usable.
        """
        embeddings, report = self.pipeline.embed_poses(captures)
        try:
            if len(embeddings) < MIN_VALID_POSES:
                raise FaceCaptureRejected(report)
            centroid = centroid_embedding(embeddings)
            if self.settings.debug_scores:
                # TEMPORARY (alignment investigation) - see backend/services/face_debug.py's own
                # docstring for why this must run before `embeddings.clear()` below, and for the
                # hard guarantee that only scalar cosine similarities are ever logged here.
                log_enrollment_pose_diagnostics(embeddings, centroid)
        finally:
            embeddings.clear()  # the temporary per-pose embeddings are gone from here on
        try:
            if self.settings.debug_scores:
                logger.info("ENROLL-DEBUG modality=%s poses=%d valid=%d centroid_dim=%d",
                            self.modality, len(report), sum(r["status"] == "VALID" for r in report), centroid.shape[0])
            return self._store(db, centroid, user_id, application_id), report
        finally:
            del centroid

    def enroll(self, db: Session, raw_image: np.ndarray, user_id: str, application_id: str) -> list[ProtectedTemplate]:
        """Preprocess -> embed ONCE -> one template per template set -> store.

        Writes into every set `crud.plan_enrollment_sets` names: for a new user, `TEMPLATE_POOL_SIZE` new sets (v1
        ACTIVE, the rest STANDBY); for a user who already has sets, every live set (so a second or third modality
        joins them, and re-enrolling a modality replaces its templates inside them - key versions are never
        reused). Returns this modality's created rows in set order. The embedding is dropped as soon as the
        templates exist.
        """
        embedding = self.embed(raw_image)
        try:
            return self._store(db, embedding, user_id, application_id)
        finally:
            del embedding

    def enroll_confirmed(
        self,
        db: Session,
        raw_image: np.ndarray,
        confirm_raw: np.ndarray,
        user_id: str,
        application_id: str,
        accept_low_quality: bool = False,
    ) -> tuple[list[ProtectedTemplate], str]:
        """Voice enrollment from two recordings, gated by an embedding-similarity quality check. Returns (rows, quality).

        Both recordings are embedded and compared by the COSINE SIMILARITY of the embeddings (see
        `backend/services/recording_quality.py`) BEFORE anything is written:

        - EXCELLENT (>= 0.85) / GOOD (0.75-0.84): enrolled.
        - FAIR (0.60-0.74): `LowQualityWarning` - nothing stored unless `accept_low_quality=True`, in which case enrolled.
        - POOR (< 0.60): `EnrollmentInconsistent` - rejected, nothing stored.

        The templates come from the FIRST recording, exactly as for a single-sample enrollment.
        """
        first = self.embed(raw_image)
        second = self.embed(confirm_raw)
        try:
            similarity = cosine_similarity(first, second)
            quality = classify(similarity)
            if self.settings.debug_scores:
                logger.info("ENROLL-DEBUG modality=%s embedding_cosine=%.4f quality=%s accept_low_quality=%s",
                            self.modality, similarity, quality, accept_low_quality)
            if quality == POOR:
                raise EnrollmentInconsistent(self.modality, similarity)
            if quality == FAIR and not accept_low_quality:
                raise LowQualityWarning(self.modality, similarity)
            return self._store(db, first, user_id, application_id), quality
        finally:
            del first, second

    def _store(self, db: Session, embedding: np.ndarray, user_id: str, application_id: str) -> list[ProtectedTemplate]:
        first_key_version = crud.next_key_version(db, user_id, self.modality, application_id)
        crud.get_or_create_user(db, user_id)
        set_versions = crud.plan_enrollment_sets(db, user_id, application_id, self.settings.template_pool_size)
        entries = {
            set_version: build_entry(
                self.settings,
                embedding,
                user_id=user_id,
                application_id=application_id,
                modality=self.modality,
                key_version=first_key_version + offset,
            )
            for offset, set_version in enumerate(set_versions)
        }
        return crud.save_modality_templates(
            db,
            user_id=user_id,
            application_id=application_id,
            modality=self.modality,
            template_version=TEMPLATE_FORMAT_VERSION,
            output_bits=self.settings.template_bits,
            entries=entries,
        )

    def authenticate(self, db: Session, raw_image: np.ndarray, user_id: str, application_id: str) -> AuthenticationResult:
        """Preprocess -> embed -> regenerate under the ACTIVE set's key -> compare with the ACTIVE set's template.

        STANDBY and REVOKED sets are never read. Returns `score=0.0,
        authenticated=False` (rather than raising) when nothing is enrolled.
        The threshold is per-modality from real calibration data when present
        (`backend/threshold_loader.py`), else `Settings.match_threshold`.
        """
        threshold = get_modality_threshold(self.modality, self.settings.match_threshold)
        if crud.get_active_template(db, user_id, self.modality, application_id) is None:
            return AuthenticationResult(score=0.0, threshold=threshold, authenticated=False)
        embedding = self.embed(raw_image)
        try:
            return self.authenticate_embedding(db, embedding, user_id, application_id)
        finally:
            del embedding

    def authenticate_embedding(
        self, db: Session, embedding: np.ndarray, user_id: str, application_id: str
    ) -> AuthenticationResult:
        """Compare an already-computed embedding with the ACTIVE set's template for this modality."""
        threshold = get_modality_threshold(self.modality, self.settings.match_threshold)
        stored = crud.get_active_template(db, user_id, self.modality, application_id)
        if stored is None:
            return AuthenticationResult(score=0.0, threshold=threshold, authenticated=False)

        key = derive_key(
            self.settings.master_secret,
            application_id=application_id,
            user_id=user_id,
            modality=self.modality,
            key_version=stored.key_version,
        )
        candidate_template = generate_template(embedding, key, output_bits=stored.output_bits)
        stored_template = unpack_bits(stored.protected_template, num_bits=stored.output_bits)

        assert_valid(
            validate_authentication(
                settings=self.settings,
                stored=stored,
                key=key,
                candidate_template_bits=candidate_template,
                pool=crud.get_set_rows(db, user_id, application_id),
            ),
            modality=self.modality,
            user_id=user_id,
        )

        score = compare(candidate_template, stored_template, metric="hamming")
        authenticated = accept(score, threshold=threshold, metric="hamming")
        if self.settings.debug_scores:
            # DEBUG ONLY (DEBUG_SCORES=true): metadata about each stage - never the embedding or template itself.
            norm = float(np.linalg.norm(embedding))
            logger.info(
                "AUTH-DEBUG modality=%s embedding_dim=%d normalized=%s biohash_bits=%d active_template=(set=%d,key=%d,status=%s) "
                "hamming=%.4f threshold=%.2f match=%s",
                self.modality, embedding.shape[0], abs(norm - 1.0) < 1e-3, len(candidate_template),
                stored.template_set_version, stored.key_version, stored.template_status, score, threshold, authenticated,
            )
            if self.modality == "face":
                # TEMPORARY (alignment investigation) - see backend/services/face_debug.py's own
                # docstring for why `live_vs_centroid_cosine` is reported as unavailable rather
                # than computed: the enrolled raw embedding never exists at this point. This call
                # happens strictly AFTER `authenticated` above was already decided from `score` -
                # it cannot influence the real authentication result.
                log_authentication_diagnostics(score)
        return AuthenticationResult(
            score=score,
            threshold=threshold,
            authenticated=authenticated,
            distance=1.0 - score,
            template_version=stored.template_version,
            key_version=stored.key_version,
            template_set_version=stored.template_set_version,
            mock_embedder=getattr(self.pipeline, "is_mock", False),
            template_status=stored.template_status or "",
        )
