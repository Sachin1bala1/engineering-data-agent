"""Map failure contexts to SOP steps."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text

from ..db import engine


def get_sop_steps(asset_type: str | None = None, keyword: str | None = None) -> list[dict[str, Any]]:
    sql = "SELECT id, sop_name, step_number, instruction, asset_type FROM sop_steps WHERE 1=1"
    params: dict[str, Any] = {}
    if asset_type:
        sql += " AND (asset_type=:asset_type OR asset_type IS NULL OR asset_type='')"
        params["asset_type"] = asset_type
    if keyword:
        sql += " AND LOWER(instruction) LIKE :keyword"
        params["keyword"] = f"%{keyword.lower()}%"
    sql += " ORDER BY sop_name, step_number"

    with engine.begin() as conn:
        rows = conn.execute(text(sql), params)
        return [dict(row._mapping) for row in rows]


def map_sop_for_failure(asset_type: str | None, failure_mode: str | None, root_cause: str | None) -> dict[str, Any]:
    keyword_candidates = [
        (failure_mode or "").strip().lower(),
        (root_cause or "").strip().lower(),
    ]
    keyword_candidates = [k for k in keyword_candidates if k]

    matched_steps: list[dict[str, Any]] = []
    for keyword in keyword_candidates:
        matched_steps = get_sop_steps(asset_type=asset_type, keyword=keyword)
        if matched_steps:
            break

    if not matched_steps:
        matched_steps = get_sop_steps(asset_type=asset_type)

    grouped: dict[str, list[dict[str, Any]]] = {}
    for step in matched_steps:
        grouped.setdefault(step["sop_name"], []).append(step)

    return {
        "asset_type": asset_type,
        "failure_mode": failure_mode,
        "root_cause": root_cause,
        "matched_sops": [
            {
                "sop_name": sop_name,
                "steps": sorted(steps, key=lambda x: x.get("step_number") or 0),
            }
            for sop_name, steps in grouped.items()
        ],
    }

