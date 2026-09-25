"""Fig. 3: ROC of the protected-template (256-bit BioHash) decision scores - face, voice, fingerprint, face+voice fusion
and three-modality fusion - on ONE protocol: the chimeric virtual users of evaluation/ieee/experiments.py part14
(20 pairings x 24 users x 3 attempts; LFW held-out faces x VoxCeleb1 test speakers x SOCOFing fingers).

Legend EER / ROC-AUC are read from evaluation/results/fusion_score_level_eer.csv; the curves are regenerated from the
same deterministic scores and asserted to reproduce those values before anything is drawn.

Why not voice_roc.csv / fingerprint_roc.csv / face_metrics.csv: those are the training notebooks' RAW-embedding cosine
evaluations on different protocols (all-pairs; face_metrics.csv is a closed-set summary with no curve), so they are not
protected-template ROCs and are not comparable with the fusion curves.

Run: python -m evaluation.scripts.fig03_roc_protected_templates
Output: evaluation/figures/fig03_roc_protected_templates.png (300 dpi) and .pdf
"""

from __future__ import annotations

import csv

import numpy as np

from evaluation.ieee.common import COL_W, FIGURES, RESULTS, eer, ieee_style, roc
from evaluation.ieee.experiments import MODALITIES, chimeric_rows

#: CSV row name -> (legend label, colour, line style); muted paper palette (evaluation/ieee/common.py::COLORS)
SERIES = {
    "face": ("Face", "#1f4e79", "-"),
    "voice": ("Voice", "#b85c00", "-"),
    "fingerprint": ("Fingerprint", "#2e7d32", "-"),
    "mean(face,voice)": ("Face + Voice fusion", "#6a1b9a", "--"),
    "mean(face,voice,fingerprint)": ("Face + Voice + Fingerprint fusion", "#3a3a3a", "-."),
}


def _reported() -> dict[str, tuple[float, float]]:
    with (RESULTS / "fusion_score_level_eer.csv").open(encoding="utf-8") as f:
        return {r["score"]: (float(r["EER"]), float(r["AUC"])) for r in csv.DictReader(f)}


def curves() -> dict[str, dict]:
    rows = chimeric_rows()
    gen = np.array([r["genuine"] for r in rows])
    scores = {m: np.array([r[f"{m}_score"] for r in rows]) for m in MODALITIES}
    scores["mean(face,voice)"] = (scores["face"] + scores["voice"]) / 2
    scores["mean(face,voice,fingerprint)"] = (scores["face"] + scores["voice"] + scores["fingerprint"]) / 3
    out = {}
    for name, s in scores.items():
        c = roc(s[gen], s[~gen])
        out[name] = {"curve": c, "EER": eer(s[gen], s[~gen])[0], "AUC": float(np.trapezoid(c["tpr"], c["fpr"])),
                     "n_genuine": int(gen.sum()), "n_impostor": int((~gen).sum())}
    return out


def main() -> None:
    reported = _reported()
    data = curves()
    for name in SERIES:  # the drawn curves must be the ones the CSV reports
        e, a = reported[name]
        assert abs(data[name]["EER"] - e) < 5e-6 and abs(data[name]["AUC"] - a) < 5e-6, (name, data[name]["EER"], e, data[name]["AUC"], a)

    plt = ieee_style()
    fig, ax = plt.subplots(figsize=(COL_W, 2.7), facecolor="white")
    ax.set_facecolor("white")
    for name, (label, color, style) in SERIES.items():
        e, a = reported[name]
        c = data[name]["curve"]
        ax.plot(c["fpr"], c["tpr"], ls=style, color=color, lw=1.1, label=f"{label} (EER {100 * e:.2f}%, AUC {a:.4f})")
    ax.set_xscale("log")
    ax.set(xlim=(1e-4, 1), ylim=(0, 1.005), xlabel="False Accept Rate (FAR)", ylabel="True Accept Rate (TAR)")
    ax.grid(True, which="major", color="#b0b0b0")
    ax.grid(True, which="minor", color="#d8d8d8", lw=0.3)
    ax.legend(loc="lower right", fontsize=5.8, frameon=True, framealpha=1.0, edgecolor="#cccccc", facecolor="white")
    n_g, n_i = data["face"]["n_genuine"], data["face"]["n_impostor"]
    ax.set_title(f"ROC, 256-bit protected templates ({n_g:,} genuine / {n_i:,} impostor attempts)", fontsize=7)
    for ext in ("png", "pdf"):
        fig.savefig(FIGURES / f"fig03_roc_protected_templates.{ext}", dpi=300, facecolor="white")
    plt.close(fig)
    print("written:", *(FIGURES / f"fig03_roc_protected_templates.{e}" for e in ("png", "pdf")))


if __name__ == "__main__":
    main()
