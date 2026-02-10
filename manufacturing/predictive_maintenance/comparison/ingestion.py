"""Ingestion for baseline vs experiment comparison."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Dict, List, Optional, Tuple
from pathlib import Path

import pandas as pd

from ..time_intelligence.time_normalizer import normalize_time
from ..ingestion.schema_inspector import inspect_schema
from ..ingestion.signal_mapper import map_signals


SIGNAL_COLUMNS = {
    "pressure": ["pressure", "press", "psi", "kpa"],
    "current": ["current", "amps", "amp", "current_a"],
    "speed": ["speed", "rpm", "velocity"],
}

TIME_KEYS = ["timestamp", "time", "datetime", "date_time"]


@dataclass
class IngestionResult:
    dataframe: pd.DataFrame
    warnings: List[str]
    metadata: Dict[str, object]


def _find_column(columns: List[str], candidates: List[str]) -> Optional[str]:
    lower_map = {c.lower(): c for c in columns}
    for cand in candidates:
        if cand in lower_map:
            return lower_map[cand]
    return None


def _extract_timestamp(df: pd.DataFrame, default_date: Optional[date] = None) -> Tuple[pd.Series, List[str]]:
    warnings: List[str] = []
    columns = list(df.columns)
    time_col = _find_column(columns, TIME_KEYS)
    if time_col:
        ts = pd.to_datetime(df[time_col], errors="coerce", utc=True)
        if ts.isna().any():
            warnings.append(f"Some timestamps could not be parsed in column {time_col}.")
        return ts, warnings

    date_col = _find_column(columns, ["date"])
    hour_col = _find_column(columns, ["hour"])
    minute_col = _find_column(columns, ["minute"])
    second_col = _find_column(columns, ["second"])
    micro_col = _find_column(columns, ["microsecond", "micros", "micro"])

    if date_col and hour_col and minute_col:
        date_vals = pd.to_datetime(df[date_col], errors="coerce").dt.date
        micros = df[micro_col] if micro_col else 0
        raw_times = (
            df[hour_col].astype(int).astype(str).str.zfill(2)
            + ":"
            + df[minute_col].astype(int).astype(str).str.zfill(2)
            + ":"
            + df[second_col].fillna(0).astype(int).astype(str).str.zfill(2)
            + "."
            + pd.Series(micros).astype(int).astype(str).str.zfill(6)
        )
        timestamps: List[pd.Timestamp] = []
        for raw, row_date in zip(raw_times, date_vals):
            normalized, dt_value = normalize_time(
                raw, row_date=row_date, file_metadata=None, default_date=default_date, start_date=None, shift_name=None
            )
            if not dt_value:
                warnings.append("Unable to normalize time value; row skipped.")
            timestamps.append(pd.to_datetime(dt_value, utc=True) if dt_value else pd.NaT)
        return pd.Series(timestamps), warnings

    if hour_col and minute_col and second_col:
        default_day = default_date or date.today()
        micros = df[micro_col] if micro_col else 0
        raw_times = (
            df[hour_col].astype(int).astype(str).str.zfill(2)
            + ":"
            + df[minute_col].astype(int).astype(str).str.zfill(2)
            + ":"
            + df[second_col].astype(int).astype(str).str.zfill(2)
            + "."
            + pd.Series(micros).astype(int).astype(str).str.zfill(6)
        )
        timestamps: List[pd.Timestamp] = []
        for raw in raw_times:
            normalized, dt_value = normalize_time(
                raw, row_date=default_day, file_metadata=None, default_date=default_day, start_date=None, shift_name=None
            )
            if not dt_value:
                warnings.append("Unable to normalize time-only value; row skipped.")
            timestamps.append(pd.to_datetime(dt_value, utc=True) if dt_value else pd.NaT)
        warnings.append("Time-only values anchored to shift day.")
        return pd.Series(timestamps), warnings

    # No time columns - fall back to index-based time
    warnings.append("No timestamp columns found; using sequence index for alignment.")
    return pd.Series(pd.RangeIndex(start=0, stop=len(df), step=1)), warnings


def ingest_file(path: str, default_date: Optional[date] = None) -> IngestionResult:
    file_path = Path(path)
    if file_path.suffix.lower() in [".xls", ".xlsx"]:
        df = pd.read_excel(file_path)
    else:
        df = pd.read_csv(file_path)

    warnings: List[str] = []
    metadata = {"original_columns": list(df.columns)}

    timestamp_series, ts_warnings = _extract_timestamp(df, default_date=default_date)
    warnings.extend(ts_warnings)

    canonical: Dict[str, pd.Series] = {"timestamp": timestamp_series}

    asset_col = _find_column(list(df.columns), ["asset_id", "asset"])
    if asset_col:
        canonical["asset_id"] = df[asset_col].astype(str)
    else:
        canonical["asset_id"] = "ASSET-UNKNOWN"

    inspection = inspect_schema(list(df.columns))
    mapped_df, mappings, map_warnings = map_signals(df, inspection.signal_columns)
    warnings.extend(map_warnings)
    for col in mapped_df.columns:
        canonical[col] = pd.to_numeric(mapped_df[col], errors="coerce")

    for signal, candidates in SIGNAL_COLUMNS.items():
        col = _find_column(list(df.columns), candidates)
        if col:
            canonical[signal] = pd.to_numeric(df[col], errors="coerce")
            mappings.setdefault(signal, [col])

    metadata["inferred_mappings"] = {
        "signal_columns": inspection.signal_columns,
        "signal_mappings": mappings,
    }

    canonical_df = pd.DataFrame(canonical)
    canonical_df["raw_signal_metadata"] = df.to_dict(orient="records")

    if canonical_df["timestamp"].isna().any():
        warnings.append("Some rows have missing timestamps and may be dropped during alignment.")

    return IngestionResult(dataframe=canonical_df, warnings=warnings, metadata=metadata)
