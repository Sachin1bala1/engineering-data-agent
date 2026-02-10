"""Planner agent (AI read-only) for comparison planning."""

from __future__ import annotations

import json
import os
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

import httpx

from .agent_protocols import PlannerOutput


def _default_plan(signals: List[str], alignment_method: str) -> PlannerOutput:
    return PlannerOutput(
        comparison_type="baseline_vs_experiment",
        signals=signals,
        alignment_method=alignment_method,
        statistics_required=["mean", "std", "z_score", "trend", "persistence"],
        reason="Deterministic baseline vs experiment comparison.",
    )


def _parse_json(text: str) -> Dict[str, Any] | None:
    try:
        return json.loads(text)
    except Exception:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except Exception:
                return None
        return None


def _list_models(api_key: str) -> List[Dict[str, Any]]:
    url = "https://generativelanguage.googleapis.com/v1beta/models"
    with httpx.Client(timeout=20.0) as client:
        response = client.get(url, params={"key": api_key})
        response.raise_for_status()
        data = response.json()
    return data.get("models", [])


def _supports_generate(model: Dict[str, Any]) -> bool:
    methods = model.get("supportedGenerationMethods") or model.get("supportedMethods") or []
    return any(method.lower() == "generatecontent" for method in methods if isinstance(method, str))


def _resolve_model(api_key: str, preferred: Optional[str]) -> str:
    try:
        models = _list_models(api_key)
        names = [m.get("name", "") for m in models]
        stripped = [name.replace("models/", "") for name in names if name]

        if preferred and preferred in stripped:
            return preferred

        # Prefer a model that explicitly supports generateContent
        for model in models:
            if _supports_generate(model):
                name = model.get("name", "")
                if name:
                    return name.replace("models/", "")

        if stripped:
            return stripped[0]
    except Exception:
        pass

    return preferred or "gemini-2.5-flash"


def plan(
    signals: List[str],
    alignment_method: str,
    ai_assisted: bool,
) -> PlannerOutput:
    if not ai_assisted or not os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
        return _default_plan(signals, alignment_method)

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    preferred_model = os.getenv("GEMINI_MODEL")
    instructions = (
        "You are a planner agent. Only propose a plan. "
        "Do NOT output any numeric results. "
        "Return JSON with keys: comparison_type, signals, alignment_method, statistics_required, reason."
    )
    payload = {
        "signals": signals,
        "alignment_method": alignment_method,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    prompt = f"{instructions}\n\nDATA:\n{json.dumps(payload)}"

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "topP": 0.8,
            "maxOutputTokens": 512,
            "response_mime_type": "application/json",
        },
    }
    model = _resolve_model(api_key, preferred_model)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.post(url, params={"key": api_key}, json=body)
            if response.status_code == 404:
                # Refresh model list and retry once.
                model = _resolve_model(api_key, None)
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                response = client.post(url, params={"key": api_key}, json=body)
            response.raise_for_status()
            data = response.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        parsed = _parse_json(text)
        if not parsed:
            return PlannerOutput(
                comparison_type="baseline_vs_experiment",
                signals=signals,
                alignment_method=alignment_method,
                statistics_required=["mean", "std", "z_score", "trend", "persistence"],
                reason="AI planning response could not be parsed; deterministic plan used.",
            )
    except Exception:
        return PlannerOutput(
            comparison_type="baseline_vs_experiment",
            signals=signals,
            alignment_method=alignment_method,
            statistics_required=["mean", "std", "z_score", "trend", "persistence"],
            reason="AI planning unavailable; deterministic plan used.",
        )

    return PlannerOutput(
        comparison_type=parsed.get("comparison_type", "baseline_vs_experiment"),
        signals=parsed.get("signals", signals),
        alignment_method=parsed.get("alignment_method", alignment_method),
        statistics_required=parsed.get("statistics_required", ["mean", "std", "z_score", "trend", "persistence"]),
        reason=parsed.get("reason", "AI-assisted planning."),
    )
