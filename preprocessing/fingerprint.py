"""Fingerprint preprocessing: contrast enhancement + ridge normalization.

Entirely classical computer vision. The output is what the deep-learning
model in models/fingerprint/inference.py consumes.

Steps:
    1. Grayscale + CLAHE contrast enhancement (handles varying scan quality).
    2. Ridge normalization to zero mean / unit variance, which is the
       standard preprocessing step before Gabor-filter-based ridge
       enhancement in fingerprint recognition literature.
    3. Gabor filtering to sharpen ridge/valley structure.
    4. Resize to the model's expected input resolution.
"""

from __future__ import annotations

import cv2
import numpy as np

FINGERPRINT_INPUT_SIZE = 224  # matches the ResNet50 backbone's expected input


class FingerprintPreprocessor:
    """Enhances and normalizes a raw fingerprint scan."""

    def __init__(self, input_size: int = FINGERPRINT_INPUT_SIZE):
        self.input_size = input_size
        self._clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

    @staticmethod
    def _normalize_ridges(gray: np.ndarray, target_mean: float = 100.0, target_var: float = 100.0) -> np.ndarray:
        gray = gray.astype(np.float64)
        mean, var = gray.mean(), gray.var() or 1.0
        normalized = target_mean + np.sign(gray - mean) * np.sqrt(target_var * (gray - mean) ** 2 / var)
        return np.clip(normalized, 0, 255).astype(np.uint8)

    @staticmethod
    def _gabor_enhance(gray: np.ndarray) -> np.ndarray:
        enhanced = np.zeros_like(gray, dtype=np.float64)
        for theta in np.arange(0, np.pi, np.pi / 8):
            kernel = cv2.getGaborKernel((15, 15), sigma=4.0, theta=theta, lambd=10.0, gamma=0.5, psi=0)
            filtered = cv2.filter2D(gray, cv2.CV_64F, kernel)
            enhanced = np.maximum(enhanced, filtered)
        enhanced = cv2.normalize(enhanced, None, 0, 255, cv2.NORM_MINMAX)
        return enhanced.astype(np.uint8)

    def preprocess(self, image: np.ndarray) -> np.ndarray:
        """Enhance and normalize a raw RGB fingerprint scan.

        Returns a 3-channel uint8 array of shape (input_size, input_size, 3)
        (channel-replicated grayscale, matching the ImageNet-pretrained
        backbone's expected 3-channel input).
        """
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        contrast_enhanced = self._clahe.apply(gray)
        ridge_normalized = self._normalize_ridges(contrast_enhanced)
        gabor_enhanced = self._gabor_enhance(ridge_normalized)
        resized = cv2.resize(gabor_enhanced, (self.input_size, self.input_size), interpolation=cv2.INTER_AREA)
        return cv2.cvtColor(resized, cv2.COLOR_GRAY2RGB)
