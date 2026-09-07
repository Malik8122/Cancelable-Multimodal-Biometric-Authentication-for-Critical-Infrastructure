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
          (keyed orthonormal projection -> keyed quantize -> keyed permute)
                      |
                      v
              Protected Biometric Template
                      |
                      v
           backend/ (FastAPI + SQLite: templates only)
                      |
                      v                              [Phase 3]
              fusion/score_fusion.py
        (configurable weighted multimodal fusion)
                      |
                      v
              AUTHENTICATE / REJECT
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
| Face | Geometric alignment (post-landmark) | MTCNN detection/landmarks; InceptionResnetV1 embedding |
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
