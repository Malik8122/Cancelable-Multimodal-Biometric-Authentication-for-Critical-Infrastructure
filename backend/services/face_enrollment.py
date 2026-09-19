"""Face enrollment vocabulary: the five guided poses and the per-pose verdicts.

Face enrollment is a ONE-TIME, five-pose capture (front, left, right, slight up, slight down). Per pose: MTCNN detection,
the existing alignment, one 512-d embedding. A pose is rejected ONLY if no face is detected or the aligned crop is blurry;
nothing else about it (expression, lighting, glasses) is judged. The valid embeddings are averaged into a centroid, the
temporary embeddings are discarded immediately, and the T1-T4 template sets are generated from the centroid alone.
"""

from __future__ import annotations

FACE_POSES = ("front", "left", "right", "up", "down")

#: Per-pose verdicts.
VALID = "VALID"
NO_FACE = "NO_FACE"
BLURRY = "BLURRY"

#: How many valid poses are needed to enroll. The guided UI collects all five (each pose is checked as it is captured and
#: retaken if rejected); the backend tolerates a couple of rejected poses so one bad capture never blocks enrollment,
#: but a centroid of fewer than three poses would not be a meaningful average.
MIN_VALID_POSES = 3

POSE_HINTS = {
    NO_FACE: "No face was detected. Face the camera in good light.",
    BLURRY: "The image is too blurry. Hold still and try again.",
}


class FaceCaptureRejected(RuntimeError):
    """Too few valid poses to enroll; nothing was stored. `report` is the per-pose verdict list."""

    def __init__(self, report: list[dict]):
        valid = sum(1 for r in report if r["status"] == VALID)
        super().__init__(
            f"Only {valid} of {len(report)} captures were usable (need at least {MIN_VALID_POSES}). "
            "Nothing was enrolled - retake the rejected poses."
        )
        self.report = report
