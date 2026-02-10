"""Comparison pipeline integrating agents and deterministic execution."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from typing import Dict, Any, List, Optional, Tuple

from .ingestion import ingest_file
from .alignment import align_datasets
from .comparison_engine import build_signal_comparisons, build_summary, build_alignment_metadata
from .reports import build_report
from ..agents.planner_agent import plan as planner_plan
from ..agents.execution_agent import run_execution
from ..agents.validation_agent import validate_results
from ..agents.repair_agent import suggest_repair
from ..agents.agent_protocols import AgentLogEntry, PlannerOutput, ExecutionOutput, ValidationOutput, RepairOutput


def _hash_file(path: str) -> str:
    with open(path, "rb") as handle:
        data = handle.read()
    return "sha256:" + hashlib.sha256(data).hexdigest()


def _log_agent(
    logs: List[AgentLogEntry],
    agent: str,
    input_hash: str,
    output: Dict[str, Any],
) -> None:
    output_hash = "sha256:" + hashlib.sha256(json.dumps(output, default=str).encode("utf-8")).hexdigest()
    logs.append(
        AgentLogEntry(
            agent=agent,
            timestamp=__import__("datetime").datetime.utcnow().isoformat(),
            input_hash=input_hash,
            output_hash=output_hash,
            payload=output,
        )
    )


def _choose_alignment(baseline_df, experiment_df) -> str:
    if "timestamp" in baseline_df.columns and "timestamp" in experiment_df.columns:
        return "timestamp"
    if "run_hours" in baseline_df.columns and "run_hours" in experiment_df.columns:
        return "run_hours"
    return "index"


def _available_signals(baseline_df, experiment_df) -> List[str]:
    signals = []
    for signal in [
        "temperature", "vibration", "pressure", "current",
        "speed", "run_hours", "alarm_count"
    ]:
        if signal in baseline_df.columns and signal in experiment_df.columns:
            signals.append(signal)
    return signals


def run_comparison(
    baseline_path: str,
    experiment_path: str,
    asset_id: Optional[str],
    analysis_mode: str,
    default_date: Optional[date] = None,
) -> Tuple[Any, List[AgentLogEntry], List[str], List[str]]:
    warnings: List[str] = []
    errors: List[str] = []
    agent_logs: List[AgentLogEntry] = []

    baseline_ingest = ingest_file(baseline_path, default_date=default_date)
    experiment_ingest = ingest_file(experiment_path, default_date=default_date)
    warnings.extend(baseline_ingest.warnings)
    warnings.extend(experiment_ingest.warnings)

    baseline_df = baseline_ingest.dataframe
    experiment_df = experiment_ingest.dataframe

    alignment_method = _choose_alignment(baseline_df, experiment_df)
    signals = _available_signals(baseline_df, experiment_df)

    ai_assisted = analysis_mode == "ai_assisted"
    planner_output = planner_plan(signals, alignment_method, ai_assisted=ai_assisted)
    _log_agent(agent_logs, "planner", _hash_file(baseline_path), planner_output.model_dump())

    aligned, alignment_warnings = align_datasets(baseline_df, experiment_df, planner_output.alignment_method)
    warnings.extend(alignment_warnings)

    input_hash = _hash_file(baseline_path) + ":" + _hash_file(experiment_path)
    execution_output = run_execution(planner_output, aligned, input_hash=input_hash)
    _log_agent(agent_logs, "execution", execution_output.input_hash, execution_output.model_dump())

    validation_output = validate_results(
        execution_output.signal_results,
        metadata={"aligned_points": len(aligned)}
    )
    _log_agent(agent_logs, "validation", execution_output.execution_hash, validation_output.model_dump())

    if validation_output.status != "PASS" and validation_output.recommend_repair:
        repair_output = suggest_repair(validation_output.errors, {"alignment_method": planner_output.alignment_method})
        _log_agent(agent_logs, "repair", execution_output.execution_hash, repair_output.model_dump())
        if "alignment" in repair_output.suggested_fix.lower():
            alternate = "run_hours" if planner_output.alignment_method != "run_hours" else "index"
            planner_output = PlannerOutput(
                comparison_type=planner_output.comparison_type,
                signals=planner_output.signals,
                alignment_method=alternate,
                statistics_required=planner_output.statistics_required,
                reason=f"Repair suggested alignment change to {alternate}",
            )
            aligned, alignment_warnings = align_datasets(baseline_df, experiment_df, alternate)
            warnings.extend(alignment_warnings)
            execution_output = run_execution(planner_output, aligned, input_hash=input_hash)
            _log_agent(agent_logs, "execution", execution_output.input_hash, execution_output.model_dump())
            validation_output = validate_results(
                execution_output.signal_results,
                metadata={"aligned_points": len(aligned)}
            )
            _log_agent(agent_logs, "validation", execution_output.execution_hash, validation_output.model_dump())

    if validation_output.status != "PASS":
        errors.extend(validation_output.errors)

    comparisons, comp_warnings = build_signal_comparisons(execution_output.signal_results)
    warnings.extend(comp_warnings)

    alignment_metadata = build_alignment_metadata(
        planner_output.alignment_method,
        baseline_points=len(baseline_df),
        experiment_points=len(experiment_df),
        aligned_points=len(aligned),
        warnings=alignment_warnings,
    )

    summary = build_summary(asset_id or "ASSET-UNKNOWN", comparisons)
    report = build_report(
        summary=summary,
        comparisons=comparisons,
        alignment_metadata=alignment_metadata,
        raw_metadata={
            "baseline": baseline_ingest.metadata,
            "experiment": experiment_ingest.metadata,
            "plan": planner_output.model_dump(),
            "validation": validation_output.model_dump(),
            "aligned_series": _build_aligned_series(aligned, planner_output.signals),
        },
    )
    return report, agent_logs, warnings, errors


def _build_aligned_series(aligned, signals: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    series: Dict[str, List[Dict[str, Any]]] = {}
    if "timestamp" in aligned.columns:
        time_values = aligned["timestamp"]
    elif "run_hours" in aligned.columns:
        time_values = aligned["run_hours"]
    else:
        time_values = aligned.index

    max_points = 500
    if len(aligned) > max_points:
        aligned = aligned.iloc[-max_points:]
        time_values = time_values.iloc[-max_points:] if hasattr(time_values, "iloc") else time_values

    for signal in signals:
        exp_col = f"{signal}_experiment"
        base_col = f"{signal}_baseline"
        if exp_col not in aligned.columns or base_col not in aligned.columns:
            continue
        points = []
        for idx, t in enumerate(time_values):
            points.append({
                "timestamp": str(t),
                "baseline": aligned.iloc[idx][base_col],
                "experiment": aligned.iloc[idx][exp_col],
            })
        series[signal] = points
    return series
