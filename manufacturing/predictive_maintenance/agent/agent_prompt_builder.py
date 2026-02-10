"""
Prompt builder for operator-facing troubleshooting assistance.
"""

from typing import Dict, Any


def build_prompt(context: Dict[str, Any]) -> str:
    return (
        "Engineering assistant context. Use only system data.\n"
        f"Asset: {context.get('asset', {})}\n"
        f"Risk: {context.get('risk_assessment', {})}\n"
        f"Failure modes: {context.get('failure_mode_breakdown', [])}\n"
        f"Maintenance history: {context.get('maintenance_history', [])}\n"
    )
