"""Engineering explanation agent for analyzer."""

from __future__ import annotations

import json
import os
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


def _normalize_explanation(parsed: Dict[str, Any]) -> Dict[str, Any]:
    summary = parsed.get("summary", "")
    conclusions = parsed.get("conclusions", [])
    limitations = parsed.get("limitations", [])
    tests_used = parsed.get("tests_used", [])
    signals_used = parsed.get("signals_used", [])

    if isinstance(conclusions, str):
        conclusions = [conclusions]
    if not isinstance(conclusions, list):
        conclusions = []
    if isinstance(limitations, str):
        limitations = [limitations]
    if not isinstance(limitations, list):
        limitations = []
    if isinstance(tests_used, str):
        tests_used = [tests_used]
    if not isinstance(tests_used, list):
        tests_used = []
    if isinstance(signals_used, str):
        signals_used = [signals_used]
    if not isinstance(signals_used, list):
        signals_used = []

    return {
        "summary": str(summary),
        "conclusions": [str(item) for item in conclusions],
        "limitations": [str(item) for item in limitations],
        "tests_used": [str(item) for item in tests_used],
        "signals_used": [str(item) for item in signals_used],
    }


def _explanation_shape_ok(explanation: Dict[str, Any]) -> bool:
    if not isinstance(explanation.get("summary"), str):
        return False
    for key in ("conclusions", "limitations", "tests_used", "signals_used"):
        value = explanation.get(key)
        if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
            return False
    return True


def explain(payload: Dict[str, Any]) -> Dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    preferred_model = os.getenv("GEMINI_MODEL")
    instructions = (
        "You are the Engineering Explanation Agent. Use only the provided results. "
        "Do NOT compute numbers. Cite tests used, signals used, and confidence logic. "
        "Return JSON only with keys: summary, conclusions, limitations, tests_used, signals_used. "
        "conclusions, limitations, tests_used, signals_used MUST be arrays of strings."
    )
    prompt = f"{instructions}\n\nDATA:\n{json.dumps(payload)}"

    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "topP": 0.8,
            "maxOutputTokens": 700,
            "response_mime_type": "application/json",
        },
    }
    model = _resolve_model(api_key, preferred_model)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    with httpx.Client(timeout=30.0) as client:
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
        repair_instructions = (
            "The previous response was invalid JSON. "
            "Return ONLY a valid JSON object with keys: summary, conclusions, limitations, "
            "tests_used, signals_used. No prose. No markdown."
        )
        repair_prompt = f"{repair_instructions}\n\nINVALID_RESPONSE:\n{text}"
        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, params={"key": api_key}, json={
                "contents": [{"parts": [{"text": repair_prompt}]}],
                "generationConfig": {
                    "temperature": 0.2,
                    "topP": 0.8,
                    "maxOutputTokens": 700,
                    "response_mime_type": "application/json",
                },
            })
            response.raise_for_status()
            data = response.json()
        repaired_text = data["candidates"][0]["content"]["parts"][0]["text"]
        parsed = _parse_json(repaired_text)
        if not parsed:
            raise RuntimeError("Explanation output could not be parsed.")

    normalized = _normalize_explanation(parsed)
    if not _explanation_shape_ok(normalized):
        raise RuntimeError("Explanation output did not match required JSON schema.")
    return normalized
