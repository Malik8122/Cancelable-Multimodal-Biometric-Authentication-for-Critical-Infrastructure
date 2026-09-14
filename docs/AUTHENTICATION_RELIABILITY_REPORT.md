# Authentication Reliability Report

**Sprint:** Phase 2.7 — Authentication Reliability Sprint
**Scope:** Backend only (`preprocessing/`, `template_protection/`, `fusion/`, `backend/`, `evaluation/`). No UI, API contract, or database schema changes.

## Root Cause

Two independent, real causes were found for "a genuine enrolled user is denied":

### Cause 1 — Fixed: a concrete bug in voice preprocessing

`preprocessing/voice.py::VoicePreprocessor._trim_silence` reconstructed the "voice-activity-trimmed" waveform by concatenating each *voiced* 400-sample frame's samples directly. Consecutive frames advance by only a 160-sample hop, so they overlap — for a mostly-or-fully-voiced clip (the common case; most real utterances aren't mostly silence), the same audio got copied into the output once per overlapping voiced frame that covered it. A fully-voiced 4-second (64,000-sample) clip measured out at **~159,200 samples — 2.5x its input length**.

`_fixed_length_segment`'s center-crop then selected from that unstable, duplicated sequence, so a tiny, realistic amount of capture noise shifted which content survived the crop, and the resulting speaker embedding changed catastrophically: a genuine same-speaker "recapture" measured **cosine similarity −0.18** instead of ~1.0.

**Fix:** build a per-sample keep-mask (OR-combining every frame that covers a sample) instead of concatenating frames — this can only ever select a subset of the input, so the trimmed output is now guaranteed `<= len(input)`.

### Cause 2 — Diagnosed, not silently patched: an uncalibrated acceptance threshold

`Settings.match_threshold = 0.9` is applied as a fallback to every modality whenever `evaluation/results/<modality>_threshold.json` doesn't exist — which is the case for all of face/fingerprint/voice (the directory holds only `*_metrics.csv`/`*_roc.csv` from the real Kaggle *raw-embedding* evaluation runs, never a threshold calibrated on *protected-template Hamming similarity*, the actual score space `authenticate()` compares).

Real, already-measured project data (`evaluation/results/*.csv`, from real Kaggle test-set evaluation) shows this default is wrong in different ways per modality:

| Modality | Real raw-embedding EER | Real EER-threshold (cosine) | Real median impostor cosine |
|---|---|---|---|
| Face | 1.0% | *(not measured — no ROC curve was ever saved)* | *(not measured)* |
| Fingerprint | **30.77%** | 0.9147 | **0.90** |
| Voice | 2.29% | 0.3221 | ~0.00 |

**Fingerprint is a genuinely weak model.** At its own best raw-embedding operating point, genuine and impostor pairs are separated by only ~30 percentage points of error, and its real median impostor cosine similarity (0.90) sits right next to its real 5%-FAR genuine operating point (0.9442) — the two are barely distinguishable in raw-embedding terms, let alone after BioHash quantization degrades that further. No protected-template threshold choice can make this specific checkpoint both "always accept genuine" and "always reject a realistic impostor" — that is a raw-model-accuracy ceiling, not a template-protection-layer problem.

**The important, corrective realization this sprint reached:** despite fingerprint's weak *real-world* accuracy, it already authenticates genuine users successfully at the *current* 0.9 fallback for any realistic amount of capture noise (see "Before vs after" below) — so fingerprint's threshold did **not** need to be touched. An earlier attempt in this sprint tried recalibrating it anyway and is documented below specifically because of the mistake it caught.

**Voice is the one modality with a real, unresolved reliability gap at 0.9.** Even after fixing Cause 1, a realistic amount of genuine voice-capture variation measures ~0.62 mean Hamming similarity (same-key, real-ROC-anchored estimate — see below) — below 0.9. Combined with `ALL_REQUIRED` fusion (every submitted modality must individually pass — the correct, secure default from the prior hardening sprint), voice alone denies an otherwise-genuine multi-factor attempt.

### A calibration methodology bug this sprint found and fixed in itself

While investigating whether voice's threshold could be safely recalibrated from real data, an early version of `scripts/calibrate_protected_thresholds.py` paired genuine/impostor samples the way `evaluation/threshold_calibration.py`'s general-purpose pairing does: each synthetic "identity" gets its *own* derived key. That measures a materially easier question than what this system's real `authenticate()` flow does: `backend/services/base_service.py::authenticate` always derives the comparison key from the **claimed** user_id, so a real impersonation attempt compares the impostor's own embedding against the victim's template **under the victim's key**, never under two different keys.

The different-key version looked cleanly separated in calibration (EER = 0) but, when actually exercised through a real `ModalityService.authenticate()` call with a same-key impostor at fingerprint's real median-impostor similarity (cosine 0.90), **the impostor scored 0.84 and authenticated successfully** at the calibrated threshold. This was caught before it was deployed anywhere: this session's own safety tooling flagged writing the resulting (lowered) threshold files as a security-weakening action and blocked it, which is the correct outcome — the file was never applied, and the mistake is now the subject of a permanent regression test (`test_a_same_key_impostor_with_realistic_similarity_is_rejected_at_the_current_threshold`) rather than a shipped weakness. The fixed, same-key version of the script is in the repo, uncommitted-as-output (see "What was NOT done" below).

## Files Changed

| File | Change |
|---|---|
| `preprocessing/voice.py` | Fixed `_trim_silence`'s frame-overlap duplication bug (per-sample mask instead of frame concatenation). |
| `tests/test_voice_preprocessing.py` | Added the length-invariant regression tests that would have caught Cause 1. |
| `tests/test_voice_backend_integration.py` | Added a real-checkpoint stability regression test (genuine recapture score no longer collapses). |
| `tests/test_authentication_debug_sprint.py` | Added regression tests: genuine user succeeds (face, fingerprint) with a second non-identical capture; never-enrolled user rejected; same-key impostor at a realistic similarity rejected; `ALL_REQUIRED` correctly denies the exact mixed pass/fail scenario from the bug report; fusion only requires modalities actually submitted (Scenario D). |
| `scripts/debug_authentication_pipeline.py` | New: reusable end-to-end trace tool (enroll → authenticate → fusion) against the real trained checkpoints. |
| `scripts/calibrate_protected_thresholds.py` | New, **not run to produce active output** in this sprint: a same-key, real-ROC-anchored calibration approach for fingerprint/voice, for the user's review (see "What was NOT done"). |

**Not changed:** `template_protection/transform.py` — investigated `quantize()`'s per-call recomputation of the quantization-threshold spread as a possible second bug; empirically measured the difference between "current" and "fixed" behavior on a realistic genuine pair and found it negligible (0.875 vs 0.867 Hamming similarity). Left alone: it isn't the cause of anything, and changing working code without a demonstrated benefit isn't a fix.

## Before vs After Similarity Scores

All numbers below are from `scripts/debug_authentication_pipeline.py`, run against the real trained face/fingerprint/voice checkpoints (`mock_mode=False` for all three), comparing one enrolled sample against a second, independently-perturbed "recapture" of the same synthetic identity.

| Modality | Before fix (cosine, raw embedding) | After fix (cosine, raw embedding) | Hamming similarity (protected template, after fix) |
|---|---|---|---|
| Face | *(unaffected by this sprint)* | 0.9998 | 0.9844 |
| Fingerprint | *(unaffected by this sprint)* | 1.0000 | 0.9844 |
| **Voice** | **−0.18** (catastrophic collapse) | **0.62–0.86** (stable, noise-level dependent) | **0.6194 mean** (same-key, real-ROC-anchored estimate) / **0.8359** (measured, low-noise scenario) |

The voice fix alone (no threshold change) took a genuine recapture from "less related than two random unrelated recordings" to "clearly, stably correlated." It did not, by itself, clear the uncalibrated 0.9 threshold — that is Cause 2, deliberately left as an open decision (see below).

## Final Genuine Authentication Report

**Applied and confirmed**, per the user's explicit decision on the disclosed tradeoff below: `evaluation/results/voice_threshold.json` now holds a real, same-key, ROC-anchored voice threshold (0.58). Fingerprint and face are untouched (still the 0.9 fallback - both already worked). Produced by `PYTHONPATH=. python scripts/debug_authentication_pipeline.py` against the current repository state:

```
User ID: genuine-user-001
Face Score / Threshold / Pass:        0.9844 / 0.9000 / True
Fingerprint Score / Threshold / Pass: 0.9844 / 0.9000 / True
Voice Score / Threshold / Pass:       0.8359 / 0.5800 / True
Fusion Score: 0.9349
Fusion Policy: ALL_REQUIRED
Authenticated: True   <-- ACCESS GRANTED, produced by the real backend, no bypass, no mocked score
```

Also confirmed via a full, real HTTP round-trip (`POST /enroll` -> `POST /verify/voice`, `test_genuine_recapture_authenticates_with_the_calibrated_threshold`): a genuine second capture (broadband signal + realistic 1% sample noise) now returns `authenticated: true` through the actual API, not just the direct-service debug script.

**Before this threshold was applied**, the same run returned:

```
Voice Score / Threshold / Pass: 0.8359 / 0.9000 / False
Authenticated: False
Reason for failure: voice individually failed its own threshold; ALL_REQUIRED vetoes on any failure.
```

## Final Impostor Authentication Report

`test_a_same_key_impostor_with_realistic_similarity_is_rejected_at_the_current_threshold` (fingerprint, unmodified 0.9 threshold - permanent regression test):

```
Victim: enrolled with a synthetic fingerprint embedding.
Attacker: a different embedding at cosine similarity 0.90 to the victim
          (fingerprint's real, measured MEDIAN impostor similarity - not a
          best-case near-zero assumption), compared under the victim's own
          key (the real threat model - see Cause 2 above).
Result: authenticated = False.
```

At the (rejected, never shipped) recalibrated fingerprint threshold this sprint initially and incorrectly tried (0.61, from the flawed different-key methodology), **this same attacker scored 0.84 and would have authenticated** — the exact reason that threshold was reverted.

For voice's **applied** threshold (0.58), a same-key impostor at voice's real median-impostor similarity (cosine ~0.00) was checked directly:

```
Victim: enrolled with a synthetic voice embedding.
Attacker: a different embedding at cosine similarity ~0.00 to the victim
          (voice's real, measured MEDIAN impostor similarity), compared
          under the victim's own key.
Attacker score: 0.5703   Threshold: 0.5800   Result: authenticated = False.
```

This margin is real but thin (0.57 vs 0.58) - consistent with the disclosed FAR≈22% at this operating point: a meaningful fraction of impostor attempts, particularly ones closer to the high end of voice's real impostor-similarity distribution, are expected to succeed. This is the explicit tradeoff the applied calibration accepts (see "Decision" below), not a residual bug.

## Fusion Scenario Validation (Step 5)

| Scenario | Expected | Result |
|---|---|---|
| A: Face ✓ Fingerprint ✓ Voice ✓ | GRANTED | GRANTED at current thresholds (all three genuinely pass at 0.9 for face/fingerprint; voice needs the pending recalibration decision - see above) |
| B: Face ✓ Fingerprint ✗ Voice ✓ | DENIED under ALL_REQUIRED | Confirmed (`test_all_required_denies_the_exact_mixed_result_this_bug_report_describes`, and pre-existing `test_all_required_blocks_the_compensatory_averaging_bug`) |
| C: Face ✓ Fingerprint ✓, voice missing | Building-dependent | Confirmed - `evaluate_fusion_policy` only ever sees modalities actually submitted (`test_fusion_only_requires_the_modalities_actually_submitted`); `backend/api/fusion.py` already only populates scores from uploaded files |
| D: Face-only building | Face alone succeeds | Confirmed - same test as C; this was **already correct** before this sprint, not a new fix |

## Database Validation (Step 6)

Live query trace against a real in-memory DB, using the real `backend/database/crud.py` functions:

```
after enroll:                 active template key_version = 1
after revoke + re-enroll:     old row is_active=False, new row is_active=True
get_active_template(...):     returns key_version = 2 (the latest, not the first)
history for this user:        2 rows total, old one preserved but inactive (audit trail intact)
lookup for a different user_id: returns None (correctly scoped per user_id)
```

Confirms: correct `user_id` scoping, active-only lookup, latest `key_version`/`template_version` used, revoked templates ignored, full history preserved (not deleted) for audit purposes. No bug found here — this was already correct.

## What Was NOT Done (and why)

- **Fingerprint's threshold was not changed.** It already authenticates genuine users reliably at 0.9 (see "Before vs after"). Recalibrating it would only ever *lower* impostor resistance for zero genuine-acceptance benefit — this sprint's own investigation is the reason to leave it alone, not a reason to touch it.
- **No threshold was lowered blindly, no score was mocked, no matcher was bypassed, and `authenticated` was never forced to `true`.** Voice's threshold change (below) is a real, disclosed, data-anchored calibration, not a workaround.

## Decision and Outcome

Voice's threshold gap (Cause 2) was presented to the user as an explicit choice, with the real FAR/FRR tradeoff disclosed up front: apply the same-key, ROC-anchored calibration (~0.58, ~22% FAR / ~17% FRR), keep 0.9 and rely on face+fingerprint for the demo, or relax the fusion policy instead. **The user chose to apply the calibration.**

`evaluation/results/voice_threshold.json` now holds this real, same-key, ROC-anchored threshold for voice only. Fingerprint and face are untouched. This was verified, not just computed:

- The full pytest suite (293 tests, up from 292) is green, including a new test that a genuine voice recapture now returns `authenticated: true` through the real HTTP API (`test_genuine_recapture_authenticates_with_the_calibrated_threshold`).
- `scripts/debug_authentication_pipeline.py`, re-run against the live repository state, now reports `Authenticated: True` for the genuine three-modality scenario (see "Final Genuine Authentication Report").
- A same-key impostor at voice's real median-impostor similarity was re-checked at the new threshold and still correctly rejected (0.57 vs 0.58 - a thin but real margin, consistent with the disclosed ~22% FAR at this operating point).

The disclosed residual risk stands as accepted: some fraction of voice impostor attempts (particularly ones on the higher-similarity side of voice's real impostor distribution) will succeed at this threshold. Improving this further requires either a better-trained voice checkpoint or a real, labeled multi-sample dataset to calibrate against - both out of scope for this sprint.
