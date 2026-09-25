# Fingerprint documentation audit

Audited 2026-09-25 against the working tree on `main` @ `873c13e`. Code and committed evaluation artifacts take precedence over prose.

## 1. Old model and result (superseded)

| | |
|---|---|
| Model | ResNet50 (ImageNet) + head; only `layer4` fine-tuned; 12 epochs; per-image split inside each subject |
| Result | accuracy 0.555, **EER 0.445, AUC 0.579**, val acc 0.000 (Kaggle log quoted in `docs/PROJECT_REPORT.md` §8.2) |
| Checkpoint | added in `b7ea1ee`, replaced in `fc9fd47` / `3a0bfeb` |
| Status | **Historical only.** These numbers describe a model that is no longer in the repository. |

## 2. Current model and result (verified)

| | |
|---|---|
| Checkpoint | `models/fingerprint/saved/fingerprint_embedder.pt` (Git LFS, ~105 MB), installed in `3a0bfeb` |
| Architecture | ResNet50 (ImageNet) + projection head, **512-D** embedding (`models/fingerprint/inference.py::FINGERPRINT_EMBEDDING_DIM = 512`; `fingerprint_config.json: embedding_dim 512`) |
| Training config | `models/fingerprint/saved/fingerprint_config.json`: conv1/bn1/layer1 frozen, ArcFace m=0.5 s=64, label smoothing 0.1, hard negatives from epoch 10, lr 3e-4, 30 epochs max with early stopping, P×K = 16×4, subject-disjoint 70/15/15 split, seed 42 |
| Dataset | SOCOFing (600 subjects, 6,000 real prints + altered versions) |
| Evaluation script | fingerprint training notebook (`kaggle_kernels/`); reproduced by re-extraction in `evaluation/metric_verification_report.md` |
| Evaluated samples | **900** test images (subject-disjoint) |
| Pairs | **404,550** = C(900, 2): 4,050 genuine, 400,500 impostor |
| Metrics | **EER 30.77 %** (0.307684), **AUC 0.7644** (0.764447), accuracy 0.6923, at EER threshold cosine 0.9147 |
| Source | `evaluation/results/fingerprint_metrics.csv`, `fingerprint_confusion_matrix.csv`, `fingerprint_roc.csv` |
| Verification | Every value was recomputed from the confusion matrix and ROC, and the model was re-extracted: AUC 0.764448 (Δ 9.7e-7), 900 samples, 4,050 genuine pairs (`evaluation/metric_verification_report.md` rows 23-47). **VERIFIED.** |

Evidence label: **REAL DATA**, raw embedding cosine, all pairs, subject-level protocol. Different fingers of the same
subject count as genuine, so this is a hard protocol.

### Other fingerprint protocols in the repository (do not mix them)

| Protocol | Representation | n genuine / impostor | EER | AUC | Source |
|---|---|---|---|---|---|
| Subject-level, all pairs (above) | raw cosine | 4,050 / 400,500 | 30.77 % | 0.7644 | `fingerprint_metrics.csv` |
| Subject-level, enrollment-vs-probe | raw cosine | 810 / 4,500 | 28.77 % | 0.7875 | `raw_vs_protected_metrics.csv` (fingerprint_subject_protocol) |
| Subject-level, enrollment-vs-probe | 256-bit protected | 810 / 4,500 | 34.48 % | 0.7039 | same |
| Finger-level: Real reference vs dataset-altered (Easy) impression of the SAME finger | raw cosine | 2,682 / 45,000 | 4.74 % | 0.9888 | same (fingerprint) |
| Same, finger-level | 256-bit protected | 2,682 / 45,000 | 9.45 % | 0.9653 | same |

The finger-level protocol compares a print with a synthetically altered copy of the same image. It measures robustness
to alteration, not recognition of a new impression, and must not be reported as fingerprint recognition accuracy.

## 3. Every occurrence of 44.5 / 0.445 / 44.50 / 57.9 / 0.579 (classified)

| Location | Text | Classification | Action |
|---|---|---|---|
| `docs/PROJECT_REPORT.md` §8.2 (log block + next paragraph) | EER 0.445, AUC 0.579 | Historical log of the superseded model, but was presented as current | **Kept as a historical record**; added a "Superseded" note with the current values, plus a status banner at the top of the report |
| `docs/PROJECT_FUNDAMENTALS.md:117` | "First attempt (superseded) … AUC 0.579" | Correctly labelled historical | none |
| `docs/PAPER_SOURCE_OF_TRUTH.md:228` | "describes an older fingerprint model … 0.445 / 0.579" | Correct discrepancy note | none |
| `docs/RESEARCH_EVIDENCE_PACKAGE.md:504` (and its PDF) | discrepancy table row | Correct discrepancy note | none |
| `training/summarize.py:48`, `training/TRAINING_SUMMARY.md:35` | "STALE - do not use: EER 0.445 / AUC 0.579" | Correctly labelled HISTORICAL_DOCUMENTED | none |
| `evaluation/IEEE_EVALUATION_PACKAGE.md:89`, `evaluation/tables/table07_fusion_performance.*` | 0.5792 | **Unrelated**: F1 of WEIGHTED(face+voice) fusion | none |
| `evaluation/tables/table11_software_validation.*` | 257.966 | Unrelated (test-suite runtime in seconds) | none |
| `evaluation/results/{fingerprint_roc,voice_roc,threshold_sweep,revocation_per_attempt,fusion_policy_metrics,software_validation}.csv` | digit sequences inside longer numbers | Unrelated numeric coincidences | none |

No current document now presents 44.5 % / 0.579 as the current fingerprint result.

## 4. Dimension consistency (fixed in this audit)

| File | Before | After |
|---|---|---|
| `scripts/calibrate_biohash_metric_mapping.py::MODALITY_DIMS` | fingerprint 256 | **512** |
| `evaluation/template_set_experiments.py::_MODALITY_DIMS` | fingerprint 256 | **512** |
| `evaluation/results/biohash_metric_calibration.json` | fingerprint curve fitted at D=256 | refitted at **D=512**. Face and voice curves are bit-identical (their seeds are unchanged) |
| `docs/TEMPLATE_PROTECTION.md`, `docs/COMPUTER_VISION.md` | "fingerprint 256-dimensional" | 512 |

Runtime effect of the refit: the fingerprint accept/reject decision is a direct Hamming threshold (0.90) and is
**unchanged**. Only fingerprint's `fusion_score`, which WEIGHTED and AT_LEAST_TWO fusion read through its calibration
curve, moves. The largest change of the fitted Hamming value over the whole cosine grid is **0.00056**. The refit
changed the template-set experiment numbers slightly, because fingerprint now draws 512 values from the shared random
stream. Their conclusions are unchanged: cross-set similarity ≈ 0.50, 80/80 acceptances, 3 revocations and then HTTP 409.

`tests/test_modality_dimensions.py` pins FACE 512 / VOICE 192 / FINGERPRINT 512 in the models, the calibration script,
the template-set experiments, the committed calibration file, the mock embedders and the BioHash input.

## 5. Remaining discrepancies

1. `evaluation/results/fingerprint_threshold_sweep.csv` and the notebook metrics come from the training notebook on
   Kaggle. The notebook's epoch-by-epoch history was not committed, so the training curve is NOT AVAILABLE
   (`training/TRAINING_SUMMARY.md`).
2. The protected-template fingerprint threshold (Hamming ≥ 0.90) is a configured value that was not selected from data.
   On the subject-level protocol the fingerprint model is weak, with EER ≈ 31–34 %.
3. Fingerprint is optional in the deployed flow. The user picks any enrolled subset of face, voice and fingerprint (nothing
   is preselected in `frontend/src/pages/AuthenticatePage.tsx`). The research evaluation focuses on face+voice.
