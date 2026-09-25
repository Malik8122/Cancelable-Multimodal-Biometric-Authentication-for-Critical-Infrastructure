# Architecture

## System flow

```text
                              USER
                               |
                               v
                     Biometric Acquisition
                               |
             +-----------------+-----------------+
             v                 v                 v
           FACE              IRIS           FINGERPRINT
             |                 |                 |
             v                 v                 v
    preprocessing/face  preprocessing/iris  preprocessing/fingerprint
    (MTCNN detect+align) (Hough localize +   (CLAHE + ridge norm +
                           Daugman normalize)  Gabor enhancement)
             |                 |                 |
             v                 v                 v
     models/face          models/iris       models/fingerprint
   (InceptionResnetV1,   (ResNet18 +        (ResNet50 +
    VGGFace2 pretrained,  projection head,   projection head,
    ArcFace fine-tuned)   ArcFace fine-tuned) ArcFace fine-tuned;
                                              DeepPrint substitute)
             |                 |                 |
             +--------+--------+--------+--------+
                      v (Phase 1 boundary)
             BaseEmbedder.extract_embedding()
             -> fixed-length, L2-normalized embedding
                      |
                      v
          template_protection/hkdf_keys.py + biohash.py
   (HKDF key v1..vN -> keyed orthonormal projection -> keyed quantize -> keyed permute)
                      |
                      v
     Template SET pool (each set = one template per enrolled modality):
        Set 1 [Face V1|Fingerprint V1|Voice V1]  ACTIVE
        Sets 2..N  (same shape)                  STANDBY
                      |
                      v
   backend/ (FastAPI + SQLite/PostgreSQL: protected templates + set lifecycle only)
                      |   authentication compares the ACTIVE set only, never mixing sets
                      v
              fusion/ (ALL_REQUIRED | AT_LEAST_TWO | WEIGHTED)
        per-modality similarities stay internal -> ONE fusion similarity
                      |
                      v
              ACCESS GRANTED / ACCESS DENIED

  Revocation: ACTIVE set -> REVOKED, oldest STANDBY set -> ACTIVE, all modalities together
  (authorized by a biometric match against the ACTIVE set; 409 when the set pool is exhausted).
  Details: docs/MULTI_TEMPLATE_ARCHITECTURE.md
```

## Why one interface for three very different modalities

`models/common/base_embedder.py` defines `BaseEmbedder`, which every
modality's embedder subclasses. The contract is deliberately narrow:

```python
embedding = embedder.extract_embedding(image)  # -> np.ndarray, L2-normalized
```

This is what lets `template_protection/` (Phase 2) and `fusion/` (Phase 3)
treat face, iris, and fingerprint uniformly, without knowing anything about
MTCNN, Daugman normalization, or Gabor filtering — those details are fully
contained in each modality's `preprocessing/*.py` and `models/*/inference.py`.
Swapping a backbone later (e.g. replacing the ResNet50 fingerprint model with
a real DeepPrint implementation, if one becomes practically available) only
requires the new class to honor this same interface.

## Mock mode

Before a modality has a trained checkpoint (fresh clone, before running the
relevant Colab notebook), `BaseEmbedder` falls back to a deterministic
pseudo-random embedding derived from the image's own pixel content
(`_mock_embedding`). This exists purely so the rest of the system — tests,
the backend once it exists, the fusion layer — can be exercised end-to-end
without requiring a GPU or trained weights. Mock embeddings are **not**
biometrically meaningful and must never back a real enrollment/authentication
decision; `ModalityPipeline.is_mock` exposes this flag so calling code can
refuse to use mock embeddings outside of tests/demos.

## Classical CV vs. deep learning, per modality

| Modality | Classical CV | Deep learning |
|---|---|---|
| Face | bounding-box crop (default `FACE_ALIGNMENT=bbox`); optional 5-landmark similarity alignment (`FACE_ALIGNED`), see `evaluation/reports/FACE_ALIGNMENT_DECISION.md` | MTCNN detection/landmarks; InceptionResnetV1 embedding |
| Iris | Hough circle localization; Daugman rubber-sheet normalization | ResNet18 embedding |
| Fingerprint | CLAHE contrast enhancement; ridge normalization; Gabor filtering | ResNet50 embedding |

## Model decisions and why (Phase 1)

- **Face — InceptionResnetV1 pretrained on VGGFace2** (`facenet-pytorch`):
  strong off-the-shelf embeddings, pip-installable, needs only light
  fine-tuning (last inception block) rather than training from scratch.
- **Iris — ResNet18 (ImageNet) + projection head:** no public pretrained
  iris-embedding model exists, so a small, fast-to-fine-tune ImageNet backbone
  was chosen over training a bespoke architecture from scratch.
- **Fingerprint — ResNet50 (ImageNet) + projection head, in place of
  DeepPrint:** DeepPrint (Engelsma et al., 2019) has no public pretrained
  weights or pip-installable reference implementation, making it impractical
  to reproduce reliably within a capstone timeline. A ResNet50 backbone
  fine-tuned with an ArcFace angular-margin loss is a well-documented,
  reproducible alternative that still produces a fixed-length discriminative
  embedding — see `models/fingerprint/inference.py` docstring for the same
  justification recorded next to the code.

All three fine-tuning heads use the same ArcFace-style loss
(`models/common/arcface.py`) so the three modalities are trained consistently
rather than with three different, harder-to-compare recipes.

## Flexible multimodal authentication (V3)

The user decides which modalities to enroll and which to present; a building is context only (details:
`docs/MULTI_TEMPLATE_ARCHITECTURE.md`):

```text
  User Enrollment Profile        Building (context only)          Authentication Engine
  which modalities the user      id, name, clearance level,       authenticates + fuses EXACTLY the
  enrolled: NOT_REGISTERED /     description - no biometric       modalities the user submits
  REGISTERED / UPDATED /         policy (config/buildings.json)   (POST /authenticate/fusion)
  RETRY_REQUIRED (voice)                 |                                  ^
            \____________ submitted modalities all enrolled? _____________/
                      no  -> ENROLLMENT_REQUIRED (409, nothing verified)
                      yes -> fuse the submitted modalities -> ACCESS_GRANTED | ACCESS_DENIED
```

Template sets hold templates only for the modalities enrolled so far (T1 ACTIVE, T2-T4 STANDBY for each); enrolling another
modality later adds its templates to the existing live sets without regenerating the others.
