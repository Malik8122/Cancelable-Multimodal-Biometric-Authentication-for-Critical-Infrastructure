"""Iris preprocessing: localization + Daugman rubber-sheet normalization.

This pipeline is entirely classical computer vision (no deep learning) -
the deep-learning step happens later, in models/iris/inference.py, on the
normalized iris strip produced here.

Steps:
    1. Localization: find the pupil and iris boundaries via Hough circle
       detection on a smoothed grayscale image.
    2. Normalization: unroll the annular iris region into a fixed-size
       rectangular strip using Daugman's rubber-sheet model, so that the
       embedding model always sees a consistent, scale/rotation-normalized
       representation regardless of pupil dilation or camera distance.
"""

from __future__ import annotations

import cv2
import numpy as np

IRIS_STRIP_HEIGHT = 64
IRIS_STRIP_WIDTH = 512


class IrisPreprocessor:
    """Localizes and normalizes an iris from a raw eye image."""

    def __init__(
        self,
        strip_height: int = IRIS_STRIP_HEIGHT,
        strip_width: int = IRIS_STRIP_WIDTH,
    ):
        self.strip_height = strip_height
        self.strip_width = strip_width

    def _locate_circles(self, gray: np.ndarray) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
        blurred = cv2.medianBlur(gray, 5)

        pupil_circles = cv2.HoughCircles(
            blurred,
            cv2.HOUGH_GRADIENT,
            dp=1,
            minDist=gray.shape[0] // 2,
            param1=100,
            param2=15,
            minRadius=gray.shape[0] // 12,
            maxRadius=gray.shape[0] // 4,
        )
        if pupil_circles is None:
            raise ValueError("Could not localize pupil boundary in the provided eye image.")
        px, py, pr = pupil_circles[0][0]

        iris_circles = cv2.HoughCircles(
            blurred,
            cv2.HOUGH_GRADIENT,
            dp=1,
            minDist=gray.shape[0] // 2,
            param1=100,
            param2=15,
            minRadius=int(pr * 1.8),
            maxRadius=gray.shape[0] // 2,
        )
        if iris_circles is None:
            # Fall back to a fixed ratio of the pupil radius rather than failing outright.
            ix, iy, ir = px, py, int(pr * 2.5)
        else:
            ix, iy, ir = iris_circles[0][0]

        return (int(px), int(py), int(pr)), (int(ix), int(iy), int(ir))

    def _rubber_sheet_normalize(
        self,
        gray: np.ndarray,
        pupil: tuple[int, int, int],
        iris: tuple[int, int, int],
    ) -> np.ndarray:
        px, py, pr = pupil
        ix, iy, ir = iris
        strip = np.zeros((self.strip_height, self.strip_width), dtype=np.uint8)

        thetas = np.linspace(0, 2 * np.pi, self.strip_width, endpoint=False)
        radii = np.linspace(0, 1, self.strip_height, endpoint=False)

        for theta_idx, theta in enumerate(thetas):
            cos_t, sin_t = np.cos(theta), np.sin(theta)
            x_p, y_p = px + pr * cos_t, py + pr * sin_t
            x_i, y_i = ix + ir * cos_t, iy + ir * sin_t
            for r_idx, r in enumerate(radii):
                x = int(x_p + r * (x_i - x_p))
                y = int(y_p + r * (y_i - y_p))
                if 0 <= y < gray.shape[0] and 0 <= x < gray.shape[1]:
                    strip[r_idx, theta_idx] = gray[y, x]

        return strip

    def preprocess(self, image: np.ndarray) -> np.ndarray:
        """Localize and normalize an iris from an RGB eye image.

        Returns a single-channel uint8 array of shape
        (strip_height, strip_width) representing the unrolled iris texture.
        Raises ValueError if the pupil/iris boundaries cannot be located.
        """
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        gray = cv2.equalizeHist(gray)
        pupil, iris = self._locate_circles(gray)
        strip = self._rubber_sheet_normalize(gray, pupil, iris)
        return strip
