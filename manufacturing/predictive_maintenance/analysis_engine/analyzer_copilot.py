"""
Analyzer copilot for Engineering Data Analyzer results.
"""

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Deque
from collections import deque

import httpx

from ..models.data_models import CopilotResponse, CopilotEvidence
from .models import AnalyzerReport


class AnalyzerCopilotService:
    """Builds context and queries Gemini for analyzer results with guardrails."""

    def __init__(self, log_path: Optional[Path] = None):
        self.log_path = log_path or Path("predictive_maintenance") / "logs" / "analyzer_copilot.log"
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.model = os.getenv("GEMINI_MODEL")
        self._resolved_model: Optional[str] = None
        self._memory: Dict[str, Deque[Dict[str, Any]]] = {}
        self._memory_limit = 12
        self._context_store: Dict[str, Dict[str, Any]] = {}
        self._context_report: Dict[str, str] = {}
        self._data_samples: Dict[str, List[Dict[str, Any]]] = {}

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

    def cache_data_sample(self, report_id: str, sample_rows: List[Dict[str, Any]]) -> None:
        self._data_samples[report_id] = sample_rows

    def build_context(self, report: AnalyzerReport) -> Dict[str, Any]:
        report_data = report.model_dump()
        return {
            "report_id": report.report_id,
            "created_at": report.created_at,
            "profile": report_data.get("profile"),
            "plan": report_data.get("plan"),
            "results": report_data.get("results"),
            "validation": report_data.get("validation"),
            "confidence": report_data.get("confidence"),
            "explanation": report_data.get("explanation"),
            "assumptions": report_data.get("assumptions", []),
            "warnings": report_data.get("warnings", []),
            "data_sample": self._data_samples.get(report.report_id, []),
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
        if self._is_fft_request(question):
            response = self._build_fft_response(question, context)
            response.llm_used = False
            self._log_interaction(report_id, role, question, response, context, llm_used=False, session_id=session_id)
            self._remember(session_id, role, question, response.summary)
            return response
        if self._is_plot_request(question):
            response = self._build_plot_response(question, context)
            response.llm_used = False
            self._log_interaction(report_id, role, question, response, context, llm_used=False, session_id=session_id)
            self._remember(session_id, role, question, response.summary)
            return response

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
                repaired = self._repair_response(api_key, model_response)
                if repaired:
                    normalized = self._normalize_llm_response(repaired)
                    response = CopilotResponse(**normalized)
                    llm_used = True
                else:
                    self._log_llm_parse_failure(report_id, role, question, model_response)
                    response = self._build_parse_failure_response()
        except Exception as exc:
            raise RuntimeError(f"LLM request failed: {exc}") from exc

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
            "You are an engineering copilot for analyzer results. "
            "Use ONLY the provided report data. "
            "Never invent values or events. Do not speculate. "
            "If a requested datum is missing, say 'insufficient data' and explain what is missing. "
            "Cite evidence with specific data references from the context fields. "
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
            if response.status_code == 429:
                time.sleep(1.5)
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
            if '"summary"' in stripped:
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
            return None

    def _repair_response(self, api_key: str, raw_text: str) -> Optional[Dict[str, Any]]:
        model = self.resolve_model(api_key)
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        instructions = (
            "Return ONLY a valid JSON object with keys: summary, evidence_used, suggested_next_checks, "
            "confidence_disclaimer, decision_support, hypotheses, python_script. No prose. No markdown."
        )
        prompt = f"{instructions}\n\nINVALID_RESPONSE:\n{raw_text}"
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "topP": 0.8,
                "maxOutputTokens": 700,
                "response_mime_type": "application/json",
            },
        }
        with httpx.Client(timeout=20.0) as client:
            response = client.post(url, params={"key": api_key}, json=body)
            if response.status_code == 429:
                return None
            response.raise_for_status()
            data = response.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return self._parse_model_response(text)

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
            suggested_next_checks=["Retry the question or ask for a specific result detail."],
            confidence_disclaimer="No LLM response was available due to parsing failure.",
            decision_support="Decision Support Only",
            hypotheses=None,
            python_script=None,
        )

    def _is_plot_request(self, question: str) -> bool:
        lowered = question.lower()
        plot_terms = ["plot", "chart", "graph", "boxplot", "box plot", "histogram", "scatter", "line", "heatmap"]
        return any(term in lowered for term in plot_terms)

    def _is_fft_request(self, question: str) -> bool:
        lowered = question.lower()
        return "fft" in lowered or "frequency" in lowered

    def _select_numeric_columns(self, data_sample: List[Dict[str, Any]]) -> List[str]:
        if not data_sample:
            return []
        numeric_cols: List[str] = []
        for key, value in data_sample[0].items():
            if isinstance(value, (int, float)) or value is None:
                numeric_cols.append(key)
        return numeric_cols

    def _pick_target_column(self, question: str, candidates: List[str]) -> str:
        lowered = question.lower()
        for col in candidates:
            if col.lower() in lowered:
                return col
        return candidates[0] if candidates else "value"

    def _build_plot_response(self, question: str, context: Dict[str, Any]) -> CopilotResponse:
        data_sample = context.get("data_sample", []) or []
        if not data_sample:
            return CopilotResponse(
                summary="Insufficient data to build a plot. No data sample is available for this report.",
                evidence_used=[CopilotEvidence(source="data_sample", detail="No data sample cached for report.")],
                suggested_next_checks=["Re-run the analysis to refresh the analyzer data sample."],
                confidence_disclaimer="Deterministic response based on available context.",
                decision_support="Decision Support Only",
                hypotheses=None,
                python_script=None,
            )

        numeric_cols = self._select_numeric_columns(data_sample)
        if not numeric_cols:
            return CopilotResponse(
                summary="Insufficient numeric columns to build a plot.",
                evidence_used=[CopilotEvidence(source="data_sample", detail="No numeric columns detected.")],
                suggested_next_checks=["Provide numeric signals or re-run analysis with mapped numeric columns."],
                confidence_disclaimer="Deterministic response based on available context.",
                decision_support="Decision Support Only",
                hypotheses=None,
                python_script=None,
            )

        target = self._pick_target_column(question, numeric_cols)
        python_script = self._build_plot_script(question, target, numeric_cols, data_sample)
        return CopilotResponse(
            summary="Generated a Python script to render the requested plot using the cached data sample.",
            evidence_used=[
                CopilotEvidence(source="data_sample", detail=f"{len(data_sample)} cached rows available."),
                CopilotEvidence(source="signals", detail=f"Numeric columns: {', '.join(numeric_cols[:5])}"),
            ],
            suggested_next_checks=["Run the Python script in the script runner to generate the plot image."],
            confidence_disclaimer="Deterministic script generated from cached analyzer data only.",
            decision_support="Decision Support Only",
            hypotheses=None,
            python_script=python_script,
        )

    def _build_fft_response(self, question: str, context: Dict[str, Any]) -> CopilotResponse:
        data_sample = context.get("data_sample", []) or []
        if not data_sample:
            return CopilotResponse(
                summary="Insufficient data to compute FFT. No data sample is available for this report.",
                evidence_used=[CopilotEvidence(source="data_sample", detail="No data sample cached for report.")],
                suggested_next_checks=["Re-run the analysis to refresh the analyzer data sample."],
                confidence_disclaimer="Deterministic response based on available context.",
                decision_support="Decision Support Only",
                hypotheses=None,
                python_script=None,
            )

        numeric_cols = self._select_numeric_columns(data_sample)
        time_cols = [c for c in numeric_cols if c.lower() in ("hour", "minute", "second", "microsecond")]
        signal_cols = [c for c in numeric_cols if c not in time_cols]
        if not signal_cols:
            return CopilotResponse(
                summary="Insufficient numeric signal columns to compute FFT.",
                evidence_used=[CopilotEvidence(source="data_sample", detail="No numeric signal columns detected.")],
                suggested_next_checks=["Include a numeric signal column (e.g., vibration) in the dataset."],
                confidence_disclaimer="Deterministic response based on available context.",
                decision_support="Decision Support Only",
                hypotheses=None,
                python_script=None,
            )

        target = self._pick_target_column(question, signal_cols)
        python_script = self._build_fft_script(target, time_cols, data_sample)
        return CopilotResponse(
            summary="Generated a Python script to compute FFT, peak amplitude, and dominant frequency.",
            evidence_used=[
                CopilotEvidence(source="data_sample", detail=f"{len(data_sample)} cached rows available."),
                CopilotEvidence(source="signals", detail=f"Target signal: {target}"),
            ],
            suggested_next_checks=["Run the Python script in the script runner to compute FFT metrics."],
            confidence_disclaimer="Deterministic script generated from cached analyzer data only.",
            decision_support="Decision Support Only",
            hypotheses=None,
            python_script=python_script,
        )

    def _build_plot_script(
        self,
        question: str,
        target: str,
        numeric_cols: List[str],
        data_sample: List[Dict[str, Any]],
    ) -> str:
        plot_hint = question.lower()
        payload = json.dumps(data_sample[:500])
        return (
            "import json\n"
            "import pandas as pd\n"
            "import matplotlib.pyplot as plt\n"
            "import seaborn as sns\n"
            "\n"
            f"data = json.loads('''{payload}''')\n"
            "df = pd.DataFrame(data)\n"
            "sns.set_theme(style='whitegrid')\n"
            "fig, ax = plt.subplots(figsize=(7, 4))\n"
            f"target = '{target}'\n"
            f"numeric_cols = {json.dumps(numeric_cols)}\n"
            "if 'heatmap' in '" + plot_hint + "' or 'corr' in '" + plot_hint + "':\n"
            "    corr = df[numeric_cols].corr()\n"
            "    sns.heatmap(corr, ax=ax, cmap='coolwarm', center=0)\n"
            "    ax.set_title('Correlation Heatmap')\n"
            "elif 'box' in '" + plot_hint + "':\n"
            "    sns.boxplot(x=df[target], ax=ax)\n"
            "    ax.set_title(f'Boxplot: {target}')\n"
            "elif 'hist' in '" + plot_hint + "':\n"
            "    sns.histplot(df[target], ax=ax, kde=True)\n"
            "    ax.set_title(f'Histogram: {target}')\n"
            "elif 'scatter' in '" + plot_hint + "' and len(numeric_cols) >= 2:\n"
            "    x_col, y_col = numeric_cols[0], numeric_cols[1]\n"
            "    sns.scatterplot(x=df[x_col], y=df[y_col], ax=ax)\n"
            "    ax.set_title(f'Scatter: {x_col} vs {y_col}')\n"
            "else:\n"
            "    ax.plot(df[target])\n"
            "    ax.set_title(f'Time Series: {target}')\n"
            "    ax.set_xlabel('Index')\n"
            "    ax.set_ylabel(target)\n"
            "fig.tight_layout()\n"
            "output_path = 'analyzer_plot.png'\n"
            "fig.savefig(output_path, dpi=200)\n"
            "print(f'Saved plot to {output_path}')\n"
        )

    def _build_fft_script(
        self,
        target: str,
        time_cols: List[str],
        data_sample: List[Dict[str, Any]],
    ) -> str:
        payload = json.dumps(data_sample[:2000])
        time_cols_payload = json.dumps(time_cols)
        return (
            "import json\n"
            "import numpy as np\n"
            "import pandas as pd\n"
            "import matplotlib.pyplot as plt\n"
            "\n"
            f"data = json.loads('''{payload}''')\n"
            "df = pd.DataFrame(data)\n"
            f"target = '{target}'\n"
            f"time_cols = {time_cols_payload}\n"
            "values = pd.to_numeric(df[target], errors='coerce').dropna().to_numpy()\n"
            "if values.size < 4:\n"
            "    raise SystemExit('Not enough samples for FFT.')\n"
            "\n"
            "if set(time_cols) >= {'hour', 'minute', 'second', 'microsecond'}:\n"
            "    t = (\n"
            "        pd.to_numeric(df['hour'], errors='coerce') * 3600\n"
            "        + pd.to_numeric(df['minute'], errors='coerce') * 60\n"
            "        + pd.to_numeric(df['second'], errors='coerce')\n"
            "        + pd.to_numeric(df['microsecond'], errors='coerce') / 1_000_000\n"
            "    )\n"
            "    t = t.dropna().to_numpy()\n"
            "    if t.size < 2:\n"
            "        raise SystemExit('Not enough timestamp samples for FFT spacing.')\n"
            "    dt = np.median(np.diff(t))\n"
            "    if not np.isfinite(dt) or dt <= 0:\n"
            "        raise SystemExit('Invalid time spacing for FFT.')\n"
            "    fs = 1.0 / dt\n"
            "else:\n"
            "    fs = 1.0\n"
            "    print('Warning: time columns missing, assuming 1 Hz sampling.')\n"
            "\n"
            "n = values.size\n"
            "fft_vals = np.fft.rfft(values - np.mean(values))\n"
            "freqs = np.fft.rfftfreq(n, d=1.0 / fs)\n"
            "amplitudes = np.abs(fft_vals) / n\n"
            "peak_idx = int(np.argmax(amplitudes[1:]) + 1) if amplitudes.size > 1 else 0\n"
            "peak_amp = float(amplitudes[peak_idx])\n"
            "peak_freq = float(freqs[peak_idx])\n"
            "print(f'Peak amplitude: {peak_amp}')\n"
            "print(f'Dominant frequency: {peak_freq} Hz')\n"
            "\n"
            "fig, ax = plt.subplots(figsize=(7, 4))\n"
            "ax.plot(freqs, amplitudes)\n"
            "ax.set_title(f'FFT Amplitude Spectrum: {target}')\n"
            "ax.set_xlabel('Frequency (Hz)')\n"
            "ax.set_ylabel('Amplitude')\n"
            "fig.tight_layout()\n"
            "output_path = 'fft_spectrum.png'\n"
            "fig.savefig(output_path, dpi=200)\n"
            "print(f'Saved FFT plot to {output_path}')\n"
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
                "signals": list((context.get("profile", {}) or {}).get("signals", {}).keys()),
                "tests": [t.get("test") for t in (context.get("plan", {}) or {}).get("recommended_tests", [])],
            },
        }
        with self.log_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record) + "\n")
