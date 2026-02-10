"""Validation agent for Engineering Data Analyzer."""

from __future__ import annotations

from typing import Dict, Any, List

import numpy as np
import pandas as pd


def validate_results(df: pd.DataFrame, plan: Dict[str, Any], results: Dict[str, Any]) -> Dict[str, Any]:
    warnings: List[str] = []
    penalty = 0.0

    for test in plan.get("recommended_tests", []):
        test_name = test.get("test")
        column = test.get("applies_to")
        if not column or column not in df.columns:
            warnings.append(f"Test {test_name} skipped: column {column} missing.")
            penalty += 0.05
            continue

        values = pd.to_numeric(df[column], errors="coerce").to_numpy(dtype=float)
        count = int(np.sum(~np.isnan(values)))
        if test_name == "shapiro_wilk" and count > 5000:
            warnings.append(f"{column}: Shapiro-Wilk not valid for n>5000.")
            penalty += 0.1
        if test_name == "shapiro_wilk" and count < 3:
            warnings.append(f"{column}: Shapiro-Wilk requires >=3 samples.")
            penalty += 0.1
        if test_name == "normaltest" and count < 20:
            warnings.append(f"{column}: Normality test requires >=20 samples.")
            penalty += 0.1

    valid = True if not warnings else True
    penalty = min(0.5, penalty)
    return {"valid": valid, "warnings": warnings, "confidence_penalty": penalty}
