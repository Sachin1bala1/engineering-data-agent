"""Builds Engineering Data Analyzer report."""

from __future__ import annotations

from datetime import datetime
from typing import Dict, Any, List

from .models import (
    AnalyzerReport,
    AnalyzerExecutionResults,
    ValidationOutput,
    ConfidenceScore,
    EngineeringExplanation,
)


def build_report(
    report_id: str,
    profile,
    plan,
    results: AnalyzerExecutionResults,
    validation: Dict[str, Any],
    confidence: Dict[str, Any],
    explanation: Dict[str, Any],
    assumptions: List[str],
    warnings: List[str],
    errors: List[str],
) -> AnalyzerReport:
    return AnalyzerReport(
        report_id=report_id,
        created_at=datetime.utcnow(),
        profile=profile,
        plan=plan,
        results=results,
        validation=ValidationOutput(**validation),
        confidence=ConfidenceScore(**confidence),
        explanation=EngineeringExplanation(**explanation),
        assumptions=assumptions,
        warnings=warnings,
        errors=errors,
    )
