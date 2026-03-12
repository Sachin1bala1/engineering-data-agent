"""
Global Gemini -> Groq fallback for existing requests-based Gemini calls.

This module monkey-patches requests Session.request for Gemini generateContent
POST calls only. All existing Gemini call sites continue to work unchanged.
"""

import json
import os
from typing import Any, Dict, Iterable, Optional

import requests

_PATCHED = False
_ORIGINAL_REQUEST = None


def _is_gemini_generate_request(method: str, url: str) -> bool:
    m = str(method or "").upper()
    u = str(url or "")
    return (
        m == "POST"
        and "generativelanguage.googleapis.com" in u
        and ":generateContent" in u
    )


def _should_fallback_status(status_code: int) -> bool:
    # Fallback on quota/rate limit and transient server-side issues.
    return status_code == 429 or status_code == 408 or 500 <= status_code <= 599


def _iter_text_parts(parts: Iterable[Any]) -> Iterable[str]:
    for part in parts or []:
        if isinstance(part, dict):
            text = part.get("text")
            if text is not None:
                yield str(text)


def _extract_prompt_from_gemini_payload(payload: Any) -> str:
    if isinstance(payload, str):
        return payload
    if not isinstance(payload, dict):
        return ""

    contents = payload.get("contents")
    if isinstance(contents, list):
        chunks = []
        for item in contents:
            if isinstance(item, dict):
                parts = item.get("parts")
                if isinstance(parts, list):
                    chunks.extend(_iter_text_parts(parts))
        prompt = "\n".join([c for c in chunks if c.strip()]).strip()
        if prompt:
            return prompt

    # Last fallback keeps routing functional even for unexpected payloads.
    try:
        return json.dumps(payload)
    except Exception:
        return ""


def _make_gemini_like_response(text: str, source_url: str) -> requests.Response:
    payload = {
        "candidates": [
            {
                "content": {
                    "parts": [{"text": text}],
                }
            }
        ]
    }
    resp = requests.Response()
    resp.status_code = 200
    resp.url = source_url
    resp.headers["Content-Type"] = "application/json"
    resp._content = json.dumps(payload).encode("utf-8")
    resp.encoding = "utf-8"
    return resp


def _call_groq(prompt: str, timeout: Optional[Any] = None) -> str:
    groq_key = (os.getenv("GROQ_API_KEY") or "").strip()
    if not groq_key:
        raise RuntimeError("GROQ_API_KEY is not configured.")

    base = (os.getenv("GROQ_API_BASE") or "https://api.groq.com/openai/v1").rstrip("/")
    model = os.getenv("GROQ_MODEL") or "llama-3.3-70b-versatile"
    url = f"{base}/chat/completions"
    body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt or "Please answer the user request."}],
        "temperature": 0.2,
    }

    groq_timeout = timeout if timeout is not None else float(os.getenv("GROQ_TIMEOUT_SEC") or 30)
    response = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {groq_key}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=groq_timeout,
    )
    response.raise_for_status()
    data = response.json()
    text = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    text = str(text or "").strip()
    if not text:
        raise RuntimeError("Groq returned an empty response.")
    return text


def install_gemini_groq_fallback() -> None:
    global _PATCHED, _ORIGINAL_REQUEST
    if _PATCHED:
        return

    _ORIGINAL_REQUEST = requests.sessions.Session.request

    def _patched_request(session, method, url, *args, **kwargs):
        if not _is_gemini_generate_request(method, url):
            return _ORIGINAL_REQUEST(session, method, url, *args, **kwargs)

        gemini_response = None
        gemini_error = None
        gemini_payload = kwargs.get("json")

        try:
            gemini_response = _ORIGINAL_REQUEST(session, method, url, *args, **kwargs)
            if not _should_fallback_status(int(gemini_response.status_code)):
                return gemini_response
        except requests.RequestException as exc:
            gemini_error = exc

        try:
            prompt = _extract_prompt_from_gemini_payload(gemini_payload)
            fallback_text = _call_groq(prompt, timeout=kwargs.get("timeout"))
            return _make_gemini_like_response(fallback_text, str(url))
        except Exception as groq_error:
            if gemini_response is not None:
                return gemini_response
            if gemini_error is not None:
                raise RuntimeError(
                    f"Gemini call failed and Groq fallback failed: {gemini_error}; {groq_error}"
                ) from gemini_error
            raise RuntimeError(
                f"Gemini/Groq routing failed: {groq_error}"
            ) from groq_error

    requests.sessions.Session.request = _patched_request
    _PATCHED = True

