"""Fingerprint preprocessing: contrast enhancement + ridge normalization.

Entirely classical computer vision. `enhance()` is the deep-learning-agnostic
part (steps 1-7 below); `preprocess()` additionally applies ImageNet
normalization since that's the form `models/fingerprint/inference.py`'s
ResNet50 backbone actually expects.

Steps:
    1. Grayscale.
    2. CLAHE contrast enhancement (handles varying scan quality).
    3. Ridge normalization to zero mean / unit variance, the standard
       preprocessing step before Gabor-filter-based ridge enhancement in
       fingerprint recognition literature.
    4. Gaussian blur (3x3) to suppress high-frequency sensor noise before
       orientation-selective filtering.
    5. Gabor filter bank (8 orientations) to sharpen ridge/valley structure.
    6. Min-max normalization back to the full [0, 255] range.
    7. Resize to the model's expected input resolution.
    8. (`preprocess()` only) ImageNet mean/std normalization to float32.

`enhance()` (steps 1-7, uint8 output) is what training-time augmentation
(`models/fingerprint/dataset.py`) operates on - augmenting brightness/contrast/
noise on an already-ImageNet-normalized tensor would not mean what it says,
so ImageNet normalization has to be the last step, after augmentation, not
baked into the shared enhancement path. `preprocess()` (steps 1-8) is the
inference-time contract every other caller (`embeddings/pipelines.py`,
`BaseEmbedder`) already relies on, and remains unchanged for them.
"""

from __future__ import annotations

import cv2
import numpy as np

FINGERPRINT_INPUT_SIZE = 224  # matches the ResNet50 backbone's expected input

#: Standard ImageNet per-channel statistics (RGB order), the same constants
#: `torchvision.models.ResNet50_Weights.IMAGENET1K_V2` was trained against.
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


def imagenet_normalize(image: np.ndarray) -> np.ndarray:
    """(H, W, 3) uint8 [0, 255] -> (H, W, 3) float32, ImageNet mean/std normalized."""
    scaled = image.astype(np.float32) / 255.0
    mean = np.array(IMAGENET_MEAN, dtype=np.float32)
    std = np.array(IMAGENET_STD, dtype=np.float32)
    return (scaled - mean) / std


class FingerprintPreprocessor:
    """Enhances and normalizes a raw fingerprint scan."""

    def __init__(self, input_size: int = FINGERPRINT_INPUT_SIZE):
        self.input_size = input_size
        self._clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))

    @staticmethod
    def _normalize_ridges(gray: np.ndarray, target_mean: float = 100.0, target_var: float = 100.0) -> np.ndarray:
        gray = gray.astype(np.float64)
        mean, var = gray.mean(), gray.var() or 1.0
        normalized = target_mean + np.sign(gray - mean) * np.sqrt(target_var * (gray - mean) ** 2 / var)
        return np.clip(normalized, 0, 255).astype(np.uint8)

    @staticmethod
    def _gabor_filter_bank(gray: np.ndarray, num_orientations: int = 8) -> np.ndarray:
        """Max-response combination across `num_orientations` evenly-spaced Gabor kernels."""
        enhanced = np.zeros_like(gray, dtype=np.float64)
        for theta in np.arange(0, np.pi, np.pi / num_orientations):
            kernel = cv2.getGaborKernel((15, 15), sigma=4.0, theta=theta, lambd=10.0, gamma=0.5, psi=0)
            filtered = cv2.filter2D(gray, cv2.CV_64F, kernel)
            enhanced = np.maximum(enhanced, filtered)
        return enhanced

    def enhance(self, image: np.ndarray) -> np.ndarray:
        """Run the classical-CV enhancement pipeline (steps 1-7).

        Returns a 3-channel uint8 array of shape (input_size, input_size, 3)
        (channel-replicated grayscale, matching the ImageNet-pretrained
        backbone's expected 3-channel input) - *without* ImageNet
        normalization, so this is what training-time augmentation should
        operate on. See `preprocess()` for the full inference-time contract.
        """
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        contrast_enhanced = self._clahe.apply(gray)
        ridge_normalized = self._normalize_ridges(contrast_enhanced)
        blurred = cv2.GaussianBlur(ridge_normalized, (3, 3), sigmaX=0)
        gabor_response = self._gabor_filter_bank(blurred)
        min_max_normalized = cv2.normalize(gabor_response, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
        resized = cv2.resize(min_max_normalized, (self.input_size, self.input_size), interpolation=cv2.INTER_AREA)
        return cv2.cvtColor(resized, cv2.COLOR_GRAY2RGB)

    def preprocess(self, image: np.ndarray) -> np.ndarray:
        """Enhance and normalize a raw RGB fingerprint scan for the embedding model.

        Returns a (input_size, input_size, 3) float32 array, ImageNet
        mean/std normalized - the contract `models/fingerprint/inference.py`
        and `embeddings/pipelines.py` expect.
        """
        return imagenet_normalize(self.enhance(image))
