# Voice Model

Voice is the fourth biometric modality, added alongside Face, Iris, and
Fingerprint. It follows the exact same design philosophy — modality-specific
preprocessing (`preprocessing/voice.py`) feeding a modality-specific
embedding model (`models/voice/`) behind the one shared
`BaseEmbedder.extract_embedding()` interface — with one interface nuance
explained in detail below.

## Architecture: ECAPA-TDNN

[ECAPA-TDNN](https://arxiv.org/abs/2005.07143) (Emphasized Channel Attention,
Propagation and Aggregation in TDNN, Desplanques et al., 2020) is the current
state-of-the-art architecture for speaker verification: a time-delay neural
network (TDNN) backbone with Squeeze-Excitation channel attention and
multi-layer feature aggregation, producing a fixed-length "speaker
embedding" from variable-length speech. This project uses SpeechBrain's
`speechbrain.lobes.models.ECAPA_TDNN.ECAPA_TDNN` implementation
(`models/voice/model.py::VoiceEmbeddingNet`) rather than the full
`speechbrain.inference.speaker.EncoderClassifier` pipeline — the lower-level
module takes precomputed features directly, so `preprocessing/voice.py`
(not SpeechBrain's own internal feature extractor) owns log-mel extraction,
matching how `preprocessing/face.py`, `iris.py`, and `fingerprint.py` each
own their modality's classical preprocessing rather than delegating it into
the model.

Fine-tuning uses the same ArcFace (additive angular margin) loss every other
modality uses — `models/common/arcface.py::ArcMarginProduct`, wrapped by
`models/voice/losses.py::build_arcface_head` rather than reimplemented, so
all four modalities train with one reviewed, consistent loss.

## Integration: why `extract_embedding` takes an array, not a path

An early draft of this module's spec called for
`VoiceEmbedder.extract_embedding(audio_path)`. That can't hold literally:
`models/common/base_embedder.py::BaseEmbedder.extract_embedding` is a
**concrete** method — every modality only implements `_load_checkpoint` and
`_extract_embedding_impl`, never `extract_embedding` itself — that validates
`image.ndim == 3 and image.shape[2] == 3` before dispatching. This is
deliberate: it's the one contract that lets `embeddings/pipelines.py`, and
later fusion/backend code, treat every modality uniformly without knowing
anything about MTCNN, Daugman normalization, Gabor filtering, or (now)
log-mel filterbanks.

The resolution mirrors how Iris already generalizes "image":
`preprocessing/voice.py::VoicePreprocessor.preprocess()` returns an 80-mel-bin
× time-frame log-mel spectrogram — a bare 2D array, exactly like
`preprocessing/iris.py::IrisPreprocessor.preprocess()` returns a bare 2D iris
strip. `embeddings/pipelines.py::ModalityPipeline`'s existing
`if processed.ndim == 2: stack to 3 channels` fallback then turns it into a
pseudo-"RGB" `(n_mels, n_frames, 3)` array purely to satisfy `BaseEmbedder`'s
shape contract — no `base_embedder.py` change, no special-casing anywhere
else. `VoiceEmbedder._extract_embedding_impl` takes channel 0 back out
(lossless, since all 3 channels are identical) before feeding it to
ECAPA-TDNN.

The spec's actual functional ask — a path-based `extract_embedding`,
`load_model`, `compare_embeddings` — is implemented as **free functions in
`models/voice/inference.py`**, built on top of the array-based contract
rather than replacing it:

```python
from models.voice.inference import compare_embeddings
similarity = compare_embeddings("speaker_a.wav", "speaker_b.wav")
```

`embeddings/pipelines.py::VoicePipeline` is the other integration point —
like `FacePipeline`/`IrisPipeline`/`FingerprintPipeline`, but its `embed()`
is overridden to also accept a `sample_rate` argument, since a raw waveform
alone (unlike a raw image) doesn't say what sample rate it was captured at.

## Dataset: VoxCeleb1 (subset)

Trained against [gaurav41/voxceleb1-audio-wav-files-for-india-celebrity](https://www.kaggle.com/datasets/gaurav41/voxceleb1-audio-wav-files-for-india-celebrity)
on Kaggle — a real-audio subset of VoxCeleb1 (Indian-celebrity speakers), not
the full ~1,251-speaker corpus (impractical to download unattended inside a
single Kaggle kernel session — see `docs/DATASETS.md`'s Voice section for
the full licensing/scope note). Number of speakers, utterance counts, and
the resulting train/val/test split are **not hardcoded** — they're printed
at run time by `kaggle_kernels/voice_training/voice-embedding-training.ipynb`'s
dataset cell from whatever the attached copy actually contains. From the
real Kaggle GPU-kernel run that produced the committed checkpoint:

| Metric | Value |
|---|---|
| Speakers | 24 |
| Total utterances | 4,857 |
| Train / Val / Test | 3,389 / 717 / 751 (70% / 15% / 15% per speaker) |

## Real training results

From the same run (`kaggle_kernels/voice_training/`, CPU — see "A note on GPU
compatibility" below), evaluated on the 751-utterance held-out test set via
`evaluation/voice_metrics.py::run_voice_experiment`:

| Metric | Value |
|---|---|
| EER | 2.29% |
| Accuracy (at EER threshold) | 97.71% |
| AUC | 0.9967 |
| Precision | 67.57% |
| Recall | 97.71% |
| F1 | 79.89% |
| Genuine-pair cosine similarity (sample) | 0.895 |
| Impostor-pair cosine similarity (sample) | 0.132 |

Precision is lower than the other metrics because this evaluation counts
every genuine/impostor *pair* among the 751 test utterances (13,101 genuine
pairs vs. 268,524 impostor pairs — impostor pairs vastly outnumber genuine
ones for a 24-speaker test set), not because the model performs poorly; EER
and AUC are the metrics that matter for verification quality and both are
strong for a from-scratch fine-tune on a 24-speaker subset.

### A note on GPU compatibility

The Kaggle free-tier GPU (Tesla P100, compute capability 6.0) available for
this run was **not supported** by the preinstalled PyTorch build (which only
supports compute capability 7.0+) — `models/voice/utils.py::detect_device()`
smoke-tests CUDA with a real op and falls back to CPU rather than crashing
mid-training when this happens, which is what training actually ran on.
Training completed in full (all 30 epochs) in a little under 8 hours on CPU.

**Split methodology:** per-identity 70/15/15 (`models/voice/dataset.py::VoxCelebDataset`),
the same simplification `notebooks/03_fingerprint_training_and_testing.ipynb`
already uses, rather than VoxCeleb1's official fixed trial-list verification
protocol — a deliberate, documented scope reduction (same spirit as the
ResNet50-for-DeepPrint substitution in `docs/ARCHITECTURE.md`), not a silent
gap.

## Preprocessing pipeline

```text
raw waveform (any sample rate, mono or stereo)
        |
Mono conversion (average channels)
        |
Resample to 16 kHz (scipy.signal.resample_poly)
        |
Voice activity detection (energy-threshold, trims near-silent frames)
        |
Loudness normalization (scale to a target RMS level)
        |
Fixed-length segment extraction (4s: random crop when training, center crop
                                  at inference; zero-padded if shorter)
        |
80-bin log-mel filterbank (manual triangular filterbank + scipy.signal.stft,
                            mean-normalized)
        |
(n_mels, n_frames) float32 array  -> embeddings/pipelines.py stacks to
                                      pseudo-RGB -> BaseEmbedder contract
```

**Zero hard dependencies for preprocessing/testing.** `preprocessing/voice.py`
uses only `numpy` + `scipy` (`scipy.io.wavfile`, `scipy.signal`) — no
`torchaudio`, `speechbrain`, or `webrtcvad` required just to preprocess audio
or run this project's offline tests. Those three are genuinely needed (and
listed in `requirements.txt`) for the real ECAPA-TDNN backbone and Kaggle/
Colab training, imported lazily inside `models/voice/model.py`/`inference.py`
exactly like `models/face/inference.py` defers `facenet_pytorch` — so
`tests/test_voice_preprocessing.py`, `test_voice_dataset.py`, and
`test_voice_embedding.py` all pass with zero optional dependencies installed,
same as Face/Fingerprint's mock-mode tests. VAD defaults to a dependency-free
energy-threshold implementation (`VoiceConfig.vad_backend = "energy"`);
`webrtcvad` is opt-in, not required, since it needs a compiled C extension
that isn't reliably installable on every dev machine.

Augmentation (Gaussian noise, speed perturbation, time/frequency masking,
random gain — configured via `VoiceConfig`'s `augmentation_*` fields) is
training-only and never applied by `VoicePreprocessor.preprocess()` at
inference (`training=False`).

## Training configuration

All defaults live in `models/voice/config.py::VoiceConfig` — one dataclass,
not scattered constants, since Voice has enough independently-tunable knobs
to warrant it (unlike Face/Iris/Fingerprint's handful of module-level
constants).

| Parameter | Default |
|---|---|
| Sample rate | 16,000 Hz |
| Clip length | 4 seconds |
| Mel bins | 80 |
| Embedding size | 192 |
| Optimizer | AdamW |
| Scheduler | CosineAnnealingLR |
| Batch size | 64 |
| Epochs | 30 |
| Mixed precision | Enabled (CUDA only) |
| Early stopping patience | 5 epochs |
| ArcFace margin / scale | 0.50 / 30.0 |

## Embedding dimension

**192-dimensional**, L2-normalized — matches SpeechBrain's standard
`spkrec-ecapa-voxceleb` embedding size and the spec's requirement.

## Output checkpoints

`models/voice/train.py::train()` (and `models/voice/export.py::export_checkpoint`
for standalone re-export) produce, in `models/voice/saved/`:

- `voice_embedder.pt` — canonical, loaded by `models/voice/inference.py`.
- `voice_embedder.h5` — interoperability export
  (`models/common/checkpoint_io.py::save_state_dict_as_h5`, the same utility
  Face/Iris/Fingerprint use).
- `training_config.json` — the exact `VoiceConfig` used, for reproducibility.

Until a checkpoint exists, `VoiceEmbedder` transparently falls back to
`BaseEmbedder`'s deterministic mock-mode embedding, exactly like Iris does
today — the rest of the system (tests, `embeddings.pipelines.VoicePipeline`,
a future backend service) can be exercised end-to-end without a GPU.

## Kaggle GPU training

`kaggle_kernels/voice_training/` (`kernel-metadata.json` +
`voice-embedding-training.ipynb`) is the unattended, real-GPU counterpart to
`notebooks/04_voice_training.ipynb`'s manual/interactive Colab version — same
relationship the other three modalities already have between their
`kaggle_kernels/*_training/` and `notebooks/0N_*_training_and_testing.ipynb`.
Run via:

```bash
python scripts/run_kaggle_kernels.py --only voice
```

which pushes the kernel, polls until it finishes on Kaggle's GPU, and
installs the resulting `.pt`/`.h5` checkpoints into `models/voice/saved/`
automatically — see `kaggle_kernels/README.md`.
