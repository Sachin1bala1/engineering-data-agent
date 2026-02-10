"""
Comparison copilot for baseline vs experiment reasoning.
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Deque
from collections import deque

import httpx

from ..models.data_models import CopilotResponse, CopilotEvidence
from .models import ComparisonReport


class CompareCopilotService:
    """Builds context and queries Gemini with guardrails for comparisons."""

    def __init__(self, log_path: Optional[Path] = None):
        self.log_path = log_path or Path("predictive_maintenance") / "logs" / "compare_copilot.log"
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.model = os.getenv("GEMINI_MODEL")
        self._resolved_model: Optional[str] = None
        self._memory: Dict[str, Deque[Dict[str, Any]]] = {}
        self._memory_limit = 10
        self._context_store: Dict[str, Dict[str, Any]] = {}
        self._context_report: Dict[str, str] = {}

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

            for candidate in ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"]:
                if candidate in stripped_names:
                    self._resolved_model = candidate
                    return candidate

            if stripped_names:
                self._resolved_model = stripped_names[0]
                return self._resolved_model
        except Exception:
            pass

        self._resolved_model = preferred or "gemini-2.5-flash"
        return self._resolved_model

    def refresh_model(self, api_key: str) -> str:
        self._resolved_model = None
        return self.resolve_model(api_key)

    def build_context(self, report: ComparisonReport) -> Dict[str, Any]:
        report_data = report.model_dump()
        raw_metadata = report_data.get("raw_metadata", {}) or {}
        aligned_series = raw_metadata.get("aligned_series", {}) or {}
        trimmed_series = {
            signal: points[-200:] if len(points) > 200 else points
            for signal, points in aligned_series.items()
            if isinstance(points, list)
        }

        return {
            "report_id": report.report_id,
            "created_at": report.created_at,
            "comparison_summary": report.comparison_summary.model_dump(),
            "alignment_metadata": report.alignment_metadata.model_dump(),
            "signal_comparison": [signal.model_dump() for signal in report.signal_comparison],
            "aligned_series": trimmed_series,
            "raw_metadata": {
                "baseline": raw_metadata.get("baseline"),
                "experiment": raw_metadata.get("experiment"),
                "plan": raw_metadata.get("plan"),
                "validation": raw_metadata.get("validation"),
            },
        }

    def set_session_context(self, session_id: str, report_id: str, context: Dict[str, Any]) -> None:
        self._context_store[session_id] = context
        self._context_report[session_id] = report_id

    def get_session_context(self, session_id: Optional[str], report_id: str) -> Optional[Dict[str, Any]]:
        if not session_id:
            return None
        if self._context_report.get(session_id) != report_id:
            return None
        return self._context_store.get(session_id)

    def answer_query(
        self,
        report_id: str,
        role: str,
        question: str,
        context: Dict[str, Any],
        session_id: Optional[str],
    ) -> CopilotResponse:
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        is_plot = self._is_plot_request(question)
        prefers_line = "line" in question.lower() or "time series" in question.lower() or "timeseries" in question.lower()

        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured.")

        prompt = self._build_prompt(role, question, context, session_id)
        if is_plot:
            plot_hint = "line chart (time series overlay)" if prefers_line else "appropriate chart"
            prompt += (
                "\n\nPLOT INSTRUCTIONS:\n"
                f"- Include python_script that renders a {plot_hint} comparing baseline vs experiment.\n"
                "- Use the aligned_series from context; do not load external data.\n"
                "- Return JSON only with the required keys.\n"
            )
        llm_used = False
        try:
            model_response = self._query_gemini(api_key, prompt)
            parsed = self._parse_model_response(model_response)
            if parsed:
                normalized = self._normalize_llm_response(parsed)
                response = CopilotResponse(**normalized)
                llm_used = True
            else:
                self._log_llm_parse_failure(report_id, role, question, model_response)
                # One retry with stricter JSON-only instructions
                retry_prompt = (
                    "Return JSON ONLY with keys: summary, evidence_used, suggested_next_checks, "
                    "confidence_disclaimer, decision_support, hypotheses, python_script.\n"
                    f"QUESTION: {question}\n"
                    f"CONTEXT: {json.dumps(context, default=str)}"
                )
                retry_response = self._query_gemini(api_key, retry_prompt)
                parsed_retry = self._parse_model_response(retry_response)
                if parsed_retry:
                    normalized = self._normalize_llm_response(parsed_retry)
                    response = CopilotResponse(**normalized)
                    llm_used = True
                else:
                    response = self._build_parse_failure_response()
        except Exception as exc:
            raise RuntimeError(f"LLM request failed: {exc}") from exc

        if is_plot and (not response.python_script or (prefers_line and response.python_script and "boxplot" in response.python_script.lower())):
            reprompt = (
                "Return JSON with keys: summary, evidence_used, suggested_next_checks, confidence_disclaimer, "
                "decision_support, hypotheses, python_script.\n"
                "Provide ONLY JSON. The python_script must generate a line chart overlay of baseline vs experiment "
                "using aligned_series from the context.\n"
                f"QUESTION: {question}\n"
                f"CONTEXT: {json.dumps(context, default=str)}"
            )
            model_response = self._query_gemini(api_key, reprompt)
            parsed = self._parse_model_response(model_response)
            if parsed:
                normalized = self._normalize_llm_response(parsed)
                response = CopilotResponse(**normalized)
                llm_used = True

        response.llm_used = llm_used
        self._log_interaction(report_id, role, question, response, context, llm_used=llm_used, session_id=session_id)
        self._remember(session_id, role, question, response.summary)
        return response

    def reset_memory(self, session_id: str) -> None:
        self._memory.pop(session_id, None)
        self._context_store.pop(session_id, None)
        self._context_report.pop(session_id, None)

    def _build_prompt(self, role: str, question: str, context: Dict[str, Any], session_id: Optional[str]) -> str:
        instructions = (
            "You are an engineering copilot for baseline vs experiment comparisons. "
            "Use ONLY the provided comparison report data. "
            "Never invent causes, values, or events. Do not speculate. "
            "If a requested datum is missing, say 'insufficient data' and explain what is missing. "
            "When asked for statistics (mean/max/min/median), compute from aligned_series only. "
            "Cite evidence with specific data references from the context fields. "
            "If you provide python_script, embed the aligned_series data as a JSON literal inside the script "
            "so it runs without external files. "
            "Return JSON only with keys: summary, evidence_used, suggested_next_checks, "
            "confidence_disclaimer, decision_support, hypotheses, python_script."
        )
        memory = self._memory.get(session_id or "", deque())
        payload = json.dumps({
            "role": role,
            "question": question,
            "context": context,
            "memory": list(memory),
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
                "response_mime_type": "application/json",
            },
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
                    "hypotheses": None,
                }

            # Last-resort fallback: use raw text as summary and extract python code if present.
            raw_text = text.strip()
            if not raw_text:
                return None
            code_block = None
            if "```" in raw_text:
                try:
                    code_match = re.search(r"```(?:python|py)?\s*([\s\S]*?)```", raw_text, re.IGNORECASE)
                    if code_match:
                        code_block = code_match.group(1).strip()
                        raw_text = raw_text.replace(code_match.group(0), "").strip()
                except Exception:
                    pass

            summary = raw_text[:1500] if raw_text else "Model returned code without a textual summary."
            return {
                "summary": summary,
                "evidence_used": [],
                "suggested_next_checks": [],
                "confidence_disclaimer": "LLM response parsed with a raw-text fallback.",
                "decision_support": "Decision Support Only",
                "hypotheses": None,
                "python_script": code_block,
            }

    def _normalize_llm_response(self, parsed: Dict[str, Any]) -> Dict[str, Any]:
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
                    "detail": item.get("detail", ""),
                })
            else:
                normalized_evidence.append({
                    "source": "model",
                    "detail": str(item),
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
            "hypotheses": normalized_hypotheses,
            "python_script": parsed.get("python_script"),
        }

    def _remember(self, session_id: Optional[str], role: str, question: str, summary: str) -> None:
        if not session_id:
            return
        if session_id not in self._memory:
            self._memory[session_id] = deque(maxlen=self._memory_limit)
        self._memory[session_id].append({
            "role": role,
            "question": question,
            "summary": summary,
        })

    def _log_llm_parse_failure(self, report_id: str, role: str, question: str, raw_text: str) -> None:
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "report_id": report_id,
            "role": role,
            "question": question,
            "llm_parse_failed": True,
            "raw_response_preview": raw_text[:500],
        }
        with self.log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record) + "\n")

    def _build_parse_failure_response(self) -> CopilotResponse:
        return CopilotResponse(
            summary="LLM response could not be parsed. Please retry or refine the question.",
            evidence_used=[CopilotEvidence(source="system", detail="Model output did not match expected JSON schema.")],
            suggested_next_checks=["Retry the question or ask for a specific comparison detail."],
            confidence_disclaimer="No LLM response was available due to parsing failure.",
            decision_support="Decision Support Only",
            hypotheses=None,
            python_script=None,
        )

    def _is_plot_request(self, question: str) -> bool:
        lowered = question.lower()
        plot_terms = ["plot", "chart", "graph", "boxplot", "box plot", "histogram", "scatter", "line"]
        return any(term in lowered for term in plot_terms)

    def _build_plot_response(self, question: str, context: Dict[str, Any]) -> CopilotResponse:
        aligned_series = context.get("aligned_series", {}) or {}
        available_signals = [signal for signal, points in aligned_series.items() if isinstance(points, list)]
        if not available_signals:
            return CopilotResponse(
                summary="Insufficient data to build a plot. No aligned series are available.",
                evidence_used=[CopilotEvidence(source="aligned_series", detail="No aligned series present in context.")],
                suggested_next_checks=["Run the comparison again to regenerate aligned series."],
                confidence_disclaimer="Deterministic response based on available context.",
                decision_support="Decision Support Only",
                hypotheses=None,
                python_script=None,
            )

        target_signal = available_signals[0]
        prefers_line = "line" in question.lower()
        if prefers_line:
            python_script = self._build_linechart_script(target_signal, aligned_series.get(target_signal, []))
            summary = (
                f"Generated a Python script to render a line chart overlay for baseline vs experiment "
                f"using the aligned series for {target_signal}."
            )
        else:
            python_script = self._build_boxplot_script(target_signal, aligned_series.get(target_signal, []))
            summary = (
                f"Generated a Python script to render a box plot for baseline vs experiment "
                f"using the aligned series for {target_signal}."
            )
        return CopilotResponse(
            summary=summary,
            evidence_used=[
                CopilotEvidence(source="aligned_series", detail=f"Signal {target_signal} with aligned points.")
            ],
            suggested_next_checks=["Run the Python script in the script runner to generate the plot image."],
            confidence_disclaimer="Deterministic script generated from comparison data only.",
            decision_support="Decision Support Only",
            hypotheses=None,
            python_script=python_script,
        )

    def _build_boxplot_script(self, signal: str, points: List[Dict[str, Any]]) -> str:
        baseline = [p.get("baseline") for p in points if p.get("baseline") is not None]
        experiment = [p.get("experiment") for p in points if p.get("experiment") is not None]
        payload = json.dumps({
            "signal": signal,
            "baseline": baseline,
            "experiment": experiment,
        })
        return (
            "import json\n"
            "import matplotlib.pyplot as plt\n"
            "import seaborn as sns\n"
            "\n"
            f"payload = json.loads('''{payload}''')\n"
            "baseline = payload['baseline']\n"
            "experiment = payload['experiment']\n"
            "signal = payload['signal']\n"
            "\n"
            "sns.set_theme(style='whitegrid')\n"
            "fig, ax = plt.subplots(figsize=(6, 4))\n"
            "ax.boxplot([baseline, experiment], labels=['baseline', 'experiment'])\n"
            "ax.set_title(f'Baseline vs Experiment Box Plot: {signal}')\n"
            "ax.set_ylabel(signal)\n"
            "fig.tight_layout()\n"
            "output_path = 'comparison_boxplot.png'\n"
            "fig.savefig(output_path, dpi=200)\n"
            "print(f'Saved box plot to {output_path}')\n"
        )

    def _build_linechart_script(self, signal: str, points: List[Dict[str, Any]]) -> str:
        timestamps = [p.get("timestamp") for p in points]
        baseline = [p.get("baseline") for p in points]
        experiment = [p.get("experiment") for p in points]
        payload = json.dumps({
            "signal": signal,
            "timestamps": timestamps,
            "baseline": baseline,
            "experiment": experiment,
        })
        return (
            "import json\n"
            "import matplotlib.pyplot as plt\n"
            "import pandas as pd\n"
            "\n"
            f"payload = json.loads('''{payload}''')\n"
            "signal = payload['signal']\n"
            "timestamps = payload.get('timestamps') or list(range(len(payload['baseline'])))\n"
            "baseline = payload['baseline']\n"
            "experiment = payload['experiment']\n"
            "\n"
            "try:\n"
            "    x = pd.to_datetime(timestamps)\n"
            "except Exception:\n"
            "    x = list(range(len(baseline)))\n"
            "\n"
            "fig, ax = plt.subplots(figsize=(8, 4))\n"
            "ax.plot(x, baseline, label='baseline', linewidth=2)\n"
            "ax.plot(x, experiment, label='experiment', linewidth=2)\n"
            "ax.set_title(f'Baseline vs Experiment Line Chart: {signal}')\n"
            "ax.set_ylabel(signal)\n"
            "ax.legend()\n"
            "fig.tight_layout()\n"
            "output_path = 'comparison_linechart.png'\n"
            "fig.savefig(output_path, dpi=200)\n"
            "print(f'Saved line chart to {output_path}')\n"
        )

    def _log_interaction(
        self,
        report_id: str,
        role: str,
        question: str,
        response: CopilotResponse,
        context: Dict[str, Any],
        llm_used: bool,
        session_id: Optional[str],
    ) -> None:
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "report_id": report_id,
            "role": role,
            "question": question,
            "response": response.model_dump(),
            "llm_used": llm_used,
            "session_id": session_id,
            "context_summary": {
                "signals": [s.get("signal_name") for s in context.get("signal_comparison", [])],
                "primary_deviation": context.get("comparison_summary", {}).get("primary_deviation_signal"),
            },
        }
        with self.log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record) + "\n")
