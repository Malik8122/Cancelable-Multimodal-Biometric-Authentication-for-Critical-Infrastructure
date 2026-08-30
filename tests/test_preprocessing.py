"""Preprocessing pipeline smoke tests using synthetic images (no real biometric data)."""

from __future__ import annotations

import numpy as np
import pytest


def test_iris_preprocessing_produces_normalized_strip(synthetic_eye_image):
    from preprocessing.iris import IRIS_STRIP_HEIGHT, IRIS_STRIP_WIDTH, IrisPreprocessor

    strip = IrisPreprocessor().preprocess(synthetic_eye_image)

    assert strip.shape == (IRIS_STRIP_HEIGHT, IRIS_STRIP_WIDTH)
    assert strip.dtype == np.uint8


def test_iris_preprocessing_raises_on_uninformative_image():
    """A flat, featureless image has no circular boundaries to localize.

    (Random noise is deliberately not used here: Hough circle detection can
    find spurious circles in unstructured noise, which would make this test
    flaky - a uniform flat image has no edges at all, so it's a reliable
    negative case.)
    """
    from preprocessing.iris import IrisPreprocessor

    flat_image = np.full((300, 300, 3), 128, dtype=np.uint8)

    with pytest.raises(ValueError):
        IrisPreprocessor().preprocess(flat_image)


def test_fingerprint_preprocessing_produces_expected_shape(synthetic_fingerprint_image):
    from preprocessing.fingerprint import FINGERPRINT_INPUT_SIZE, FingerprintPreprocessor

    enhanced = FingerprintPreprocessor().preprocess(synthetic_fingerprint_image)

    assert enhanced.shape == (FINGERPRINT_INPUT_SIZE, FINGERPRINT_INPUT_SIZE, 3)
    assert enhanced.dtype == np.uint8


def test_face_preprocessing_requires_facenet_pytorch_and_detects_no_face_on_noise(random_rgb_image):
    facenet_pytorch = pytest.importorskip(
        "facenet_pytorch", reason="facenet-pytorch not installed in this environment"
    )
    from preprocessing.face import FacePreprocessor

    with pytest.raises(ValueError):
        FacePreprocessor().preprocess(random_rgb_image)
