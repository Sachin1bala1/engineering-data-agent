"""Failure reasoning based on deterministic historical records."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import text

from ..confidence.historical_confidence import compute_confidence
from ..db import engine


def get_historical_failures(asset_id: str) -> list[dict[str, Any]]:
    with engine.begin() as conn:
        rows = conn.execute(
            text(
                """
                SELECT id, asset_id, timestamp, failure_mode, root_cause, corrective_action, notes, resolved
                     , downtime_minutes, source_dataset_id
                FROM incidents
                WHERE asset_id=:asset_id
                ORDER BY timestamp DESC
                """
            ),
            {"asset_id": asset_id},
        )
        return [dict(row._mapping) for row in rows]


def recommend_action(asset_id: str, detected_failure: str | None = None) -> dict[str, Any]:
    incidents = get_historical_failures(asset_id)
    if not incidents:
        return {
            "asset_id": asset_id,
            "detected_failure": detected_failure,
            "recommendation": None,
            "confidence": 0.0,
            "evidence": [],
            "reason": "No historical incidents available.",
        }

    filtered = incidents
    if detected_failure:
        target = str(detected_failure or "").strip().lower()
        filtered = [
            row
            for row in incidents
            if target and target in str(row.get("failure_mode") or "").strip().lower()
        ]
        if not filtered:
            filtered = [
                row
                for row in incidents
                if str(row.get("failure_mode") or "").strip().lower() == target
            ]
        if not filtered:
            filtered = incidents

    failure_counts = Counter(str(row.get("failure_mode") or "unknown_failure") for row in filtered)
    root_cause_counts = Counter(str(row.get("root_cause") or "unknown_cause") for row in filtered)

    action_outcomes: dict[str, dict[str, int]] = {}
    for row in filtered:
        action = str(row.get("corrective_action") or "unspecified_action")
        bucket = action_outcomes.setdefault(action, {"success": 0, "total": 0})
        bucket["total"] += 1
        if bool(row.get("resolved")):
            bucket["success"] += 1

    if not action_outcomes:
        return {
            "asset_id": asset_id,
            "detected_failure": detected_failure,
            "recommendation": None,
            "confidence": 0.0,
            "evidence": [],
            "reason": "No corrective-action history available.",
        }

    best_action = max(
        action_outcomes.items(),
        key=lambda kv: (kv[1]["success"] / max(1, kv[1]["total"]), kv[1]["total"]),
    )
    action_name = best_action[0]
    action_stats = best_action[1]
    historical_success = action_stats["success"] / max(1, action_stats["total"])

    recent_window = datetime.utcnow() - timedelta(days=180)
    recent_count = 0
    valid_time_rows = 0
    for row in filtered:
        ts = row.get("timestamp")
        if not ts:
            continue
        valid_time_rows += 1
        if isinstance(ts, datetime):
            dt = ts
        else:
            try:
                dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00").replace(" ", "T"))
            except ValueError:
                continue
        if dt.replace(tzinfo=None) >= recent_window:
            recent_count += 1

    recency_signal = recent_count / max(1, valid_time_rows)
    similarity = 1.0 if detected_failure and detected_failure in failure_counts else 0.75
    data_quality = min(1.0, len(filtered) / 12.0)
    confidence = compute_confidence(similarity, historical_success, data_quality)
    confidence = max(confidence, min(1.0, 0.5 + recency_signal * 0.3))

    top_failure = failure_counts.most_common(1)[0][0] if failure_counts else "unknown_failure"
    top_cause = root_cause_counts.most_common(1)[0][0] if root_cause_counts else "unknown_cause"

    evidence = [
        {
            "incident_id": row.get("id"),
            "asset_id": row.get("asset_id"),
            "timestamp": row.get("timestamp"),
            "failure_mode": row.get("failure_mode"),
            "root_cause": row.get("root_cause"),
            "corrective_action": row.get("corrective_action"),
            "resolved": row.get("resolved"),
            "notes": row.get("notes"),
            "downtime_minutes": row.get("downtime_minutes"),
            "source_dataset_id": row.get("source_dataset_id"),
        }
        for row in filtered[:25]
    ]

    return {
        "asset_id": asset_id,
        "detected_failure": detected_failure or top_failure,
        "inferred_root_cause": top_cause,
        "recommendation": {
            "action": action_name,
            "historical_success_rate": historical_success,
            "evidence_count": action_stats["total"],
        },
        "confidence": round(confidence, 4),
        "evidence": evidence,
        "reason": (
            f"Recommended '{action_name}' because it resolved {action_stats['success']} of {action_stats['total']} "
            "similar historical incidents."
        ),
    }


def why_failure_occurred(asset_id: str, detected_failure: str | None = None) -> dict[str, Any]:
    rec = recommend_action(asset_id, detected_failure)
    if not rec.get("recommendation"):
        return {
            "asset_id": asset_id,
            "failure": detected_failure,
            "root_cause_summary": "Insufficient historical evidence.",
            "evidence": rec.get("evidence", []),
            "confidence": rec.get("confidence", 0.0),
        }

    root = rec.get("inferred_root_cause")
    failure = rec.get("detected_failure")
    action = (rec.get("recommendation") or {}).get("action")
    return {
        "asset_id": asset_id,
        "failure": failure,
        "root_cause_summary": f"Most frequent cause linked to '{failure}' is '{root}'.",
        "historically_effective_action": action,
        "evidence": rec.get("evidence", []),
        "confidence": rec.get("confidence", 0.0),
    }
