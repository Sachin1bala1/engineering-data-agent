import importlib
import os
from pathlib import Path

import pandas as pd


def _bootstrap_modules(tmp_path: Path):
    db_file = tmp_path / "knowledge_twin_test.db"
    os.environ["KNOWLEDGE_DB_URL"] = f"sqlite:///{db_file.as_posix()}"

    db_mod = importlib.import_module("predictive_maintenance.knowledge_twin.db")
    importlib.reload(db_mod)
    graph_mod = importlib.import_module("predictive_maintenance.knowledge_twin.graph.graph_store")
    importlib.reload(graph_mod)
    log_mod = importlib.import_module("predictive_maintenance.knowledge_twin.ingestion.log_parser")
    importlib.reload(log_mod)
    sop_mod = importlib.import_module("predictive_maintenance.knowledge_twin.ingestion.sop_parser")
    importlib.reload(sop_mod)
    reasoner_mod = importlib.import_module("predictive_maintenance.knowledge_twin.reasoning.failure_reasoner")
    importlib.reload(reasoner_mod)
    mapper_mod = importlib.import_module("predictive_maintenance.knowledge_twin.reasoning.sop_mapper")
    importlib.reload(mapper_mod)
    risk_mod = importlib.import_module("predictive_maintenance.knowledge_twin.reasoning.process_risk_engine")
    importlib.reload(risk_mod)

    db_mod.bootstrap_schema()
    return log_mod, sop_mod, reasoner_mod, mapper_mod, risk_mod


def test_knowledge_twin_ingestion_and_recommendation(tmp_path):
    log_mod, sop_mod, reasoner_mod, mapper_mod, risk_mod = _bootstrap_modules(tmp_path)

    csv_path = tmp_path / "logs.csv"
    pd.DataFrame(
        [
            {
                "asset_id": "MOTOR-1",
                "timestamp": "2024-01-01T00:00:00",
                "failure_mode": "bearing_wear",
                "root_cause": "poor_lubrication",
                "action": "add_lubrication",
                "resolved": True,
                "notes": "resolved quickly",
            },
            {
                "asset_id": "MOTOR-1",
                "timestamp": "2024-02-01T00:00:00",
                "failure_mode": "bearing_wear",
                "root_cause": "poor_lubrication",
                "action": "add_lubrication",
                "resolved": True,
                "notes": "resolved again",
            },
            {
                "asset_id": "MOTOR-1",
                "timestamp": "2024-03-01T00:00:00",
                "failure_mode": "bearing_wear",
                "root_cause": "alignment_issue",
                "action": "realign_shaft",
                "resolved": False,
                "notes": "partial",
            },
        ]
    ).to_csv(csv_path, index=False)

    result = log_mod.ingest_maintenance_logs(csv_path)
    assert result["rows_ingested"] == 3

    sop_path = tmp_path / "motor_sop.txt"
    sop_path.write_text(
        "1. Lubricate bearing housing.\n2. Verify shaft alignment.\n3. Restart and verify vibration.\n",
        encoding="utf-8",
    )
    sop_ingested = sop_mod.ingest_sop(sop_path, sop_name="Motor SOP", asset_type="motor")
    assert sop_ingested["steps_ingested"] >= 3

    recommendation = reasoner_mod.recommend_action("MOTOR-1", "bearing_wear")
    assert recommendation["recommendation"]["action"] == "add_lubrication"
    assert recommendation["confidence"] > 0
    assert len(recommendation["evidence"]) >= 2

    sop_match = mapper_mod.map_sop_for_failure("motor", "bearing_wear", "poor_lubrication")
    assert len(sop_match["matched_sops"]) >= 1

    risk = risk_mod.process_risk("MOTOR-1")
    assert 0 <= risk["risk_score"] <= 1
    assert risk["risk_level"] in {"low", "medium", "high", "critical"}
