"""
Deterministic time classifier using regex and numeric heuristics.
"""

import re
from typing import Tuple, Any


TIME_CLASSES = {
    "FULL_DATETIME",
    "TIME_ONLY",
    "DATE_ONLY",
    "RELATIVE",
    "EXCEL_SERIAL",
    "TEXTUAL",
    "UNKNOWN"
}


def classify_time_value(value: Any) -> Tuple[str, float]:
    if value is None:
        return "UNKNOWN", 0.0

    text = str(value).strip()
    if not text:
        return "UNKNOWN", 0.0

    # Excel serial dates
    if re.fullmatch(r"\d+(\.\d+)?", text):
        numeric = float(text)
        if 30000 <= numeric <= 60000:
            return "EXCEL_SERIAL", 0.9
        if numeric < 10000:
            return "RELATIVE", 0.7

    # Full datetime patterns
    if re.search(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", text) or re.search(r"\d{4}/\d{2}/\d{2}", text):
        return "FULL_DATETIME", 0.9

    # Date only
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text) or re.fullmatch(r"\d{2}/\d{2}/\d{4}", text):
        return "DATE_ONLY", 0.85

    # Time only (HH:MM:SS or HH:MM)
    if re.fullmatch(r"\d{1,2}:\d{2}(:\d{2}(\.\d{1,6})?)?", text):
        return "TIME_ONLY", 0.85

    # Relative patterns
    if re.fullmatch(r"(t\+)?\d+(\.\d+)?(s|sec|seconds|m|min|h|hr)", text.lower()):
        return "RELATIVE", 0.8

    # Textual date
    if re.search(r"[a-zA-Z]{3,}", text):
        return "TEXTUAL", 0.6

    return "UNKNOWN", 0.0
