"""Maintenance log ingestion pipeline."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

from ..db import embedding_for_text
from ..graph.graph_store import add_edge, add_embedding, insert_incident, upsert_asset


def _load_table(file_path: str | Path) -> pd.DataFrame:
    path = Path(file_path)
    suffix = path.suffix.lower()
    if suffix in {".xlsx", ".xls"}:
        return pd.read_excel(path)
    return pd.read_csv(path)


def _norm_col(name: str) -> str:
    return name.strip().lower().replace(" ", "_")


def _infer_from_notes(notes: str) -> tuple[str | None, str | None]:
    text = (notes or "").lower()
    rules = [
        ("overload", ("overload", "overcurrent_or_load_exceedance")),
        ("wire", ("wiring_degradation", "wiring_degradation")),
        ("seal", ("seal_leak", "seal_wear_or_pressure_spike")),
        ("misalign", ("misalignment", "shaft_or_coupling_misalignment")),
        ("bearing", ("bearing_wear", "bearing_lubrication_or_wear")),
        ("vibration", ("vibration_alert", "excessive_vibration_condition")),
        ("pressure", ("pressure_alert", "pressure_spike_or_restriction")),
        ("temperature", ("temperature_alert", "thermal_overstress")),
    ]
    for keyword, (failure_mode, root_cause) in rules:
        if keyword in text:
            return failure_mode, root_cause
    return None, None


def ingest_maintenance_logs(file_path: str | Path, source_dataset_id: str | None = None) -> dict[str, Any]:
    df = _load_table(file_path)
    df.columns = [_norm_col(c) for c in df.columns]

    alias = {
        "asset": "asset_id",
        "equipment_id": "asset_id",
        "machine_id": "asset_id",
        "event_time": "timestamp",
        "date": "timestamp",
        "time": "timestamp",
        "cause": "root_cause",
        "root_caus": "root_cause",
        "rootcause": "root_cause",
        "action": "corrective_action",
        "corrective": "corrective_action",
        "corrective_act": "corrective_action",
        "status": "resolved",
        "failure": "failure_mode",
        "failuremode": "failure_mode",
        "downtime": "downtime_minutes",
        "downtime_min": "downtime_minutes",
        "downtime_mins": "downtime_minutes",
        "duration_minutes": "downtime_minutes",
    }
    dynamic_alias = {c: alias[c] for c in df.columns if c in alias}
    for col in df.columns:
        if col.startswith("root_caus"):
            dynamic_alias[col] = "root_cause"
        elif col.startswith("corrective"):
            dynamic_alias[col] = "corrective_action"
        elif col.startswith("failure_mode") or col.startswith("failuremode"):
            dynamic_alias[col] = "failure_mode"
        elif col.startswith("down") and "time" in col:
            dynamic_alias[col] = "downtime_minutes"
    df = df.rename(columns=dynamic_alias)

    required = ["asset_id", "timestamp"]
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")

    inserted = 0
    asset_ids: set[str] = set()
    for row in df.to_dict(orient="records"):
        asset_id = str(row.get("asset_id") or "").strip()
        if not asset_id:
            continue
        status_raw = str(row.get("resolved", row.get("status", ""))).strip().lower()
        resolved = status_raw in {"true", "1", "yes", "y", "resolved", "done", "ok", "normal", "pass"}
        notes = str(row.get("notes") or row.get("description") or row.get("comment") or row.get("remarks") or "")
        inferred_failure, inferred_root = _infer_from_notes(notes)
        failure_mode = str(row.get("failure_mode") or "").strip()
        if not failure_mode:
            sensor = str(row.get("sensor") or "").strip().lower()
            if status_raw in {"alert", "warning", "critical", "alarm"} and sensor:
                failure_mode = f"{sensor}_alert"
            elif inferred_failure:
                failure_mode = inferred_failure
            else:
                failure_mode = "unknown_failure"
        root_cause = str(row.get("root_cause") or "").strip() or (inferred_root or "unknown_cause")

        upsert_asset(
            asset_id=asset_id,
            asset_type=row.get("asset_type") or None,
            location=row.get("location") or None,
            metadata={"source": "maintenance_logs"},
        )

        incident = {
            "asset_id": asset_id,
            "timestamp": row.get("timestamp"),
            "failure_mode": failure_mode,
            "root_cause": root_cause,
            "corrective_action": str(row.get("corrective_action") or "unspecified_action"),
            "downtime_minutes": row.get("downtime_minutes"),
            "source_dataset_id": source_dataset_id,
            "notes": notes,
            "resolved": resolved,
            "raw_payload": row,
        }
        insert_incident(incident)
        asset_ids.add(asset_id)

        failure = incident["failure_mode"]
        cause = incident["root_cause"]
        action = incident["corrective_action"]
        add_edge(asset_id, "asset", asset_id, "failure_mode", failure)
        add_edge(asset_id, "failure_mode", failure, "root_cause", cause)
        add_edge(asset_id, "root_cause", cause, "corrective_action", action)

        content = f"asset={asset_id}; failure={failure}; root_cause={cause}; action={action}; notes={incident['notes']}"
        add_embedding("maintenance_log", content, embedding_for_text(content))
        inserted += 1

    return {"rows_read": int(df.shape[0]), "rows_ingested": inserted, "asset_ids": sorted(asset_ids), "dataset_id": source_dataset_id}
