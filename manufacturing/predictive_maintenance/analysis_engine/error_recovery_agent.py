"""Error recovery agent for analyzer pipeline."""

from __future__ import annotations

import json
import os
import time
from typing import Dict, Any, Optional
from datetime import datetime, timezone

import httpx


def _parse_json(text: str) -> Optional[Dict[str, Any]]:
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


def _list_models(api_key: str):
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


def suggest_fix(error_message: str, context: Dict[str, Any]) -> Dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return {"issue": error_message, "suggestions": ["Check file formatting and required columns."], "notes": []}

    preferred_model = os.getenv("GEMINI_MODEL")
    instructions = (
        "You are the Engineering Analyzer Error Recovery Agent. "
        "Read the error and propose fixes. Do NOT auto-correct. "
        "Return JSON only with keys: issue, suggestions, notes."
    )
    payload = {"error": error_message, "context": context, "timestamp": datetime.now(timezone.utc).isoformat()}
    prompt = f"{instructions}\n\nDATA:\n{json.dumps(payload)}"

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "topP": 0.8,
            "maxOutputTokens": 512,
            "response_mime_type": "application/json",
        },
    }
    model = _resolve_model(api_key, preferred_model)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    with httpx.Client(timeout=20.0) as client:
        response = client.post(url, params={"key": api_key}, json=body)
        if response.status_code == 404:
            model = _resolve_model(api_key, None)
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            response = client.post(url, params={"key": api_key}, json=body)
        if response.status_code == 429:
            return {
                "issue": error_message,
                "suggestions": ["LLM rate limit hit. Retry after 30-60 seconds."],
                "notes": ["Error recovery agent did not run due to Gemini 429 response."],
            }
        response.raise_for_status()
        data = response.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    parsed = _parse_json(text)
    if not parsed:
        return {"issue": error_message, "suggestions": ["Review input schema and timestamps."], "notes": []}
    return parsed
