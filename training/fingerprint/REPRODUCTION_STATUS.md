# Fingerprint reproduction status

**Training reproduced: NO** - no run had reached COMPLETED when these documents were generated.

What was found: the training code (`models/fingerprint/train.py`), its configuration, the dataset (under `data/`) and the deployed checkpoint are all present.

Not started in this environment: this is a CPU-only machine with 8 GB RAM, and only one training job can run at a time (the voice run was occupying it).

Command: `python -m training.run_training fingerprint` (then `python -m training.summarize`)

Runs:

Historical information that remains unavailable:
- epochs completed (no saved notebook outputs)
- best validation EER (no saved notebook outputs)
- hardware / duration (no saved notebook outputs)
