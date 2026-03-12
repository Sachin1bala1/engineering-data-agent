"""Historical confidence scoring for deterministic recommendations."""

from __future__ import annotations


def compute_confidence(similarity: float, historical_success: float, data_quality: float) -> float:
    score = 0.4 * similarity + 0.4 * historical_success + 0.2 * data_quality
    return max(0.0, min(1.0, float(score)))

