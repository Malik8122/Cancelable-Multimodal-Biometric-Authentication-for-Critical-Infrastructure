# Cancelable Multimodal Biometric Authentication for Critical Infrastructure

A privacy-preserving biometric authentication system that combines **face,
iris, and fingerprint** recognition with **cancelable biometric template
protection**, so that no raw biometric image or unprotected biometric
embedding is ever stored as the permanent authentication credential.

This is a final-year capstone project. It is a research/demo system, not a
production-hardened security product — see [Limitations & honest
scope](#limitations--honest-scope) before drawing any stronger conclusion
from it.

**Preparing for a project evaluation/viva?** [`docs/PROJECT_REPORT.md`](docs/PROJECT_REPORT.md)
is the full in-depth writeup — motivation, why multimodal, why cancelable
biometrics, how this compares to existing solutions, every model/dataset
decision justified, the real GPU training results (including the honest
ones), and a prepared-answers section for the questions reviewers are most
likely to ask. [`docs/COMPUTER_VISION.md`](docs/COMPUTER_VISION.md) is the
companion deep dive into every computer-vision technique used, with code
references.

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
| **2** | Cancelable template protection, key management, backend + storage | ✅ Implemented (this branch) |
| **3** | Multimodal fusion, React dashboard, full cross-modality evaluation | 🔜 Next |

## Repository structure

```text
backend/              FastAPI app: api/, services/, database/, auth/, config.py
models/
  common/             BaseEmbedder interface + ArcFace training head
  face/ iris/ fingerprint/   inference.py + saved/ (Git-LFS-tracked checkpoints)
preprocessing/         Modality-specific classical-CV preprocessing
embeddings/            Preprocessing + model wired together behind one interface
template_protection/   Cancelable BioHashing transform, HKDF key management, matcher
fusion/                Multimodal score fusion (Phase 3)
evaluation/            Shared metrics (FAR/FRR/EER/ROC/AUC) + experiment runners,
                       including privacy_metrics.py (protected-template experiments)
frontend/              React dashboard (Phase 3)
notebooks/             Colab notebooks: dataset download, fine-tuning, image testing
kaggle_kernels/         Kaggle Kernel equivalents: unattended real-GPU training via the API
scripts/                run_kaggle_kernels.py: push/monitor/pull all 4 Kaggle kernels
docs/                  Architecture, datasets/licensing, privacy analysis, roadmap,
                       template protection + backend API reference
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
pipeline is correctly wired for all three modalities, plus the full
`template_protection/` + `backend/` layer against synthetic embeddings and an
in-memory database:

```bash
pytest
```

### Configure the backend environment

The backend needs a `MASTER_SECRET` — the root secret every cancelable
template's key is derived from (see `docs/TEMPLATE_PROTECTION.md`). There is
no working default; the server refuses to start without one.

```bash
cp .env.example .env
python -c "import secrets; print(secrets.token_hex(32))"   # paste the output into .env as MASTER_SECRET
```

`.env` is gitignored — never commit a real secret. `pytest` doesn't need this
step; the test suite supplies its own obviously-fake secret via a fixture
(`tests/conftest.py`).

### Run the backend

```bash
uvicorn backend.main:app --reload
```

Then see `docs/BACKEND_API.md` for the full endpoint reference, or open
`http://127.0.0.1:8000/docs` for interactive Swagger docs. By default this
creates a local `biometric.db` SQLite file (gitignored) storing **only**
protected templates — never raw images or raw embeddings.

### Train the models

Two equivalent ways to run the same training/evaluation/image-testing logic
— pick whichever fits your workflow. Either way, each run: downloads its
modality's dataset (see licensing notes below), preprocesses it with this
repo's own `preprocessing/` code, fine-tunes the embedding model with an
ArcFace head, **saves the resulting checkpoint** (both `.pt` — the format
`models/<modality>/inference.py` actually loads — and a companion `.h5`
interoperability export) to `models/<modality>/saved/`, evaluates it
(accuracy/FAR/FRR/EER/ROC-AUC), and runs an image-based testing section —
genuine vs. impostor pairs and a gallery-matching demo, with the actual
images and similarity scores displayed, not just a metrics table.

**Option A — Google Colab (manual, interactive):** open each notebook below
in Colab (GPU runtime) and run top to bottom — no Google Drive mount
required.

- [`notebooks/01_face_training_and_testing.ipynb`](notebooks/01_face_training_and_testing.ipynb)
- [`notebooks/02_iris_training_and_testing.ipynb`](notebooks/02_iris_training_and_testing.ipynb)
- [`notebooks/03_fingerprint_training_and_testing.ipynb`](notebooks/03_fingerprint_training_and_testing.ipynb)

Then download the resulting checkpoints and commit them locally.

**Option B — Kaggle Kernels (unattended, scriptable, free GPU):** see
[`kaggle_kernels/README.md`](kaggle_kernels/README.md). Datasets are attached
natively (SOCOFing, the CASIA-Iris-Thousand mirror) instead of downloaded
manually. Once you have a Kaggle API token in place:

```bash
python scripts/run_kaggle_kernels.py
```

pushes all 3 kernels, waits for each to finish on Kaggle's GPU, pulls the
resulting `.pt`/`.h5` checkpoints, and installs them into
`models/<modality>/saved/` automatically. Then:

```bash
git add models/*/saved/*.pt models/*/saved/*.h5   # Git LFS picks these up automatically
git commit -m "Add trained checkpoints from Kaggle GPU training"
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
| Voice | ECAPA-TDNN (SpeechBrain), 192-dim embedding | Current state-of-the-art speaker-verification architecture, PyTorch-compatible, easy to fine-tune; see [`docs/VOICE_MODEL.md`](docs/VOICE_MODEL.md) |

All four are fine-tuned with the same ArcFace angular-margin loss
(`models/common/arcface.py`) for a consistent, comparable training recipe
across modalities.

## Datasets

| Modality | Dataset | Access |
|---|---|---|
| Face | [LFW](http://vis-www.cs.umass.edu/lfw/) | Auto-downloaded, no login |
| Iris | CASIA-Iris-Thousand (or an equivalent licensed dataset) | **You must obtain a licensed copy yourself** — see [`docs/DATASETS.md`](docs/DATASETS.md) |
| Fingerprint | [SOCOFing](https://www.kaggle.com/datasets/ruizgara/socofing) | Kaggle account required (free) |
| Voice | [VoxCeleb1 subset (Indian celebrities)](https://www.kaggle.com/datasets/gaurav41/voxceleb1-audio-wav-files-for-india-celebrity) | Kaggle account required (free); see [`docs/DATASETS.md`](docs/DATASETS.md) for why this is a subset, not the full corpus |

Full source/license/retention notes: [`docs/DATASETS.md`](docs/DATASETS.md).
**No raw biometric image from any dataset is ever committed to this repo.**

## Privacy design

- Raw biometric samples exist only for the duration of a preprocessing call —
  nothing persists them to disk.
- The database (`backend/database/`) stores **only** cancelable/protected
  templates, never raw images or raw embeddings.
- Transformation keys are derived via HKDF-SHA256
  (`template_protection/hkdf_keys.py`), not stored plaintext beside the
  templates they produced.
- Revocability and cross-application diversity are experimentally
  demonstrated (`evaluation/privacy_metrics.py`), not just asserted.

Full principles, the BioHashing/HKDF design, and current honest limitations:
[`docs/PRIVACY_AND_SECURITY.md`](docs/PRIVACY_AND_SECURITY.md) and
[`docs/TEMPLATE_PROTECTION.md`](docs/TEMPLATE_PROTECTION.md).

## Limitations & honest scope

- This is a capstone research/demo system, **not** a production-grade
  security product. No claim of "100% secure," formal cryptographic
  irreversibility, or regulatory compliance is made anywhere in this
  codebase.
- Fingerprint recognition uses a ResNet50 substitute for DeepPrint (see
  above) — an explicit, documented architecture swap, not a silent
  downgrade.
- The iris dataset is license-gated; results depend on the specific dataset
  the user supplies. No trained iris checkpoint is committed yet either —
  `BaseEmbedder` falls back to a deterministic mock embedding for iris until
  one is trained, so iris enrollment/authentication through the backend is
  demonstrably wired end-to-end but not yet biometrically meaningful.
- The cancelable transform's non-invertibility is an information-lossy
  argument, not a cryptographic one-wayness proof — see
  [`docs/TEMPLATE_PROTECTION.md`](docs/TEMPLATE_PROTECTION.md)'s "Security
  assumptions and limitations" for exactly what is and isn't claimed.
- There is no user/API-caller authentication (API keys, OAuth, sessions) —
  every endpoint in `backend/` is reachable by anyone who can reach the
  process; that's out of scope for this capstone's biometric-verification
  focus, not an oversight (see `docs/BACKEND_API.md`).

## Team / contributor roles

- **Member 1 — Face:** dataset, preprocessing, model, evaluation, `models/face/`.
- **Member 2 — Iris:** dataset, preprocessing, model, evaluation, `models/iris/`.
- **Member 3 — Fingerprint + integration/privacy:** dataset, preprocessing,
  model, evaluation, `models/fingerprint/`, plus the `template_protection/`
  cancelable-transform implementation and the `backend/` FastAPI integration.

All three modalities share the `BaseEmbedder` interface
(`models/common/base_embedder.py`) precisely so this split can happen without
one member's work blocking another's.

## License

MIT — see [`LICENSE`](LICENSE). This covers the code in this repository; it
does **not** grant any rights to the third-party datasets referenced in
[`docs/DATASETS.md`](docs/DATASETS.md), which carry their own separate
licenses.
