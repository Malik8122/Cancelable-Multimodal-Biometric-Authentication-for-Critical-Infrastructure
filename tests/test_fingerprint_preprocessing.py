"""Offline tests for the upgraded preprocessing/fingerprint.py pipeline.

Synthetic fingerprint-like image only (tests/conftest.py's
`synthetic_fingerprint_image` fixture) - no SOCOFing, no network. Extends
tests/test_preprocessing.py's basic shape/dtype check with coverage of the
individual pipeline stages this accuracy upgrade touches (CLAHE clip 3.0,
Gaussian blur, Gabor bank, min-max normalization, ImageNet normalization).
"""

from __future__ import annotations

import numpy as np

from preprocessing.fingerprint import (
    FINGERPRINT_INPUT_SIZE,
    IMAGENET_MEAN,
    IMAGENET_STD,
    FingerprintPreprocessor,
    imagenet_normalize,
)


def test_enhance_output_is_full_range_uint8(synthetic_fingerprint_image):
    """The min-max normalization step should stretch the response to use the
    full [0, 255] range (allowing for resize-interpolation edge effects)."""
    enhanced = FingerprintPreprocessor().enhance(synthetic_fingerprint_image)

    assert enhanced.dtype == np.uint8
    assert enhanced.min() < 50
    assert enhanced.max() > 200


def test_enhance_channels_are_identical_grayscale_replication(synthetic_fingerprint_image):
    enhanced = FingerprintPreprocessor().enhance(synthetic_fingerprint_image)

    np.testing.assert_array_equal(enhanced[:, :, 0], enhanced[:, :, 1])
    np.testing.assert_array_equal(enhanced[:, :, 1], enhanced[:, :, 2])


def test_enhance_is_deterministic(synthetic_fingerprint_image):
    preprocessor = FingerprintPreprocessor()

    first = preprocessor.enhance(synthetic_fingerprint_image)
    second = preprocessor.enhance(synthetic_fingerprint_image)

    np.testing.assert_array_equal(first, second)


def test_clahe_clip_limit_is_3(synthetic_fingerprint_image):
    preprocessor = FingerprintPreprocessor()
    assert preprocessor._clahe.getClipLimit() == 3.0


def test_gabor_filter_bank_uses_8_orientations(synthetic_fingerprint_image):
    import cv2

    gray = cv2.cvtColor(synthetic_fingerprint_image, cv2.COLOR_RGB2GRAY)
    response = FingerprintPreprocessor()._gabor_filter_bank(gray, num_orientations=8)

    assert response.shape == gray.shape
    assert response.dtype == np.float64


def test_imagenet_normalize_matches_standard_constants():
    image = np.full((4, 4, 3), 255, dtype=np.uint8)

    normalized = imagenet_normalize(image)

    expected = (1.0 - np.array(IMAGENET_MEAN, dtype=np.float32)) / np.array(IMAGENET_STD, dtype=np.float32)
    np.testing.assert_allclose(normalized[0, 0], expected, atol=1e-6)


def test_preprocess_equals_imagenet_normalize_of_enhance(synthetic_fingerprint_image):
    preprocessor = FingerprintPreprocessor()

    enhanced = preprocessor.enhance(synthetic_fingerprint_image)
    preprocessed = preprocessor.preprocess(synthetic_fingerprint_image)

    np.testing.assert_allclose(preprocessed, imagenet_normalize(enhanced))


def test_preprocess_output_shape_and_dtype(synthetic_fingerprint_image):
    preprocessed = FingerprintPreprocessor().preprocess(synthetic_fingerprint_image)

    assert preprocessed.shape == (FINGERPRINT_INPUT_SIZE, FINGERPRINT_INPUT_SIZE, 3)
    assert preprocessed.dtype == np.float32


def test_preprocess_is_compatible_with_the_shared_pipeline_and_mock_embedder(synthetic_fingerprint_image):
    """End-to-end sanity check: the new preprocessing output still satisfies
    BaseEmbedder's (H, W, 3) contract used by embeddings/pipelines.py."""
    from embeddings.pipelines import FingerprintPipeline

    pipeline = FingerprintPipeline(checkpoint_path=None)
    embedding = pipeline.embed(synthetic_fingerprint_image)

    assert embedding.shape == (pipeline.embedding_dim,)
    assert np.isclose(np.linalg.norm(embedding), 1.0, atol=1e-5)
