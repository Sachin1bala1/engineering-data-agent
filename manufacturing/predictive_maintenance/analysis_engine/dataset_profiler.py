"""Deterministic dataset profiling."""

from __future__ import annotations

from datetime import date
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path

import numpy as np
import pandas as pd

from .models import DatasetProfile, SignalProfile
from ..time_intelligence.time_normalizer import normalize_time
from ..ingestion.schema_inspector import inspect_schema
from ..ingestion.signal_mapper import map_signals

try:
    from scipy import stats
    SCIPY_AVAILABLE = True
except Exception:
    stats = None
    SCIPY_AVAILABLE = False

try:
    from statsmodels.tsa.stattools import adfuller
    STATSMODELS_AVAILABLE = True
except Exception:
    adfuller = None
    STATSMODELS_AVAILABLE = False


TIME_KEYS = ["timestamp", "time", "datetime", "date_time"]


def _find_column(columns: List[str], candidates: List[str]) -> Optional[str]:
    lower_map = {c.lower(): c for c in columns}
    for cand in candidates:
        if cand in lower_map:
            return lower_map[cand]
    return None


def _extract_timestamp(
    df: pd.DataFrame,
    default_date: Optional[date] = None,
    start_date: Optional[date] = None,
) -> Tuple[pd.Series, List[str]]:
    assumptions: List[str] = []
    columns = list(df.columns)
    time_col = _find_column(columns, TIME_KEYS)
    if time_col:
        ts = pd.to_datetime(df[time_col], errors="coerce", utc=True)
        return ts, assumptions

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
            timestamps.append(pd.to_datetime(dt_value, utc=True) if dt_value else pd.NaT)
        return pd.Series(timestamps), assumptions

    if time_col:
        default_day = default_date or date.today()
        timestamps: List[pd.Timestamp] = []
        for raw in df[time_col]:
            record, dt_value = normalize_time(
                raw, row_date=default_day, file_metadata=None,
                default_date=default_day, start_date=start_date, shift_name=None
            )
            assumptions.extend(record.assumptions)
            timestamps.append(pd.to_datetime(dt_value, utc=True) if dt_value else pd.NaT)
        assumptions.append("time_only_anchored_to_default_date")
        return pd.Series(timestamps), assumptions

    assumptions.append("time_missing_index_alignment")
    return pd.Series(pd.RangeIndex(start=0, stop=len(df), step=1)), assumptions


def _distribution(values: np.ndarray) -> str:
    clean = values[~np.isnan(values)]
    if clean.size < 3:
        return "insufficient_data"
    if np.nanmax(clean) - np.nanmin(clean) == 0:
        return "constant"
    if not SCIPY_AVAILABLE:
        raise RuntimeError("SciPy is required for distribution tests.")
    if clean.size > 5000:
        return "unknown_large_sample"
    stat, pvalue = stats.shapiro(clean)
    return "approx_normal" if pvalue >= 0.05 else "non_normal"


def _stationarity(values: np.ndarray) -> Optional[str]:
    clean = values[~np.isnan(values)]
    if clean.size < 10:
        return None
    if not STATSMODELS_AVAILABLE:
        raise RuntimeError("statsmodels is required for stationarity tests.")
    if np.nanmax(clean) - np.nanmin(clean) == 0:
        return "constant"
    result = adfuller(clean, autolag="AIC")
    return "stationary" if result[1] < 0.05 else "non_stationary"


def _infer_units(name: str) -> Optional[str]:
    lower = name.lower()
    if "temp" in lower:
        return "C"
    if "pressure" in lower or "psi" in lower:
        return "psi"
    if "vibration" in lower:
        return "mm/s"
    if "speed" in lower or "rpm" in lower:
        return "rpm"
    return None


def load_dataset(
    path: str,
    column_mapping: Optional[Dict[str, str]] = None,
) -> pd.DataFrame:
    file_path = Path(path)
    if file_path.suffix.lower() in [".xls", ".xlsx"]:
        df = pd.read_excel(file_path)
    else:
        df = pd.read_csv(file_path)

    if column_mapping:
        rename_map = {raw: canonical for canonical, raw in column_mapping.items() if raw in df.columns}
        if rename_map:
            df = df.rename(columns=rename_map)

    inspection = inspect_schema(list(df.columns))
    mapped_df, mappings, _ = map_signals(df, inspection.signal_columns)
    for col in mapped_df.columns:
        df[col] = pd.to_numeric(mapped_df[col], errors="coerce")

    return df


def profile_dataset(
    path: str,
    default_date: Optional[date] = None,
    start_date: Optional[date] = None,
    column_mapping: Optional[Dict[str, str]] = None,
) -> DatasetProfile:
    df = load_dataset(path, column_mapping=column_mapping)
    time_series, assumptions = _extract_timestamp(df, default_date=default_date, start_date=start_date)
    df = df.copy()
    df["__timestamp__"] = time_series
    signals: Dict[str, SignalProfile] = {}
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    for col in numeric_cols:
        if col == "__timestamp__":
            continue
        values = pd.to_numeric(df[col], errors="coerce").to_numpy(dtype=float)
        missing_pct = float(np.isnan(values).mean() * 100.0) if values.size else 100.0
        signals[col] = SignalProfile(
            type="continuous",
            rows=int(values.size),
            missing_pct=missing_pct,
            distribution=_distribution(values),
            stationarity=_stationarity(values),
            units=_infer_units(col),
        )

    categorical_cols = [c for c in df.columns if c not in numeric_cols and c != "__timestamp__"]
    for col in categorical_cols:
        missing_pct = float(df[col].isna().mean() * 100.0)
        signals[col] = SignalProfile(
            type="categorical",
            rows=int(len(df)),
            missing_pct=missing_pct,
            distribution="categorical",
            units=None,
        )

    dataset_type = "time_series" if df["__timestamp__"].notna().any() else "tabular"
    missing = [s.missing_pct for s in signals.values()] or [100.0]
    quality_score = float(max(0.0, 1.0 - (np.mean(missing) / 100.0)))

    preview_rows = df.drop(columns=["__timestamp__"]).head(5).to_dict(orient="records")

    return DatasetProfile(
        dataset_type=dataset_type,
        quality_score=quality_score,
        signals=signals,
        preview_rows=preview_rows,
        time_assumptions=sorted(set(assumptions)),
    )
