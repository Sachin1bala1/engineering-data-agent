"""FastAPI routes for Engineering Knowledge Twin."""

from __future__ import annotations

import json
import os
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List
import uuid
import re
import math
from datetime import datetime, timezone
import time

import httpx
from fastapi import APIRouter, Query, UploadFile, File, Form, HTTPException
from pydantic import BaseModel, Field

from ..db import bootstrap_schema, embedding_for_text, ensure_schema_once, execute, read_rows
from ..graph.graph_store import (
    fetch_asset_graph,
    vector_search,
    write_audit_log,
)
from ..ingestion.incident_parser import ingest_incident_reports
from ..ingestion.log_parser import ingest_maintenance_logs
from ..ingestion.sop_parser import ingest_sop
from ..reasoning.failure_reasoner import recommend_action, why_failure_occurred
from ..reasoning.process_risk_engine import process_risk
from ..reasoning.sop_mapper import map_sop_for_failure


router = APIRouter(prefix="/knowledge", tags=["knowledge_twin"])


class KnowledgeQueryResponse(BaseModel):
    asset_id: str
    question: str
    deterministic_answer: dict[str, Any]
    ai_summary: str
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    confidence: float = 0.0


class KnowledgeChatRequest(BaseModel):
    asset_id: str
    question: str
    failure: str | None = None
    session_id: str | None = None
    save_to_memory: bool = False


class KnowledgeChatResponse(BaseModel):
    session_id: str
    answer: str
    deterministic_answer: dict[str, Any]
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    confidence: float = 0.0
    history: list[dict[str, str]] = Field(default_factory=list)


class KnowledgeMemoryConfigRequest(BaseModel):
    persistence_enabled: bool = False
    use_asset_history: bool = True


class SaveDatasetsRequest(BaseModel):
    dataset_ids: list[str] = Field(default_factory=list)


class SaveChatSessionRequest(BaseModel):
    asset_id: str | None = None


_KNOWLEDGE_CHAT_MEMORY: Dict[str, List[Dict[str, str]]] = {}
_KNOWLEDGE_CHAT_STATE: Dict[str, List[Dict[str, Any]]] = {}
_LATEST_DATASET_BY_ASSET: Dict[str, str] = {}
_DATASET_META: Dict[str, Dict[str, Any]] = {}
_DEFAULT_MODEL_CANDIDATES = [
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.5-pro",
    "gemini-pro-latest",
]

_MEMORY_PERSISTENCE_KEY = "chat_persistence_enabled"
_MEMORY_ASSET_HISTORY_KEY = "chat_use_asset_history"

_KNOWLEDGE_QUERY_KEYWORDS = {
    "failure",
    "cause",
    "root cause",
    "incident",
    "asset",
    "sop",
    "downtime",
    "maintenance",
    "recommend",
    "action",
    "repair",
    "fix",
    "seal",
    "bearing",
    "overload",
    "wiring",
    "misalignment",
    "overheat",
    "electrical",
    "risk",
    "graph",
    "evidence",
    "confidence",
    "dataset",
    "uploaded",
    "file",
    "filename",
}


def _gemini_summary(payload: dict[str, Any], question: str) -> str:
    fallback_summary = _fallback_summary(question, payload)
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return fallback_summary

    prompt = (
        "You are an industrial engineering assistant. Summarize only deterministic results provided. "
        "Do not add assumptions or new recommendations. "
        "Answer the exact question first, then give top leading failure causes, recommended action, confidence, and evidence count. "
        "Return plain text only.\n"
        f"Question: {question}\n"
        f"Deterministic JSON: {json.dumps(payload, default=str)}"
    )

    candidates = [
        "gemini-2.5-flash",
        "gemini-flash-latest",
        "gemini-2.5-pro",
        "gemini-pro-latest",
    ]
    for model in candidates:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.0, "topP": 0.1, "maxOutputTokens": 220},
        }
        try:
            response = httpx.post(
                url,
                params={"key": api_key},
                json=body,
                timeout=20.0,
            )
            if response.status_code >= 400:
                continue
            data = response.json()
            candidate_rows = data.get("candidates") or []
            if not candidate_rows:
                continue
            parts = ((candidate_rows[0].get("content") or {}).get("parts") or [])
            output = "\n".join([p.get("text", "") for p in parts if isinstance(p, dict)]).strip()
            if output:
                if len(output) < 30:
                    return fallback_summary
                return output
        except Exception:
            continue

    return fallback_summary


def _parse_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


def _get_setting_bool(key: str, default: bool) -> bool:
    rows = read_rows("SELECT value FROM knowledge_settings WHERE key=:k", {"k": key})
    if not rows:
        return default
    return _parse_bool(rows[0].get("value"), default)


def _set_setting_bool(key: str, value: bool) -> None:
    rows = read_rows("SELECT key FROM knowledge_settings WHERE key=:k", {"k": key})
    if rows:
        execute(
            "UPDATE knowledge_settings SET value=:v, updated_at=CURRENT_TIMESTAMP WHERE key=:k",
            {"k": key, "v": "true" if value else "false"},
        )
        return
    execute(
        "INSERT INTO knowledge_settings(key, value) VALUES (:k, :v)",
        {"k": key, "v": "true" if value else "false"},
    )


def _get_memory_config() -> dict[str, Any]:
    persistence_enabled = _get_setting_bool(_MEMORY_PERSISTENCE_KEY, False)
    use_asset_history = _get_setting_bool(_MEMORY_ASSET_HISTORY_KEY, True)
    return {
        "persistence_enabled": persistence_enabled,
        "use_asset_history": use_asset_history,
    }


def _save_dataset_metadata(dataset_id: str, source: str, filename: str, asset_ids: list[str]) -> None:
    rows = read_rows("SELECT dataset_id FROM knowledge_saved_datasets WHERE dataset_id=:d", {"d": dataset_id})
    payload = json.dumps([str(x) for x in asset_ids])
    if rows:
        execute(
            """
            UPDATE knowledge_saved_datasets
            SET source=:s, filename=:f, asset_ids=:a, created_at=CURRENT_TIMESTAMP
            WHERE dataset_id=:d
            """,
            {"d": dataset_id, "s": source, "f": filename, "a": payload},
        )
        return
    execute(
        """
        INSERT INTO knowledge_saved_datasets(dataset_id, source, filename, asset_ids)
        VALUES (:d, :s, :f, :a)
        """,
        {"d": dataset_id, "s": source, "f": filename, "a": payload},
    )


def _get_saved_dataset_ids(asset_id: str | None = None) -> set[str]:
    rows = read_rows("SELECT dataset_id, asset_ids FROM knowledge_saved_datasets")
    ids: set[str] = set()
    for row in rows:
        dataset_id = str(row.get("dataset_id") or "").strip()
        if not dataset_id:
            continue
        if not asset_id:
            ids.add(dataset_id)
            continue
        raw = row.get("asset_ids")
        try:
            asset_list = json.loads(str(raw or "[]"))
        except Exception:
            asset_list = []
        if str(asset_id) in [str(x) for x in asset_list]:
            ids.add(dataset_id)
    return ids


def _load_persistent_history(session_id: str, asset_id: str, *, use_asset_history: bool, limit: int = 200) -> list[dict[str, str]]:
    rows = read_rows(
        """
        SELECT role, content
        FROM knowledge_chat_memory
        WHERE session_id=:s
        ORDER BY id DESC
        LIMIT :lim
        """,
        {"s": session_id, "lim": int(limit)},
    )
    if rows:
        rows = list(reversed(rows))
        return [{"role": str(r.get("role") or "assistant"), "content": str(r.get("content") or "")} for r in rows]
    if not use_asset_history:
        return []
    rows = read_rows(
        """
        SELECT role, content
        FROM knowledge_chat_memory
        WHERE asset_id=:a
        ORDER BY id DESC
        LIMIT :lim
        """,
        {"a": asset_id, "lim": int(limit)},
    )
    rows = list(reversed(rows))
    return [{"role": str(r.get("role") or "assistant"), "content": str(r.get("content") or "")} for r in rows]


def _persist_chat_message(session_id: str, asset_id: str, role: str, content: str, metadata: dict[str, Any] | None = None) -> None:
    execute(
        """
        INSERT INTO knowledge_chat_memory(session_id, asset_id, role, content, metadata)
        VALUES (:s, :a, :r, :c, :m)
        """,
        {
            "s": session_id,
            "a": asset_id,
            "r": role,
            "c": content,
            "m": json.dumps(metadata or {}),
        },
    )


def _reset_persistent_chat(session_id: str) -> None:
    execute("DELETE FROM knowledge_chat_memory WHERE session_id=:s", {"s": session_id})


def _persist_full_session_history(session_id: str, asset_id: str | None, history: list[dict[str, str]]) -> int:
    _reset_persistent_chat(session_id)
    count = 0
    for item in history:
        role = str(item.get("role") or "").strip()
        content = str(item.get("content") or "").strip()
        if not role or not content:
            continue
        _persist_chat_message(session_id, asset_id or "", role, content, {"mode": "manual_save_session"})
        count += 1
    return count


def _build_model_candidates() -> List[str]:
    env_candidates = [s.strip() for s in os.getenv("GEMINI_MODELS", "").split(",") if s.strip()]
    candidates = env_candidates if env_candidates else _DEFAULT_MODEL_CANDIDATES
    seen = set()
    normalized: List[str] = []
    for candidate in candidates:
        if not candidate:
            continue
        model_id = candidate if candidate.startswith("models/") else f"models/{candidate}"
        if model_id in seen:
            continue
        seen.add(model_id)
        normalized.append(model_id)
    return normalized or ["models/gemini-pro-latest"]


def _generate_with_fallback(prompt: str) -> str:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    candidates = _build_model_candidates()
    last_err: Exception | None = None
    for model_id in candidates:
        attempt = 0
        backoff = 0.5
        while attempt < 3:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/{model_id}:generateContent"
                body = {"contents": [{"parts": [{"text": prompt}]}]}
                with httpx.Client(timeout=30.0) as client:
                    response = client.post(url, params={"key": api_key}, json=body)
                    response.raise_for_status()
                    data = response.json()
                return data["candidates"][0]["content"]["parts"][0]["text"]
            except Exception as exc:  # pragma: no cover
                last_err = exc
                status = None
                msg = str(exc).lower()
                if hasattr(exc, "response") and exc.response is not None:
                    status = exc.response.status_code

                if status == 404 or ("not found" in msg and "model" in msg):
                    break
                if status == 429:
                    break
                if status and 400 <= status < 500:
                    raise
                if status and status >= 500 and attempt < 2:
                    time.sleep(backoff)
                    backoff *= 2
                    attempt += 1
                    continue
                break
    raise last_err or RuntimeError("AI generation failed with all candidate models.")


def _fallback_summary(question: str, payload: dict[str, Any]) -> str:
    recommendation = payload.get("recommendation") or {}
    recommendation_detail = recommendation.get("recommendation") or {}
    action = recommendation_detail.get("action") or recommendation.get("action") or "No action recommendation available"
    confidence = float(recommendation.get("confidence") or payload.get("confidence") or 0.0)
    evidence_count = len(recommendation.get("evidence") or payload.get("evidence") or [])
    leading = payload.get("leading_failure_causes") or []
    lead_text = ", ".join(f"{row.get('cause')} ({row.get('count')})" for row in leading[:3] if row.get("cause")) or "not enough historical data"
    return (
        f"Question: {question}\n"
        f"Most likely leading causes: {lead_text}.\n"
        f"Historically recommended action: {action}.\n"
        f"Confidence: {confidence:.1%} from {evidence_count} evidence records."
    )


def _parse_dt(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def _normalize_label(text: str) -> str:
    cleaned = re.sub(r"[^a-z0-9 ]+", " ", (text or "").lower())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def _detect_target_failure(question: str) -> dict[str, str] | None:
    q = (question or "").lower()
    failure_terms = [
        ("bearing", {"failure_mode": "bearing"}),
        ("overheat", {"failure_mode": "overheat"}),
        ("electrical", {"failure_mode": "electrical"}),
        ("fault", {"failure_mode": "fault"}),
        ("seal", {"failure_mode": "seal"}),
    ]
    for token, target in failure_terms:
        if token in q:
            return target
    if "overload" in q:
        return {"failure_mode": "overload"}
    if "wiring" in q or "wire" in q:
        return {"root_cause": "wire"}
    if "misalignment" in q or "misalign" in q:
        return {"root_cause": "misalign"}
    return None


def _filter_evidence_by_target(evidence: list[dict[str, Any]], target: dict[str, str] | None) -> list[dict[str, Any]]:
    if not target:
        return evidence
    filtered: list[dict[str, Any]] = []
    key, needle = list(target.items())[0]
    needle_lower = needle.lower()
    for item in evidence:
        value = str(item.get(key) or "").lower()
        if needle_lower in value:
            filtered.append(item)
    return filtered


def _action_rankings(evidence: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counter = Counter(
        str(item.get("corrective_action") or "").strip()
        for item in evidence
        if str(item.get("corrective_action") or "").strip()
        and "unspecified" not in str(item.get("corrective_action") or "").lower()
    )
    return [{"action": action, "count": count} for action, count in counter.most_common()]


def _infer_fix_steps(question: str, sop_steps: list[dict[str, Any]], has_history: bool) -> tuple[list[str], bool]:
    q = (question or "").lower()
    if sop_steps:
        steps = [f"{step.get('instruction')}" for step in sop_steps[:5] if str(step.get("instruction") or "").strip()]
        return steps, not has_history

    if "wiring" in q or "wire" in q:
        return [
            "Inspect insulation integrity and connector corrosion across harness routes.",
            "Replace degraded cables with high-temperature rated wiring and add strain relief.",
            "Re-route cable paths away from vibration/heat zones and verify grounding continuity.",
        ], True
    if "seal" in q:
        return [
            "Inspect seal faces and replace with material-compatible seal kit.",
            "Check shaft runout/alignment and correct any bearing or coupling offset.",
            "Verify process pressure transients and tune relief settings to protect seals.",
        ], True
    if "overload" in q:
        return [
            "Review load profile against design limits and remove overload conditions.",
            "Check motor current draw, thermal protection settings, and power quality.",
            "Implement staged startup or control logic limits to prevent repeated overload trips.",
        ], True
    if "misalign" in q:
        return [
            "Perform laser alignment and correct angular/parallel offset.",
            "Inspect foundation, soft-foot, and coupling wear before restart.",
            "Recheck vibration trend post-alignment to confirm corrective effectiveness.",
        ], True
    return [
        "Collect structured failure_mode, root_cause, and corrective_action records for this case.",
        "Run targeted inspection and verify operating envelope against SOP limits.",
        "Validate fix effectiveness with follow-up condition monitoring trend checks.",
    ], True


def _format_history_for_prompt(history: List[Dict[str, str]]) -> str:
    if not history:
        return ""
    trimmed = history[-12:]
    lines = []
    for item in trimmed:
        role = "Assistant" if item.get("role") == "assistant" else "User"
        content = str(item.get("content") or "").strip()
        if content:
            lines.append(f"{role}: {content}")
    return "\n".join(lines)


def _is_general_chat_question(question: str) -> bool:
    q = (question or "").strip().lower()
    if not q:
        return True
    if any(token in q for token in _KNOWLEDGE_QUERY_KEYWORDS):
        return False
    smalltalk_starts = (
        "my name is",
        "i am ",
        "i'm ",
        "hello",
        "hi",
        "hey",
        "who are you",
        "what is my name",
        "how are you",
    )
    if q.startswith(smalltalk_starts):
        return True
    return len(q.split()) <= 5


def _is_dataset_name_question(question: str) -> bool:
    q = (question or "").strip().lower()
    if "dataset" not in q and "file" not in q:
        return False
    markers = ["uploaded", "name", "names", "list", "which", "filename", "file name"]
    return any(marker in q for marker in markers)


def _format_uploaded_dataset_names(asset_id: str | None = None) -> str:
    if not _DATASET_META:
        return "No datasets have been uploaded yet."

    saved_ids = _get_saved_dataset_ids(asset_id=asset_id)
    rows: list[tuple[str, dict[str, Any]]] = []
    for dataset_id, meta in _DATASET_META.items():
        if asset_id:
            asset_ids = [str(a) for a in (meta.get("asset_ids") or [])]
            if asset_id not in asset_ids:
                continue
        meta = dict(meta)
        meta["saved_to_memory"] = dataset_id in saved_ids
        rows.append((dataset_id, meta))
    if not rows:
        return f"No uploaded datasets found for asset '{asset_id}'."

    rows.sort(key=lambda item: str(item[1].get("uploaded_at") or ""), reverse=True)
    lines = ["Uploaded datasets:"]
    for dataset_id, meta in rows:
        fname = str(meta.get("filename") or dataset_id)
        source = str(meta.get("source") or "unknown")
        uploaded = str(meta.get("uploaded_at") or "unknown_time")
        saved_tag = "saved" if bool(meta.get("saved_to_memory")) else "not-saved"
        lines.append(f"- {fname} ({source}, {saved_tag}, uploaded: {uploaded})")
    return "\n".join(lines)


def _uploaded_files_context(asset_id: str | None = None) -> str:
    if not _DATASET_META:
        return "No uploaded datasets available."
    rows: list[str] = []
    for dataset_id, meta in sorted(_DATASET_META.items(), key=lambda item: str(item[1].get("uploaded_at") or ""), reverse=True):
        if asset_id:
            asset_ids = [str(a) for a in (meta.get("asset_ids") or [])]
            if asset_id not in asset_ids:
                continue
        fname = str(meta.get("filename") or dataset_id)
        source = str(meta.get("source") or "unknown")
        rows.append(f"{fname} ({source})")
    if not rows:
        return f"No uploaded datasets found for asset '{asset_id}'."
    return "Uploaded datasets in scope: " + ", ".join(rows)


def _extract_user_name_from_history(history: List[Dict[str, str]]) -> str | None:
    name_pattern = re.compile(r"\bmy name is\s+([a-z][a-z0-9_\- ]{0,40})\b", re.IGNORECASE)
    greet_pattern = re.compile(r"\bnice to meet you,\s*([a-z][a-z0-9_\- ]{0,40})\b", re.IGNORECASE)
    for item in reversed(history):
        content = str(item.get("content") or "")
        if item.get("role") == "user":
            m = name_pattern.search(content)
            if m:
                return m.group(1).strip().split()[0].title()
        if item.get("role") == "assistant":
            m2 = greet_pattern.search(content)
            if m2:
                return m2.group(1).strip().split()[0].title()
    return None


def _general_chat_fallback(question: str, history: List[Dict[str, str]]) -> str:
    q = (question or "").strip()
    q_lower = q.lower()
    remembered_name = _extract_user_name_from_history(history)
    if q_lower.startswith("my name is"):
        extracted = _extract_user_name_from_history([{"role": "user", "content": q}]) or "there"
        return f"Nice to meet you, {extracted}. I can help with knowledge queries on your uploaded engineering data."
    if any(token in q_lower for token in ["what is my name", "what's my name", "whats my name", "remember my name"]) and remembered_name:
        return f"Your name is {remembered_name}."
    return "I can help with your engineering dataset. Ask about failure causes, actions, trends, or a specific asset."


def _answer_general_chat(question: str, history: List[Dict[str, str]], asset_id: str | None = None) -> tuple[str, str]:
    q_lower = (question or "").strip().lower()
    remembered_name = _extract_user_name_from_history(history)
    if q_lower.startswith("my name is"):
        extracted = _extract_user_name_from_history([{"role": "user", "content": question}]) or "there"
        return f"Nice to meet you, {extracted}. I can help with knowledge queries on your uploaded engineering data.", "deterministic_name_memory"
    if any(token in q_lower for token in ["what is my name", "what's my name", "whats my name", "remember my name"]) and remembered_name:
        return f"Your name is {remembered_name}.", "deterministic_name_memory"

    history_text = _format_history_for_prompt(history)
    history_block = f"\nConversation so far:\n{history_text}\n" if history_text else ""
    files_context = _uploaded_files_context(asset_id)
    prompt = (
        "You are a professional data analyst with engineering domain expertise.\n"
        "You have access to all uploaded files listed in the context.\n"
        "Give practical, professional answers grounded in uploaded data.\n"
        "When asked for summary/analysis, choose best-fit analysis by data type:\n"
        "- Numeric: distribution, trend, correlation, outlier checks.\n"
        "- Categorical: frequency, top categories, co-occurrence.\n"
        "- Time-series: trend, seasonality, change points.\n"
        "Be concise, clear, and helpful.\n"
        "If the user gives personal info like name, acknowledge naturally and remember it within this conversation.\n"
        "Do not output failure analysis unless user asks a maintenance/knowledge question.\n"
        f"Current asset context: {asset_id or 'none'}\n"
        f"{files_context}\n"
        f"{history_block}\n"
        f"User message: {question}\n"
        "Assistant reply:"
    )
    try:
        text = _generate_with_fallback(prompt).strip()
        if text:
            return text, "gemini_general_chat"
    except Exception:
        pass
    return _general_chat_fallback(question, history), "fallback_general_chat"


def _answer_with_ai_agent(question: str, context: dict[str, Any], history: List[Dict[str, str]]) -> str:
    q = (question or "").lower()
    if "file" in q and ("missing" in q or "which" in q):
        return _answer_question_deterministically(question, context)

    recommendation = context.get("recommendation") or {}
    evidence = recommendation.get("evidence") or []
    ranked = context.get("leading_failure_causes") or []
    action_rankings = context.get("action_rankings") or []
    confidence = min(1.0, math.log10(len(evidence) + 1))
    target_filter = context.get("target_filter") or {}
    missing_fields = context.get("missing_required_fields") or []
    sop_steps = context.get("sop_steps") or []
    fix_steps, derived_fix = _infer_fix_steps(question, sop_steps, has_history=bool(action_rankings))
    history_text = _format_history_for_prompt(history)
    history_block = f"\nPrevious conversation:\n{history_text}\n" if history_text else ""
    files_context = _uploaded_files_context(str((recommendation or {}).get("asset_id") or None))

    sources = set()
    for item in evidence:
        sid = str(item.get("source_dataset_id") or "").lower()
        if sid.startswith("logs-"):
            sources.add("logs")
        elif sid.startswith("incidents-"):
            sources.add("incidents")
    if sop_steps:
        sources.add("SOP")
    if not sources:
        sources = {"incidents"}

    if not evidence:
        return f"INSUFFICIENT EVIDENCE. Missing required fields: {', '.join(missing_fields or ['failure_mode', 'root_cause', 'corrective_action', 'asset_id', 'timestamp'])}."

    timestamps = [dt for dt in (_parse_dt(item.get("timestamp")) for item in evidence) if dt is not None]
    time_range = {
        "start": min(timestamps).isoformat() if timestamps else "n/a",
        "end": max(timestamps).isoformat() if timestamps else "n/a",
    }

    prompt_payload = {
        "question": question,
        "target_filter": target_filter,
        "ranked_causes": ranked,
        "historical_fix_actions": action_rankings[:8],
        "recommended_fix_steps": fix_steps,
        "derived_fix": derived_fix,
        "evidence_count": len(evidence),
        "sources": sorted(sources),
        "time_range": time_range,
        "missing_required_fields": missing_fields,
        "confidence_score": round(confidence, 4),
    }

    prompt = (
        f"{history_block}"
        "You are a professional engineering data analyst and maintenance advisor.\n"
        "You have access to all uploaded datasets listed in context.\n"
        "Use ONLY the provided deterministic evidence payload.\n"
        "Do not fabricate.\n"
        "If missing evidence, output: INSUFFICIENT EVIDENCE. Missing required fields: ...\n"
        "If user asks for summary/analysis, pick best analysis based on data type (numeric/categorical/time-series).\n"
        "Answer in this exact format:\n"
        "Question: <user question>\n\n"
        "Root Cause Explanation:\n<engineering explanation>\n\n"
        "Historical Fix Actions:\n1. <action> - <count>\n\n"
        "Engineering Recommended Fix Steps:\n- Step 1\n- Step 2\n- Step 3\n\n"
        "Evidence Summary:\nRecords matched: <N>\nSources: logs / SOP / incidents\nTime range: <start> to <end>\n\n"
        "Confidence Score: <value>\n"
        "If no historical action exists, include line: Derived engineering recommendation (not historical).\n\n"
        f"{files_context}\n"
        f"DETERMINISTIC_PAYLOAD:\n{json.dumps(prompt_payload, default=str)}"
    )
    return _generate_with_fallback(prompt)


def _answer_with_ai_wording_assist(question: str, context: dict[str, Any], history: List[Dict[str, str]]) -> str:
    recommendation = context.get("recommendation") or {}
    evidence = recommendation.get("evidence") or []
    history_text = _format_history_for_prompt(history)
    history_block = f"\nPrevious conversation:\n{history_text}\n" if history_text else ""
    files_context = _uploaded_files_context(str((recommendation or {}).get("asset_id") or None))
    prompt = (
        f"{history_block}"
        "You are a professional data analyst with engineering domain expertise.\n"
        "You have access to all uploaded datasets listed in context.\n"
        "Rewrite the deterministic answer in clearer language while staying fully grounded in provided evidence.\n"
        "Do not hallucinate. If data is insufficient, clearly say what is missing and ask for exact fields/files needed.\n"
        "When useful, add brief best-fit analysis guidance based on data type (numeric/categorical/time-series).\n"
        "Keep answer concise and actionable for plant engineers.\n\n"
        f"Question: {question}\n"
        f"{files_context}\n"
        f"Deterministic context JSON: {json.dumps(context, default=str)}\n"
        f"Evidence count: {len(evidence)}\n"
    )
    return _generate_with_fallback(prompt)


def _is_cause_ranking_question(question: str) -> bool:
    q = (question or "").lower()
    cause_terms = ["cause", "failure", "root cause", "major", "leading", "top", "most"]
    return any(term in q for term in cause_terms) and ("fix" not in q and "how to" not in q and "repair" not in q)


def _is_fix_question(question: str) -> bool:
    q = (question or "").lower()
    verbs = ["fix", "how to", "repair", "resolve", "step", "what to do", "what should", "do for", "mitigate", "action"]
    if any(v in q for v in verbs):
        return True
    # If a specific failure is mentioned, treat this as a troubleshooting intent.
    return _detect_target_failure(q) is not None


def _should_use_ai_agent(question: str) -> bool:
    q = (question or "").lower()
    if "file" in q and ("missing" in q or "which" in q):
        return False
    if _is_cause_ranking_question(q):
        return False
    return _is_fix_question(q)


def _is_deterministic_answer_weak(answer: str) -> bool:
    text = (answer or "").strip().lower()
    if not text:
        return True
    if text.startswith("insufficient evidence"):
        return True
    if "most likely leading causes:" in text and "historically recommended action:" in text:
        return True
    if "analysis used uploaded incidents/logs and derived taxonomy" in text:
        return True
    return False


def _api_key_available() -> bool:
    return bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))


def _is_ai_answer_usable(answer: str) -> bool:
    text = (answer or "").strip()
    if len(text) < 60:
        return False
    if text.lower().startswith("insufficient evidence"):
        return False
    return "Question:" in text and "Evidence Summary:" in text


def _derive_taxonomy(evidence: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], bool]:
    known_rows = []
    for item in evidence:
        cause = str(item.get("root_cause") or "").strip()
        if cause and "unknown" not in cause.lower():
            known_rows.append({"label": cause, "derived": False, "evidence": item})
    if known_rows:
        return known_rows, False

    # Derived classification from failure mode + notes if structured taxonomy is missing.
    derived_rows = []
    for item in evidence:
        failure_mode = str(item.get("failure_mode") or "").strip()
        notes = str(item.get("notes") or "").strip()
        base = failure_mode if failure_mode and "unknown" not in failure_mode.lower() else notes
        label = _normalize_label(base)
        if not label:
            continue
        # Keep short engineering-friendly labels.
        label = " ".join(label.split()[:6])
        derived_rows.append({"label": label, "derived": True, "evidence": item})
    return derived_rows, True


def _rank_causes(
    taxonomy_rows: list[dict[str, Any]],
    *,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    now = now or datetime.now(timezone.utc)
    buckets: Dict[str, Dict[str, Any]] = {}
    for row in taxonomy_rows:
        label = str(row.get("label") or "").strip()
        if not label:
            continue
        evidence = row.get("evidence") or {}
        dt = _parse_dt(evidence.get("timestamp"))
        days_old = max(0.0, (now - dt.replace(tzinfo=timezone.utc)).total_seconds() / 86400.0) if dt else 365.0
        recency_weight = 1.0 / (1.0 + days_old / 90.0)
        downtime = evidence.get("downtime_minutes")
        try:
            downtime_val = float(downtime) if downtime is not None else 0.0
        except Exception:
            downtime_val = 0.0
        severity_weight = 1.0 + min(2.0, downtime_val / 120.0)
        bucket = buckets.setdefault(label, {"cause": label, "count": 0, "score": 0.0, "downtime_total": 0.0})
        bucket["count"] += 1
        bucket["score"] += severity_weight * recency_weight
        bucket["downtime_total"] += downtime_val

    ranked = sorted(buckets.values(), key=lambda x: (x["score"], x["count"]), reverse=True)
    total = sum(item["count"] for item in ranked) or 1
    for item in ranked:
        item["share"] = round(item["count"] / total, 4)
    return ranked


def _missing_required_fields(evidence: list[dict[str, Any]]) -> list[str]:
    required = ["failure_mode", "root_cause", "asset_id", "timestamp", "downtime_minutes"]
    missing: list[str] = []
    for field in required:
        present = False
        for item in evidence:
            value = item.get(field)
            if value is None:
                continue
            text = str(value).strip()
            if not text:
                continue
            if field in {"failure_mode", "root_cause"} and "unknown" in text.lower():
                continue
            present = True
            break
        if not present:
            missing.append(field)
    return missing


def _engineering_confidence(evidence_count: int, missing_required: int) -> float:
    missing_rate = min(1.0, missing_required / 5.0)
    data_quality_score = max(0.5, 1.0 - missing_rate * 0.5)
    return min(1.0, math.sqrt(max(0.0, evidence_count) / 30.0) * data_quality_score)


def _format_cause_response(
    question: str,
    ranked: list[dict[str, Any]],
    *,
    derived: bool,
    evidence: list[dict[str, Any]],
    missing_fields: list[str],
    confidence: float,
    action: str,
) -> str:
    if not ranked:
        return f"INSUFFICIENT EVIDENCE. Missing required fields: {', '.join(missing_fields or ['failure_mode', 'root_cause'])}."

    lines = [f"Question: {question}", "", "Top Failure Causes (Ranked)"]
    for idx, row in enumerate(ranked, start=1):
        lines.append(f"{idx}. {row['cause']} - {row['count']} incidents - {row['share'] * 100:.1f}%")

    if derived:
        lines.extend([
            "",
            "No structured failure taxonomy detected.",
            "Derived Classification generated from failure_mode/notes similarity.",
        ])

    fields_used = ["failure_mode", "root_cause", "notes", "timestamp", "downtime_minutes", "asset_id"]
    timestamps = [dt for dt in (_parse_dt(item.get("timestamp")) for item in evidence) if dt is not None]
    if timestamps:
        start_ts = min(timestamps).isoformat()
        end_ts = max(timestamps).isoformat()
    else:
        start_ts = "n/a"
        end_ts = "n/a"

    warning_line = ""
    if missing_fields:
        warning_line = "WARNING: Failure taxonomy unreliable. Recommend structured logging schema upgrade."

    lines.extend([
        "",
        "Evidence Summary:",
        f"Evidence Records Used: {len(evidence)}",
        f"Fields Used: {', '.join(fields_used)}",
        f"Time Range: {start_ts} to {end_ts}",
        "",
        "Recommended Actions:",
        f"- Standardize root_cause capture and corrective_action logging for '{action}'.",
        "- Add downtime_minutes and severity tags to improve ranking accuracy.",
        "- Use these ranked causes to prioritize PM tasks and reduce repeat alerts.",
        "",
        f"Confidence: {confidence:.2f}",
    ])
    if warning_line:
        lines.extend(["", warning_line])
    return "\n".join(lines)


def _build_deterministic_context(asset_id: str, failure: str | None, question: str) -> dict[str, Any]:
    target_filter = _detect_target_failure(question)
    effective_failure = failure or ((target_filter or {}).get("failure_mode"))
    recommendation = recommend_action(asset_id=asset_id, detected_failure=effective_failure)
    explanation = why_failure_occurred(asset_id=asset_id, detected_failure=effective_failure)
    risk = process_risk(asset_id)
    query_embedding = embedding_for_text(question)
    related_knowledge = vector_search(query_embedding, limit=12)
    base_evidence = recommendation.get("evidence") or []
    evidence = _filter_evidence_by_target(base_evidence, target_filter)
    if not evidence and target_filter:
        # Fallback: rebuild from full history when early recommendation filter was too narrow.
        all_recommendation = recommend_action(asset_id=asset_id, detected_failure=None)
        all_evidence = all_recommendation.get("evidence") or []
        evidence = _filter_evidence_by_target(all_evidence, target_filter)
        recommendation = {**all_recommendation, "evidence": evidence}
    memory_cfg = _get_memory_config()
    saved_dataset_ids = _get_saved_dataset_ids(asset_id=asset_id) if bool(memory_cfg.get("persistence_enabled")) else set()
    if bool(memory_cfg.get("persistence_enabled")):
        if saved_dataset_ids:
            evidence = [row for row in evidence if str(row.get("source_dataset_id") or "") in saved_dataset_ids]
        else:
            evidence = []
        recommendation = {**recommendation, "evidence": evidence}
    taxonomy_rows, derived_taxonomy = _derive_taxonomy(evidence)
    leading_failure_causes = _rank_causes(taxonomy_rows)
    missing_fields = _missing_required_fields(evidence)
    confidence_score = _engineering_confidence(len(evidence), len(missing_fields))
    action_rankings = _action_rankings(evidence)

    sop_bundle = map_sop_for_failure(
        asset_type=None,
        failure_mode=(target_filter or {}).get("failure_mode"),
        root_cause=(target_filter or {}).get("root_cause"),
    )
    sop_steps = []
    for block in (sop_bundle.get("matched_sops") or []):
        for step in (block.get("steps") or []):
            sop_steps.append(step)

    recommendation = {
        **recommendation,
        "evidence": evidence,
    }
    return {
        "recommendation": recommendation,
        "failure_reasoning": explanation,
        "risk": risk,
        "related_knowledge": related_knowledge,
        "leading_failure_causes": leading_failure_causes,
        "action_rankings": action_rankings,
        "target_filter": target_filter,
        "sop_steps": sop_steps,
        "derived_taxonomy": derived_taxonomy,
        "missing_required_fields": missing_fields,
        "confidence_score": confidence_score,
        "dataset_meta": _DATASET_META,
        "saved_dataset_ids": sorted(saved_dataset_ids),
        "memory_config": memory_cfg,
    }


def _answer_question_deterministically(question: str, context: dict[str, Any]) -> str:
    q = (question or "").strip().lower()
    recommendation = context.get("recommendation") or {}
    evidence = recommendation.get("evidence") or []
    action = (
        (recommendation.get("recommendation") or {}).get("action")
        or recommendation.get("action")
        or "unspecified_action"
    )
    confidence = float(context.get("confidence_score") or recommendation.get("confidence") or 0.0)
    leading = context.get("leading_failure_causes") or []
    missing_required_fields = list(context.get("missing_required_fields") or [])
    action_rankings = list(context.get("action_rankings") or [])
    sop_steps = list(context.get("sop_steps") or [])
    target_filter = context.get("target_filter") or {}
    dataset_meta = context.get("dataset_meta") or {}

    def _parse_top_n(text: str) -> int:
        m = re.search(r"\btop\s+(\d+)\b", text) or re.search(r"\blist\s+(\d+)\b", text)
        if m:
            return max(1, min(20, int(m.group(1))))
        words = {
            "five": 5,
            "four": 4,
            "three": 3,
            "two": 2,
            "one": 1,
        }
        for word, value in words.items():
            if re.search(rf"\b{word}\b", text):
                return value
        return 5

    def _parse_rank(text: str) -> int:
        rank_words = {
            "first": 1,
            "second": 2,
            "third": 3,
            "fourth": 4,
            "fifth": 5,
        }
        for word, value in rank_words.items():
            if re.search(rf"\b{word}\b", text):
                return value
        m = re.search(r"\b(\d+)(st|nd|rd|th)\b", text)
        if m:
            return max(1, int(m.group(1)))
        return 0

    def _ordinal(n: int) -> str:
        names = {1: "First", 2: "Second", 3: "Third", 4: "Fourth", 5: "Fifth"}
        if n in names:
            return names[n]
        if 10 <= (n % 100) <= 20:
            suffix = "th"
        else:
            suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
        return f"{n}{suffix}"

    if _is_cause_ranking_question(q):
        ranked = list(leading)
        exclude_unknown = "except unknown" in q or "excluding unknown" in q or "without unknown" in q
        if exclude_unknown:
            ranked = [row for row in ranked if "unknown" not in str(row.get("cause", "")).lower()]
        rank = _parse_rank(q)
        top_n = _parse_top_n(q)
        if rank > 0:
            if len(ranked) >= rank:
                row = ranked[rank - 1]
                return (
                    f"{_ordinal(rank)} most frequent failure cause: {row.get('cause')} - "
                    f"{row.get('count')} incidents - {float(row.get('share') or 0.0) * 100:.1f}%"
                )
            return "INSUFFICIENT EVIDENCE. Requested rank exceeds available cause categories."
        if "major" in q or "main" in q or "primary" in q:
            top_n = 1
        ranked = ranked[:top_n]
        return _format_cause_response(
            question=question,
            ranked=ranked,
            derived=bool(context.get("derived_taxonomy")),
            evidence=evidence,
            missing_fields=missing_required_fields,
            confidence=confidence,
            action=action,
        )

    if "file" in q and ("missing" in q or "which" in q):
        if not missing_required_fields:
            return "No required fields are currently missing for the matched evidence."
        evidence_dataset_ids = {
            str(item.get("source_dataset_id") or "").strip()
            for item in evidence
            if str(item.get("source_dataset_id") or "").strip()
        }
        if not evidence_dataset_ids:
            return (
                f"INSUFFICIENT EVIDENCE. Missing required fields: {', '.join(missing_required_fields)}. "
                "Unable to map to a dataset filename."
            )
        lines = ["Files with missing required fields:"]
        for dsid in sorted(evidence_dataset_ids):
            meta = dataset_meta.get(dsid) or {}
            filename = str(meta.get("filename") or dsid)
            lines.append(f"- {filename}: missing {', '.join(missing_required_fields)}")
        return "\n".join(lines)

    if _is_fix_question(q) or "cause" in q or "root cause" in q or "failure" in q:
        # Fresh deterministic response in required template.
        ranked = leading
        exclude_unknown = "except unknown" in q or "excluding unknown" in q or "without unknown" in q
        if exclude_unknown:
            ranked = [row for row in ranked if "unknown" not in str(row.get("cause", "")).lower()]

        rank = _parse_rank(q)
        top_n = _parse_top_n(q)
        if rank > 0 and ranked:
            ranked = [ranked[rank - 1]] if len(ranked) >= rank else []
        else:
            ranked = ranked[:top_n]

        if not ranked and missing_required_fields:
            return f"INSUFFICIENT EVIDENCE. Missing required fields: {', '.join(missing_required_fields)}."

        fix_steps, derived_fix = _infer_fix_steps(question, sop_steps, has_history=bool(action_rankings))

        lines = [f"Question: {question}", "", "Root Cause Explanation:"]
        if target_filter:
            key, value = list(target_filter.items())[0]
            lines.append(f"Analysis filtered to {key} containing '{value}' as requested.")
        else:
            lines.append("Analysis used uploaded incidents/logs and derived taxonomy where structured fields were missing.")
        if ranked:
            lines.append(f"Most likely cause in matched records: {ranked[0]['cause']}.")

        lines.extend(["", "Historical Fix Actions:"])
        if action_rankings:
            for idx, row in enumerate(action_rankings[:5], start=1):
                lines.append(f"{idx}. {row['action']} - {row['count']}")
        else:
            lines.append("1. No direct historical corrective_action records for this filtered failure.")

        lines.extend(["", "Engineering Recommended Fix Steps:"])
        for step in fix_steps:
            lines.append(f"- {step}")
        if derived_fix:
            lines.append('- Derived engineering recommendation (not historical).')

        timestamps = [dt for dt in (_parse_dt(item.get("timestamp")) for item in evidence) if dt is not None]
        if timestamps:
            start_ts = min(timestamps).isoformat()
            end_ts = max(timestamps).isoformat()
        else:
            start_ts = "n/a"
            end_ts = "n/a"

        sources = set()
        for item in evidence:
            sid = str(item.get("source_dataset_id") or "").lower()
            if sid.startswith("logs-"):
                sources.add("logs")
            elif sid.startswith("incidents-"):
                sources.add("incidents")
        if sop_steps:
            sources.add("SOP")
        if not sources:
            sources = {"incidents"}
        n = len(evidence)
        chat_confidence = min(1.0, math.log10(n + 1))

        lines.extend([
            "",
            "Evidence Summary:",
            f"Records matched: {n}",
            f"Sources: {' / '.join(sorted(sources))}",
            f"Time range: {start_ts} to {end_ts}",
            "",
            f"Confidence Score: {chat_confidence:.2f}",
        ])
        if missing_required_fields:
            lines.extend([
                "",
                "WARNING: Failure taxonomy unreliable. Recommend structured logging schema upgrade.",
            ])
        return "\n".join(lines)

    if "action" in q or "worked" in q or "recommend" in q:
        return (
            f"Historically most effective action is '{action}' "
            f"with confidence {confidence:.1%} based on {len(evidence)} evidence records."
        )

    if "why" in q:
        reasoning = context.get("failure_reasoning") or {}
        summary = reasoning.get("root_cause_summary") or "Insufficient deterministic evidence."
        return f"{summary} Confidence {confidence:.1%} from {len(evidence)} evidence records."

    return _fallback_summary(question, context)


@router.on_event("startup")
def knowledge_startup() -> None:
    bootstrap_schema()


@router.post("/upload/logs")
async def upload_logs(file: UploadFile = File(...), save_to_memory: bool = Form(False)) -> dict[str, Any]:
    ensure_schema_once()
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / (file.filename or "logs.csv")
        path.write_bytes(await file.read())
        dataset_id = f"logs-{uuid.uuid4().hex[:12]}"
        result = ingest_maintenance_logs(path, source_dataset_id=dataset_id)
        _DATASET_META[dataset_id] = {
            "filename": file.filename or "logs.csv",
            "source": "logs",
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "asset_ids": result.get("asset_ids", []),
            "saved_to_memory": bool(save_to_memory),
        }
        if save_to_memory:
            _save_dataset_metadata(
                dataset_id=dataset_id,
                source="logs",
                filename=file.filename or "logs.csv",
                asset_ids=[str(x) for x in (result.get("asset_ids") or [])],
            )
        for aid in result.get("asset_ids", []):
            _LATEST_DATASET_BY_ASSET[str(aid)] = dataset_id
    return {"status": "logs ingested", "saved_to_memory": bool(save_to_memory), **result}


@router.post("/upload/sop")
async def upload_sop(
    file: UploadFile = File(...),
    sop_name: str = Form("Engineering SOP"),
    asset_type: str = Form("generic_asset"),
    save_to_memory: bool = Form(False),
) -> dict[str, Any]:
    ensure_schema_once()
    dataset_id = f"sop-{uuid.uuid4().hex[:12]}"
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / (file.filename or "sop.pdf")
        path.write_bytes(await file.read())
        try:
            result = ingest_sop(path, sop_name=sop_name, asset_type=asset_type)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    _DATASET_META[dataset_id] = {
        "filename": file.filename or "sop.pdf",
        "source": "sop",
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "asset_ids": [],
        "saved_to_memory": bool(save_to_memory),
    }
    if save_to_memory:
        _save_dataset_metadata(
            dataset_id=dataset_id,
            source="sop",
            filename=file.filename or "sop.pdf",
            asset_ids=[],
        )
    return {"status": "sop ingested", "saved_to_memory": bool(save_to_memory), "dataset_id": dataset_id, **result}


@router.post("/upload/incidents")
async def upload_incidents(file: UploadFile = File(...), save_to_memory: bool = Form(False)) -> dict[str, Any]:
    ensure_schema_once()
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / (file.filename or "incidents.csv")
        path.write_bytes(await file.read())
        dataset_id = f"incidents-{uuid.uuid4().hex[:12]}"
        result = ingest_incident_reports(path, source_dataset_id=dataset_id)
        _DATASET_META[dataset_id] = {
            "filename": file.filename or "incidents.csv",
            "source": "incidents",
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "asset_ids": result.get("asset_ids", []),
            "saved_to_memory": bool(save_to_memory),
        }
        if save_to_memory:
            _save_dataset_metadata(
                dataset_id=dataset_id,
                source="incidents",
                filename=file.filename or "incidents.csv",
                asset_ids=[str(x) for x in (result.get("asset_ids") or [])],
            )
        for aid in result.get("asset_ids", []):
            _LATEST_DATASET_BY_ASSET[str(aid)] = dataset_id
    return {"status": "incidents ingested", "saved_to_memory": bool(save_to_memory), **result}


@router.get("/graph/{asset_id}")
def knowledge_graph(asset_id: str) -> dict[str, Any]:
    ensure_schema_once()
    return fetch_asset_graph(asset_id)


@router.get("/recommendation/{asset_id}")
def knowledge_recommendation(asset_id: str, failure: str | None = Query(default=None)) -> dict[str, Any]:
    ensure_schema_once()
    deterministic = recommend_action(asset_id=asset_id, detected_failure=failure)
    explanation = why_failure_occurred(asset_id=asset_id, detected_failure=failure)
    risk = process_risk(asset_id)
    sop = map_sop_for_failure(
        asset_type=None,
        failure_mode=deterministic.get("detected_failure"),
        root_cause=deterministic.get("inferred_root_cause"),
    )

    answer = {
        "asset_id": asset_id,
        "recommendation": deterministic,
        "failure_explanation": explanation,
        "risk": risk,
        "sop_mapping": sop,
    }
    ai_summary = _gemini_summary(answer, question=f"Recommendation for asset {asset_id}")
    evidence_count = len(deterministic.get("evidence") or [])
    write_audit_log(
        endpoint="/knowledge/recommendation/{asset_id}",
        query_text=f"asset_id={asset_id};failure={failure}",
        response_summary=ai_summary[:1200],
        evidence_count=evidence_count,
        confidence_score=float(deterministic.get("confidence") or 0.0),
        metadata={"asset_id": asset_id},
    )

    return {
        **answer,
        "ai_summary": ai_summary,
        "evidence": deterministic.get("evidence") or [],
        "confidence": deterministic.get("confidence") or 0.0,
    }


@router.get("/query", response_model=KnowledgeQueryResponse)
def knowledge_query(
    asset_id: str,
    q: str = Query(..., description="Engineering question"),
    failure: str | None = None,
) -> KnowledgeQueryResponse:
    ensure_schema_once()
    if _is_dataset_name_question(q):
        ai_summary = _format_uploaded_dataset_names(asset_id=asset_id)
        write_audit_log(
            endpoint="/knowledge/query",
            query_text=q,
            response_summary=ai_summary[:1200],
            evidence_count=0,
            confidence_score=1.0,
            metadata={"asset_id": asset_id, "failure": failure, "mode": "dataset_lookup"},
        )
        return KnowledgeQueryResponse(
            asset_id=asset_id,
            question=q,
            deterministic_answer={
                "mode": "dataset_lookup",
                "dataset_count": len(_DATASET_META),
                "response_source": "deterministic_dataset_lookup",
                "gemini_configured": _api_key_available(),
            },
            ai_summary=ai_summary,
            evidence=[],
            confidence=1.0,
        )

    if _is_general_chat_question(q):
        ai_summary, general_source = _answer_general_chat(q, [], asset_id=asset_id)
        write_audit_log(
            endpoint="/knowledge/query",
            query_text=q,
            response_summary=ai_summary[:1200],
            evidence_count=0,
            confidence_score=0.0,
            metadata={"asset_id": asset_id, "failure": failure, "mode": "general_chat"},
        )
        return KnowledgeQueryResponse(
            asset_id=asset_id,
            question=q,
            deterministic_answer={
                "mode": "general_chat",
                "note": "No evidence query executed.",
                "response_source": general_source,
                "gemini_configured": _api_key_available(),
            },
            ai_summary=ai_summary,
            evidence=[],
            confidence=0.0,
        )

    deterministic = _build_deterministic_context(asset_id=asset_id, failure=failure, question=q)
    recommendation = deterministic.get("recommendation") or {}
    evidence = recommendation.get("evidence") or []
    ai_summary = _answer_question_deterministically(q, deterministic)
    response_source = "deterministic"
    if _should_use_ai_agent(q):
        try:
            ai_candidate = _answer_with_ai_agent(q, deterministic, [])
            if _is_ai_answer_usable(ai_candidate):
                ai_summary = ai_candidate
                response_source = "gemini_evidence_agent"
        except Exception:
            pass
    if response_source == "deterministic" and _is_deterministic_answer_weak(ai_summary) and _api_key_available():
        try:
            ai_candidate = _answer_with_ai_wording_assist(q, deterministic, [])
            if ai_candidate and len(ai_candidate.strip()) >= 40:
                ai_summary = ai_candidate.strip()
                response_source = "gemini_wording_assist"
        except Exception:
            pass
    deterministic["response_source"] = response_source
    deterministic["gemini_configured"] = _api_key_available()

    confidence = float(deterministic.get("confidence_score") or recommendation.get("confidence") or 0.0)
    write_audit_log(
        endpoint="/knowledge/query",
        query_text=q,
        response_summary=ai_summary[:1200],
        evidence_count=len(evidence),
        confidence_score=confidence,
        metadata={"asset_id": asset_id, "failure": failure},
    )

    return KnowledgeQueryResponse(
        asset_id=asset_id,
        question=q,
        deterministic_answer=deterministic,
        ai_summary=ai_summary,
        evidence=evidence,
        confidence=confidence,
    )


@router.get("/memory/config")
def get_memory_config() -> dict[str, Any]:
    ensure_schema_once()
    return _get_memory_config()


@router.post("/memory/config")
def set_memory_config(payload: KnowledgeMemoryConfigRequest) -> dict[str, Any]:
    ensure_schema_once()
    _set_setting_bool(_MEMORY_PERSISTENCE_KEY, bool(payload.persistence_enabled))
    _set_setting_bool(_MEMORY_ASSET_HISTORY_KEY, bool(payload.use_asset_history))
    return _get_memory_config()


@router.post("/memory/save-datasets")
def save_datasets_to_memory(payload: SaveDatasetsRequest) -> dict[str, Any]:
    ensure_schema_once()
    saved: list[str] = []
    missing: list[str] = []
    for dataset_id in payload.dataset_ids:
        dsid = str(dataset_id or "").strip()
        if not dsid:
            continue
        meta = _DATASET_META.get(dsid)
        if not meta:
            missing.append(dsid)
            continue
        _save_dataset_metadata(
            dataset_id=dsid,
            source=str(meta.get("source") or "unknown"),
            filename=str(meta.get("filename") or dsid),
            asset_ids=[str(x) for x in (meta.get("asset_ids") or [])],
        )
        meta["saved_to_memory"] = True
        _DATASET_META[dsid] = meta
        saved.append(dsid)
    return {"saved_dataset_ids": saved, "missing_dataset_ids": missing}


@router.post("/memory/save-chat/{session_id}")
def save_chat_session_to_memory(session_id: str, payload: SaveChatSessionRequest) -> dict[str, Any]:
    ensure_schema_once()
    history = _KNOWLEDGE_CHAT_MEMORY.get(session_id) or []
    if not history:
        return {"session_id": session_id, "saved_messages": 0, "status": "no_history"}
    asset_id = (payload.asset_id or "").strip()
    saved = _persist_full_session_history(session_id=session_id, asset_id=asset_id, history=history)
    return {"session_id": session_id, "saved_messages": saved, "status": "saved"}


@router.post("/chat", response_model=KnowledgeChatResponse)
def knowledge_chat(payload: KnowledgeChatRequest) -> KnowledgeChatResponse:
    ensure_schema_once()
    session_id = payload.session_id or str(uuid.uuid4())
    history = _KNOWLEDGE_CHAT_MEMORY.setdefault(session_id, [])
    state = _KNOWLEDGE_CHAT_STATE.setdefault(session_id, [])
    memory_config = _get_memory_config()
    persistence_enabled = bool(memory_config.get("persistence_enabled"))
    use_asset_history = bool(memory_config.get("use_asset_history"))
    if persistence_enabled and not history:
        history.extend(_load_persistent_history(session_id=session_id, asset_id=payload.asset_id, use_asset_history=use_asset_history, limit=40))
    normalized_q = (payload.question or "").strip()
    if any(token in normalized_q.lower() for token in ["i mean", "same", "that", "this", "it"]) and len(normalized_q.split()) <= 5:
        prev_user = [h["content"] for h in history if h.get("role") == "user"]
        if prev_user:
            normalized_q = f"{prev_user[-1]} | follow-up: {normalized_q}"

    if _is_dataset_name_question(normalized_q):
        answer = _format_uploaded_dataset_names(asset_id=payload.asset_id)
        history.append({"role": "user", "content": payload.question})
        history.append({"role": "assistant", "content": answer})
        if persistence_enabled and payload.save_to_memory:
            _persist_chat_message(session_id, payload.asset_id, "user", payload.question, {"mode": "dataset_lookup"})
            _persist_chat_message(session_id, payload.asset_id, "assistant", answer, {"mode": "dataset_lookup"})
        if len(history) > 40:
            history[:] = history[-40:]
        write_audit_log(
            endpoint="/knowledge/chat",
            query_text=payload.question,
            response_summary=answer[:1200],
            evidence_count=0,
            confidence_score=1.0,
            metadata={
                "asset_id": payload.asset_id,
                "failure": payload.failure,
                "session_id": session_id,
                "memory_turns": len(history),
                "mode": "dataset_lookup",
            },
        )
        return KnowledgeChatResponse(
            session_id=session_id,
            answer=answer,
            deterministic_answer={
                "mode": "dataset_lookup",
                "dataset_count": len(_DATASET_META),
                "response_source": "deterministic_dataset_lookup",
                "gemini_configured": _api_key_available(),
            },
            evidence=[],
            confidence=1.0,
            history=history,
        )

    if _is_general_chat_question(normalized_q):
        answer, general_source = _answer_general_chat(normalized_q, history, asset_id=payload.asset_id)
        history.append({"role": "user", "content": payload.question})
        history.append({"role": "assistant", "content": answer})
        if persistence_enabled and payload.save_to_memory:
            _persist_chat_message(session_id, payload.asset_id, "user", payload.question, {"mode": "general_chat"})
            _persist_chat_message(session_id, payload.asset_id, "assistant", answer, {"mode": "general_chat"})
        if len(history) > 40:
            history[:] = history[-40:]
        write_audit_log(
            endpoint="/knowledge/chat",
            query_text=payload.question,
            response_summary=answer[:1200],
            evidence_count=0,
            confidence_score=0.0,
            metadata={
                "asset_id": payload.asset_id,
                "failure": payload.failure,
                "session_id": session_id,
                "memory_turns": len(history),
                "mode": "general_chat",
            },
        )
        return KnowledgeChatResponse(
            session_id=session_id,
            answer=answer,
            deterministic_answer={
                "mode": "general_chat",
                "note": "No evidence query executed.",
                "response_source": general_source,
                "gemini_configured": _api_key_available(),
            },
            evidence=[],
            confidence=0.0,
            history=history,
        )

    deterministic = _build_deterministic_context(
        asset_id=payload.asset_id,
        failure=payload.failure,
        question=normalized_q,
    )
    answer = _answer_question_deterministically(normalized_q, deterministic)
    response_source = "deterministic"
    if _should_use_ai_agent(normalized_q):
        try:
            ai_candidate = _answer_with_ai_agent(normalized_q, deterministic, history)
            if _is_ai_answer_usable(ai_candidate):
                answer = ai_candidate
                response_source = "gemini_evidence_agent"
        except Exception:
            pass
    if response_source == "deterministic" and _is_deterministic_answer_weak(answer) and _api_key_available():
        try:
            ai_candidate = _answer_with_ai_wording_assist(normalized_q, deterministic, history)
            if ai_candidate and len(ai_candidate.strip()) >= 40:
                answer = ai_candidate.strip()
                response_source = "gemini_wording_assist"
        except Exception:
            pass
    recommendation = deterministic.get("recommendation") or {}
    evidence = recommendation.get("evidence") or []
    confidence = min(1.0, math.log10(len(evidence) + 1))
    deterministic["response_source"] = response_source
    deterministic["gemini_configured"] = _api_key_available()

    history.append({"role": "user", "content": payload.question})
    history.append({"role": "assistant", "content": answer})
    if persistence_enabled and payload.save_to_memory:
        _persist_chat_message(session_id, payload.asset_id, "user", payload.question, {"mode": "knowledge_chat"})
        _persist_chat_message(session_id, payload.asset_id, "assistant", answer, {"mode": "knowledge_chat"})
    if len(history) > 40:
        history[:] = history[-40:]
    state.append(
        {
            "source_dataset_id": _LATEST_DATASET_BY_ASSET.get(payload.asset_id, "unknown_dataset"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "evidence_count": len(evidence),
            "normalized_failure_taxonomy": deterministic.get("leading_failure_causes", []),
            "statistical_summaries": {
                "confidence": confidence,
                "risk_level": ((deterministic.get("risk") or {}).get("risk_level")),
            },
        }
    )
    if len(state) > 20:
        state[:] = state[-20:]

    write_audit_log(
        endpoint="/knowledge/chat",
        query_text=payload.question,
        response_summary=answer[:1200],
        evidence_count=len(evidence),
        confidence_score=confidence,
        metadata={
            "asset_id": payload.asset_id,
            "failure": payload.failure,
            "session_id": session_id,
            "memory_turns": len(history),
            "memory_entries": len(state),
        },
    )

    return KnowledgeChatResponse(
        session_id=session_id,
        answer=answer,
        deterministic_answer=deterministic,
        evidence=evidence,
        confidence=confidence,
        history=history,
    )


@router.post("/chat/{session_id}/reset")
def knowledge_chat_reset(session_id: str) -> dict[str, Any]:
    _KNOWLEDGE_CHAT_MEMORY.pop(session_id, None)
    _KNOWLEDGE_CHAT_STATE.pop(session_id, None)
    return {"status": "reset", "session_id": session_id, "persisted_memory_cleared": False}
