"""Stability and risk metrics for DOE comparison."""

from __future__ import annotations

from typing import Dict, Any, List

import numpy as np
import pandas as pd


def assess_stability(aligned: pd.DataFrame, parameters: List[str]) -> Dict[str, Any]:
    drift = False
    noise = False
    transient = False
    details: List[str] = []
    control_proximity = "unknown"

    control_flags = []

    for param in parameters:
        base_col = f"{param}_baseline"
        exp_col = f"{param}_experiment"
        if base_col not in aligned.columns or exp_col not in aligned.columns:
            continue

        base_vals = pd.to_numeric(aligned[base_col], errors="coerce").to_numpy(dtype=float)
        exp_vals = pd.to_numeric(aligned[exp_col], errors="coerce").to_numpy(dtype=float)

        base_clean = base_vals[~np.isnan(base_vals)]
        exp_clean = exp_vals[~np.isnan(exp_vals)]
        if base_clean.size < 5 or exp_clean.size < 5:
            continue

        base_mean = float(np.mean(base_clean))
        base_std = float(np.std(base_clean, ddof=1)) if base_clean.size > 1 else 0.0
        exp_mean = float(np.mean(exp_clean))
        exp_std = float(np.std(exp_clean, ddof=1)) if exp_clean.size > 1 else 0.0

        if base_std > 0 and abs(exp_mean - base_mean) > 2 * base_std:
            drift = True
            details.append(f"{param}: mean shifted beyond 2σ baseline band.")

        if base_std > 0 and exp_std > 1.5 * base_std:
            noise = True
            details.append(f"{param}: experiment noise exceeds 1.5x baseline.")

        midpoint = exp_clean.size // 2
        if midpoint > 0:
            first_mean = float(np.mean(exp_clean[:midpoint]))
            second_mean = float(np.mean(exp_clean[midpoint:]))
            if base_std > 0 and abs(second_mean - first_mean) > base_std:
                transient = True
                details.append(f"{param}: transient shift between first/second halves.")

        if base_std > 0:
            upper = base_mean + 3 * base_std
            lower = base_mean - 3 * base_std
            max_exp = float(np.max(exp_clean))
            min_exp = float(np.min(exp_clean))
            if max_exp >= upper or min_exp <= lower:
                control_flags.append("outside_3sigma")
            elif max_exp >= base_mean + 2 * base_std or min_exp <= base_mean - 2 * base_std:
                control_flags.append("near_3sigma")

    if "outside_3sigma" in control_flags:
        control_proximity = "outside_control_limits"
    elif "near_3sigma" in control_flags:
        control_proximity = "near_control_limits"
    else:
        control_proximity = "within_control_limits"

    return {
        "drift_detected": drift,
        "noise_amplification": noise,
        "transient_behavior": transient,
        "control_limit_proximity": control_proximity,
        "details": details,
    }
