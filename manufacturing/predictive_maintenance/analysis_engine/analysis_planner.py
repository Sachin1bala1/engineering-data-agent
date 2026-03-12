"""LLM analysis planner for Engineering Data Analyzer."""

from __future__ import annotations

import json
import os
import time
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone

import httpx

from .models import AnalysisPlan


def _slugify(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "_" for ch in value).strip("_")
    while "__" in cleaned:
        cleaned = cleaned.replace("__", "_")
    return cleaned or "unknown_test"


def _canonical_test_name(name: str) -> str:
    slug = _slugify(name)
    alias_map = {
        "anova": "anova",
        "analysis_of_variance": "anova",
        "anova_analysis_of_variance": "anova",
        "t_test": "t_test",
        "t_tests": "t_test",
        "ttest": "t_test",
        "regression": "regression",
        "regression_analysis": "regression",
        "regression_analysis_to_model_relationships_between_variables_e_g_load_vs_response_time": "regression",
        "chi_squared": "chi_squared",
        "chi_squared_test": "chi_squared",
        "chi_square": "chi_squared",
        "chi_square_test": "chi_squared",
        "statistical_process_control": "spc",
        "statistical_process_control_spc_charts": "spc",
        "spc": "spc",
        "control_chart": "spc",
        "normaltest": "normaltest",
        "shapiro_wilk": "shapiro_wilk",
        "autocorr": "autocorr",
        "correlation": "correlation",
    }
    return alias_map.get(slug, slug)


def _normalize_applies_to(value: Any) -> str:
    if value is None:
        return "all_numeric"
    if isinstance(value, list):
        cleaned = [str(v).strip() for v in value if str(v).strip()]
        return cleaned[0] if cleaned else "all_numeric"
    text = str(value).strip()
    if not text:
        return "all_numeric"
    lowered = text.lower()
    if lowered in {"all_numeric", "numeric", "*", "all", "all_number", "all_numbers"}:
        return "all_numeric"
    if lowered in {"all_categorical", "categorical"}:
        return "all_categorical"
    return text


def _normalize_plan(parsed: Dict[str, Any]) -> Dict[str, Any]:
    tests = parsed.get("recommended_tests", [])
    if isinstance(tests, str):
        tests = [tests]
    if not isinstance(tests, list):
        tests = []
    normalized_tests = []
    for item in tests:
        if isinstance(item, dict):
            test_name = item.get("test") or item.get("name") or item.get("type") or "unknown_test"
            applies_to = item.get("applies_to") or item.get("signal") or item.get("appliesTo") or "all_numeric"
            reason = item.get("reason") or item.get("description") or ""
            normalized_tests.append({
                "test": _canonical_test_name(str(test_name)),
                "applies_to": _normalize_applies_to(applies_to),
                "reason": str(reason),
            })
        elif isinstance(item, str):
            normalized_tests.append({
                "test": _canonical_test_name(item.split(" for ")[0]),
                "applies_to": "all_numeric",
                "reason": item,
            })
    plots = parsed.get("recommended_plots", [])
    if not isinstance(plots, list):
        plots = []
    assumptions = parsed.get("assumptions", [])
    if not isinstance(assumptions, list):
        assumptions = []
    return {
        "analysis_goal": parsed.get("analysis_goal", "engineering_analysis"),
        "recommended_tests": normalized_tests,
        "recommended_plots": [str(p) for p in plots],
        "assumptions": [str(a) for a in assumptions],
    }


def _plan_shape_ok(plan: Dict[str, Any]) -> bool:
    if not isinstance(plan.get("analysis_goal"), str):
        return False
    tests = plan.get("recommended_tests")
    if not isinstance(tests, list):
        return False
    for item in tests:
        if not isinstance(item, dict):
            return False
        if not all(key in item for key in ("test", "applies_to", "reason")):
            return False
    plots = plan.get("recommended_plots")
    if not isinstance(plots, list) or not all(isinstance(p, str) for p in plots):
        return False
    assumptions = plan.get("assumptions")
    if not isinstance(assumptions, list) or not all(isinstance(a, str) for a in assumptions):
        return False
    return True


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


def _request_plan(api_key: str, preferred_model: Optional[str], prompt: str) -> str:
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
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
        if response.status_code == 429:
            time.sleep(1.5)
            response = client.post(url, params={"key": api_key}, json=body)
        if response.status_code == 429:
            raise RuntimeError("Gemini rate limit (429). Retry after 30-60 seconds.")
        response.raise_for_status()
        data = response.json()
    return data["candidates"][0]["content"]["parts"][0]["text"]


def plan(profile: Dict[str, Any]) -> AnalysisPlan:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    preferred_model = os.getenv("GEMINI_MODEL")
    instructions = (
        "You are the Engineering Data Analyzer planner for real manufacturing/process data. "
        "Suggest only tests that are executable with the observed data types and sample sizes. "
        "If data is sparse, prefer descriptive stats/correlation/robust checks over invalid tests. "
        "Use applies_to as either a real column name, all_numeric, or all_categorical. "
        "Return ONLY a JSON object with keys: analysis_goal, recommended_tests, recommended_plots, assumptions. "
        "recommended_tests MUST be a list of objects with keys: test, applies_to, reason. "
        "Do not return lists of strings. No numbers, no interpretation."
    )
    payload = {
        "profile": profile,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    prompt = f"{instructions}\n\nDATA:\n{json.dumps(payload)}"

    text = _request_plan(api_key, preferred_model, prompt)
    parsed = _parse_json(text)
    if not parsed:
        repair_instructions = (
            "The previous response was invalid JSON. "
            "Return ONLY a valid JSON object with keys: analysis_goal, recommended_tests, "
            "recommended_plots, assumptions. No prose. No markdown."
        )
        repair_prompt = f"{repair_instructions}\n\nINVALID_RESPONSE:\n{text}"
        repaired_text = _request_plan(api_key, preferred_model, repair_prompt)
        parsed = _parse_json(repaired_text)
        if not parsed:
            preview = repaired_text.strip().replace("\n", " ")[:500]
            raise RuntimeError(f"Planner output could not be parsed as JSON. Preview: {preview}")

    normalized = _normalize_plan(parsed)
    if not _plan_shape_ok(normalized):
        structure_instructions = (
            "The previous JSON did not match the required schema. "
            "Return ONLY a JSON object with keys: analysis_goal, recommended_tests, recommended_plots, assumptions. "
            "recommended_tests must be a list of objects with keys: test, applies_to, reason. "
            "No prose. No markdown."
        )
        structure_prompt = f"{structure_instructions}\n\nINVALID_RESPONSE:\n{text}"
        structured_text = _request_plan(api_key, preferred_model, structure_prompt)
        structured_parsed = _parse_json(structured_text)
        if not structured_parsed:
            preview = structured_text.strip().replace("\n", " ")[:500]
            raise RuntimeError(f"Planner output could not be parsed as JSON. Preview: {preview}")
        normalized = _normalize_plan(structured_parsed)
        if not _plan_shape_ok(normalized):
            raise RuntimeError("Planner output did not match required JSON schema.")

    return AnalysisPlan(
        analysis_goal=normalized["analysis_goal"],
        recommended_tests=normalized["recommended_tests"],
        recommended_plots=normalized["recommended_plots"],
        assumptions=normalized["assumptions"],
    )


def revise_plan(
    profile: Dict[str, Any],
    current_plan: Dict[str, Any],
    instruction: str,
    history: Optional[List[Dict[str, str]]] = None,
) -> AnalysisPlan:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    preferred_model = os.getenv("GEMINI_MODEL")
    instructions = (
        "You are revising an existing Engineering Data Analyzer plan. "
        "Respect data types and sample-size feasibility. "
        "Only include tests that can run with the given profile. "
        "Keep applies_to to: specific column name, all_numeric, or all_categorical. "
        "Return ONLY JSON with keys: analysis_goal, recommended_tests, recommended_plots, assumptions."
    )
    payload = {
        "profile": profile,
        "current_plan": current_plan,
        "instruction": instruction,
        "history": history or [],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    prompt = f"{instructions}\n\nDATA:\n{json.dumps(payload)}"

    text = _request_plan(api_key, preferred_model, prompt)
    parsed = _parse_json(text)
    if not parsed:
        raise RuntimeError("Plan revision output could not be parsed as JSON.")

    normalized = _normalize_plan(parsed)
    if not _plan_shape_ok(normalized):
        raise RuntimeError("Revised plan did not match required JSON schema.")

    return AnalysisPlan(
        analysis_goal=normalized["analysis_goal"],
        recommended_tests=normalized["recommended_tests"],
        recommended_plots=normalized["recommended_plots"],
        assumptions=normalized["assumptions"],
    )
