"""
Deterministic time resolution agent (read-only).
"""

from typing import Dict, Any

from ..policy.confidence_scoring import score_confidence


class TimeResolutionAgent:
    def analyze(self, report: Dict[str, Any]) -> Dict[str, Any]:
        errors = report.get("errors", [])
        warnings = report.get("warnings", [])
        diagnosis = "Time normalization issues detected."
        root_cause = "Unknown"
        recommended_fix: Dict[str, Any] = {}
        base_confidence = 0.6

        if any("default" in w for w in warnings):
            root_cause = "Missing date; time-only values were anchored."
            recommended_fix = {"type": "apply_default_date", "detail": "Provide default_date for time-only logs."}
            base_confidence = 0.8
        if any("Timestamp column could not be parsed" in e for e in errors):
            root_cause = "Timestamp parsing failed."
            recommended_fix = {"type": "parse_time_only", "detail": "Provide hour/minute/second columns or start_date."}
            base_confidence = 0.7

        confidence = score_confidence(base_confidence, penalties=len(errors))
        explanation = "Recommendation generated using deterministic heuristics from transformation report."

        return {
            "diagnosis": diagnosis,
            "root_cause": root_cause,
            "recommended_fix": recommended_fix,
            "confidence": confidence,
            "explanation": explanation
        }
