"""Deterministic engineering statistics for comparisons."""

from __future__ import annotations

from typing import Dict, Optional

import numpy as np


def compute_stats(values: np.ndarray) -> Dict[str, float]:
    clean = values[~np.isnan(values)]
    if clean.size == 0:
        return {"mean": 0.0, "std": 0.0, "count": 0, "min": np.nan, "max": np.nan}

    return {
        "mean": float(np.mean(clean)),
        "std": float(np.std(clean, ddof=1)) if clean.size > 1 else 0.0,
        "count": int(clean.size),
        "min": float(np.min(clean)),
        "max": float(np.max(clean)),
    }


def compute_trend(values: np.ndarray) -> Optional[float]:
    clean = values[~np.isnan(values)]
    if clean.size < 3:
        return None
    x = np.arange(clean.size)
    slope = np.polyfit(x, clean, 1)[0]
    return float(slope)


def percent_delta(baseline_mean: float, experiment_mean: float) -> Optional[float]:
    if baseline_mean == 0:
        return None
    return float((experiment_mean - baseline_mean) / baseline_mean * 100.0)


def z_score(experiment_mean: float, baseline_mean: float, baseline_std: float) -> Optional[float]:
    if baseline_std == 0:
        return None
    return float((experiment_mean - baseline_mean) / baseline_std)


def persistence_above(values: np.ndarray, threshold: float) -> Optional[float]:
    clean = values[~np.isnan(values)]
    if clean.size == 0:
        return None
    return float(np.mean(clean > threshold) * 100.0)


def severity_from_z(z: Optional[float]) -> str:
    if z is None:
        return "UNKNOWN"
    abs_z = abs(z)
    if abs_z < 1:
        return "NORMAL"
    if abs_z < 2:
        return "WATCH"
    if abs_z < 3:
        return "INVESTIGATE"
    return "FAIL"
