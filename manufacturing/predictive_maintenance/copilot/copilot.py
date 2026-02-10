"""
Engineering copilot for deterministic explanation and troubleshooting.
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Deque
from collections import deque

import httpx

from ..models.data_models import CopilotResponse, CopilotEvidence


class CopilotService:
    """Builds context and queries Gemini with strict guardrails."""

    def __init__(self, log_path: Optional[Path] = None):
        self.log_path = log_path or Path("predictive_maintenance") / "logs" / "copilot.log"
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.model = os.getenv("GEMINI_MODEL")
        self._resolved_model: Optional[str] = None
        self._memory: Dict[str, Deque[Dict[str, Any]]] = {}
        self._memory_limit = 10

    def llm_enabled(self) -> bool:
        return bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))

    def resolve_model(self, api_key: str) -> str:
        if self._resolved_model:
            return self._resolved_model

        preferred = self.model
        try:
            models = self._list_models(api_key)
            model_names = [m.get("name", "") for m in models]
            stripped_names = [name.replace("models/", "") for name in model_names]

            if preferred and preferred in stripped_names:
                self._resolved_model = preferred
                return preferred

            # Prefer a fast, generally available model
            for candidate in ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"]:
                if candidate in stripped_names:
                    self._resolved_model = candidate
                    return candidate

            # Fallback to the first available model name (stripped)
            if stripped_names:
                self._resolved_model = stripped_names[0]
                return self._resolved_model
        except Exception:
            pass

        # Last resort fallback
        self._resolved_model = preferred or "gemini-2.5-flash"
        return self._resolved_model

    def refresh_model(self, api_key: str) -> str:
        self._resolved_model = None
        return self.resolve_model(api_key)

    def build_context(self, asset_id: str, asset_type: str,
                      sensor_history: List[Dict[str, Any]],
                      maintenance_history: List[Dict[str, Any]],
                      risk_assessment: Dict[str, Any],
                      failure_mode_breakdown: List[Dict[str, Any]],
                      baseline_bands: Dict[str, Any],
                      failure_mode_timeline: List[Dict[str, Any]]) -> Dict[str, Any]:
        return {
            "asset": {
                "asset_id": asset_id,
                "asset_type": asset_type
            },
            "risk_assessment": risk_assessment,
            "failure_mode_breakdown": failure_mode_breakdown,
            "failure_mode_timeline": failure_mode_timeline,
            "indicator_trends": {
                "sensor_history": sensor_history,
                "baseline_bands": baseline_bands
            },
            "maintenance_history": maintenance_history
        }

    def answer_query(self, asset_id: str, role: str, question: str,
                     context: Dict[str, Any], session_id: Optional[str]) -> CopilotResponse:
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured.")

        prompt = self._build_prompt(role, question, context, session_id)
        llm_used = False
        try:
            model_response = self._query_gemini(api_key, prompt)
            parsed = self._parse_model_response(model_response)
            if parsed:
                normalized = self._normalize_llm_response(parsed)
                response = CopilotResponse(**normalized)
                llm_used = True
            else:
                self._log_llm_parse_failure(asset_id, role, question, model_response)
                raise RuntimeError("LLM response could not be parsed.")
        except Exception as exc:
            raise RuntimeError(f"LLM request failed: {exc}") from exc

        response.llm_used = llm_used
        self._log_interaction(asset_id, role, question, response, context, llm_used=llm_used, session_id=session_id)
        self._remember(session_id, role, question, response.summary)
        return response

    def _log_llm_parse_failure(self, asset_id: str, role: str, question: str, raw_text: str) -> None:
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "asset_id": asset_id,
            "role": role,
            "question": question,
            "llm_parse_failed": True,
            "raw_response_preview": raw_text[:500]
        }
        with self.log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record) + "\n")

    def _normalize_llm_response(self, parsed: Dict[str, Any]) -> Dict[str, Any]:
        """Ensure required fields exist for CopilotResponse."""
        def as_list(value: Any) -> List[Any]:
            if isinstance(value, list):
                return value
            if value is None:
                return []
            return [value]

        evidence_raw = as_list(parsed.get("evidence_used"))
        normalized_evidence: List[Dict[str, Any]] = []
        for item in evidence_raw:
            if isinstance(item, dict):
                normalized_evidence.append({
                    "source": item.get("source", "model"),
                    "detail": item.get("detail", "")
                })
            else:
                normalized_evidence.append({
                    "source": "model",
                    "detail": str(item)
                })

        checks_raw = as_list(parsed.get("suggested_next_checks"))
        normalized_checks = [str(item) for item in checks_raw]

        hypotheses_raw = parsed.get("hypotheses")
        if hypotheses_raw is None:
            normalized_hypotheses = None
        else:
            normalized_hypotheses = []
            for item in as_list(hypotheses_raw):
                if isinstance(item, dict):
                    normalized_hypotheses.append(item)
                else:
                    normalized_hypotheses.append({"hypothesis": str(item)})

        return {
            "summary": parsed.get("summary") or "No summary returned by model.",
            "evidence_used": normalized_evidence,
            "suggested_next_checks": normalized_checks,
            "confidence_disclaimer": parsed.get("confidence_disclaimer") or "Model response (unverified).",
            "decision_support": parsed.get("decision_support") or "Decision Support Only",
            "hypotheses": normalized_hypotheses
        }

    def _build_prompt(self, role: str, question: str, context: Dict[str, Any],
                      session_id: Optional[str]) -> str:
        instructions = (
            "You are an engineering copilot. Use ONLY the provided system data. "
            "Never invent causes, values, or events. Do not speculate. "
            "If a requested datum is missing, say 'insufficient data' and explain what is missing. "
            "When asked for statistics (mean/max/min/median), compute from sensor_history only. "
            "Cite evidence with specific data references from the context fields. "
            "Return JSON only with keys: summary, evidence_used, suggested_next_checks, "
            "confidence_disclaimer, decision_support, hypotheses."
        )
        memory = self._memory.get(session_id or "", deque())
        payload = json.dumps({
            "role": role,
            "question": question,
            "context": context,
            "memory": list(memory)
        }, default=str)
        return f"{instructions}\n\nDATA:\n{payload}"

    def _list_models(self, api_key: str) -> List[Dict[str, Any]]:
        url = "https://generativelanguage.googleapis.com/v1beta/models"
        with httpx.Client(timeout=20.0) as client:
            response = client.get(url, params={"key": api_key})
            response.raise_for_status()
            data = response.json()
        return data.get("models", [])

    def _query_gemini(self, api_key: str, prompt: str) -> str:
        model = self.resolve_model(api_key)
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        headers = {"Content-Type": "application/json"}
        body = {
            "contents": [
                {"parts": [{"text": prompt}]}
            ],
            "generationConfig": {
                "temperature": 0.1,
                "topP": 0.8,
                "maxOutputTokens": 1024,
                "response_mime_type": "application/json"
            }
        }
        with httpx.Client(timeout=20.0) as client:
            response = client.post(url, params={"key": api_key}, headers=headers, json=body)
            response.raise_for_status()
            data = response.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]

    def _parse_model_response(self, text: str) -> Optional[Dict[str, Any]]:
        try:
            return json.loads(text)
        except Exception:
            # Attempt to extract JSON from a fenced or verbose response
            stripped = text.strip()
            if "```" in stripped:
                stripped = stripped.replace("```json", "```").replace("```JSON", "```")
                parts = stripped.split("```")
                stripped = next((p.strip() for p in parts if p.strip().startswith("{")), stripped)

            start = stripped.find("{")
            end = stripped.rfind("}")
            if start != -1 and end != -1 and end > start:
                candidate = stripped[start:end + 1]
                try:
                    return json.loads(candidate)
                except Exception:
                    pass

            # Fallback: extract summary with regex if JSON is malformed
            import re
            match = re.search(r'"summary"\s*:\s*"(.*?)"\s*(?:,|\n\s*")', stripped, re.DOTALL)
            if match:
                summary = match.group(1).replace('\\"', '"').replace('\\n', '\n')
                return {
                    "summary": summary,
                    "evidence_used": [],
                    "suggested_next_checks": [],
                    "confidence_disclaimer": "LLM response parsed with fallback extractor.",
                    "decision_support": "Decision Support Only",
                    "hypotheses": None
                }

            return None

    def _deterministic_fallback(self, role: str, question: str,
                                context: Dict[str, Any]) -> CopilotResponse:
        control_response = self._answer_control_question(question, context)
        if control_response:
            return control_response

        stat_response = self._answer_stat_question(question, context)
        if stat_response:
            return stat_response

        breakdown = context.get("failure_mode_breakdown", [])
        if not breakdown:
            return CopilotResponse(
                summary="Insufficient data to explain the alert. No failure modes are currently triggered.",
                evidence_used=[CopilotEvidence(source="system", detail="No failure mode breakdown available")],
                suggested_next_checks=["Verify sensor connectivity and upload recent data."],
                confidence_disclaimer="Low confidence due to insufficient data."
            )

        top_mode = sorted(breakdown, key=lambda x: x.get("risk_score", 0), reverse=True)[0]
        evidence = [
            CopilotEvidence(
                source="failure_mode_breakdown",
                detail=f"{top_mode.get('failure_mode_id')} stage {top_mode.get('stage')} with risk {top_mode.get('risk_score')}"
            )
        ]
        for indicator in top_mode.get("indicators", [])[:3]:
            evidence.append(CopilotEvidence(
                source="indicator",
                detail=f"{indicator.get('name')} is {indicator.get('status')} ({indicator.get('evidence')})"
            ))

        hypotheses = []
        total = sum(m.get("risk_score", 0) for m in breakdown) or 1.0
        for mode in breakdown:
            hypotheses.append({
                "failure_mode_id": mode.get("failure_mode_id"),
                "probability": round(mode.get("risk_score", 0) / total, 2)
            })

        return CopilotResponse(
            summary=(
                f"For {role}, the highest-risk mode is {top_mode.get('failure_mode_id')} "
                f"at {top_mode.get('stage')} stage. {top_mode.get('explanation')}"
            ),
            evidence_used=evidence,
            suggested_next_checks=[
                top_mode.get("recommended_action", "Verify asset condition and review recent sensor trends.")
            ],
            confidence_disclaimer="Deterministic summary based on current sensor data and rule outputs.",
            hypotheses=hypotheses
        )

    def _answer_control_question(self, question: str, context: Dict[str, Any]) -> Optional[CopilotResponse]:
        lower = question.lower()
        control_terms = [
            "out of control", "out-of-control", "out of bounds", "out-of-bounds",
            "exceed", "threshold", "limit", "too high", "too low"
        ]
        if not any(term in lower for term in control_terms):
            return None

        metric = None
        unit = ""
        if "vibration" in lower:
            metric = "vibration"
            unit = " mm/s"
        elif "temperature" in lower or "temp" in lower:
            metric = "temperature"
            unit = " C"
        elif "run hours" in lower or "run_hours" in lower or "runtime" in lower:
            metric = "run_hours"
            unit = " hours"
        elif "alarm" in lower:
            metric = "alarm_frequency"
            unit = " counts/hr"

        if not metric:
            return None

        sensor_history = context.get("indicator_trends", {}).get("sensor_history", [])
        baseline_bands = context.get("indicator_trends", {}).get("baseline_bands", {})
        baseline = baseline_bands.get(metric)

        latest = None
        for point in reversed(sensor_history):
            value = point.get(metric)
            if value is not None:
                latest = value
                break

        if latest is None:
            return CopilotResponse(
                summary=f"Insufficient sensor history to evaluate {metric} control status.",
                evidence_used=[CopilotEvidence(source="sensor_history", detail="No usable values found")],
                suggested_next_checks=["Upload recent sensor data or verify sensor ingestion."],
                confidence_disclaimer="Deterministic summary based on available data only."
            )

        if not baseline or baseline.get("std") in (None, 0):
            return CopilotResponse(
                summary=f"Baseline unavailable to evaluate {metric} control status.",
                evidence_used=[CopilotEvidence(source="baseline_bands", detail="Missing or zero standard deviation")],
                suggested_next_checks=["Establish baseline bands with sufficient historical data."],
                confidence_disclaimer="Deterministic summary based on available data only."
            )

        mean = baseline.get("mean", 0.0)
        std = baseline.get("std", 0.0)
        z_score = (latest - mean) / std if std else 0.0
        abs_z = abs(z_score)

        if abs_z < 1.0:
            status = "within normal range"
            level = "NORMAL"
        elif abs_z < 2.0:
            status = "elevated"
            level = "ELEVATED"
        else:
            status = "critical"
            level = "CRITICAL"

        return CopilotResponse(
            summary=(
                f"Latest {metric.replace('_', ' ')} is {latest:.2f}{unit} and is {status} "
                f"(z-score {z_score:.2f})."
            ),
            evidence_used=[
                CopilotEvidence(source="sensor_history", detail=f"Latest {metric}: {latest:.2f}{unit}"),
                CopilotEvidence(source="baseline_bands", detail=f"Mean {mean:.2f}, std {std:.2f}, z {z_score:.2f}")
            ],
            suggested_next_checks=[
                "Compare recent trend against baseline bands and investigate sustained deviations."
            ],
            confidence_disclaimer=f"Deterministic control check using baseline bands ({level})."
        )

    def _answer_stat_question(self, question: str, context: Dict[str, Any]) -> Optional[CopilotResponse]:
        lower = question.lower()
        stat_type = None
        if "mean" in lower or "average" in lower:
            stat_type = "mean"
        elif "max" in lower or "maximum" in lower:
            stat_type = "max"
        elif "min" in lower or "minimum" in lower:
            stat_type = "min"
        elif "median" in lower:
            stat_type = "median"

        if not stat_type:
            return None

        metric = None
        unit = ""
        if "vibration" in lower:
            metric = "vibration"
            unit = " mm/s"
        elif "temperature" in lower or "temp" in lower:
            metric = "temperature"
            unit = " C"
        elif "run hours" in lower or "run_hours" in lower or "runtime" in lower:
            metric = "run_hours"
            unit = " hours"
        elif "alarm" in lower:
            metric = "alarm_frequency"
            unit = " counts/hr"

        if not metric:
            return None

        sensor_history = context.get("indicator_trends", {}).get("sensor_history", [])
        values = [point.get(metric) for point in sensor_history if point.get(metric) is not None]
        if not values:
            return CopilotResponse(
                summary=f"Insufficient sensor history to calculate {stat_type} {metric}.",
                evidence_used=[CopilotEvidence(source="sensor_history", detail="No usable values found")],
                suggested_next_checks=["Upload recent sensor data or verify sensor ingestion."],
                confidence_disclaimer="Deterministic summary based on available data only."
            )

        if stat_type == "mean":
            stat_value = sum(values) / len(values)
        elif stat_type == "max":
            stat_value = max(values)
        elif stat_type == "min":
            stat_value = min(values)
        else:
            sorted_vals = sorted(values)
            mid = len(sorted_vals) // 2
            if len(sorted_vals) % 2 == 0:
                stat_value = (sorted_vals[mid - 1] + sorted_vals[mid]) / 2
            else:
                stat_value = sorted_vals[mid]

        summary_metric = metric.replace("_", " ")
        return CopilotResponse(
            summary=(
                f"{stat_type.capitalize()} {summary_metric} over the latest {len(values)} readings is "
                f"{stat_value:.2f}{unit}."
            ),
            evidence_used=[CopilotEvidence(source="sensor_history", detail=f"Computed from {len(values)} values")],
            suggested_next_checks=["Compare against baseline bands for deviations if needed."],
            confidence_disclaimer="Deterministic summary based on available sensor history."
        )

    def _log_interaction(self, asset_id: str, role: str, question: str,
                         response: CopilotResponse, context: Dict[str, Any],
                         llm_used: bool, session_id: Optional[str]) -> None:
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "asset_id": asset_id,
            "role": role,
            "question": question,
            "response": response.model_dump(),
            "llm_used": llm_used,
            "session_id": session_id,
            "context_summary": {
                "failure_modes": [m.get("failure_mode_id") for m in context.get("failure_mode_breakdown", [])],
                "risk_score": context.get("risk_assessment", {}).get("risk_score")
            }
        }
        with self.log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record) + "\n")

    def _remember(self, session_id: Optional[str], role: str, question: str, summary: str) -> None:
        if not session_id:
            return
        if session_id not in self._memory:
            self._memory[session_id] = deque(maxlen=self._memory_limit)
        self._memory[session_id].append({
            "role": role,
            "question": question,
            "summary": summary
        })

    def reset_memory(self, session_id: str) -> None:
        self._memory.pop(session_id, None)
