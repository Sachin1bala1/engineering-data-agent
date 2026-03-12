"""Graph store operations for Knowledge Twin."""

from __future__ import annotations

import json
from datetime import datetime, date
import math
from typing import Any

from sqlalchemy import text

from ..db import engine, is_postgres, to_embedding_literal


def _json_default(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if hasattr(value, "item"):
        # numpy scalar types
        try:
            return value.item()
        except Exception:
            pass
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            pass
    return str(value)


def _to_json(payload: Any) -> str:
    return json.dumps(payload, default=_json_default, ensure_ascii=False)


def upsert_asset(asset_id: str, asset_type: str | None = None, location: str | None = None, metadata: dict[str, Any] | None = None) -> None:
    payload = _to_json(metadata or {})
    with engine.begin() as conn:
        if is_postgres():
            conn.execute(
                text(
                    """
                    INSERT INTO assets(asset_id, asset_type, location, metadata)
                    VALUES (:asset_id, :asset_type, :location, CAST(:metadata AS JSONB))
                    ON CONFLICT(asset_id)
                    DO UPDATE SET
                      asset_type = COALESCE(EXCLUDED.asset_type, assets.asset_type),
                      location = COALESCE(EXCLUDED.location, assets.location),
                      metadata = assets.metadata || EXCLUDED.metadata
                    """
                ),
                {
                    "asset_id": asset_id,
                    "asset_type": asset_type,
                    "location": location,
                    "metadata": payload,
                },
            )
        else:
            conn.execute(
                text(
                    """
                    INSERT INTO assets(asset_id, asset_type, location, metadata)
                    VALUES (:asset_id, :asset_type, :location, :metadata)
                    ON CONFLICT(asset_id)
                    DO UPDATE SET
                      asset_type = COALESCE(excluded.asset_type, assets.asset_type),
                      location = COALESCE(excluded.location, assets.location),
                      metadata = COALESCE(excluded.metadata, assets.metadata)
                    """
                ),
                {
                    "asset_id": asset_id,
                    "asset_type": asset_type,
                    "location": location,
                    "metadata": payload,
                },
            )


def insert_incident(record: dict[str, Any]) -> None:
    payload = _to_json(record.get("raw_payload") or {})
    with engine.begin() as conn:
        if is_postgres():
            conn.execute(
                text(
                    """
                    INSERT INTO incidents(
                      asset_id, timestamp, failure_mode, root_cause,
                      corrective_action, downtime_minutes, source_dataset_id, notes, resolved, raw_payload
                    ) VALUES (
                      :asset_id, :timestamp, :failure_mode, :root_cause,
                      :corrective_action, :downtime_minutes, :source_dataset_id, :notes, :resolved, CAST(:raw_payload AS JSONB)
                    )
                    """
                ),
                {
                    "asset_id": record.get("asset_id"),
                    "timestamp": _json_default(record.get("timestamp")),
                    "failure_mode": record.get("failure_mode"),
                    "root_cause": record.get("root_cause"),
                    "corrective_action": record.get("corrective_action"),
                    "downtime_minutes": record.get("downtime_minutes"),
                    "source_dataset_id": record.get("source_dataset_id"),
                    "notes": record.get("notes", ""),
                    "resolved": bool(record.get("resolved", False)),
                    "raw_payload": payload,
                },
            )
        else:
            conn.execute(
                text(
                    """
                    INSERT INTO incidents(
                      asset_id, timestamp, failure_mode, root_cause,
                      corrective_action, downtime_minutes, source_dataset_id, notes, resolved, raw_payload
                    ) VALUES (
                      :asset_id, :timestamp, :failure_mode, :root_cause,
                      :corrective_action, :downtime_minutes, :source_dataset_id, :notes, :resolved, :raw_payload
                    )
                    """
                ),
                {
                    "asset_id": record.get("asset_id"),
                    "timestamp": _json_default(record.get("timestamp")),
                    "failure_mode": record.get("failure_mode"),
                    "root_cause": record.get("root_cause"),
                    "corrective_action": record.get("corrective_action"),
                    "downtime_minutes": record.get("downtime_minutes"),
                    "source_dataset_id": record.get("source_dataset_id"),
                    "notes": record.get("notes", ""),
                    "resolved": bool(record.get("resolved", False)),
                    "raw_payload": payload,
                },
            )


def insert_sop_step(sop_name: str, step_number: int, instruction: str, asset_type: str | None = None) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO sop_steps(sop_name, step_number, instruction, asset_type)
                VALUES (:sop_name, :step_number, :instruction, :asset_type)
                """
            ),
            {
                "sop_name": sop_name,
                "step_number": step_number,
                "instruction": instruction,
                "asset_type": asset_type,
            },
        )


def add_embedding(source: str, content: str, embedding: list[float]) -> None:
    with engine.begin() as conn:
        if is_postgres():
            conn.execute(
                text(
                    """
                    INSERT INTO knowledge_embeddings(source, content, embedding)
                    VALUES (:source, :content, CAST(:embedding AS vector))
                    """
                ),
                {
                    "source": source,
                    "content": content,
                    "embedding": to_embedding_literal(embedding),
                },
            )
        else:
            conn.execute(
                text(
                    """
                    INSERT INTO knowledge_embeddings(source, content, embedding)
                    VALUES (:source, :content, :embedding)
                    """
                ),
                {
                    "source": source,
                    "content": content,
                    "embedding": _to_json(embedding),
                },
            )


def add_edge(
    asset_id: str,
    source_type: str,
    source_value: str,
    target_type: str,
    target_value: str,
    weight: float = 1.0,
    metadata: dict[str, Any] | None = None,
) -> None:
    meta = _to_json(metadata or {})
    with engine.begin() as conn:
        if is_postgres():
            conn.execute(
                text(
                    """
                    INSERT INTO knowledge_edges(
                      asset_id, source_type, source_value, target_type, target_value, weight, metadata
                    ) VALUES (
                      :asset_id, :source_type, :source_value, :target_type, :target_value, :weight, CAST(:metadata AS JSONB)
                    )
                    """
                ),
                {
                    "asset_id": asset_id,
                    "source_type": source_type,
                    "source_value": source_value,
                    "target_type": target_type,
                    "target_value": target_value,
                    "weight": weight,
                    "metadata": meta,
                },
            )
        else:
            conn.execute(
                text(
                    """
                    INSERT INTO knowledge_edges(
                      asset_id, source_type, source_value, target_type, target_value, weight, metadata
                    ) VALUES (
                      :asset_id, :source_type, :source_value, :target_type, :target_value, :weight, :metadata
                    )
                    """
                ),
                {
                    "asset_id": asset_id,
                    "source_type": source_type,
                    "source_value": source_value,
                    "target_type": target_type,
                    "target_value": target_value,
                    "weight": weight,
                    "metadata": meta,
                },
            )


def vector_search(query_embedding: list[float], limit: int = 8) -> list[dict[str, Any]]:
    with engine.begin() as conn:
        if is_postgres():
            rows = conn.execute(
                text(
                    """
                    SELECT id, source, content, 1 - (embedding <=> CAST(:embedding AS vector)) AS similarity
                    FROM knowledge_embeddings
                    ORDER BY embedding <=> CAST(:embedding AS vector)
                    LIMIT :limit
                    """
                ),
                {
                    "embedding": to_embedding_literal(query_embedding),
                    "limit": limit,
                },
            )
            return [dict(row._mapping) for row in rows]

        rows = conn.execute(
            text(
                """
                SELECT id, source, content
                FROM knowledge_embeddings
                ORDER BY id DESC
                LIMIT :limit
                """
            ),
            {"limit": limit},
        )
        return [dict(row._mapping) for row in rows]


def fetch_asset_graph(asset_id: str) -> dict[str, Any]:
    with engine.begin() as conn:
        incident_rows = conn.execute(
            text(
                """
                SELECT id, timestamp, failure_mode, root_cause, corrective_action, notes, resolved
                FROM incidents
                WHERE asset_id=:asset_id
                ORDER BY timestamp DESC
                LIMIT 200
                """
            ),
            {"asset_id": asset_id},
        )
        incidents = [dict(row._mapping) for row in incident_rows]

        edge_rows = conn.execute(
            text(
                """
                SELECT source_type, source_value, target_type, target_value, weight
                FROM knowledge_edges
                WHERE asset_id=:asset_id
                """
            ),
            {"asset_id": asset_id},
        )
        edges = [dict(row._mapping) for row in edge_rows]

    nodes: dict[str, dict[str, Any]] = {
        f"asset:{asset_id}": {"id": f"asset:{asset_id}", "label": asset_id, "type": "asset"}
    }
    for row in incidents:
        incident_node = f"incident:{row['id']}"
        nodes[incident_node] = {
            "id": incident_node,
            "label": f"Incident {row['id']}",
            "type": "incident",
            "timestamp": row.get("timestamp"),
            "resolved": bool(row.get("resolved")),
        }
        failure = (row.get("failure_mode") or "unknown_failure").strip()
        cause = (row.get("root_cause") or "unknown_cause").strip()
        action = (row.get("corrective_action") or "no_action").strip()
        nodes.setdefault(f"failure_mode:{failure}", {"id": f"failure_mode:{failure}", "label": failure, "type": "failure_mode"})
        nodes.setdefault(f"root_cause:{cause}", {"id": f"root_cause:{cause}", "label": cause, "type": "root_cause"})
        nodes.setdefault(f"corrective_action:{action}", {"id": f"corrective_action:{action}", "label": action, "type": "corrective_action"})

        edges.append({"source_type": "asset", "source_value": asset_id, "target_type": "incident", "target_value": str(row["id"]), "weight": 1.0})
        edges.append({"source_type": "incident", "source_value": str(row["id"]), "target_type": "failure_mode", "target_value": failure, "weight": 1.0})
        edges.append({"source_type": "failure_mode", "source_value": failure, "target_type": "root_cause", "target_value": cause, "weight": 1.0})
        edges.append({"source_type": "root_cause", "source_value": cause, "target_type": "corrective_action", "target_value": action, "weight": 1.0})

    graph_edges = []
    for edge in edges:
        src = f"{edge['source_type']}:{edge['source_value']}"
        dst = f"{edge['target_type']}:{edge['target_value']}"
        if src not in nodes:
            nodes[src] = {"id": src, "label": str(edge["source_value"]), "type": edge["source_type"]}
        if dst not in nodes:
            nodes[dst] = {"id": dst, "label": str(edge["target_value"]), "type": edge["target_type"]}
        graph_edges.append({"source": src, "target": dst, "weight": float(edge.get("weight") or 1.0)})

    return {
        "asset_id": asset_id,
        "nodes": list(nodes.values()),
        "edges": graph_edges,
        "incidents": incidents,
        "generated_at": datetime.utcnow().isoformat(),
    }


def write_audit_log(
    endpoint: str,
    query_text: str,
    response_summary: str,
    evidence_count: int,
    confidence_score: float,
    metadata: dict[str, Any] | None = None,
) -> None:
    payload = _to_json(metadata or {})
    with engine.begin() as conn:
        if is_postgres():
            conn.execute(
                text(
                    """
                    INSERT INTO ai_audit_logs(endpoint, query_text, response_summary, evidence_count, confidence_score, metadata)
                    VALUES (:endpoint, :query_text, :response_summary, :evidence_count, :confidence_score, CAST(:metadata AS JSONB))
                    """
                ),
                {
                    "endpoint": endpoint,
                    "query_text": query_text,
                    "response_summary": response_summary,
                    "evidence_count": evidence_count,
                    "confidence_score": confidence_score,
                    "metadata": payload,
                },
            )
        else:
            conn.execute(
                text(
                    """
                    INSERT INTO ai_audit_logs(endpoint, query_text, response_summary, evidence_count, confidence_score, metadata)
                    VALUES (:endpoint, :query_text, :response_summary, :evidence_count, :confidence_score, :metadata)
                    """
                ),
                {
                    "endpoint": endpoint,
                    "query_text": query_text,
                    "response_summary": response_summary,
                    "evidence_count": evidence_count,
                    "confidence_score": confidence_score,
                    "metadata": payload,
                },
            )
