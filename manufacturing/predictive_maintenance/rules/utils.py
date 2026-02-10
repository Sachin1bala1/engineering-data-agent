"""
Deterministic helper utilities for failure mode detection.
"""

from typing import List, Optional
from statistics import mean, pstdev
from datetime import datetime, timedelta

import numpy as np

from ..models.data_models import FailureModeIndicator, FailureStage


def safe_mean(values: List[float]) -> float:
    return mean(values) if values else 0.0


def safe_std(values: List[float]) -> float:
    return pstdev(values) if len(values) > 1 else 0.0


def build_indicator(name: str, value: Optional[float], status: str,
                    evidence: Optional[str], window_hours: Optional[int] = None) -> FailureModeIndicator:
    return FailureModeIndicator(
        name=name,
        value=value,
        status=status,
        evidence=evidence,
        window_hours=window_hours
    )


def get_recent_points(sensor_data, hours: int):
    if not sensor_data:
        return []
    cutoff = max(p.timestamp for p in sensor_data) - timedelta(hours=hours)
    return [p for p in sensor_data if p.timestamp >= cutoff]


def compute_trend(values: List[float]) -> float:
    if len(values) < 5:
        return 0.0
    x = np.arange(len(values))
    y = np.array(values)
    valid = ~np.isnan(y)
    if np.sum(valid) < 5:
        return 0.0
    slope = np.polyfit(x[valid], y[valid], 1)[0]
    return float(slope)


def persistence_ratio(values: List[float], threshold: float) -> float:
    if not values:
        return 0.0
    exceed = [v for v in values if v >= threshold]
    return len(exceed) / len(values)


def classify_stage(early: bool, mid: bool, late: bool) -> FailureStage:
    if late:
        return FailureStage.LATE
    if mid:
        return FailureStage.MID
    return FailureStage.EARLY if early else FailureStage.EARLY


def compute_confidence(indicator_hits: int, indicator_total: int, persistence: float) -> float:
    if indicator_total == 0:
        return 0.0
    base = indicator_hits / indicator_total
    return max(0.1, min(1.0, base * 0.7 + persistence * 0.3))
