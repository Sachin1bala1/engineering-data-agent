"""
Deterministic time normalization pipeline.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Tuple, List

import pandas as pd

from .time_classifier import classify_time_value
from .time_anchor_resolver import resolve_anchor


@dataclass
class NormalizedTimeRecord:
    raw_value: Any
    normalized_iso: Optional[str]
    confidence: float
    assumptions: List[str]
    time_class: str


def _parse_excel_serial(value: float) -> datetime:
    base = datetime(1899, 12, 30)
    return base + timedelta(days=value)


def normalize_time(raw_value: Any,
                   row_date: Optional[datetime.date],
                   file_metadata: Optional[Dict[str, Any]],
                   default_date: Optional[datetime.date],
                   start_date: Optional[datetime.date],
                   shift_name: Optional[str]) -> Tuple[NormalizedTimeRecord, Optional[datetime]]:
    time_class, confidence = classify_time_value(raw_value)
    assumptions: List[str] = []

    if time_class == "FULL_DATETIME" or time_class == "TEXTUAL":
        parsed = pd.to_datetime(raw_value, errors="coerce", utc=True)
        if pd.isna(parsed):
            return NormalizedTimeRecord(raw_value, None, 0.0, ["unparseable"], time_class), None
        return NormalizedTimeRecord(raw_value, parsed.isoformat(), confidence, assumptions, time_class), parsed.to_pydatetime()

    if time_class == "DATE_ONLY":
        parsed_date = pd.to_datetime(raw_value, errors="coerce").date()
        anchor = resolve_anchor(parsed_date, file_metadata, default_date, start_date, shift_name)
        assumptions.extend(anchor.assumptions)
        normalized = datetime.combine(parsed_date, datetime.min.time())
        return NormalizedTimeRecord(raw_value, normalized.isoformat() + "Z", confidence, assumptions, time_class), normalized

    if time_class == "TIME_ONLY":
        anchor = resolve_anchor(row_date, file_metadata, default_date, start_date, shift_name)
        assumptions.extend(anchor.assumptions)
        if not anchor.anchor_date:
            return NormalizedTimeRecord(raw_value, None, 0.0, assumptions + ["missing_anchor_date"], time_class), None
        parsed_time = pd.to_datetime(raw_value).time()
        normalized = datetime.combine(anchor.anchor_date, parsed_time)
        return NormalizedTimeRecord(raw_value, normalized.isoformat() + "Z", confidence, assumptions, time_class), normalized

    if time_class == "EXCEL_SERIAL":
        normalized = _parse_excel_serial(float(raw_value))
        return NormalizedTimeRecord(raw_value, normalized.isoformat() + "Z", confidence, assumptions, time_class), normalized

    if time_class == "RELATIVE":
        anchor = resolve_anchor(row_date, file_metadata, default_date, start_date, shift_name)
        assumptions.extend(anchor.assumptions)
        if not anchor.anchor_date:
            return NormalizedTimeRecord(raw_value, None, 0.0, assumptions + ["missing_anchor_date"], time_class), None
        seconds = float(str(raw_value).strip().rstrip("smh").replace("t+", "")) if raw_value else 0.0
        normalized = datetime.combine(anchor.anchor_date, datetime.min.time()) + timedelta(seconds=seconds)
        return NormalizedTimeRecord(raw_value, normalized.isoformat() + "Z", confidence, assumptions, time_class), normalized

    return NormalizedTimeRecord(raw_value, None, 0.0, ["unknown_time_format"], time_class), None
