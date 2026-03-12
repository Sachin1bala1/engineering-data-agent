"""Deterministic process risk scoring engine."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import text

from ..db import engine


def process_risk(asset_id: str) -> dict[str, Any]:
    with engine.begin() as conn:
        rows = conn.execute(
            text(
                """
                SELECT timestamp, failure_mode, resolved
                FROM incidents
                WHERE asset_id=:asset_id
                ORDER BY timestamp DESC
                LIMIT 300
                """
            ),
            {"asset_id": asset_id},
        )
        incidents = [dict(row._mapping) for row in rows]

    total = len(incidents)
    if total == 0:
        return {
            "asset_id": asset_id,
            "risk_score": 0.0,
            "risk_level": "low",
            "drivers": ["No incident history available."],
        }

    unresolved = sum(1 for row in incidents if not bool(row.get("resolved")))
    unresolved_ratio = unresolved / total

    recent_cutoff = datetime.utcnow() - timedelta(days=90)
    recent = 0
    for row in incidents:
        ts = row.get("timestamp")
        if not ts:
            continue
        if isinstance(ts, datetime):
            dt = ts
        else:
            try:
                dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00").replace(" ", "T"))
            except ValueError:
                continue
        if dt.replace(tzinfo=None) >= recent_cutoff:
            recent += 1

    recurrence = recent / max(1, total)
    variety = len({str(row.get("failure_mode") or "unknown") for row in incidents}) / 8.0
    risk_score = min(1.0, unresolved_ratio * 0.5 + recurrence * 0.35 + min(1.0, variety) * 0.15)

    if risk_score >= 0.75:
        level = "critical"
    elif risk_score >= 0.5:
        level = "high"
    elif risk_score >= 0.25:
        level = "medium"
    else:
        level = "low"

    drivers = [
        f"Unresolved incidents: {unresolved}/{total}",
        f"Recent incident density (90d): {recent}/{total}",
        f"Failure mode variety index: {min(1.0, variety):.2f}",
    ]

    return {
        "asset_id": asset_id,
        "risk_score": round(risk_score, 4),
        "risk_level": level,
        "drivers": drivers,
    }

