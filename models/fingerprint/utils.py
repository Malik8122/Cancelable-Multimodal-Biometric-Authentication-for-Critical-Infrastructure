"""Small shared helpers for the fingerprint training pipeline."""

from __future__ import annotations


def detect_device() -> str:
    """"cuda" if a GPU is both reported available *and* actually usable, else "cpu".

    Deferred `torch` import, like every other heavy-dependency import in this
    project (see models/face/inference.py) - importing models/fingerprint/utils.py
    alone must never require torch to be installed.

    `torch.cuda.is_available()` alone isn't sufficient: some hosted GPU
    sessions (observed on Kaggle's free-tier P100s while training the Voice
    modality this same upgrade cycle) report CUDA as available while shipping
    a PyTorch build that doesn't include a compiled kernel for that GPU's
    (older) compute capability - it doesn't fail until the first real op
    runs, deep inside training, as `AcceleratorError: CUDA error: no kernel
    image is available for execution on the device`. Running a real op now
    and falling back to CPU on failure catches this upfront.
    """
    import torch

    if not torch.cuda.is_available():
        return "cpu"
    try:
        (torch.zeros(1, device="cuda") + 1).cpu()
    except Exception:
        return "cpu"
    return "cuda"
