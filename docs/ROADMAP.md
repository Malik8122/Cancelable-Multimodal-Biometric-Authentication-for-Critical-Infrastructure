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

## Phase 2 — Privacy layer (next)

- `template_protection/cancelable_transform.py`: a BioHashing-style transform
  (keyed random projection → nonlinear mapping → quantization/binarization)
  applied identically to all 3 modalities' embeddings.
- `template_protection/key_management.py`: HKDF-derived, per-user/per-application
  transformation keys — never stored in plaintext beside the protected template.
- FastAPI backend + SQLite: `/enroll`, `/authenticate`, `/verify/{modality}`,
  `/user/{id}` — storing **only** protected templates, never raw images or
  raw embeddings.
- Experiment 2 (protected vs. unprotected recognition performance),
  Experiment 4 (revocability: same biometric + different keys → different,
  unlinkable templates), and a diversity demonstration (same user, different
  application keys → different templates).
- `docs/PRIVACY_AND_SECURITY.md` filled in with the Experiment 5 analysis
  (template leakage, replay, key compromise, reconstruction risk, database
  compromise, cross-application linkability) — proportionate, non-overclaiming.

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
