"""
Deterministic time anchor resolver.
"""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional, Dict, Any, List

from ..config.shifts import SHIFT_STARTS, DEFAULT_SHIFT
from ..config.env import get_default_date


@dataclass
class AnchorResolution:
    anchor_date: Optional[date]
    anchor_time: Optional[datetime.time]
    assumptions: List[str]


def resolve_anchor(row_date: Optional[date],
                   file_metadata: Optional[Dict[str, Any]],
                   default_date: Optional[date],
                   start_date: Optional[date],
                   shift_name: Optional[str]) -> AnchorResolution:
    assumptions: List[str] = []

    if row_date:
        return AnchorResolution(anchor_date=row_date, anchor_time=None, assumptions=assumptions)

    if file_metadata and file_metadata.get("file_date"):
        assumptions.append("anchored_to_file_metadata_date")
        return AnchorResolution(anchor_date=file_metadata["file_date"], anchor_time=None, assumptions=assumptions)

    if start_date:
        assumptions.append("anchored_to_user_start_date")
        return AnchorResolution(anchor_date=start_date, anchor_time=None, assumptions=assumptions)

    if default_date:
        assumptions.append("anchored_to_user_default_date")
        return AnchorResolution(anchor_date=default_date, anchor_time=None, assumptions=assumptions)

    shift = shift_name or DEFAULT_SHIFT
    assumptions.append(f"anchored_to_shift_{shift}")
    return AnchorResolution(anchor_date=get_default_date(), anchor_time=SHIFT_STARTS.get(shift), assumptions=assumptions)
