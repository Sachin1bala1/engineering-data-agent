"""Execution agent for deterministic computations (no AI)."""

from __future__ import annotations

import hashlib
import json
from typing import Dict, Any, List

import numpy as np
import pandas as pd

from .agent_protocols import PlannerOutput, ExecutionOutput
from .sandbox import execute_code


def _hash_payload(payload: Any) -> str:
    data = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    return "sha256:" + hashlib.sha256(data).hexdigest()


def run_execution(
    plan: PlannerOutput,
    aligned: pd.DataFrame,
    input_hash: str,
) -> ExecutionOutput:
    signals = plan.signals
    code_lines: List[str] = [
        "result = {}",
        "def compute_stats(values):",
        "    clean = values[~np.isnan(values)]",
        "    if clean.size == 0:",
        "        return {'mean': 0.0, 'std': 0.0, 'count': 0, 'min': float('nan'), 'max': float('nan')}",
        "    mean = float(np.mean(clean))",
        "    std = float(np.std(clean, ddof=1)) if clean.size > 1 else 0.0",
        "    return {'mean': mean, 'std': std, 'count': int(clean.size), 'min': float(np.min(clean)), 'max': float(np.max(clean))}",
        "def trend(values):",
        "    clean = values[~np.isnan(values)]",
        "    if clean.size < 3:",
        "        return None",
        "    x = np.arange(clean.size)",
        "    return float(np.polyfit(x, clean, 1)[0])",
    ]

    for signal in signals:
        base_col = f"{signal}_baseline"
        exp_col = f"{signal}_experiment"
        code_lines.extend([
            f"if '{base_col}' in aligned.columns and '{exp_col}' in aligned.columns:",
            f"    base_vals = pd.to_numeric(aligned['{base_col}'], errors='coerce').to_numpy(dtype=float)",
            f"    exp_vals = pd.to_numeric(aligned['{exp_col}'], errors='coerce').to_numpy(dtype=float)",
            "    base_stats = compute_stats(base_vals)",
            "    exp_stats = compute_stats(exp_vals)",
            "    z = None",
            "    if base_stats['std'] != 0:",
            "        z = float((exp_stats['mean'] - base_stats['mean']) / base_stats['std'])",
            "    trend_base = trend(base_vals)",
            "    trend_exp = trend(exp_vals)",
            "    trend_delta = None",
            "    if trend_base is not None and trend_exp is not None:",
            "        trend_delta = float(trend_exp - trend_base)",
            "    persistence = None",
            "    if base_stats['count'] > 0:",
            "        persistence = float(np.mean(exp_vals > base_stats['mean']) * 100.0)",
            f"    result['{signal}'] = {{",
            "        'baseline_stats': base_stats,",
            "        'experiment_stats': exp_stats,",
            "        'z_score': z,",
            "        'trend_delta': trend_delta,",
            "        'persistence_above_baseline': persistence,",
            "    }",
        ])

    code = "\n".join(code_lines)

    plan_hash = _hash_payload(plan.model_dump())
    context = {"np": np, "pd": pd, "aligned": aligned}
    result = execute_code(code, context)
    output = result.get("result", {})
    output_hash = _hash_payload(output)

    return ExecutionOutput(
        signal_results=output,
        execution_hash=output_hash,
        input_hash=_hash_payload({"plan": plan_hash, "input": input_hash}),
    )
