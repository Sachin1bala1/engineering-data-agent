"""DOE comparison pipeline with multi-agent orchestration."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, date
from typing import Dict, Any, List, Optional, Tuple

from .ingestion import ingest_file
from .models import (
    DOEReport,
    DOEContext,
    DOEAnalysisPlan,
    DOEComparisonRow,
    DOEStabilityRisk,
    DOEEngineeringInterpretation,
    DOEConfidenceComponents,
    DOEConfidenceWeights,
    DOEConfidenceScore,
)
from .planner_agent import plan as planner_plan
from .execution import (
    execute_plan,
    compute_confidence_components,
    compute_correlations,
    compute_trends,
    SCIPY_AVAILABLE,
)
from .stability import assess_stability
from .validation_agent import validate as validate_plan
from .explanation_agent import explain as explain_results
from .recovery_agent import suggest_fix
from ..comparison.alignment import align_datasets
from ..agents.agent_protocols import AgentLogEntry


def _hash_payload(payload: Any) -> str:
    data = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    return "sha256:" + hashlib.sha256(data).hexdigest()


def _choose_alignment(baseline_df, experiment_df) -> str:
    if "timestamp" in baseline_df.columns and "timestamp" in experiment_df.columns:
        return "timestamp"
    if "run_hours" in baseline_df.columns and "run_hours" in experiment_df.columns:
        return "run_hours"
    return "index"


def _available_signals(baseline_df, experiment_df) -> List[str]:
    ignore = {"timestamp", "asset_id", "raw_signal_metadata"}
    candidates = [c for c in baseline_df.columns if c in experiment_df.columns and c not in ignore]
    return [c for c in candidates if baseline_df[c].dtype != "O"]


def _apply_transformations(aligned, transformations: List[str], parameters: List[str]) -> None:
    if not transformations:
        return
    if "log" in transformations:
        for param in parameters:
            for suffix in ("baseline", "experiment"):
                col = f"{param}_{suffix}"
                if col in aligned.columns:
                    aligned[col] = aligned[col].apply(lambda x: None if x is None else (0.0 if x <= 0 else x))
                    aligned[col] = aligned[col].apply(lambda x: None if x is None else __import__("math").log1p(x))


def _map_weight(label: str) -> float:
    mapping = {"low": 0.15, "medium": 0.2, "high": 0.25}
    return mapping.get(label.lower(), 0.2)


def _map_risk(label: str) -> float:
    mapping = {"low": 0.2, "medium": 0.5, "high": 0.8}
    return mapping.get(label.lower(), 0.5)


def run_doe_comparison(
    baseline_path: str,
    experiment_path: str,
    process_name: str,
    engineer: str,
    baseline_description: Optional[str],
    experiment_description: Optional[str],
    doe_factors: Optional[Dict[str, Any]],
    column_mapping: Optional[Dict[str, str]] = None,
    default_date: Optional[date] = None,
    start_date: Optional[date] = None,
) -> Tuple[DOEReport, List[AgentLogEntry], List[str], List[str]]:
    warnings: List[str] = []
    errors: List[str] = []
    agent_logs: List[AgentLogEntry] = []

    baseline_ingest = ingest_file(
        baseline_path,
        default_date=default_date,
        start_date=start_date,
        column_mapping=column_mapping,
    )
    experiment_ingest = ingest_file(
        experiment_path,
        default_date=default_date,
        start_date=start_date,
        column_mapping=column_mapping,
    )
    warnings.extend(baseline_ingest.warnings)
    warnings.extend(experiment_ingest.warnings)

    baseline_df = baseline_ingest.dataframe
    experiment_df = experiment_ingest.dataframe
    time_assumptions = sorted(set(baseline_ingest.time_assumptions + experiment_ingest.time_assumptions))

    alignment_method = _choose_alignment(baseline_df, experiment_df)
    signals = _available_signals(baseline_df, experiment_df)
    plan = planner_plan(signals, alignment_method, {
        "baseline_metadata": baseline_ingest.metadata,
        "experiment_metadata": experiment_ingest.metadata,
        "time_assumptions": time_assumptions,
    })
    agent_logs.append(AgentLogEntry(
        agent="planner",
        timestamp=datetime.utcnow().isoformat(),
        input_hash=_hash_payload({"signals": signals, "alignment": alignment_method}),
        output_hash=_hash_payload(plan.model_dump()),
        payload=plan.model_dump(),
    ))

    aligned, alignment_warnings = align_datasets(baseline_df, experiment_df, plan.alignment_method)
    warnings.extend(alignment_warnings)
    _apply_transformations(aligned, plan.transformations, plan.signals)

    if not SCIPY_AVAILABLE and "welch_t_test" in plan.tests:
        warnings.append("SciPy not available; p-values omitted for Welch t-test.")

    execution_results = execute_plan(aligned, plan.signals, plan.tests)
    correlations = compute_correlations(aligned, plan.signals)
    trends = compute_trends(aligned, plan.signals)
    agent_logs.append(AgentLogEntry(
        agent="execution",
        timestamp=datetime.utcnow().isoformat(),
        input_hash=_hash_payload({"alignment": plan.alignment_method, "signals": plan.signals}),
        output_hash=_hash_payload(execution_results),
        payload={"results": execution_results},
    ))

    stability = assess_stability(aligned, plan.signals)
    validation = validate_plan(plan.model_dump(), execution_results)
    agent_logs.append(AgentLogEntry(
        agent="validation",
        timestamp=datetime.utcnow().isoformat(),
        input_hash=_hash_payload({"plan": plan.model_dump()}),
        output_hash=_hash_payload(validation),
        payload=validation,
    ))

    interpretation_payload = {
        "process_name": process_name,
        "engineer": engineer,
        "baseline_description": baseline_description,
        "experiment_description": experiment_description,
    }
    explanation = explain_results(
        {**interpretation_payload, "correlations": correlations, "trends": trends},
        execution_results,
        stability
    )
    agent_logs.append(AgentLogEntry(
        agent="explanation",
        timestamp=datetime.utcnow().isoformat(),
        input_hash=_hash_payload({"results": execution_results}),
        output_hash=_hash_payload(explanation),
        payload=explanation,
    ))

    interpretation = explanation.get("interpretation") or {}
    interpretation.setdefault("summary", "Engineering interpretation unavailable.")
    interpretation.setdefault("material_changes", [])
    interpretation.setdefault("implications", [])
    interpretation.setdefault("recommended_actions", [])

    weight_labels = explanation.get("weights", {})
    weights = {
        "data_completeness": _map_weight(weight_labels.get("data_completeness", "medium")),
        "sample_adequacy": _map_weight(weight_labels.get("sample_adequacy", "medium")),
        "noise_ratio": _map_weight(weight_labels.get("noise_ratio", "medium")),
        "significance_robustness": _map_weight(weight_labels.get("significance_robustness", "medium")),
        "assumption_risk": _map_weight(weight_labels.get("assumption_risk", "medium")),
    }
    weight_sum = sum(weights.values()) or 1.0
    normalized_weights = {k: v / weight_sum for k, v in weights.items()}

    components = compute_confidence_components(execution_results)
    assumption_risk = _map_risk(explanation.get("assumption_risk", "medium"))
    components["assumption_risk"] = assumption_risk
    assumption_score = 1.0 - assumption_risk
    confidence_score = (
        normalized_weights["data_completeness"] * components["data_completeness"]
        + normalized_weights["sample_adequacy"] * components["sample_adequacy"]
        + normalized_weights["noise_ratio"] * components["noise_ratio"]
        + normalized_weights["significance_robustness"] * components["significance_robustness"]
        + normalized_weights["assumption_risk"] * assumption_score
    )

    comparison_table: List[DOEComparisonRow] = []
    for param, row in execution_results.items():
        comparison_table.append(DOEComparisonRow(parameter=param, **row))

    plot_requests = explanation.get("plot_requests", [])
    if not plot_requests:
        plot_requests = _default_plot_requests(correlations, trends)
    plot_scripts = _build_plot_scripts(aligned, plot_requests)

    report = DOEReport(
        report_id=str(__import__("uuid").uuid4()),
        created_at=datetime.utcnow(),
        context=DOEContext(
            process_name=process_name,
            engineer=engineer,
            baseline_description=baseline_description,
            experiment_description=experiment_description,
            doe_factors=doe_factors or {},
            alignment_method=plan.alignment_method,
            time_assumptions=time_assumptions,
        ),
        analysis_plan=plan,
        comparison_table=comparison_table,
        stability_risk=DOEStabilityRisk(**stability),
        engineering_interpretation=DOEEngineeringInterpretation(**interpretation),
        confidence=DOEConfidenceScore(
            score=float(confidence_score),
            components=DOEConfidenceComponents(
                data_completeness=components["data_completeness"],
                sample_adequacy=components["sample_adequacy"],
                noise_ratio=components["noise_ratio"],
                significance_robustness=components["significance_robustness"],
                assumption_risk=components["assumption_risk"],
            ),
            weights=DOEConfidenceWeights(**normalized_weights),
        ),
        verdict=explanation.get("verdict", "NEED MORE DATA"),
        plot_scripts=plot_scripts,
        warnings=warnings,
        errors=validation.get("issues", []),
        raw_metadata={
            "baseline": baseline_ingest.metadata,
            "experiment": experiment_ingest.metadata,
            "validation": validation,
            "correlations": correlations,
            "trends": trends,
        },
    )

    if validation.get("status") == "FAIL":
        recovery = suggest_fix("Validation failed", {"issues": validation.get("issues", [])})
        report.warnings.append("Validation flagged issues; review recommended.")
        report.raw_metadata["recovery_suggestions"] = recovery

    return report, agent_logs, warnings, errors


def _default_plot_requests(correlations: Dict[str, float], trends: Dict[str, float]) -> List[Dict[str, Any]]:
    requests: List[Dict[str, Any]] = []
    if correlations:
        top_pair = max(correlations.items(), key=lambda item: abs(item[1]))
        if abs(top_pair[1]) >= 0.6:
            left, right = top_pair[0].split("__", 1)
            requests.append({"type": "scatter", "x": left, "y": right})
    if trends:
        top_trend = max(trends.items(), key=lambda item: abs(item[1]))
        if abs(top_trend[1]) > 0:
            requests.append({"type": "trend", "parameter": top_trend[0]})
    return requests


def _build_plot_scripts(aligned, plot_requests: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    scripts: List[Dict[str, str]] = []
    for request in plot_requests:
        plot_type = (request.get("type") or "").lower()
        if plot_type == "scatter":
            x_param = request.get("x")
            y_param = request.get("y")
            if not x_param or not y_param:
                continue
            script = _scatter_script(aligned, x_param, y_param)
            scripts.append({"title": f"Scatter: {x_param} vs {y_param}", "code": script})
        if plot_type == "trend":
            param = request.get("parameter")
            if not param:
                continue
            script = _trend_script(aligned, param)
            scripts.append({"title": f"Trend: {param}", "code": script})
    return scripts


def _scatter_script(aligned, x_param: str, y_param: str) -> str:
    x_col = f"{x_param}_experiment"
    y_col = f"{y_param}_experiment"
    x_vals = aligned[x_col].tolist() if x_col in aligned.columns else []
    y_vals = aligned[y_col].tolist() if y_col in aligned.columns else []
    payload = json.dumps({"x": x_vals, "y": y_vals, "x_label": x_param, "y_label": y_param})
    return (
        "import json\n"
        "import matplotlib.pyplot as plt\n"
        "\n"
        f"payload = json.loads('''{payload}''')\n"
        "x = payload['x']\n"
        "y = payload['y']\n"
        "fig, ax = plt.subplots(figsize=(6, 4))\n"
        "ax.scatter(x, y, alpha=0.7)\n"
        "ax.set_xlabel(payload['x_label'])\n"
        "ax.set_ylabel(payload['y_label'])\n"
        "ax.set_title(f\"Correlation: {payload['x_label']} vs {payload['y_label']}\")\n"
        "fig.tight_layout()\n"
        "output_path = 'doe_scatter.png'\n"
        "fig.savefig(output_path, dpi=200)\n"
        "print(f'Saved plot to {output_path}')\n"
    )


def _trend_script(aligned, param: str) -> str:
    col = f"{param}_experiment"
    values = aligned[col].tolist() if col in aligned.columns else []
    payload = json.dumps({"values": values, "label": param})
    return (
        "import json\n"
        "import matplotlib.pyplot as plt\n"
        "\n"
        f"payload = json.loads('''{payload}''')\n"
        "values = payload['values']\n"
        "fig, ax = plt.subplots(figsize=(6, 4))\n"
        "ax.plot(values, linewidth=1.5)\n"
        "ax.set_title(f\"Trend: {payload['label']}\")\n"
        "ax.set_xlabel('Index')\n"
        "ax.set_ylabel(payload['label'])\n"
        "fig.tight_layout()\n"
        "output_path = 'doe_trend.png'\n"
        "fig.savefig(output_path, dpi=200)\n"
        "print(f'Saved plot to {output_path}')\n"
    )
