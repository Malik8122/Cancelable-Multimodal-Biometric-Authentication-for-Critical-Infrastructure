"""Small shared helpers for the Voice module.

Config JSON load/save lives on `VoiceConfig` itself (config.py); this module
holds the one thing every other file needs and none of them should
re-derive independently: which device to run on.
"""

from __future__ import annotations


def detect_device() -> str:
    """"cuda" if a GPU is available (Kaggle/Colab training), else "cpu".

    Deferred `torch` import, like every other heavy-dependency import in this
    project (see models/face/inference.py) - importing models/voice/utils.py
    alone must never require torch to be installed.
    """
    import torch

    return "cuda" if torch.cuda.is_available() else "cpu"
