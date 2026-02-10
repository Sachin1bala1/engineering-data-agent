"""
Deterministic error analysis agent for ingestion failures.
"""

from typing import Dict, Any


class ErrorAnalysisAgent:
    def analyze(self, report: Dict[str, Any]) -> Dict[str, Any]:
        errors = report.get("errors", [])
        if not errors:
            return {"summary": "No critical errors detected.", "confidence": 0.9}

        return {
            "summary": "Critical ingestion errors detected.",
            "errors": errors,
            "confidence": 0.8
        }
