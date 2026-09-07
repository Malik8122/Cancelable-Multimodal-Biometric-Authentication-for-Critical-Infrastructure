# Datasets

None of these datasets are committed to this repository (see `.gitignore`). Raw
biometric images only ever exist locally / in a Colab runtime during
preprocessing and training, per the privacy-by-design principle in
`docs/PRIVACY_AND_SECURITY.md`.

## Face — LFW (Labeled Faces in the Wild)

- **Source:** [vis-www.cs.umass.edu/lfw](http://vis-www.cs.umass.edu/lfw/), downloaded
  in `notebooks/01_face_training_and_testing.ipynb` via
  `sklearn.datasets.fetch_lfw_people` — no account or manual download needed.
- **License:** released for non-commercial research use by the University of
  Massachusetts; individual images retain the copyright/usage terms of their
  original web sources. Redistribution of derived embeddings/models trained on
  it for research purposes is standard practice in the face-recognition
  literature, but this is **not** a commercial-use license.
- **Retention:** raw images live only in the Colab runtime's `/content` during
  training; they are never written into this repository.

## Iris — CASIA-Iris-Thousand (or an equivalent licensed dataset)

- **Official source:** [biometrics.idealtest.org](http://biometrics.idealtest.org/findTotalDbByMode.do?mode=Iris),
  requires registering and signing CASIA's license agreement before access is
  granted.
- **Unofficial mirrors** exist on Kaggle and Hugging Face. Their redistribution
  rights relative to CASIA's original license are **not verified by this
  project** — `notebooks/02_iris_training_and_testing.ipynb` deliberately does
  **not** auto-download a mirror; it requires you to set `DATASET_ROOT` to a
  copy you have personally confirmed you're licensed to use.
- **Why iris specifically:** unlike face (LFW) and fingerprint (SOCOFing),
  there is currently no widely-used iris dataset that is both academically
  standard and unambiguously redistributable without a signed agreement. This
  is documented here explicitly rather than silently assumed, per the "do not
  assume datasets can be freely redistributed" principle in the master project
  brief.
- **Retention:** same as Face — never committed to the repo.

## Fingerprint — SOCOFing (Sokoto Coventry Fingerprint Dataset)

- **Source:** [kaggle.com/datasets/ruizgara/socofing](https://www.kaggle.com/datasets/ruizgara/socofing),
  downloaded in `notebooks/03_fingerprint_training_and_testing.ipynb` via
  `kagglehub` (requires a free Kaggle account + API token, stored as Colab
  Secrets — never hard-coded in the notebook).
- **License:** freely available for non-commercial academic research (Shehu,
  Ruiz-Garcia et al., 2018, [arXiv:1807.10609](https://arxiv.org/abs/1807.10609)).
  6,000 fingerprint images from 600 African subjects, plus synthetically
  altered variants (obliteration, central rotation, z-cut) not used in Phase 1.
- **Retention:** same as Face — never committed to the repo.

## Voice — VoxCeleb1 (subset)

- **Source used:** [gaurav41/voxceleb1-audio-wav-files-for-india-celebrity](https://www.kaggle.com/datasets/gaurav41/voxceleb1-audio-wav-files-for-india-celebrity)
  on Kaggle, attached natively in `kaggle_kernels/voice_training/kernel-metadata.json`
  (no manual download, no Kaggle API token needed inside the kernel).
- **What it actually is:** a real-audio **subset** of VoxCeleb1 (Indian-celebrity
  speakers only), not the full ~1,251-speaker VoxCeleb1 corpus. The official
  full corpus ([robots.ox.ac.uk/~vgg/data/voxceleb](https://www.robots.ox.ac.uk/~vgg/data/voxceleb/vox1.html))
  is tens of GB split across many part-files and impractical to download
  unattended inside a single Kaggle kernel session within this capstone's
  scope — the same kind of scope reduction already documented for Fingerprint
  (ResNet50-for-DeepPrint) and Iris (mirror dataset) elsewhere in this file.
  Exact speaker/utterance/split counts are **not hardcoded here** — they
  depend on exactly what this subset contains and are printed at kernel
  run time by `kaggle_kernels/voice_training/voice-embedding-training.ipynb`'s
  dataset cell (see `docs/VOICE_MODEL.md`).
- **License:** DbCL-1.0 (Database Contents License), as declared by the
  dataset's Kaggle listing. This is a derived subset of VoxCeleb1's audio,
  not an independently-verified redistribution grant from VoxCeleb1's
  original maintainers (University of Oxford VGG) — noted explicitly per
  this project's "do not assume datasets can be freely redistributed"
  principle, the same honesty standard applied to Iris's CASIA mirror above.
- **Retention:** same as every other modality — raw audio only ever exists
  locally / in the Kaggle runtime during preprocessing and training; never
  committed to this repository.

## General policy

- No raw biometric image, of any modality, from any dataset, is ever committed
  to this repository or the production database (see `.gitignore` and
  `docs/PRIVACY_AND_SECURITY.md` for the enforcement mechanism).
- If you swap in a different dataset for any modality, update this file with
  its source, license, and retention notes — don't assume a new dataset is
  automatically fine to redistribute or commit.
