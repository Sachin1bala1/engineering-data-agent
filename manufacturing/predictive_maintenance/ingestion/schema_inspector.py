"""
Schema inspection for agentic ingestion.
"""

import re
from dataclasses import dataclass, field
from typing import List, Dict


@dataclass
class SchemaInspectionResult:
    original_columns: List[str]
    time_columns: Dict[str, str] = field(default_factory=dict)
    signal_columns: Dict[str, str] = field(default_factory=dict)
    missing_required: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


def inspect_schema(columns: List[str]) -> SchemaInspectionResult:
    lower = {c: c.strip().lower() for c in columns}
    time_columns = {}
    signal_columns = {}

    for col, lc in lower.items():
        if lc in {"timestamp", "time", "datetime"}:
            time_columns["timestamp"] = col
        elif re.search(r"\bdate\b", lc):
            time_columns["date"] = col
        elif re.search(r"\bhour\b", lc):
            time_columns["hour"] = col
        elif re.search(r"\bminute\b", lc):
            time_columns["minute"] = col
        elif re.search(r"\bsecond\b", lc):
            time_columns["second"] = col
        elif re.search(r"\bmicrosecond\b|\busec\b|\bmicro\b", lc):
            time_columns["microsecond"] = col

    for col, lc in lower.items():
        if "temp" in lc:
            signal_columns["temperature"] = col
        elif "vibration" in lc or "vib" in lc:
            signal_columns["vibration"] = col
        elif "run" in lc and "hour" in lc:
            signal_columns["run_hours"] = col
        elif "alarm" in lc:
            signal_columns["alarm_count"] = col
        elif "acc" in lc or "accel" in lc:
            if "horiz" in lc or "x" in lc:
                signal_columns.setdefault("accel_x", col)
            elif "vert" in lc or "z" in lc:
                signal_columns.setdefault("accel_z", col)
            elif "y" in lc:
                signal_columns.setdefault("accel_y", col)
            else:
                signal_columns.setdefault("accel_generic", col)

    missing_required = []
    if "timestamp" not in time_columns and not (
        {"hour", "minute", "second"} <= set(time_columns.keys())
    ):
        missing_required.append("timestamp or time components")

    return SchemaInspectionResult(
        original_columns=columns,
        time_columns=time_columns,
        signal_columns=signal_columns,
        missing_required=missing_required,
        warnings=[]
    )
