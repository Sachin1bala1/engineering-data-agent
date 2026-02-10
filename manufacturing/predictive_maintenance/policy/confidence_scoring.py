"""
Confidence scoring utilities for deterministic recommendations.
"""

def score_confidence(base: float, penalties: int = 0) -> float:
    value = base - 0.05 * penalties
    return max(0.1, min(1.0, value))
