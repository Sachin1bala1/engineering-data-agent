"""DOE explanation agent (LLM)."""

from __future__ import annotations

import json
import os
from typing import Dict, Any, List
from datetime import datetime, timezone

import httpx


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


def _resolve_model(api_key: str, preferred: str | None) -> str:
    try:
        models = _list_models(api_key)
        names = [m.get("name", "") for m in models]
        stripped = [name.replace("models/", "") for name in names if name]
        if preferred and preferred in stripped:
            return preferred
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


def explain(context: Dict[str, Any], results: Dict[str, Any], stability: Dict[str, Any]) -> Dict[str, Any]:
    if not os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
        return {
            "interpretation": {
                "summary": "Deterministic explanation unavailable; Gemini key missing.",
                "material_changes": [],
                "implications": [],
                "recommended_actions": [],
            },
            "weights": {
                "data_completeness": "medium",
                "sample_adequacy": "medium",
                "noise_ratio": "medium",
                "significance_robustness": "medium",
                "assumption_risk": "medium",
            },
            "assumption_risk": "medium",
            "verdict": "NEED MORE DATA",
        }

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    preferred_model = os.getenv("GEMINI_MODEL")
    instructions = (
        "You are the DOE Engineering Explanation Agent. Use only the provided results. "
        "Do NOT compute numbers. Reference computed values as provided. "
        "Return JSON only with keys: interpretation, weights, assumption_risk, verdict, plot_requests. "
        "interpretation: summary, material_changes, implications, recommended_actions. "
        "weights: use labels low/medium/high for each component. "
        "plot_requests: list of plot suggestions using type (scatter|trend), "
        "and parameters (x,y) or (parameter). "
        "assumption_risk: low/medium/high. verdict: ACCEPT/CONDITIONAL ACCEPT/REJECT/NEED MORE DATA."
    )
    payload = {
        "context": context,
        "results": results,
        "stability": stability,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    prompt = f"{instructions}\n\nDATA:\n{json.dumps(payload)}"

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "topP": 0.8,
            "maxOutputTokens": 800,
            "response_mime_type": "application/json",
        },
    }
    model = _resolve_model(api_key, preferred_model)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.post(url, params={"key": api_key}, json=body)
            if response.status_code == 404:
                model = _resolve_model(api_key, None)
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                response = client.post(url, params={"key": api_key}, json=body)
            response.raise_for_status()
            data = response.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        parsed = _parse_json(text)
        if not parsed:
            return {
                "interpretation": {
                    "summary": "AI explanation could not be parsed.",
                    "material_changes": [],
                    "implications": [],
                    "recommended_actions": [],
                },
                "weights": {
                    "data_completeness": "medium",
                    "sample_adequacy": "medium",
                    "noise_ratio": "medium",
                    "significance_robustness": "medium",
                    "assumption_risk": "medium",
                },
                "assumption_risk": "medium",
                "verdict": "NEED MORE DATA",
            }
        return {
            "interpretation": parsed.get("interpretation", {}),
            "weights": parsed.get("weights", {}),
            "assumption_risk": parsed.get("assumption_risk", "medium"),
            "verdict": parsed.get("verdict", "NEED MORE DATA"),
            "plot_requests": parsed.get("plot_requests", []),
        }
    except Exception:
        return {
            "interpretation": {
                "summary": "AI explanation unavailable.",
                "material_changes": [],
                "implications": [],
                "recommended_actions": [],
            },
            "weights": {
                "data_completeness": "medium",
                "sample_adequacy": "medium",
                "noise_ratio": "medium",
                "significance_robustness": "medium",
                "assumption_risk": "medium",
            },
            "assumption_risk": "medium",
            "verdict": "NEED MORE DATA",
            "plot_requests": [],
        }
