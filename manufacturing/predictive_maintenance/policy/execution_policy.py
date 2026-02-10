"""
Execution policy gate for AI suggestions.
"""

from dataclasses import dataclass
from typing import Dict, Any

from ..config.thresholds import AI_AUTO_APPLY_CONFIDENCE, WHITELISTED_FIX_TYPES


@dataclass
class ExecutionDecision:
    auto_apply: bool
    reason: str


def evaluate_execution_policy(recommendation: Dict[str, Any]) -> ExecutionDecision:
    confidence = recommendation.get("confidence", 0.0)
    fix_type = recommendation.get("recommended_fix", {}).get("type")

    if confidence >= AI_AUTO_APPLY_CONFIDENCE and fix_type in WHITELISTED_FIX_TYPES:
        return ExecutionDecision(auto_apply=True, reason="Confidence high and fix type whitelisted.")

    return ExecutionDecision(
        auto_apply=False,
        reason="Requires operator confirmation (confidence or fix type insufficient)."
    )
