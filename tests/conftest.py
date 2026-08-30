"""Synthetic-image fixtures.

None of these tests require a GPU, a trained checkpoint, or a downloaded
dataset - they exist to prove the preprocessing -> embedding interface is
correctly wired for all three modalities using generated placeholder images,
per the "local dummy verification" step described in docs/ROADMAP.md.
"""

from __future__ import annotations

import numpy as np
import pytest


@pytest.fixture
def random_rgb_image():
    rng = np.random.default_rng(42)
    return rng.integers(0, 256, size=(224, 224, 3), dtype=np.uint8)


@pytest.fixture
def synthetic_eye_image():
    """A synthetic 'eye' image with clearly drawn concentric circles.

    Guarantees the classical Hough-circle-based iris localizer in
    preprocessing/iris.py has something detectable, without needing a real
    iris photograph.
    """
    import cv2

    image = np.full((300, 300, 3), 200, dtype=np.uint8)
    center = (150, 150)
    cv2.circle(image, center, 90, (120, 100, 80), -1, lineType=cv2.LINE_AA)  # iris
    cv2.circle(image, center, 35, (10, 10, 10), -1, lineType=cv2.LINE_AA)  # pupil
    return image


@pytest.fixture
def synthetic_fingerprint_image():
    """A synthetic ridge-like pattern (sine-wave stripes) standing in for a scan."""
    x = np.linspace(0, 20 * np.pi, 300)
    y = np.linspace(0, 20 * np.pi, 300)
    xx, yy = np.meshgrid(x, y)
    ridges = (np.sin(xx) * 127 + 128).astype(np.uint8)
    return np.stack([ridges] * 3, axis=-1)
