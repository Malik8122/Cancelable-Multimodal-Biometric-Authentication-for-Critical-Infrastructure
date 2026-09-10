"""GET /metrics/{modality}: real, already-computed evaluation numbers - never invented here.

Reads `evaluation/results/<modality>_metrics.csv`, the same artifact
`evaluation/fingerprint_metrics.py`/`evaluation/voice_metrics.py` write from
real Kaggle GPU runs. If a modality's file doesn't exist (or a field within
it was never computed), that's returned as missing/absent rather than
fabricated - `available: false` for a whole modality, or a field simply not
present in `metrics` otherwise. This module does zero inference and touches
no model checkpoints; it just formats a CSV as JSON.
"""

from __future__ import annotations

import csv
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from backend.services import _SUPPORTED_MODALITIES

router = APIRouter()

_RESULTS_DIR = Path(__file__).resolve().parents[2] / "evaluation" / "results"


class ModalityMetricsResponse(BaseModel):
    modality: str
    available: bool
    metrics: dict[str, float] = Field(default_factory=dict)


def _read_metrics_csv(modality: str) -> dict[str, float] | None:
    csv_path = _RESULTS_DIR / f"{modality}_metrics.csv"
    if not csv_path.exists():
        return None

    metrics: dict[str, float] = {}
    with csv_path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            key = row["metric"]
            if key == "modality":
                continue
            metrics[key] = float(row["value"])
    return metrics


@router.get("/metrics/{modality}", response_model=ModalityMetricsResponse)
def get_metrics(modality: str) -> ModalityMetricsResponse:
    if modality not in _SUPPORTED_MODALITIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported modality {modality!r}; expected one of {_SUPPORTED_MODALITIES}",
        )

    metrics = _read_metrics_csv(modality)
    if metrics is None:
        return ModalityMetricsResponse(modality=modality, available=False)
    return ModalityMetricsResponse(modality=modality, available=True, metrics=metrics)
