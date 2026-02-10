"""DOE ingestion with time assumption capture."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Dict, List, Optional, Tuple
from pathlib import Path

import pandas as pd

from ..time_intelligence.time_normalizer import normalize_time
from ..ingestion.schema_inspector import inspect_schema
from ..ingestion.signal_mapper import map_signals


TIME_KEYS = ["timestamp", "time", "datetime", "date_time"]


@dataclass
class DOEIngestionResult:
    dataframe: pd.DataFrame
    warnings: List[str]
    metadata: Dict[str, object]
    time_assumptions: List[str]


def _find_column(columns: List[str], candidates: List[str]) -> Optional[str]:
    lower_map = {c.lower(): c for c in columns}
    for cand in candidates:
        if cand in lower_map:
            return lower_map[cand]
    return None


def _extract_timestamp(
    df: pd.DataFrame,
    default_date: Optional[date] = None,
    start_date: Optional[date] = None
) -> Tuple[pd.Series, List[str], List[str]]:
    warnings: List[str] = []
    assumptions: List[str] = []
    columns = list(df.columns)
    time_col = _find_column(columns, TIME_KEYS)
    if time_col:
        ts = pd.to_datetime(df[time_col], errors="coerce", utc=True)
        if ts.isna().any():
            warnings.append(f"Some timestamps could not be parsed in column {time_col}.")
        return ts, warnings, assumptions

    date_col = _find_column(columns, ["date"])
    time_col = _find_column(columns, ["time"])
    if date_col and time_col:
        date_vals = pd.to_datetime(df[date_col], errors="coerce").dt.date
        timestamps: List[pd.Timestamp] = []
        for raw, row_date in zip(df[time_col], date_vals):
            record, dt_value = normalize_time(
                raw, row_date=row_date, file_metadata=None,
                default_date=default_date, start_date=start_date, shift_name=None
            )
            assumptions.extend(record.assumptions)
            if not dt_value:
                warnings.append("Unable to normalize time value; row skipped.")
            timestamps.append(pd.to_datetime(dt_value, utc=True) if dt_value else pd.NaT)
        return pd.Series(timestamps), warnings, assumptions

    if time_col:
        default_day = default_date or date.today()
        timestamps: List[pd.Timestamp] = []
        for raw in df[time_col]:
            record, dt_value = normalize_time(
                raw, row_date=default_day, file_metadata=None,
                default_date=default_day, start_date=start_date, shift_name=None
            )
            assumptions.extend(record.assumptions)
            if not dt_value:
                warnings.append("Unable to normalize time-only value; row skipped.")
            timestamps.append(pd.to_datetime(dt_value, utc=True) if dt_value else pd.NaT)
        warnings.append("Time-only values anchored to default date.")
        assumptions.append("time_only_anchored_to_default_date")
        return pd.Series(timestamps), warnings, assumptions

    warnings.append("No timestamp columns found; using sequence index for alignment.")
    assumptions.append("time_missing_index_alignment")
    return pd.Series(pd.RangeIndex(start=0, stop=len(df), step=1)), warnings, assumptions


def ingest_file(
    path: str,
    default_date: Optional[date] = None,
    start_date: Optional[date] = None,
    column_mapping: Optional[Dict[str, str]] = None,
) -> DOEIngestionResult:
    file_path = Path(path)
    if file_path.suffix.lower() in [".xls", ".xlsx"]:
        df = pd.read_excel(file_path)
    else:
        df = pd.read_csv(file_path)

    warnings: List[str] = []
    metadata = {"original_columns": list(df.columns)}

    if column_mapping:
        rename_map = {}
        for canonical, raw in column_mapping.items():
            if raw in df.columns:
                rename_map[raw] = canonical
        if rename_map:
            df = df.rename(columns=rename_map)
            metadata["column_mapping_override"] = rename_map
        else:
            warnings.append("Column mapping provided but no columns matched.")

    timestamp_series, ts_warnings, assumptions = _extract_timestamp(
        df, default_date=default_date, start_date=start_date
    )
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

    metadata["inferred_mappings"] = {
        "signal_columns": inspection.signal_columns,
        "signal_mappings": mappings,
    }

    canonical_df = pd.DataFrame(canonical)
    canonical_df["raw_signal_metadata"] = df.to_dict(orient="records")

    if canonical_df["timestamp"].isna().any():
        warnings.append("Some rows have missing timestamps and may be dropped during alignment.")

    return DOEIngestionResult(
        dataframe=canonical_df,
        warnings=warnings,
        metadata=metadata,
        time_assumptions=sorted(set(assumptions)),
    )
