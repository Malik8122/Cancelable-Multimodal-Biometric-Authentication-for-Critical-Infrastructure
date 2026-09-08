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
