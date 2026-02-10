"""Repair agent (AI-guided, constrained)."""

from __future__ import annotations

import json
import os
from typing import Dict, Any

import httpx

from .agent_protocols import RepairOutput


def suggest_repair(errors: list[str], metadata: Dict[str, Any]) -> RepairOutput:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    if not api_key:
        return RepairOutput(
            issue="Validation failed",
            suggested_fix="Review alignment method or signal mapping.",
            confidence=0.4,
        )

    instructions = (
        "You are a repair agent. Suggest fixes only. Do not compute numbers. "
        "Return JSON with keys: issue, suggested_fix, confidence."
    )
    payload = {"errors": errors, "metadata": metadata}
    body = {
        "contents": [{"parts": [{"text": f"{instructions}\n\nDATA:\n{json.dumps(payload)}"}]}],
        "generationConfig": {
            "temperature": 0.2,
            "topP": 0.8,
            "maxOutputTokens": 512,
            "response_mime_type": "application/json",
        },
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.post(url, params={"key": api_key}, json=body)
            response.raise_for_status()
            data = response.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text)
        return RepairOutput(
            issue=parsed.get("issue", "Validation failed"),
            suggested_fix=parsed.get("suggested_fix", "Review alignment method or signal mapping."),
            confidence=float(parsed.get("confidence", 0.5)),
        )
    except Exception:
        return RepairOutput(
            issue="Validation failed",
            suggested_fix="Review alignment method or signal mapping.",
            confidence=0.4,
        )
