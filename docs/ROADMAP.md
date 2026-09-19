# Roadmap

Three phases. In every phase, all three modalities (face, iris, fingerprint)
advance to the same stage together — there is no phase where one modality is
further along than the others.

## Phase 1 — Foundation (current)

**Status: implemented.**

- Modular repo scaffold (`preprocessing/`, `models/`, `embeddings/`, `evaluation/`).
- Preprocessing for all 3 modalities: face detection+alignment (MTCNN), iris
  localization+Daugman normalization (classical CV), fingerprint enhancement
  (CLAHE + Gabor filtering).
- A single embedding interface (`BaseEmbedder.extract_embedding`) all three
  modalities implement identically.
- Colab notebooks (`notebooks/01`–`03`) *and* equivalent Kaggle Kernels
  (`kaggle_kernels/`, driven unattended via `scripts/run_kaggle_kernels.py`)
  that download each modality's dataset, fine-tune its embedding model with
  an ArcFace head, **save the resulting checkpoint** (`.pt` + a companion
  `.h5` export), evaluate it (Experiment 1:
  accuracy/FAR/FRR/EER/ROC-AUC), and run a dedicated image-based testing
  section (genuine/impostor pairs + gallery matching, visualized).
- `tests/` — offline, synthetic-image smoke tests proving the
  preprocessing → embedding pipeline is correctly wired for all 3 modalities,
  independent of whether real checkpoints exist yet (`pytest tests/`).

### Voice — 4th modality (added alongside Phase 1's foundation)

**Status: implemented, checkpoint trained.** Real Kaggle GPU-kernel run (CPU
fallback — see `docs/VOICE_MODEL.md`): 24 speakers, 4,857 utterances, 2.29%
EER / 97.71% accuracy / 0.9967 AUC on the held-out test set.

Speaker verification via ECAPA-TDNN, added to the same standard as Face/Iris/
Fingerprint: `preprocessing/voice.py`, `models/voice/`, a Colab notebook
(`notebooks/04_voice_training.ipynb`) and Kaggle Kernel
(`kaggle_kernels/voice_training/`), offline synthetic-audio tests, and full
documentation (`docs/VOICE_MODEL.md`). See that doc for the one interface
nuance this modality required (a mel-spectrogram stands in for the "image"
`BaseEmbedder.extract_embedding()` expects) and `docs/DATASETS.md` for the
VoxCeleb1-subset dataset note.

## Phase 2 — Privacy layer

**Status: implemented.**

- `template_protection/hkdf_keys.py`: HKDF-SHA256 key derivation — per
  (user, modality, application, key_version), three independent seeds never
  stored in plaintext beside the protected template they produce.
- `template_protection/transform.py` + `biohash.py`: the BioHashing-style
  transform (keyed orthonormal random projection → keyed quantization →
  keyed permutation) applied identically to all 3 modalities' embeddings —
  see `docs/TEMPLATE_PROTECTION.md` for the full mathematical walkthrough.
- `template_protection/matcher.py` (Hamming/cosine comparison,
  accept/reject) and `revoke.py` (key rotation → a new, unlinkable
  template).
- FastAPI backend (`backend/`) + SQLite: `POST /enroll`, `POST /authenticate`,
  `POST /verify/{face,iris,fingerprint}`, `POST /revoke-template`,
  `GET /user/{id}`, `DELETE /user/{id}` — storing **only** protected
  templates, never raw images or raw embeddings (see `docs/BACKEND_API.md`).
- `evaluation/privacy_metrics.py`: Experiment 1 (protected vs. unprotected
  similarity preservation), Experiment 2 (revocability), Experiment 3
  (diversity), Experiment 4 (FAR/FRR/EER on protected templates).
- `docs/PRIVACY_AND_SECURITY.md`'s Experiment 5 analysis (template leakage,
  replay, key compromise, reconstruction risk, database compromise,
  cross-application linkability) filled in — proportionate, non-overclaiming.

## Phase 3 — Fusion, dashboard, full evaluation

- `fusion/score_fusion.py`: configurable weighted-score fusion across
  whichever modalities are available for a given authentication attempt.
- React (Vite) dashboard: enrollment (3 uploads + "only protected templates
  stored" confirmation), authentication (per-modality pass/fail + fusion
  score + threshold + verdict), and a security/template view that shows
  "Protected" status without ever rendering raw biometric data.
- Experiment 3: full comparison across all 7 modality combinations (face-only,
  iris-only, fingerprint-only, and all pairs/triples).
- Final README/docs pass, end-to-end demo script, limitations and ethics
  section finalized.

## Phase 3A / 3A.1 - Template-set architecture (done)

Requested during project review; this is the final architecture.
See `docs/MULTI_TEMPLATE_ARCHITECTURE.md`.

- A user's credential is a pool of **template sets** (`TEMPLATE_POOL_SIZE`, default 4). Each set holds
  one cancelable template per enrolled modality (Face V*n* + Fingerprint V*n* + Voice V*n*); Set 1 is
  ACTIVE, the rest STANDBY, and revocation moves a whole set (all modalities together).
- Lifecycle (`ACTIVE` / `STANDBY` / `REVOKED`) in the existing `protected_templates` table
  (`template_set_version`, `template_set_status`, set created/activated/revoked times).
- Authentication matches the ACTIVE set only, never mixes sets, and returns a single fused
  similarity; per-modality scores are internal (audit / debug only). The denied result screen shows no
  similarity.
- Template-set management (`GET /templates`, revoke, activate, generate) is protected by **biometric
  authorization** against the ACTIVE set (403 on failure) instead of a login layer; 409 when the set
  pool is exhausted / full.
- Runtime set validation, template-set evaluation experiments (diversity / revocation / promotion /
  exhaustion), migration of previously enrolled users, Template Management and Template Protection pages.
- Still open: a real login/authorization layer, calibrated per-modality thresholds, an iris checkpoint,
  and fingerprint accuracy.

## Phase 3B / V3 - Flexible, user-driven multimodal authentication (done)

- **Buildings are context only** (`id`, `name`, `clearance_level`, `description` in `config/buildings.json`); no building defines
  required modalities and the loader rejects a config that does. The former building-readiness endpoint is gone.
- **The user chooses**: any subset of face / fingerprint / voice can be enrolled (status `NOT_REGISTERED` / `REGISTERED` /
  `UPDATED` / `RETRY_REQUIRED`) and any subset of the enrolled modalities presented. `/authenticate/fusion` (and `/authenticate`,
  `/verify/*`) authenticate and fuse exactly the submitted modalities; a submitted modality that is not enrolled is
  `ENROLLMENT_REQUIRED` (HTTP 409, never a denial). The public response adds `authentication_state`, `fusion_distance`,
  `active_template_set`.
- **Face one-time five-pose enrollment** (Front / Left / Right / Slight Up / Slight Down): per pose MTCNN + alignment + a 512-d embedding, only blurry or
  faceless poses rejected, the valid embeddings averaged into a **centroid** and discarded, T1-T4 generated from the centroid alone. Authentication stays a
  single capture.
- **Voice** recorded twice; the ECAPA embedding cosine grades them Excellent / Good (enrolled), Fair (`LOW_QUALITY_WARNING`, the user
  continues or re-records) or Poor (`ENROLLMENT_INCONSISTENT`, nothing stored).
- Template pool unchanged (T1 ACTIVE, T2-T4 STANDBY per modality; revocation promotes the next set), now with a Face / Fingerprint / Voice matrix.
- Still open: a real login layer, calibrated per-modality thresholds, an iris checkpoint, fingerprint accuracy.
