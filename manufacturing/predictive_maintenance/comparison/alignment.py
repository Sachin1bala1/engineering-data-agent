"""Alignment utilities for baseline vs experiment comparison."""

from __future__ import annotations

from typing import List, Tuple

import pandas as pd


def align_datasets(
    baseline: pd.DataFrame,
    experiment: pd.DataFrame,
    method: str
) -> Tuple[pd.DataFrame, List[str]]:
    warnings: List[str] = []

    if method == "timestamp":
        if "timestamp" not in baseline.columns or "timestamp" not in experiment.columns:
            warnings.append("Timestamp alignment requested but timestamp column missing.")
            method = "index"
        else:
            baseline_sorted = baseline.sort_values("timestamp")
            experiment_sorted = experiment.sort_values("timestamp")
            aligned = pd.merge_asof(
                experiment_sorted,
                baseline_sorted,
                on="timestamp",
                direction="nearest",
                suffixes=("_experiment", "_baseline")
            )
            return aligned, warnings

    if method == "run_hours" and "run_hours" in baseline.columns and "run_hours" in experiment.columns:
        baseline_sorted = baseline.sort_values("run_hours")
        experiment_sorted = experiment.sort_values("run_hours")
        aligned = pd.merge_asof(
            experiment_sorted,
            baseline_sorted,
            on="run_hours",
            direction="nearest",
            suffixes=("_experiment", "_baseline")
        )
        return aligned, warnings

    if method != "index":
        warnings.append(f"Alignment method {method} unavailable; falling back to index.")

    baseline_reset = baseline.reset_index(drop=True)
    experiment_reset = experiment.reset_index(drop=True)
    min_len = min(len(baseline_reset), len(experiment_reset))
    aligned = pd.concat(
        [
            experiment_reset.iloc[:min_len].add_suffix("_experiment"),
            baseline_reset.iloc[:min_len].add_suffix("_baseline"),
        ],
        axis=1
    )
    return aligned, warnings
