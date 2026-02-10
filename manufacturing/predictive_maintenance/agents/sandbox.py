"""Sandboxed execution helper for deterministic code."""

from __future__ import annotations

from typing import Any, Dict


def execute_code(code: str, context: Dict[str, Any]) -> Dict[str, Any]:
    """Execute generated code in a constrained namespace."""
    allowed_builtins = {
        "range": range,
        "len": len,
        "min": min,
        "max": max,
        "sum": sum,
        "abs": abs,
        "float": float,
        "int": int,
        "dict": dict,
        "list": list,
    }
    sandbox_globals = {"__builtins__": allowed_builtins}
    sandbox_globals.update(context)
    sandbox_locals: Dict[str, Any] = {}
    exec(code, sandbox_globals, sandbox_locals)
    return sandbox_locals
