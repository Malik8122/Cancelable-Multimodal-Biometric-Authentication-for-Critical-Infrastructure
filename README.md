# Cancelable Multimodal Biometric Authentication for Critical Infrastructure

A privacy-preserving biometric authentication system that combines **face,
iris, and fingerprint** recognition with **cancelable biometric template
protection**, so that no raw biometric image or unprotected biometric
embedding is ever stored as the permanent authentication credential.

This is a final-year capstone project. It is a research/demo system, not a
production-hardened security product — see [Limitations & honest
scope](#limitations--honest-scope) before drawing any stronger conclusion
from it.

## The problem

Traditional biometric systems store templates derived directly from a
person's face, iris, or fingerprint. Unlike a password, a biometric
characteristic can't be changed after a breach — so a compromised biometric
database is a permanent, not a recoverable, exposure. Combining three
modalities improves recognition reliability, but naively multiplies the
amount of sensitive biometric data being handled unless the storage layer is
designed around that risk from the start.

## What this project actually is

Not "face recognition + iris recognition + fingerprint recognition."  The
central contribution is combining multimodal biometric recognition **with** a
cancelable, revocable template-protection layer, so that:

```text
Biometric input -> feature extraction -> embedding -> cancelable
transformation -> protected template -> authentication
```

and the protected template — never the raw image, never the raw embedding —
is what gets stored and compared.

## Architecture

Full diagrams and the per-modality classical-CV-vs-deep-learning breakdown
are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Summary:

```text
Face/Iris/Fingerprint image
        |
Modality-specific preprocessing (preprocessing/)
        |
Modality-specific embedding model (models/)
        |
BaseEmbedder.extract_embedding()  <- one shared interface for all 3 modalities
        |
Cancelable transformation (template_protection/)        [Phase 2]
        |
Protected template  ->  backend/ (FastAPI + SQLite)      [Phase 2]
        |
Multimodal score fusion (fusion/)                        [Phase 3]
        |
AUTHENTICATE / REJECT
```

## Project roadmap

Full detail in [`docs/ROADMAP.md`](docs/ROADMAP.md). Every phase advances all
three modalities together — no modality is ever left behind.

| Phase | Focus | Status |
|---|---|---|
| **1** | Preprocessing + recognition models for face/iris/fingerprint, individually evaluated | ✅ Implemented (this branch) |
| **2** | Cancelable template protection, key management, backend + storage | 🔜 Next |
| **3** | Multimodal fusion, React dashboard, full cross-modality evaluation | 🔜 After Phase 2 |

## Repository structure

```text
backend/              FastAPI app (Phase 2+): api/, services/, database/
models/
  common/             BaseEmbedder interface + ArcFace training head
  face/ iris/ fingerprint/   inference.py + saved/ (Git-LFS-tracked checkpoints)
preprocessing/         Modality-specific classical-CV preprocessing
embeddings/            Preprocessing + model wired together behind one interface
template_protection/   Cancelable transform, key management (Phase 2)
fusion/                Multimodal score fusion (Phase 3)
evaluation/            Shared metrics (FAR/FRR/EER/ROC/AUC) + experiment runners
frontend/              React dashboard (Phase 3)
notebooks/             Colab notebooks: dataset download, fine-tuning, image testing
docs/                  Architecture, datasets/licensing, privacy analysis, roadmap
tests/                 Offline tests against synthetic images (no GPU/dataset needed)
```

## Getting started

### Prerequisites

- Python 3.10+
- [Git LFS](https://git-lfs.com/) (`git lfs install`) — trained checkpoints
  (`.pt` files) are tracked via LFS, not committed as regular blobs.

### Setup

```bash
git clone https://github.com/Malik8122/Cancelable-Multimodal-Biometric-Authentication-for-Critical-Infrastructure.git
cd Cancelable-Multimodal-Biometric-Authentication-for-Critical-Infrastructure
python -m venv .venv && source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

### Run the offline test suite

No GPU, no dataset, no trained checkpoint required — these tests exercise the
preprocessing → embedding interface with synthetic images and prove the
pipeline is correctly wired for all three modalities:

```bash
pytest
```

### Train the models (Colab)

Open each notebook in Google Colab (GPU runtime) and run top to bottom — no
Google Drive mount required:

- [`notebooks/01_face_training_and_testing.ipynb`](notebooks/01_face_training_and_testing.ipynb)
- [`notebooks/02_iris_training_and_testing.ipynb`](notebooks/02_iris_training_and_testing.ipynb)
- [`notebooks/03_fingerprint_training_and_testing.ipynb`](notebooks/03_fingerprint_training_and_testing.ipynb)

Each notebook: clones this repo into the Colab runtime, downloads its
modality's dataset (see licensing notes below), preprocesses it with this
repo's own `preprocessing/` code, fine-tunes the embedding model with an
ArcFace head, **saves the resulting checkpoint** to
`models/<modality>/saved/`, evaluates it (accuracy/FAR/FRR/EER/ROC-AUC), and
runs an image-based testing section — genuine vs. impostor pairs and a
gallery-matching demo, with the actual images and similarity scores
displayed, not just a metrics table.

After training, download the checkpoint and commit it back locally:

```bash
git add models/face/saved/face_embedder.pt   # Git LFS picks this up automatically
git commit -m "Add fine-tuned face embedding checkpoint"
git push
```

Until a checkpoint exists for a modality, `BaseEmbedder` transparently falls
back to a deterministic mock embedding (see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#mock-mode)) so the rest of the
system can still be developed and tested.

## Model decisions

| Modality | Model | Why |
|---|---|---|
| Face | InceptionResnetV1, pretrained on VGGFace2 (`facenet-pytorch`) | Strong pretrained embeddings, minimal fine-tuning needed |
| Iris | ResNet18 (ImageNet) + projection head | No public pretrained iris-embedding model exists; small enough to fine-tune fast |
| Fingerprint | ResNet50 (ImageNet) + projection head — **DeepPrint substitute** | DeepPrint has no public weights/implementation, impractical for this timeline; see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#model-decisions-and-why-phase-1) for the full justification |

All three are fine-tuned with the same ArcFace angular-margin loss
(`models/common/arcface.py`) for a consistent, comparable training recipe
across modalities.

## Datasets

| Modality | Dataset | Access |
|---|---|---|
| Face | [LFW](http://vis-www.cs.umass.edu/lfw/) | Auto-downloaded, no login |
| Iris | CASIA-Iris-Thousand (or an equivalent licensed dataset) | **You must obtain a licensed copy yourself** — see [`docs/DATASETS.md`](docs/DATASETS.md) |
| Fingerprint | [SOCOFing](https://www.kaggle.com/datasets/ruizgara/socofing) | Kaggle account required (free) |

Full source/license/retention notes: [`docs/DATASETS.md`](docs/DATASETS.md).
**No raw biometric image from any dataset is ever committed to this repo.**

## Privacy design

- Raw biometric samples exist only for the duration of a preprocessing call —
  nothing persists them to disk.
- The eventual database (Phase 2) stores **only** cancelable/protected
  templates, never raw images or raw embeddings.
- Transformation keys are derived (HKDF), not stored plaintext beside the
  templates they produced (Phase 2).
- Revocability and cross-application diversity are experimentally
  demonstrated, not just asserted (Phase 2 experiments).

Full principles and current honest limitations:
[`docs/PRIVACY_AND_SECURITY.md`](docs/PRIVACY_AND_SECURITY.md).

## Limitations & honest scope

- This is a capstone research/demo system, **not** a production-grade
  security product. No claim of "100% secure," formal cryptographic
  irreversibility, or regulatory compliance is made anywhere in this
  codebase.
- Fingerprint recognition uses a ResNet50 substitute for DeepPrint (see
  above) — an explicit, documented architecture swap, not a silent
  downgrade.
- The iris dataset is license-gated; results depend on the specific dataset
  the user supplies.
- Phase 1 alone (this branch) has **no privacy layer yet** — `BaseEmbedder`
  output is a plain embedding, not a protected credential. Do not treat
  anything before Phase 2 lands as a working privacy guarantee.

## Team / contributor roles

- **Member 1 — Face:** dataset, preprocessing, model, evaluation, `models/face/`.
- **Member 2 — Iris:** dataset, preprocessing, model, evaluation, `models/iris/`.
- **Member 3 — Fingerprint + integration/privacy:** dataset, preprocessing,
  model, evaluation, `models/fingerprint/`, plus the template-protection
  architecture and backend integration planning.

All three modalities share the `BaseEmbedder` interface
(`models/common/base_embedder.py`) precisely so this split can happen without
one member's work blocking another's.

## License

MIT — see [`LICENSE`](LICENSE). This covers the code in this repository; it
does **not** grant any rights to the third-party datasets referenced in
[`docs/DATASETS.md`](docs/DATASETS.md), which carry their own separate
licenses.
