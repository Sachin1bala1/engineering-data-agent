"""In-memory storage for DOE reports."""

from __future__ import annotations

from typing import Dict, Optional

from .models import DOEReport


class DOEReportStore:
    def __init__(self) -> None:
        self._reports: Dict[str, DOEReport] = {}

    def save(self, report: DOEReport) -> None:
        self._reports[report.report_id] = report

    def get(self, report_id: str) -> Optional[DOEReport]:
        return self._reports.get(report_id)

    def count(self) -> int:
        return len(self._reports)
