"""
Signal mapping from raw columns into canonical fields.
"""

from typing import Dict, List, Tuple
import numpy as np
import pandas as pd


def map_signals(df: pd.DataFrame, signal_columns: Dict[str, str]) -> Tuple[pd.DataFrame, Dict[str, List[str]], List[str]]:
    warnings = []
    mappings: Dict[str, List[str]] = {}
    result = pd.DataFrame(index=df.index)

    if "temperature" in signal_columns:
        result["temperature"] = df[signal_columns["temperature"]]
        mappings["temperature"] = [signal_columns["temperature"]]

    if "vibration" in signal_columns:
        result["vibration"] = df[signal_columns["vibration"]]
        mappings["vibration"] = [signal_columns["vibration"]]
    else:
        accel_cols = [signal_columns.get("accel_x"), signal_columns.get("accel_y"),
                      signal_columns.get("accel_z"), signal_columns.get("accel_generic")]
        accel_cols = [c for c in accel_cols if c]
        if accel_cols:
            accel_matrix = df[accel_cols].astype(float)
            # RMS of acceleration axes as vibration proxy
            result["vibration"] = np.sqrt((accel_matrix ** 2).mean(axis=1))
            mappings["vibration"] = accel_cols
            warnings.append("Vibration inferred from acceleration RMS proxy.")

    if "run_hours" in signal_columns:
        result["run_hours"] = df[signal_columns["run_hours"]]
        mappings["run_hours"] = [signal_columns["run_hours"]]

    if "alarm_count" in signal_columns:
        result["alarm_count"] = df[signal_columns["alarm_count"]]
        mappings["alarm_count"] = [signal_columns["alarm_count"]]

    return result, mappings, warnings
