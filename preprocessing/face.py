"""Face preprocessing: detection + alignment.

Uses MTCNN (via facenet-pytorch) for face detection and landmark-based
alignment. This is the standard preprocessing step expected by the
InceptionResnetV1 embedding model used in models/face/inference.py.

Classical CV vs deep learning split:
    - Detection & landmark localization: deep learning (MTCNN).
    - Alignment (crop/rotate to canonical pose): classical geometric
      transform driven by the detected landmarks.
"""

from __future__ import annotations

import numpy as np

FACE_INPUT_SIZE = 160  # required input size for InceptionResnetV1


class FacePreprocessor:
    """Detects, aligns, and crops a face from a raw RGB image."""

    def __init__(self, device: str = "cpu"):
        self.device = device
        self._detector = None  # lazy-loaded; MTCNN is only needed when real preprocessing runs

    def _get_detector(self):
        if self._detector is None:
            from facenet_pytorch import MTCNN

            self._detector = MTCNN(
                image_size=FACE_INPUT_SIZE,
                margin=0,
                post_process=True,
                device=self.device,
            )
        return self._detector

    def preprocess(self, image: np.ndarray) -> np.ndarray:
        """Detect + align the largest face in `image`.

        Returns an RGB uint8 array of shape (FACE_INPUT_SIZE, FACE_INPUT_SIZE, 3).
        Raises ValueError if no face is detected.
        """
        from PIL import Image

        detector = self._get_detector()
        pil_image = Image.fromarray(image)
        aligned = detector(pil_image)
        if aligned is None:
            raise ValueError("No face detected in the provided image.")

        # facenet-pytorch returns a normalized CHW torch tensor; convert back
        # to an HWC uint8 RGB array so the rest of the pipeline stays
        # framework-agnostic.
        arr = aligned.permute(1, 2, 0).detach().cpu().numpy()
        arr = ((arr * 128.0) + 127.5).clip(0, 255).astype(np.uint8)
        return arr
