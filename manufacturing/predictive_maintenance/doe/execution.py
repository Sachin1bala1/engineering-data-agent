"""DOE execution agent (Python only)."""

from __future__ import annotations

from typing import Dict, Any, List, Tuple

import numpy as np
import pandas as pd

try:
    from scipy import stats
    SCIPY_AVAILABLE = True
except Exception:
    stats = None
    SCIPY_AVAILABLE = False


def _clean(values: pd.Series) -> np.ndarray:
    return pd.to_numeric(values, errors="coerce").to_numpy(dtype=float)


def _stats(values: np.ndarray) -> Tuple[float, float, int]:
    clean = values[~np.isnan(values)]
    if clean.size == 0:
        return 0.0, 0.0, 0
    mean = float(np.mean(clean))
    std = float(np.std(clean, ddof=1)) if clean.size > 1 else 0.0
    return mean, std, int(clean.size)


def _welch_t_test(a: np.ndarray, b: np.ndarray) -> float | None:
    if not SCIPY_AVAILABLE:
        return None
    a = a[~np.isnan(a)]
    b = b[~np.isnan(b)]
    if a.size < 2 or b.size < 2:
        return None
    _, p_value = stats.ttest_ind(a, b, equal_var=False, nan_policy="omit")
    return float(p_value) if np.isfinite(p_value) else None


def _mann_whitney(a: np.ndarray, b: np.ndarray) -> float | None:
    if not SCIPY_AVAILABLE:
        return None
    a = a[~np.isnan(a)]
    b = b[~np.isnan(b)]
    if a.size < 2 or b.size < 2:
        return None
    try:
        _, p_value = stats.mannwhitneyu(a, b, alternative="two-sided")
    except ValueError:
        return None
    return float(p_value) if np.isfinite(p_value) else None


def execute_plan(
    aligned: pd.DataFrame,
    parameters: List[str],
    tests: List[str],
) -> Dict[str, Dict[str, Any]]:
    results: Dict[str, Dict[str, Any]] = {}
    for param in parameters:
        base_col = f"{param}_baseline"
        exp_col = f"{param}_experiment"
        if base_col not in aligned.columns or exp_col not in aligned.columns:
            continue
        base_vals = _clean(aligned[base_col])
        exp_vals = _clean(aligned[exp_col])
        base_mean, base_std, base_n = _stats(base_vals)
        exp_mean, exp_std, exp_n = _stats(exp_vals)

        delta_percent = None
        if base_mean != 0:
            delta_percent = float((exp_mean - base_mean) / base_mean * 100.0)

        variance_change = None
        if base_std != 0:
            variance_change = float((exp_std ** 2) / (base_std ** 2))

        p_value = None
        test_used = None
        if "welch_t_test" in tests:
            p_value = _welch_t_test(base_vals, exp_vals)
            test_used = "welch_t_test"
        elif "mann_whitney_u" in tests:
            p_value = _mann_whitney(base_vals, exp_vals)
            test_used = "mann_whitney_u"

        results[param] = {
            "baseline_mean": base_mean,
            "experiment_mean": exp_mean,
            "delta_percent": delta_percent,
            "variance_change": variance_change,
            "p_value": p_value,
            "test_used": test_used,
            "baseline_std": base_std,
            "experiment_std": exp_std,
            "baseline_n": base_n,
            "experiment_n": exp_n,
        }

    return results


def compute_confidence_components(results: Dict[str, Dict[str, Any]]) -> Dict[str, float]:
    if not results:
        return {
            "data_completeness": 0.0,
            "sample_adequacy": 0.0,
            "noise_ratio": 0.0,
            "significance_robustness": 0.0,
        }

    completeness_scores = []
    adequacy_scores = []
    noise_scores = []
    p_values = []

    for _, row in results.items():
        base_n = row.get("baseline_n", 0)
        exp_n = row.get("experiment_n", 0)
        total_n = base_n + exp_n
        completeness_scores.append(min(1.0, total_n / 200.0))
        adequacy_scores.append(min(1.0, min(base_n, exp_n) / 30.0))

        base_std = row.get("baseline_std", 0.0) or 0.0
        exp_std = row.get("experiment_std", 0.0) or 0.0
        if base_std <= 0:
            noise_scores.append(0.5)
        else:
            ratio = exp_std / base_std
            noise_scores.append(1.0 if ratio <= 1.1 else max(0.0, 1.0 - (ratio - 1.1)))

        if row.get("p_value") is not None:
            p_values.append(row["p_value"])

    data_completeness = float(np.mean(completeness_scores))
    sample_adequacy = float(np.mean(adequacy_scores))
    noise_ratio = float(np.mean(noise_scores))
    significance_robustness = float(np.mean([1.0 - min(p, 1.0) for p in p_values])) if p_values else 0.0

    return {
        "data_completeness": data_completeness,
        "sample_adequacy": sample_adequacy,
        "noise_ratio": noise_ratio,
        "significance_robustness": significance_robustness,
    }


def compute_correlations(aligned: pd.DataFrame, parameters: List[str]) -> Dict[str, float]:
    correlations: Dict[str, float] = {}
    for i, left in enumerate(parameters):
        for right in parameters[i + 1:]:
            lcol = f"{left}_experiment"
            rcol = f"{right}_experiment"
            if lcol not in aligned.columns or rcol not in aligned.columns:
                continue
            lvals = pd.to_numeric(aligned[lcol], errors="coerce")
            rvals = pd.to_numeric(aligned[rcol], errors="coerce")
            valid = lvals.notna() & rvals.notna()
            if valid.sum() < 5:
                continue
            corr = float(np.corrcoef(lvals[valid], rvals[valid])[0, 1])
            correlations[f"{left}__{right}"] = corr
    return correlations


def compute_trends(aligned: pd.DataFrame, parameters: List[str]) -> Dict[str, float]:
    trends: Dict[str, float] = {}
    for param in parameters:
        col = f"{param}_experiment"
        if col not in aligned.columns:
            continue
        values = pd.to_numeric(aligned[col], errors="coerce").to_numpy(dtype=float)
        clean = values[~np.isnan(values)]
        if clean.size < 5:
            continue
        x = np.arange(clean.size)
        slope = float(np.polyfit(x, clean, 1)[0])
        trends[param] = slope
    return trends
