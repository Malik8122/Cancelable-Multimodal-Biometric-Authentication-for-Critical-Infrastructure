"""Push all 3 Phase 1 Kaggle Kernels, wait for them to finish, and pull the
trained checkpoints back into models/<modality>/saved/.

Requires: `pip install kaggle` and a Kaggle API token at ~/.kaggle/kaggle.json
(see kaggle_kernels/README.md).

Usage:
    python scripts/run_kaggle_kernels.py                 # all 3 modalities
    python scripts/run_kaggle_kernels.py --only face      # just one
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
KAGGLE_KERNELS_DIR = REPO_ROOT / "kaggle_kernels"
POLL_INTERVAL_SECONDS = 30
MAX_WAIT_SECONDS = 60 * 60  # Kaggle GPU kernels are capped at a few hours anyway

MODALITIES = {
    "face": ("face_training", "face-embedding-training"),
    "iris": ("iris_training", "iris-embedding-training"),
    "fingerprint": ("fingerprint_training", "fingerprint-embedding-training"),
}


def get_kaggle_username() -> str:
    kaggle_json = Path.home() / ".kaggle" / "kaggle.json"
    if not kaggle_json.exists():
        raise SystemExit(
            f"No Kaggle API token found at {kaggle_json}. "
            "See kaggle_kernels/README.md for how to create one."
        )
    with open(kaggle_json) as f:
        return json.load(f)["username"]


def patch_kernel_metadata(kernel_dir: Path, username: str) -> str:
    metadata_path = kernel_dir / "kernel-metadata.json"
    metadata = json.loads(metadata_path.read_text())
    slug = metadata["id"].split("/")[-1]
    metadata["id"] = f"{username}/{slug}"
    metadata_path.write_text(json.dumps(metadata, indent=2))
    return metadata["id"]


def run(cmd: list[str]) -> str:
    result = subprocess.run(cmd, capture_output=True, text=True)
    output = result.stdout + result.stderr
    print(output)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{output}")
    return output


def push_kernel(kernel_dir: Path) -> None:
    run(["kaggle", "kernels", "push", "-p", str(kernel_dir)])


def wait_for_completion(kernel_id: str) -> None:
    waited = 0
    while waited < MAX_WAIT_SECONDS:
        status_output = run(["kaggle", "kernels", "status", kernel_id]).lower()
        if "complete" in status_output:
            print(f"{kernel_id}: complete")
            return
        if "error" in status_output or "cancelled" in status_output:
            raise RuntimeError(f"{kernel_id} failed - see output above")
        print(f"{kernel_id}: still running, waiting {POLL_INTERVAL_SECONDS}s...")
        time.sleep(POLL_INTERVAL_SECONDS)
        waited += POLL_INTERVAL_SECONDS
    raise TimeoutError(f"{kernel_id} did not complete within {MAX_WAIT_SECONDS}s")


def pull_output_and_install_checkpoints(kernel_id: str, modality: str) -> None:
    output_dir = REPO_ROOT / "kaggle_output" / modality
    output_dir.mkdir(parents=True, exist_ok=True)
    run(["kaggle", "kernels", "output", kernel_id, "-p", str(output_dir)])

    saved_source = output_dir / "repo" / "models" / modality / "saved"
    saved_dest = REPO_ROOT / "models" / modality / "saved"
    saved_dest.mkdir(parents=True, exist_ok=True)

    copied = []
    for pattern in ("*.pt", "*.h5"):
        for src_file in saved_source.glob(pattern):
            dest_file = saved_dest / src_file.name
            shutil.copy2(src_file, dest_file)
            copied.append(dest_file)

    if not copied:
        raise RuntimeError(
            f"No .pt/.h5 checkpoint found under {saved_source} - check the kernel's "
            "output for errors before assuming training succeeded."
        )
    for path in copied:
        print(f"Installed checkpoint: {path.relative_to(REPO_ROOT)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=list(MODALITIES), help="Run a single modality instead of all 3")
    args = parser.parse_args()

    username = get_kaggle_username()
    targets = [args.only] if args.only else list(MODALITIES)

    for modality in targets:
        subdir, slug = MODALITIES[modality]
        kernel_dir = KAGGLE_KERNELS_DIR / subdir
        print(f"\n=== {modality} ===")
        kernel_id = patch_kernel_metadata(kernel_dir, username)
        push_kernel(kernel_dir)
        wait_for_completion(kernel_id)
        pull_output_and_install_checkpoints(kernel_id, modality)

    print("\nDone. Review the changes, then:")
    print("  git add models/*/saved/*.pt models/*/saved/*.h5")
    print('  git commit -m "Add trained checkpoints from Kaggle GPU training"')
    print("  git push")


if __name__ == "__main__":
    main()
