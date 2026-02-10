"""In-memory report store for analyzer."""

from __future__ import annotations

from typing import Dict, Optional

from .models import AnalyzerReport


class AnalyzerReportStore:
    def __init__(self) -> None:
        self._reports: Dict[str, AnalyzerReport] = {}

    def save(self, report: AnalyzerReport) -> None:
        self._reports[report.report_id] = report

    def get(self, report_id: str) -> Optional[AnalyzerReport]:
        return self._reports.get(report_id)

    def count(self) -> int:
        return len(self._reports)
