"""Incident report ingestion pipeline."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

from ..db import embedding_for_text
from ..graph.graph_store import add_edge, add_embedding, insert_incident, upsert_asset


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


def ingest_incident_reports(file_path: str | Path, source_dataset_id: str | None = None) -> dict[str, Any]:
    path = Path(file_path)
    suffix = path.suffix.lower()
    if suffix in {".xlsx", ".xls"}:
        df = pd.read_excel(path)
    elif suffix == ".json":
        df = pd.read_json(path)
    else:
        df = pd.read_csv(path)

    df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.columns]

    rename_map = {
        "action": "corrective_action",
        "corrective": "corrective_action",
        "corrective_act": "corrective_action",
        "correctiveaction": "corrective_action",
        "cause": "root_cause",
        "root_caus": "root_cause",
        "rootcause": "root_cause",
        "failure": "failure_mode",
        "failuremode": "failure_mode",
        "machine_id": "asset_id",
        "equipment_id": "asset_id",
        "date": "timestamp",
        "downtime": "downtime_minutes",
        "downtime_min": "downtime_minutes",
        "downtime_mins": "downtime_minutes",
        "duration_minutes": "downtime_minutes",
    }
    dynamic_rename: dict[str, str] = {k: v for k, v in rename_map.items() if k in df.columns}
    for col in df.columns:
        if col.startswith("root_caus"):
            dynamic_rename[col] = "root_cause"
        elif col.startswith("corrective"):
            dynamic_rename[col] = "corrective_action"
        elif col.startswith("failure_mode") or col.startswith("failuremode"):
            dynamic_rename[col] = "failure_mode"
        elif col.startswith("down") and "time" in col:
            dynamic_rename[col] = "downtime_minutes"
    df = df.rename(columns=dynamic_rename)

    required = ["asset_id", "timestamp", "failure_mode"]
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns for incident reports: {', '.join(missing)}")

    count = 0
    asset_ids: set[str] = set()
    for row in df.to_dict(orient="records"):
        asset_id = str(row.get("asset_id") or "").strip()
        if not asset_id:
            continue
        upsert_asset(asset_id=asset_id, asset_type=row.get("asset_type"), location=row.get("location"), metadata={"source": "incident_reports"})

        notes = str(row.get("notes") or row.get("description") or row.get("comment") or row.get("remarks") or "")
        inferred_failure, inferred_root = _infer_from_notes(notes)
        failure_mode = str(row.get("failure_mode") or "").strip() or (inferred_failure or "unknown_failure")
        root_cause = str(row.get("root_cause") or "").strip() or (inferred_root or "unknown_cause")

        record = {
            "asset_id": asset_id,
            "timestamp": row.get("timestamp"),
            "failure_mode": failure_mode,
            "root_cause": root_cause,
            "corrective_action": str(row.get("corrective_action") or "unspecified_action"),
            "downtime_minutes": row.get("downtime_minutes"),
            "source_dataset_id": source_dataset_id,
            "notes": notes,
            "resolved": bool(row.get("resolved", True)),
            "raw_payload": row,
        }
        insert_incident(record)
        asset_ids.add(asset_id)
        add_edge(asset_id, "asset", asset_id, "failure_mode", record["failure_mode"])
        add_edge(asset_id, "failure_mode", record["failure_mode"], "root_cause", record["root_cause"])
        add_edge(asset_id, "root_cause", record["root_cause"], "corrective_action", record["corrective_action"])

        content = (
            f"incident asset={asset_id}; failure={record['failure_mode']}; cause={record['root_cause']}; "
            f"action={record['corrective_action']}; notes={record['notes']}"
        )
        add_embedding("incident_report", content, embedding_for_text(content))
        count += 1

    return {"rows_read": int(df.shape[0]), "rows_ingested": count, "asset_ids": sorted(asset_ids), "dataset_id": source_dataset_id}
