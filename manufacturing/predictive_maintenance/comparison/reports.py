"""Report builder and storage for comparison runs."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Any, List
import json
import tempfile
from pathlib import Path
import uuid

from .models import ComparisonReport, ComparisonUploadResponse


class ComparisonReportStore:
    def __init__(self) -> None:
        self._reports: Dict[str, ComparisonReport] = {}
        self._storage_dir = Path(tempfile.gettempdir()) / "insight-to-deck" / "compare_reports"
        self._storage_dir.mkdir(parents=True, exist_ok=True)

    def save(self, report: ComparisonReport) -> None:
        self._reports[report.report_id] = report
        try:
            payload = report.model_dump(mode="json")
            (self._storage_dir / f"{report.report_id}.json").write_text(
                json.dumps(payload, indent=2),
                encoding="utf-8",
            )
        except Exception:
            # Best-effort persistence only
            pass

    def get(self, report_id: str) -> ComparisonReport | None:
        cached = self._reports.get(report_id)
        if cached:
            return cached
        path = self._storage_dir / f"{report_id}.json"
        if not path.exists():
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            report = ComparisonReport.model_validate(payload)
            self._reports[report_id] = report
            return report
        except Exception:
            return None

    def count(self) -> int:
        return len(self._reports)


def build_report(
    summary,
    comparisons,
    alignment_metadata,
    raw_metadata: Dict[str, Any],
) -> ComparisonReport:
    return ComparisonReport(
        report_id=str(uuid.uuid4()),
        created_at=datetime.now(timezone.utc),
        comparison_summary=summary,
        signal_comparison=comparisons,
        alignment_metadata=alignment_metadata,
        raw_metadata=raw_metadata,
    )


def build_response(report: ComparisonReport, warnings: List[str]) -> ComparisonUploadResponse:
    return ComparisonUploadResponse(
        success=True,
        report_id=report.report_id,
        message="Comparison completed.",
        warnings=warnings,
    )
