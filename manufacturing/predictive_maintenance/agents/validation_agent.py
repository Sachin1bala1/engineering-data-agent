"""Rule-based validation agent."""

from __future__ import annotations

from typing import Dict, Any, List
import math

from .agent_protocols import ValidationOutput


def validate_results(results: Dict[str, Dict[str, Any]], metadata: Dict[str, Any] | None = None) -> ValidationOutput:
    errors: List[str] = []
    metadata = metadata or {}
    aligned_points = metadata.get("aligned_points")
    if aligned_points is not None and aligned_points == 0:
        errors.append("Alignment produced zero points.")
    for signal, metrics in results.items():
        base = metrics.get("baseline_stats", {})
        exp = metrics.get("experiment_stats", {})
        z = metrics.get("z_score")
        base_mean = base.get("mean")
        base_std = base.get("std")
        exp_mean = exp.get("mean")

        for name, value in [("baseline_mean", base_mean), ("baseline_std", base_std), ("experiment_mean", exp_mean)]:
            if value is None or (isinstance(value, float) and (math.isnan(value) or math.isinf(value))):
                errors.append(f"{signal}: {name} invalid")

        if base_std and base_std != 0 and exp_mean is not None and base_mean is not None:
            expected = (exp_mean - base_mean) / base_std
            if z is None or abs(expected - z) > 1e-3:
                errors.append(f"{signal}: z-score mismatch")

    if errors:
        return ValidationOutput(status="FAIL", errors=errors, recommend_repair=True)
    return ValidationOutput(status="PASS", errors=[], recommend_repair=False)
