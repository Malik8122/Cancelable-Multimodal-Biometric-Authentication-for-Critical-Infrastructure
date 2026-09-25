# Fingerprint training records

Reproduce: `python -m training.run_training fingerprint` (from the repository root; datasets under `data/`, see `training/TRAINING_REPRODUCIBILITY_REPORT.md`).

Each run lives in `runs/<experiment_id>/` with `config.json`, `environment.json`, `training_log.csv` (written after every epoch), `checkpoints/checkpoint_manifest.json` (checkpoint files themselves are gitignored), `best_checkpoint.json`, `metrics/`, `figures/`, `run_status.json`. `latest` names the newest run. The deployed checkpoint in `models/fingerprint/saved/` is NOT produced or replaced by these runs.

## Runs

- none
