"""
Timestamp inference logic for agentic ingestion.
"""

from datetime import datetime, date, timedelta
from typing import Dict, Optional, Tuple, List

import pandas as pd


class TimestampInferenceError(Exception):
    pass


def infer_timestamps(df: pd.DataFrame,
                     time_columns: Dict[str, str],
                     default_date: Optional[date] = None,
                     start_date: Optional[date] = None) -> Tuple[pd.Series, str, List[str]]:
    warnings = []
    if "timestamp" in time_columns:
        series = pd.to_datetime(df[time_columns["timestamp"]], errors="coerce", utc=True)
        if series.isna().all():
            raise TimestampInferenceError("Timestamp column could not be parsed.")
        method = "parsed_timestamp_column"
        return series, method, warnings

    # Combine date + time components
    has_time_components = {"hour", "minute", "second"} <= set(time_columns.keys())
    if not has_time_components:
        raise TimestampInferenceError("Time components missing; cannot infer timestamp.")

    if "date" in time_columns:
        base_dates = pd.to_datetime(df[time_columns["date"]], errors="coerce").dt.date
        if base_dates.isna().all():
            raise TimestampInferenceError("Date column could not be parsed.")
        method = "date_plus_time_components"
    else:
        base = start_date or default_date
        if base is None:
            raise TimestampInferenceError("No date provided for time-only data.")
        base_dates = pd.Series([base] * len(df))
        method = "default_date_plus_time_components"
        warnings.append("Date missing; used default/start date for timestamp reconstruction.")

    hours = df[time_columns["hour"]].fillna(0).astype(int)
    minutes = df[time_columns["minute"]].fillna(0).astype(int)
    seconds = df[time_columns["second"]].fillna(0).astype(int)
    microseconds = df[time_columns.get("microsecond", "")].fillna(0).astype(int) if "microsecond" in time_columns else 0

    timestamps = []
    for idx, base_date in base_dates.items():
        base_dt = datetime.combine(base_date, datetime.min.time())
        delta = timedelta(
            hours=int(hours.iloc[idx]),
            minutes=int(minutes.iloc[idx]),
            seconds=int(seconds.iloc[idx]),
            microseconds=int(microseconds.iloc[idx]) if isinstance(microseconds, pd.Series) else int(microseconds)
        )
        timestamps.append(base_dt + delta)

    series = pd.to_datetime(pd.Series(timestamps), utc=True)
    return series, method, warnings
