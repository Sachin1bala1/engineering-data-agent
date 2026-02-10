"""Deterministic confidence scoring."""

from __future__ import annotations

from typing import Dict, Any


def compute_confidence(components: Dict[str, float], assumption_risk: float, penalty: float) -> Dict[str, Any]:
    weights = {
        "data_completeness": 0.30,
        "sample_adequacy": 0.20,
        "noise_robustness": 0.20,
        "statistical_strength": 0.15,
        "assumption_risk": 0.15,
    }
    score = (
        weights["data_completeness"] * components["data_completeness"]
        + weights["sample_adequacy"] * components["sample_adequacy"]
        + weights["noise_robustness"] * components["noise_robustness"]
        + weights["statistical_strength"] * components["statistical_strength"]
        + weights["assumption_risk"] * (1.0 - assumption_risk)
    )
    score = max(0.0, score - penalty)
    return {"score": float(score), "components": components}
