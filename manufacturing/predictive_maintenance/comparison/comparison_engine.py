"""Deterministic comparison engine for baseline vs experiment."""

from __future__ import annotations

from typing import Dict, List, Tuple

from .statistics import (
    percent_delta,
    severity_from_z,
)
from .models import SignalComparison, SignalStats, DeviationMetrics, ComparisonSummary, AlignmentMetadata


SIGNALS = [
    "temperature",
    "vibration",
    "pressure",
    "current",
    "speed",
    "run_hours",
    "alarm_count",
]


def build_signal_comparisons(results: Dict[str, Dict[str, object]]) -> Tuple[List[SignalComparison], List[str]]:
    comparisons: List[SignalComparison] = []
    warnings: List[str] = []

    for signal in SIGNALS:
        if signal not in results:
            continue

        metrics = results.get(signal, {})
        base_stats = metrics.get("baseline_stats", {})
        exp_stats = metrics.get("experiment_stats", {})
        z = metrics.get("z_score")
        trend_delta = metrics.get("trend_delta")
        persistence = metrics.get("persistence_above_baseline")
        deviation = DeviationMetrics(
            absolute_delta=float(exp_stats.get("mean", 0.0) - base_stats.get("mean", 0.0)),
            percent_delta=percent_delta(base_stats.get("mean", 0.0), exp_stats.get("mean", 0.0)),
            z_score_vs_baseline=z,
            trend_difference=trend_delta,
            persistence_above_baseline=persistence,
        )

        severity = severity_from_z(z)
        z_text = f"{z:.2f}" if isinstance(z, (int, float)) else "N/A"
        explanation = (
            f"Experiment mean {exp_stats.get('mean', 0.0):.3f} vs baseline {base_stats.get('mean', 0.0):.3f} "
            f"(z={z_text} if defined)."
        )

        comparisons.append(
            SignalComparison(
                signal_name=signal,
                baseline_stats=SignalStats(**base_stats),
                experiment_stats=SignalStats(**exp_stats),
                deviation_metrics=deviation,
                severity=severity,
                persistence=persistence,
                explanation=explanation,
            )
        )

    if not comparisons:
        warnings.append("No matching signals found between baseline and experiment.")

    return comparisons, warnings


def build_summary(asset_id: str, comparisons: List[SignalComparison]) -> ComparisonSummary:
    status = "PASS"
    primary_signal = None
    highest_severity = {"NORMAL": 0, "WATCH": 1, "INVESTIGATE": 2, "FAIL": 3, "UNKNOWN": 0}
    score = 0
    for comp in comparisons:
        severity_score = highest_severity.get(comp.severity, 0)
        if severity_score > score:
            score = severity_score
            primary_signal = comp.signal_name
    if score >= 3:
        status = "FAIL"
    elif score >= 1:
        status = "WATCH"

    confidence = min(1.0, max(0.3, len(comparisons) / 5.0))
    action = {
        "PASS": "Baseline and experiment align. Continue standard monitoring.",
        "WATCH": "Investigate deviations and monitor closely.",
        "FAIL": "Deviation exceeds engineering thresholds; review before deployment."
    }[status]
    rationale = (
        f"Comparison status {status} based on highest deviation signal "
        f"{primary_signal or 'N/A'}."
    )

    return ComparisonSummary(
        asset_id=asset_id,
        comparison_status=status,
        primary_deviation_signal=primary_signal,
        confidence_level=confidence,
        recommended_action=action,
        engineering_rationale=rationale,
    )


def build_alignment_metadata(
    method: str,
    baseline_points: int,
    experiment_points: int,
    aligned_points: int,
    warnings: List[str]
) -> AlignmentMetadata:
    loss = 0.0
    if max(baseline_points, experiment_points) > 0:
        loss = 100.0 * (1.0 - aligned_points / max(baseline_points, experiment_points))
    return AlignmentMetadata(
        alignment_method=method,
        baseline_points=baseline_points,
        experiment_points=experiment_points,
        aligned_points=aligned_points,
        data_loss_percent=loss,
        warnings=warnings,
    )
