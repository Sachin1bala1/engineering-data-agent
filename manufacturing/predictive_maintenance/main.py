"""
Predictive Maintenance API - Main FastAPI Application

This is a production-grade predictive maintenance system that uses deterministic
engineering logic to assess asset health and recommend maintenance actions.

Endpoints:
- POST /upload: Upload CSV files containing sensor data and maintenance logs
- GET /risk_summary: Get risk assessment summary for all assets

Engineering Logic:
- No machine learning - uses established industrial standards and rules
- Deterministic risk scoring based on severity, persistence, and rate of change
- Designed for integration with plant maintenance management systems
"""

import os
import json
import tempfile
import base64
import io
import shutil
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from pathlib import Path
import logging
import subprocess
import uuid
import time
import sys
import textwrap
import pandas as pd
import numpy as np

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Form
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from contextlib import asynccontextmanager
from pydantic import BaseModel, Field
import httpx

from .models.data_models import (
    UploadResponse, RiskSummaryResponse, APIError,
    AssetType, SensorDataPoint, MaintenanceLog,
    CopilotContextRequest, CopilotQueryRequest, CopilotResponse,
    ComparisonCopilotContextRequest, ComparisonCopilotQueryRequest,
    AnalyzerCopilotContextRequest, AnalyzerCopilotQueryRequest, AnalyzerCopilotContextResponse,
    ScriptRunRequest, ScriptRunResponse,
    TimeNormalizationRequest, TimeNormalizationResponse,
    AgentRecommendation, OperatorConfirmationRequest,
    TimeRecommendationRequest, ExecutionPolicyDecision,
    BatchUploadResponse, FileAnalysisSummary
)
from .ingestion.ingestion import DataIngestionService
from .baseline.baseline import BaselineService
from .rules.rules import RulesEngine
from .risk_scoring.risk_scoring import RiskScoringService
from .reports.reports import ReportsService
from .copilot.copilot import CopilotService
from .agent.time_resolution_agent import TimeResolutionAgent
from .policy.execution_policy import evaluate_execution_policy
from .time_intelligence.time_normalizer import normalize_time
from .config.env import load_environment, validate_gemini_key
from .comparison.reports import ComparisonReportStore, build_response
from .comparison.pipeline import run_comparison
from .comparison.compare_copilot import CompareCopilotService
from .analysis_engine.analyzer_copilot import AnalyzerCopilotService
from .agents.script_runner import run_python_script
from .doe.report_store import DOEReportStore
from .doe.pipeline import run_doe_comparison
from .doe.models import DOEUploadResponse
from .doe_wizard import Factor as WizardFactor, generate_design, analyze_results
from .analysis_engine.dataset_profiler import profile_dataset, load_dataset
from .analysis_engine.analysis_planner import plan as analyzer_plan
from .analysis_engine.execution_engine import run_execution as analyzer_execute
from .analysis_engine.validation_agent import validate_results as analyzer_validate
from .analysis_engine.confidence_engine import compute_confidence as analyzer_confidence
from .analysis_engine.report_builder import build_report as analyzer_build_report
from .analysis_engine.explanation_agent import explain as analyzer_explain
from .analysis_engine.error_recovery_agent import suggest_fix as analyzer_recover

_DOE_TUTOR_LAST_429: float = 0.0
_DOE_TUTOR_CACHE: Dict[str, Dict[str, Any]] = {}
_DOE_TUTOR_CACHE_TTL_SEC = 600
_DOE_TUTOR_COPILOT = CompareCopilotService()

def _clean_dataframe_for_analysis(df: pd.DataFrame) -> Dict[str, Any]:
    """Remove any rows containing NaN/inf and return cleaned df with stats."""
    original_rows = int(df.shape[0])
    df = df.copy()
    # Coerce mostly-numeric columns to numeric before cleaning
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            continue
        numeric = pd.to_numeric(df[col], errors="coerce")
        non_null = int(numeric.notna().sum())
        if non_null >= max(3, int(0.7 * len(df))):
            df[col] = numeric
    df = df.replace([np.inf, -np.inf], np.nan)
    df_clean = df.dropna(how="any")
    cleaned_rows = int(df_clean.shape[0])
    dropped_rows = original_rows - cleaned_rows
    return {
        "df": df_clean,
        "original_rows": original_rows,
        "cleaned_rows": cleaned_rows,
        "dropped_rows": dropped_rows,
    }


def _sanitize_jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _sanitize_jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize_jsonable(v) for v in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        value = float(value)
    if isinstance(value, float):
        if np.isnan(value) or np.isinf(value):
            return None
    return value


def _doe_tutor_fallback(question: str, context: Dict[str, Any]) -> str:
    q = (question or "").strip().lower()
    factors = context.get("factors") or []
    factor_names = [f.get("name") for f in factors if isinstance(f, dict) and f.get("name")]
    if "most impact" in q or "most important" in q or "impact" in q:
        base = (
            "To find which factor has the most impact, start with a main-effects plot "
            "and an ANOVA table. The factor with the largest main-effect change and "
            "the lowest p-value typically has the strongest impact. "
            "Also check interaction plots because a factor can look small alone but "
            "be important in combination."
        )
        if factor_names:
            base += f" Your current factors are: {', '.join(factor_names)}."
        return base
    if "interaction" in q:
        return (
            "Interactions mean the effect of one factor depends on another. "
            "Check interaction plots or include interaction terms in the model. "
            "If lines cross in an interaction plot, that’s a strong interaction."
        )
    if "anova" in q:
        return (
            "ANOVA tests whether factor effects are statistically significant. "
            "Look at p-values: below 0.05 is typically significant. "
            "If the model has few rows, reduce terms or add replicates."
        )
    return (
        "I’m temporarily rate-limited from the AI model. "
        "For DOE questions, use main-effects plots, interaction plots, and ANOVA. "
        "If you want a precise answer, provide the response column and factor levels."
    )




def _build_doe_summary(analysis: Dict[str, Any]) -> str:
    model = analysis.get("model_summary", {}) or {}
    r2 = model.get("r2")
    adj = model.get("adj_r2")
    coeffs = analysis.get("regression", {}).get("coefficients", [])
    top = sorted([c for c in coeffs if isinstance(c, dict) and c.get("term")], key=lambda c: abs(c.get("coef") or 0), reverse=True)
    top_terms = ", ".join([f"{c['term']} ({c['coef']:.3g})" for c in top[:3]]) if top else "Not enough data for coefficients."
    parts = []
    if r2 is not None:
        parts.append(f"Model fit R?={r2:.3f}" + (f", Adj R?={adj:.3f}" if adj is not None else ""))
    if top_terms:
        parts.append(f"Top effects by magnitude: {top_terms}.")
    warnings = analysis.get("warnings") or []
    if warnings:
        parts.append(f"Warnings: {', '.join(warnings)}")
    return " ".join(parts) if parts else "Summary unavailable."


def _build_doe_plot_explanations(analysis: Dict[str, Any]) -> Dict[str, str]:
    explanations: Dict[str, str] = {}
    if analysis.get("main_effects"):
        explanations["main_effects"] = (
            "Main effects show how the response changes across factor levels. "
            "The larger the spread between levels, the stronger the factor impact."
        )
    if analysis.get("anova"):
        explanations["anova"] = (
            "ANOVA highlights which terms are statistically significant. "
            "Lower p-values indicate stronger evidence that a factor affects the response."
        )
    correlation = analysis.get("correlation") or {}
    if correlation:
        explanations["correlation"] = (
            "Correlation heatmap shows linear relationships between numeric factors and the response. "
            "Large absolute values (close to 1) indicate stronger linear relationships; near 0 suggests weak linear association."
        )
    regression = analysis.get("regression") or {}
    if regression:
        explanations["regression"] = (
            "Predicted vs actual points should cluster around the 45? line. Wide scatter indicates model error or missing terms."
        )
    diagnostics = analysis.get("diagnostics") or {}
    if diagnostics.get("residuals_vs_fitted"):
        explanations["residuals_vs_fitted"] = (
            "Residuals should be randomly scattered around zero without patterns. Curvature or funnels indicate nonlinearity or non-constant variance."
        )
    if diagnostics.get("qq"):
        explanations["qq"] = (
            "Q-Q plot should be close to a straight line if residuals are approximately normal. Strong bends suggest non-normal errors."
        )
    if diagnostics.get("leverage"):
        explanations["leverage"] = (
            "Points with high leverage and large Cook's distance can unduly influence the model. Investigate those runs for errors or special causes."
        )
    return explanations
def _doe_tutor_cache_key(question: str, context: Dict[str, Any]) -> str:
    payload = json.dumps({"q": question, "c": context}, default=str, sort_keys=True)
    return payload
from .analysis_engine.report_store import AnalyzerReportStore
from .analysis_engine.models import AnalyzerPlanResponse, AnalyzerRunResponse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables from .env if present
load_environment()

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        validate_gemini_key()
    except RuntimeError as exc:
        logger.error(str(exc))
        raise

    logger.info("Starting Predictive Maintenance API")
    logger.info("No machine learning - using deterministic engineering logic")
    yield
    logger.info("Shutting down Predictive Maintenance API")

# Initialize FastAPI app
app = FastAPI(
    title="Predictive Maintenance API",
    description="Deterministic predictive maintenance system for industrial assets",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:3003",
        "http://127.0.0.1:3003",
        "http://localhost:3004",
        "http://127.0.0.1:3004",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
ingestion_service = DataIngestionService()
baseline_service = BaselineService()
rules_engine = RulesEngine(baseline_service)
risk_scoring_service = RiskScoringService()
reports_service = ReportsService()
copilot_service = CopilotService()
compare_copilot_service = CompareCopilotService()
analyzer_copilot_service = AnalyzerCopilotService()
time_resolution_agent = TimeResolutionAgent()

# In-memory storage for demo (production would use database)
asset_data_store: Dict[str, List[SensorDataPoint]] = {}
maintenance_data_store: Dict[str, List[MaintenanceLog]] = {}
last_assessment_store: Dict[str, Any] = {}
ingestion_report_store: Dict[str, Dict[str, Any]] = {}
operator_confirmation_store: List[Dict[str, Any]] = []
comparison_report_store = ComparisonReportStore()
comparison_job_store: Dict[str, Dict[str, Any]] = {}
doe_report_store = DOEReportStore()
doe_agent_log_store: Dict[str, List[Dict[str, Any]]] = {}
analyzer_report_store = AnalyzerReportStore()

DEFAULT_MODEL_CANDIDATES = [
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.5-pro",
    "gemini-pro-latest",
]


class AnalyzeRequest(BaseModel):
    question: str
    sessionId: str
    requestType: str = "user"
    history: List[Dict[str, Any]] = Field(default_factory=list)


class ExecPythonRequest(BaseModel):
    code: str
    sessionId: str


class GeneratePptxRequest(BaseModel):
    slides: List[Dict[str, Any]] = Field(default_factory=list)


class ContactRequest(BaseModel):
    firstName: str
    lastName: str
    email: str
    phone: Optional[str] = None
    company: Optional[str] = None
    industry: Optional[str] = None
    subject: str
    message: str
    newsletter: Optional[bool] = False


class DOEWizardFactor(BaseModel):
    name: str
    low: Optional[float] = None
    high: Optional[float] = None
    levels: Optional[List[str]] = None


class DOEWizardRecommendRequest(BaseModel):
    goal: str
    factors: int
    budget: Optional[str] = "medium"
    skill_level: Optional[str] = "beginner"
    interactions: Optional[str] = "medium"
    nonlinearity: Optional[str] = "medium"


class DOEWizardDesignRequest(BaseModel):
    method: str
    factors: List[DOEWizardFactor]
    center_points: Optional[int] = 0
    replicates: Optional[int] = 1


class DOEWizardAnalyzeRequest(BaseModel):
    response_column: str
    factors: List[DOEWizardFactor]


def _get_session_dir(session_id: str) -> Path:
    return Path(tempfile.gettempdir()) / "insight-to-deck" / session_id


def _format_history_for_prompt(history: List[Dict[str, Any]]) -> str:
    if not history:
        return ""
    trimmed = history[-12:]
    lines: List[str] = []
    for entry in trimmed:
        role = "Assistant" if entry.get("role") == "assistant" else "User"
        content = str(entry.get("content") or "").strip()
        if content:
            lines.append(f"{role}: {content}")
    return "\n".join(lines)


def _build_model_candidates() -> List[str]:
    env_candidates = [s.strip() for s in os.getenv("GEMINI_MODELS", "").split(",") if s.strip()]
    candidates = env_candidates if env_candidates else DEFAULT_MODEL_CANDIDATES
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
    last_err: Optional[Exception] = None

    for model_id in candidates:
        attempt = 0
        backoff = 0.5
        while attempt < 3:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/{model_id}:generateContent"
                body = {
                    "contents": [{"parts": [{"text": prompt}]}]
                }
                with httpx.Client(timeout=30.0) as client:
                    response = client.post(url, params={"key": api_key}, json=body)
                    response.raise_for_status()
                    data = response.json()
                return data["candidates"][0]["content"]["parts"][0]["text"]
            except Exception as exc:  # pragma: no cover - network dependent
                last_err = exc
                status = None
                msg = str(exc).lower()
                if hasattr(exc, "response") and exc.response is not None:
                    status = exc.response.status_code
                elif hasattr(exc, "status_code"):
                    status = getattr(exc, "status_code")

                is_model_not_found = status == 404 or ("not found" in msg and "model" in msg)
                if is_model_not_found:
                    break

                if status == 429 or (status and 400 <= status < 500 and status != 429):
                    if status == 429:
                        break
                    raise

                if status and status >= 500 and attempt < 2:
                    time_to_sleep = backoff
                    backoff *= 2
                    attempt += 1
                    time.sleep(time_to_sleep)
                    continue
                break

    raise last_err or RuntimeError("AI generation failed with all candidate models.")


def _resolve_python_executable() -> str:
    override = os.getenv("PYTHON_PATH") or os.getenv("SCRIPT_RUNNER_PYTHON")
    if override:
        return override
    repo_root = Path(__file__).resolve().parents[2]
    venv_dot = repo_root / ".venv" / "Scripts" / "python.exe"
    if venv_dot.exists():
        return str(venv_dot)
    venv_python = repo_root / "venv" / "Scripts" / "python.exe"
    if venv_python.exists():
        return str(venv_python)
    return sys.executable or "python"


def _reject_unsafe_code(code: str) -> Optional[str]:
    """Return a rejection reason if code tries to load external/synthetic data."""
    lowered = code.lower()
    blocked_snippets = [
        "read_csv(", "read_excel(", "to_csv(", "to_excel(",
        "requests.", "urllib", "http://", "https://", "open(",
        "np.random", "numpy.random", "random.", "faker",
        "seaborn.load_dataset", "sklearn.datasets",
    ]
    for snippet in blocked_snippets:
        if snippet in lowered:
            return f"Script contains blocked pattern: {snippet}"
    return None


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "message": "Predictive Maintenance API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "upload": "POST /upload - Upload sensor data and maintenance logs",
            "risk_summary": "GET /risk_summary - Get risk assessment summary"
        }
    }


@app.post("/api/upload")
async def upload_dataset(file: UploadFile = File(..., description="CSV or Excel dataset")):
    """Upload a dataset for the analytical workspace and cache it by session."""
    allowed_extensions = {".csv", ".xls", ".xlsx"}
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Unsupported file type. Upload CSV or Excel.")

    temp_dir = Path(tempfile.mkdtemp(prefix="upload-"))
    temp_path = temp_dir / f"upload{suffix}"
    try:
        content = await file.read()
        temp_path.write_bytes(content)

        if suffix == ".csv":
            df = pd.read_csv(temp_path)
        else:
            df = pd.read_excel(temp_path)

        if df.empty:
            raise HTTPException(status_code=400, detail="No data found in file.")

        df.columns = [str(c).strip() for c in df.columns]
        session_id = uuid.uuid4().hex
        session_dir = _get_session_dir(session_id)
        session_dir.mkdir(parents=True, exist_ok=True)
        df.to_csv(session_dir / "data.csv", index=False)

        preview = df.head(5).fillna("").to_dict(orient="records")
        return {
            "sessionId": session_id,
            "fileName": file.filename,
            "rowCount": int(df.shape[0]),
            "columns": list(df.columns),
            "preview": preview,
        }
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@app.post("/api/analyze")
async def analyze_dataset(payload: AnalyzeRequest):
    """Run Gemini analysis on the cached dataset."""
    session_dir = _get_session_dir(payload.sessionId)
    csv_path = session_dir / "data.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="Data for this session not found. Please upload again.")

    with csv_path.open("r", encoding="utf-8", errors="ignore") as handle:
        lines = []
        for _ in range(6):
            line = handle.readline()
            if not line:
                break
            lines.append(line.rstrip("\n"))
    if not lines:
        raise HTTPException(status_code=400, detail="Stored data is empty.")

    columns = [c.strip() for c in lines[0].split(",") if c.strip()]
    sample_data = "\n".join(lines[:6])

    question = payload.question or ""
    lower_question = question.lower()
    is_viz_request = any(token in lower_question for token in ["chart", "plot", "visualize", "graph", "visualization"])

    history_text = _format_history_for_prompt(payload.history)
    history_context = f"\nPrevious conversation:\n{history_text}\n\n" if history_text else ""

    if payload.requestType == "initial":
        prompt = (
            f"{history_context}You are an expert data analyst. A pandas DataFrame named 'df' is in memory.\n\n"
            f"DATASET INFO:\n- Columns: {', '.join(columns)}\n- Sample:\n{sample_data}\n\n"
            f"USER REQUEST: \"{question}\"\n\n"
            "YOUR TASK:\n"
            "Provide a comprehensive, professional analysis of the dataset in Markdown format. Your report must include:\n"
            "1. A summary of data quality, identifying any missing values or potential issues.\n"
            "2. A table of descriptive statistics for each numerical column.\n"
            "3. A detailed interpretation of the statistics and what they imply.\n"
            "4. After the text analysis, provide a SINGLE, COMPLETE Python script in a python block to generate a correlation matrix heatmap.\n"
            "- The script must use the 'df' DataFrame.\n"
            "- Do not use plt.show().\n"
            "- Do not include any other visualizations in this script.\n"
            "- Do NOT use df.to_markdown() or to_markdown.\n"
            "- Save the plot with plt.savefig('plot.png').\n"
            "- Do NOT invent values or fabricate statistics; use df only. If uncertain, say insufficient data.\n"
        )
    elif is_viz_request:
        prompt = (
            f"{history_context}You are a Python data visualization bot. Your SOLE purpose is to generate a Python script to plot user data.\n"
            "A pandas DataFrame named 'df' is already in memory.\n\n"
            f"DATASET COLUMNS: {', '.join(columns)}\n"
            f"USER REQUEST: \"{question}\"\n\n"
            "ABSOLUTE RULES:\n"
            "1. Your ENTIRE response MUST be ONLY a Python script wrapped in a single fenced code block that starts with \"```python\" and ends with \"```\".\n"
            "2. DO NOT write ANY text, explanation, or narrative outside that single fenced block.\n"
            "3. The script MUST generate ONE plot.\n"
            "4. Use the 'df' DataFrame. DO NOT load data.\n"
            "5. Do NOT use plt.show().\n"
            "6. Do NOT print tables or use .to_markdown().\n"
            "7. If you break these rules, the system will fail.\n"
            "8. Do NOT create synthetic/random data; use df only.\n"
            "9. Save the plot with plt.savefig('plot.png').\n"
        )
    else:
        prompt = (
            f"{history_context}You are an expert data analyst. A pandas DataFrame named 'df' is in memory with columns: {', '.join(columns)}.\n"
            f"The user's request is: \"{question}\"\n\n"
            "Please provide a concise, data-driven answer in Markdown format.\n"
            "- Use the 'df' DataFrame for any calculations. Do not load the data yourself.\n"
            "- If you provide tables, use Markdown.\n"
            "- Do NOT invent values or fabricate statistics; use df only. If uncertain, say insufficient data.\n"
        )

    try:
        response_text = _generate_with_fallback(prompt)
        return {"answer": response_text}
    except Exception as exc:
        status = None
        if hasattr(exc, "response") and exc.response is not None:
            status = exc.response.status_code
        msg = str(exc)
        if status in (429, 503):
            return JSONResponse(status_code=status, content={"error": msg, "retryable": True})
        raise HTTPException(status_code=500, detail=msg)


@app.post("/api/exec-python")
async def exec_python(payload: ExecPythonRequest):
    """Execute AI-generated Python with cached dataset context."""
    session_dir = _get_session_dir(payload.sessionId)
    csv_path = session_dir / "data.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="Data for this session not found. Please upload again.")

    session_dir.mkdir(parents=True, exist_ok=True)
    plot_path = session_dir / "plot.png"
    result_path = session_dir / "result.json"
    user_code_path = session_dir / "user_code.py"
    script_path = session_dir / "script.py"

    if result_path.exists():
        result_path.unlink()
    if plot_path.exists():
        plot_path.unlink()

    user_code = payload.code or ""
    user_code_path.write_text(user_code if user_code.endswith("\n") else f"{user_code}\n", encoding="utf-8")

    csv_str = str(csv_path).replace("\\", "\\\\")
    plot_str = str(plot_path).replace("\\", "\\\\")
    result_str = str(result_path).replace("\\", "\\\\")
    user_code_str = str(user_code_path).replace("\\", "\\\\")

    script_body = textwrap.dedent(f"""
        RESULT_PATH = r\"{result_str}\"

        import pandas as pd
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import json
        import io
        from contextlib import redirect_stdout
        import numpy as np
        from pandas import Timedelta
        from pandas.api.types import (
            is_object_dtype,
            is_datetime64_any_dtype,
            is_datetime64tz_dtype,
            is_timedelta64_dtype,
        )

        def _noop_show(*args, **kwargs):
            return None

        plt.show = _noop_show

        def _to_seconds(value):
            arr = np.asarray(value)
            if arr.dtype == object:
                flat = arr.reshape(-1)
                series = pd.Series(flat)
                dt_candidate = pd.to_datetime(series, errors='coerce', utc=True)
                if dt_candidate.notna().sum() >= max(1, int(len(series) * 0.5)):
                    arr = dt_candidate.dt.tz_convert(None).to_numpy(dtype='datetime64[ns]').reshape(arr.shape)
                else:
                    td_candidate = pd.to_timedelta(series, errors='coerce')
                    if td_candidate.notna().sum() >= max(1, int(len(series) * 0.5)):
                        arr = td_candidate.to_numpy(dtype='timedelta64[ns]').reshape(arr.shape)
                    else:
                        return value
            if np.issubdtype(arr.dtype, np.datetime64):
                return arr.astype('datetime64[ns]').astype('float64') / 1e9
            if np.issubdtype(arr.dtype, np.timedelta64):
                return arr.astype('timedelta64[ns]').astype('float64') / 1e9
            return value

        def _wrap_temporal_ufunc(fn):
            def wrapper(a, b, *args, **kwargs):
                try:
                    if hasattr(a, 'dtype') or isinstance(a, (list, tuple)):
                        a = _to_seconds(a)
                    if hasattr(b, 'dtype') or isinstance(b, (list, tuple)):
                        b = _to_seconds(b)
                except Exception:
                    pass
                return fn(a, b, *args, **kwargs)
            return wrapper

        for _op in ('divide', 'true_divide', 'floor_divide', 'greater', 'greater_equal', 'less', 'less_equal'):
            if hasattr(np, _op):
                setattr(np, _op, _wrap_temporal_ufunc(getattr(np, _op)))

        if hasattr(np, 'diff'):
            _orig_diff = np.diff
            def _safe_diff(a, *args, **kwargs):
                try:
                    a = _to_seconds(a)
                except Exception:
                    pass
                return _orig_diff(a, *args, **kwargs)
            np.diff = _safe_diff

        if hasattr(np, 'gradient'):
            _orig_gradient = np.gradient
            def _safe_gradient(a, *args, **kwargs):
                try:
                    a = _to_seconds(a)
                except Exception:
                    pass
                return _orig_gradient(a, *args, **kwargs)
            np.gradient = _safe_gradient

        if hasattr(np, 'fft'):
            if hasattr(np.fft, 'fftfreq'):
                _orig_fftfreq = np.fft.fftfreq
                def _safe_fftfreq(n, d=1.0):
                    try:
                        d = _to_seconds(d)
                    except Exception:
                        pass
                    return _orig_fftfreq(n, d)
                np.fft.fftfreq = _safe_fftfreq
            if hasattr(np.fft, 'rfftfreq'):
                _orig_rfftfreq = np.fft.rfftfreq
                def _safe_rfftfreq(n, d=1.0):
                    try:
                        d = _to_seconds(d)
                    except Exception:
                        pass
                    return _orig_rfftfreq(n, d)
                np.fft.rfftfreq = _safe_rfftfreq

        def _timedelta_compare_wrapper(op_name):
            original = getattr(Timedelta, op_name, None)
            if original is None:
                return
            def _wrapped(self, other):
                try:
                    if isinstance(other, (int, float, np.number)):
                        other = Timedelta(seconds=float(other))
                except Exception:
                    pass
                return original(self, other)
            setattr(Timedelta, op_name, _wrapped)

        for _cmp in ('__le__', '__lt__', '__ge__', '__gt__'):
            _timedelta_compare_wrapper(_cmp)

        TEMPORAL_KEYWORDS = ('time', 'date', 'timestamp', 'datetime', 'ts')

        def _likely_temporal(name):
            lower = str(name or '').lower()
            return any(token in lower for token in TEMPORAL_KEYWORDS)

        def _convert_object_temporal_columns(frame):
            for col in frame.columns:
                series = frame[col]
                if not (is_object_dtype(series) or _likely_temporal(col)):
                    continue
                dt_candidate = pd.to_datetime(series, errors='coerce', utc=True)
                if dt_candidate.notna().sum() >= max(3, int(len(series) * 0.6)):
                    frame[col] = dt_candidate.dt.tz_convert(None)
                    continue
                td_candidate = pd.to_timedelta(series, errors='coerce')
                if td_candidate.notna().sum() >= max(3, int(len(series) * 0.6)):
                    frame[col] = td_candidate

        def _datetime_series_to_seconds(series):
            arr = series
            if is_datetime64tz_dtype(arr):
                arr = arr.dt.tz_convert('UTC').dt.tz_localize(None)
            arr = arr.astype('datetime64[ns]')
            sec = arr.view('int64').astype('float64') / 1e9
            mask = series.isna()
            if mask.any():
                sec[mask.to_numpy()] = np.nan
            return pd.Series(sec, index=series.index)

        def _timedelta_series_to_seconds(series):
            td = series.astype('timedelta64[ns]')
            sec = td.view('int64').astype('float64') / 1e9
            mask = series.isna()
            if mask.any():
                sec[mask.to_numpy()] = np.nan
            return pd.Series(sec, index=series.index)

        def _normalize_temporal_columns(frame):
            for col in frame.columns:
                series = frame[col]
                if is_datetime64_any_dtype(series) or is_datetime64tz_dtype(series):
                    backup_col = f"{col}_datetime\"
                    if backup_col not in frame.columns:
                        frame[backup_col] = series
                    ts_col = f"{col}_ts\"
                    frame[ts_col] = _datetime_series_to_seconds(series)
                    frame[col] = frame[ts_col]
                elif is_timedelta64_dtype(series):
                    backup_col = f"{col}_timedelta\"
                    if backup_col not in frame.columns:
                        frame[backup_col] = series
                    sec_col = f"{col}_seconds\"
                    frame[sec_col] = _timedelta_series_to_seconds(series)
                    frame[col] = frame[sec_col]

        output = {{}}
        debug_output = io.StringIO()

        try:
            df = pd.read_csv(r\"{csv_str}\")
            debug_output.write(\"---\\nInitial DataFrame Info---\\n\")
            df.info(buf=debug_output)
            debug_output.write(\"\\n--- Initial DataFrame Head ---\\n\")
            debug_output.write(df.head(3).to_string()[:2000])

            if 'time' in df.columns:
                try:
                    df['time'] = pd.to_datetime(df['time'], unit='d', origin='1899-12-30')
                except (ValueError, TypeError):
                    try:
                        df['time'] = pd.to_datetime(df['time'])
                    except (ValueError, TypeError):
                        pass

            if 'value' in df.columns:
                df['value'] = pd.to_numeric(df['value'], errors='coerce')
                df.dropna(subset=['value'], inplace=True)

            _convert_object_temporal_columns(df)
            _normalize_temporal_columns(df)

            debug_output.write(\"\\n\\n--- Processed DataFrame Info ---\\n\")
            df.info(buf=debug_output)
            debug_output.write(\"\\n--- Processed DataFrame Head ---\\n\")
            debug_output.write(df.head(3).to_string()[:2000])

            stdout_capture = io.StringIO()
            with redirect_stdout(stdout_capture):
                user_code_file = r\"{user_code_str}\"
                with open(user_code_file, 'r', encoding='utf-8') as f:
                    user_code = f.read()
                exec(compile(user_code, user_code_file, 'exec'), globals(), locals())

            output['success'] = True
            output['output'] = stdout_capture.getvalue()

            if plt.get_fignums():
                plt.savefig(r\"{plot_str}\")
                output['plot'] = 'plot.png'
                plt.close('all')

            output['debug'] = debug_output.getvalue()
            with open(RESULT_PATH, 'w', encoding='utf-8') as _result_file:
                json.dump(output, _result_file, default=repr)
            print(\"__RESULT_WRITTEN__\")
        except Exception as e:
            import traceback
            output = {{
                'error': str(e),
                'traceback': traceback.format_exc(),
                'success': False
            }}
            output['debug'] = ''
            with open(RESULT_PATH, 'w', encoding='utf-8') as _result_file:
                json.dump(output, _result_file, default=repr)
            print(\"__RESULT_WRITTEN__\")
    """)

    script_path.write_text(script_body, encoding="utf-8")
    env = os.environ.copy()
    env["MPLBACKEND"] = "Agg"

    try:
        result = subprocess.run(
            [_resolve_python_executable(), str(script_path)],
            cwd=str(session_dir),
            env=env,
            capture_output=True,
            text=True,
            timeout=20,
        )
    except Exception as exc:
        return {"success": False, "error": str(exc)}

    result_payload: Dict[str, Any]
    if result_path.exists():
        try:
            result_payload = json.loads(result_path.read_text(encoding="utf-8"))
        except Exception as exc:
            result_payload = {"success": False, "error": f"Failed to parse Python output: {exc}"}
    else:
        try:
            result_payload = json.loads(result.stdout)
        except Exception:
            result_payload = {
                "success": False,
                "error": "Failed to parse Python script output.",
                "details": result.stdout,
                "stderr": result.stderr,
            }

    if plot_path.exists():
        data = base64.b64encode(plot_path.read_bytes()).decode("ascii")
        result_payload["plotData"] = f"data:image/png;base64,{data}"

    return result_payload


@app.post("/api/generate-pptx")
async def generate_pptx(payload: GeneratePptxRequest, background_tasks: BackgroundTasks):
    """Generate a PPTX file from slide JSON."""
    try:
        from pptx import Presentation
        from pptx.util import Inches, Pt
        from pptx.enum.text import PP_ALIGN
        from PIL import Image
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Missing PPTX dependencies: {exc}") from exc

    temp_dir = Path(tempfile.mkdtemp(prefix="pptx-"))
    pptx_path = temp_dir / "presentation.pptx"

    prs = Presentation()

    def add_textbox(slide, left, top, width, height, text, size=18, bold=False, align_center=False):
        box = slide.shapes.add_textbox(left, top, width, height)
        tf = box.text_frame
        tf.clear()
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = text or ""
        font = run.font
        font.size = Pt(size)
        font.bold = bold
        if align_center:
            p.alignment = PP_ALIGN.CENTER
        return box

    for idx, slide_data in enumerate(payload.slides or []):
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        margin = Inches(0.5)
        title_h = Inches(1.0)
        inner_w = prs.slide_width - 2 * margin
        content_top = Inches(0.2)

        add_textbox(
            slide,
            margin,
            content_top,
            inner_w,
            title_h,
            slide_data.get("title", "Slide"),
            size=36,
            bold=True,
            align_center=True,
        )

        top_after_title = content_top + title_h + Inches(0.2)
        total_rem = prs.slide_height - top_after_title - Inches(0.3)
        main_h = int(total_rem * 0.7)
        findings_h = int(total_rem - main_h)

        img_b64 = slide_data.get("imageBase64")
        if isinstance(img_b64, str) and len(img_b64) > 10:
            try:
                if "," in img_b64:
                    img_b64 = img_b64.split(",", 1)[1]
                img_bytes = base64.b64decode(img_b64)
                image = Image.open(io.BytesIO(img_bytes))
                img_width, img_height = image.size
                image_stream = io.BytesIO(img_bytes)
                pic = slide.shapes.add_picture(image_stream, margin, top_after_title)
                max_h = main_h
                max_w = inner_w
                scale = min(max_w / pic.width, max_h / pic.height)
                pic.width = int(pic.width * scale)
                pic.height = int(pic.height * scale)
                pic.left = margin + int((inner_w - pic.width) / 2)
                pic.top = top_after_title + int((main_h - pic.height) / 2)
            except Exception:
                add_textbox(slide, margin, top_after_title, inner_w, main_h, slide_data.get("text", ""), size=18)
        else:
            add_textbox(slide, margin, top_after_title, inner_w, main_h, slide_data.get("text", ""), size=18)

        findings_top = top_after_title + main_h + Inches(0.1)
        findings = slide_data.get("findings") or ""
        if findings:
            add_textbox(slide, margin, findings_top, inner_w, Inches(0.3), "Findings", size=20, bold=True)
            add_textbox(
                slide,
                margin,
                findings_top + Inches(0.35),
                inner_w,
                max(findings_h - Inches(0.35), Inches(0.8)),
                findings,
                size=16,
            )

    if len(prs.slides) == 0:
        prs.slides.add_slide(prs.slide_layouts[5])

    prs.save(str(pptx_path))
    background_tasks.add_task(shutil.rmtree, temp_dir, ignore_errors=True)
    return FileResponse(
        path=str(pptx_path),
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename="analysis-presentation.pptx",
    )


@app.post("/api/contact")
async def submit_contact(payload: ContactRequest):
    """Store contact form submissions in JSON."""
    repo_root = Path(__file__).resolve().parents[3]
    submissions_path = repo_root / "ai_data_interpreter" / "backend" / "contact-form-submissions.json"
    submissions_path.parent.mkdir(parents=True, exist_ok=True)

    record = payload.model_dump()
    record["submittedAt"] = datetime.utcnow().isoformat() + "Z"

    if submissions_path.exists():
        try:
            existing = json.loads(submissions_path.read_text(encoding="utf-8"))
            if not isinstance(existing, list):
                existing = []
        except Exception:
            existing = []
    else:
        existing = []

    existing.append(record)
    submissions_path.write_text(json.dumps(existing, indent=2), encoding="utf-8")
    return {"success": True}


@app.post("/upload", response_model=UploadResponse)
async def upload_data(
    background_tasks: BackgroundTasks,
    sensor_data: UploadFile = File(..., description="CSV file with sensor readings"),
    maintenance_logs: Optional[UploadFile] = File(None, description="CSV file with maintenance history"),
    asset_id: Optional[str] = Form(None),
    asset_type: Optional[str] = Form(None),
    default_date: Optional[str] = Form(None),
    start_date: Optional[str] = Form(None)
):
    """
    Upload CSV files containing sensor data and maintenance logs.

    **Sensor Data CSV Format:**
    - timestamp: ISO 8601 datetime
    - asset_id: Asset identifier
    - temperature: Temperature in Celsius
    - vibration: Vibration amplitude in mm/s
    - run_hours: Cumulative operating hours

    **Maintenance Logs CSV Format:**
    - asset_id: Asset identifier
    - failure_type: Type of failure/maintenance
    - failure_date: ISO 8601 datetime of failure/maintenance

    Returns processing results and any errors encountered.
    """
    try:
        # Validate file types
        allowed_extensions = {'.csv', '.xls', '.xlsx'}
        sensor_suffix = Path(sensor_data.filename or "").suffix.lower()
        if sensor_suffix not in allowed_extensions:
            raise HTTPException(status_code=400, detail="Sensor data must be a CSV or Excel file")

        if maintenance_logs:
            maintenance_suffix = Path(maintenance_logs.filename or "").suffix.lower()
            if maintenance_suffix not in allowed_extensions:
                raise HTTPException(status_code=400, detail="Maintenance logs must be a CSV or Excel file")

        # Save uploaded files temporarily
        with tempfile.TemporaryDirectory() as temp_dir:
            sensor_file_path = os.path.join(temp_dir, f"sensor_data{sensor_suffix}")
            maintenance_file_path = (
                os.path.join(temp_dir, f"maintenance_logs{maintenance_suffix}")
                if maintenance_logs else None
            )

            # Save sensor data file
            with open(sensor_file_path, "wb") as f:
                content = await sensor_data.read()
                f.write(content)

            # Save maintenance logs file if provided
            if maintenance_logs:
                with open(maintenance_file_path, "wb") as f:
                    content = await maintenance_logs.read()
                    f.write(content)

            # Resolve asset context
            resolved_asset_id = asset_id or "ASSET-UNKNOWN"
            if asset_type:
                try:
                    resolved_asset_type = AssetType(asset_type)
                except ValueError:
                    raise HTTPException(status_code=400, detail="Invalid asset_type provided")
            else:
                resolved_asset_type = determine_asset_type(resolved_asset_id)

            # Parse optional dates
            parsed_default_date = datetime.fromisoformat(default_date).date() if default_date else None
            parsed_start_date = datetime.fromisoformat(start_date).date() if start_date else None

            # Process sensor data (agentic ingestion)
            sensor_points, sensor_errors, sensor_warnings, report = ingestion_service.process_sensor_file(
                sensor_file_path,
                resolved_asset_id,
                resolved_asset_type,
                default_date=parsed_default_date,
                start_date=parsed_start_date
            )

            if asset_id is None:
                report["assumptions"] = report.get("assumptions", []) + ["asset_id not provided; defaulted to ASSET-UNKNOWN"]
            if asset_type is None:
                report["assumptions"] = report.get("assumptions", []) + [f"asset_type inferred as {resolved_asset_type.value}"]

            ingestion_report_store[report["report_id"]] = report

            # Process maintenance logs if provided
            maintenance_records = []
            maintenance_errors = []
            if maintenance_file_path:
                maintenance_records, maintenance_errors = ingestion_service.process_maintenance_csv(
                    maintenance_file_path
                )

            # Store processed data
            all_errors = sensor_errors + maintenance_errors
            all_warnings = sensor_warnings

            if sensor_points:
                # Group sensor data by asset
                for point in sensor_points:
                    if point.asset_id not in asset_data_store:
                        asset_data_store[point.asset_id] = []
                    asset_data_store[point.asset_id].append(point)

                logger.info(f"Stored {len(sensor_points)} sensor readings for {len(set(p.asset_id for p in sensor_points))} assets")

            if maintenance_records:
                # Group maintenance data by asset
                for record in maintenance_records:
                    if record.asset_id not in maintenance_data_store:
                        maintenance_data_store[record.asset_id] = []
                    maintenance_data_store[record.asset_id].append(record)

                logger.info(f"Stored {len(maintenance_records)} maintenance records for {len(set(r.asset_id for r in maintenance_records))} assets")

            # Get updated asset counts
            updated_assets = set()
            if sensor_points:
                updated_assets.update(set(p.asset_id for p in sensor_points))
            if maintenance_records:
                updated_assets.update(set(r.asset_id for r in maintenance_records))

            # Trigger background risk assessment update
            background_tasks.add_task(update_risk_assessments)

            return UploadResponse(
                success=len(sensor_points) > 0,
                message=f"Processed {len(sensor_points)} sensor readings and {len(maintenance_records)} maintenance records",
                records_processed=len(sensor_points) + len(maintenance_records),
                assets_updated=list(updated_assets),
                errors=all_errors,
                warnings=all_warnings,
                ingestion_report_id=report.get("report_id"),
                transformation_report=report
            )

    except Exception as e:
        logger.error(f"Upload processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")


@app.post("/upload/batch", response_model=BatchUploadResponse)
async def upload_batch_data(
    background_tasks: BackgroundTasks,
    sensor_files: List[UploadFile] = File(..., description="Sensor data files (CSV or Excel)"),
    asset_id: Optional[str] = Form(None),
    asset_type: Optional[str] = Form(None),
    default_date: Optional[str] = Form(None),
    start_date: Optional[str] = Form(None)
):
    """
    Upload multiple sensor files and return per-file deterministic analysis results.
    """
    try:
        allowed_extensions = {'.csv', '.xls', '.xlsx'}
        parsed_default_date = datetime.fromisoformat(default_date).date() if default_date else None
        parsed_start_date = datetime.fromisoformat(start_date).date() if start_date else None

        file_results: List[FileAnalysisSummary] = []
        total_records_processed = 0
        all_assets_updated: set[str] = set()

        with tempfile.TemporaryDirectory() as temp_dir:
            for sensor_file in sensor_files:
                file_name = sensor_file.filename or "unknown"
                sensor_suffix = Path(file_name).suffix.lower()
                if sensor_suffix not in allowed_extensions:
                    file_results.append(FileAnalysisSummary(
                        file_name=file_name,
                        success=False,
                        message="Unsupported file type",
                        records_processed=0,
                        assets_updated=[],
                        errors=["Sensor data must be a CSV or Excel file"],
                        warnings=[]
                    ))
                    continue

                sensor_file_path = os.path.join(temp_dir, f"sensor_data_{Path(file_name).stem}{sensor_suffix}")
                with open(sensor_file_path, "wb") as f:
                    content = await sensor_file.read()
                    f.write(content)

                resolved_asset_id = asset_id or Path(file_name).stem.upper()
                if asset_type:
                    try:
                        resolved_asset_type = AssetType(asset_type)
                    except ValueError:
                        file_results.append(FileAnalysisSummary(
                            file_name=file_name,
                            success=False,
                            message="Invalid asset_type provided",
                            records_processed=0,
                            assets_updated=[],
                            errors=["Invalid asset_type provided"],
                            warnings=[]
                        ))
                        continue
                else:
                    resolved_asset_type = determine_asset_type(resolved_asset_id)

                sensor_points, sensor_errors, sensor_warnings, report = ingestion_service.process_sensor_file(
                    sensor_file_path,
                    resolved_asset_id,
                    resolved_asset_type,
                    default_date=parsed_default_date,
                    start_date=parsed_start_date
                )

                if asset_id is None:
                    report["assumptions"] = report.get("assumptions", []) + [
                        f"asset_id inferred from file name as {resolved_asset_id}"
                    ]
                if asset_type is None:
                    report["assumptions"] = report.get("assumptions", []) + [
                        f"asset_type inferred as {resolved_asset_type.value}"
                    ]

                ingestion_report_store[report["report_id"]] = report

                if sensor_points:
                    for point in sensor_points:
                        if point.asset_id not in asset_data_store:
                            asset_data_store[point.asset_id] = []
                        asset_data_store[point.asset_id].append(point)

                updated_assets = set(p.asset_id for p in sensor_points) if sensor_points else set()
                all_assets_updated.update(updated_assets)
                total_records_processed += len(sensor_points)

                risk_assessments = _build_risk_assessments_for_points(sensor_points)

                file_results.append(FileAnalysisSummary(
                    file_name=file_name,
                    success=len(sensor_points) > 0 and not sensor_errors,
                    message=f"Processed {len(sensor_points)} sensor readings",
                    records_processed=len(sensor_points),
                    assets_updated=list(updated_assets),
                    errors=sensor_errors,
                    warnings=sensor_warnings,
                    ingestion_report_id=report.get("report_id"),
                    risk_assessments=risk_assessments
                ))

        background_tasks.add_task(update_risk_assessments)

        return BatchUploadResponse(
            success=any(result.success for result in file_results),
            message=f"Processed {len(file_results)} files",
            files_processed=len(file_results),
            total_records_processed=total_records_processed,
            assets_updated=list(all_assets_updated),
            file_results=file_results
        )

    except Exception as e:
        logger.error(f"Batch upload processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")


@app.get("/risk_summary", response_model=RiskSummaryResponse)
async def get_risk_summary():
    """
    Get risk assessment summary for all assets.

    Returns a comprehensive risk summary including:
    - Total number of assets monitored
    - Count of high-risk and critical assets
    - Detailed risk assessments for each asset
    - Recommended maintenance actions

    Each assessment includes:
    - Risk score (0-100)
    - Risk level (LOW/MEDIUM/HIGH/CRITICAL)
    - Potential failure mode
    - Recommended maintenance action
    - Confidence level in the assessment
    """
    try:
        # Check if we have any data
        if not asset_data_store:
            return RiskSummaryResponse(
                total_assets=0,
                high_risk_assets=0,
                critical_assets=0,
                assessments=[],
                generated_at=datetime.now()
            )

        # Generate risk assessments for all assets
        assessments = []
        for asset_id, sensor_data in asset_data_store.items():
            try:
                # Determine asset type (simplified - production would have asset registry)
                asset_type = determine_asset_type(asset_id)

                # Get maintenance history
                maintenance_history = maintenance_data_store.get(asset_id, [])

                # Evaluate failure modes
                failure_mode_assessments = rules_engine.evaluate_asset(
                    asset_id, asset_type, sensor_data, maintenance_history
                )

                # Compute risk assessment
                assessment = risk_scoring_service.compute_risk_assessment(
                    asset_id, asset_type, failure_mode_assessments, sensor_data, maintenance_history
                )

                assessments.append(assessment)

            except Exception as e:
                logger.error(f"Error assessing asset {asset_id}: {str(e)}")
                continue

        # Generate risk summary report
        risk_summary = reports_service.generate_risk_summary_report(assessments)

        return risk_summary

    except Exception as e:
        logger.error(f"Risk summary generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Risk assessment error: {str(e)}")


@app.get("/asset/{asset_id}")
async def get_asset_details(asset_id: str):
    """
    Get detailed assessment for a specific asset.

    Returns comprehensive information about an asset's condition,
    including sensor data, maintenance history, and risk assessment.
    """
    try:
        if asset_id not in asset_data_store:
            raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")

        sensor_data = asset_data_store[asset_id]
        maintenance_history = maintenance_data_store.get(asset_id, [])

        # Determine asset type
        asset_type = determine_asset_type(asset_id)

        # Generate assessment
        failure_mode_assessments = rules_engine.evaluate_asset(
            asset_id, asset_type, sensor_data, maintenance_history
        )

        assessment = risk_scoring_service.compute_risk_assessment(
            asset_id, asset_type, failure_mode_assessments, sensor_data, maintenance_history
        )

        # Get baseline information
        baselines = baseline_service.compute_baselines(sensor_data[-100:])  # Last 100 readings
        asset_baselines = baselines.get(asset_id, [])

        latest_timestamp = max(s.timestamp for s in sensor_data)
        sensor_history = _build_sensor_history(sensor_data)
        failure_mode_timeline = _build_failure_mode_timeline(
            failure_mode_assessments, latest_timestamp
        )
        baseline_bands = _build_baseline_bands(asset_baselines)

        return {
            "asset_id": asset_id,
            "asset_type": asset_type.value,
            "risk_assessment": assessment,
            "sensor_readings_count": len(sensor_data),
            "maintenance_records_count": len(maintenance_history),
            "sensor_history": sensor_history,
            "baseline_bands": baseline_bands,
            "failure_mode_timeline": failure_mode_timeline,
            "baseline_metrics": [
                {
                    "parameter": b.parameter,
                    "mean": round(b.baseline_metrics.mean, 2),
                    "std": round(b.baseline_metrics.std, 2),
                    "window_size": b.baseline_metrics.window_size
                }
                for b in asset_baselines
            ],
            "triggered_rules": [
                {
                    "rule_name": r.failure_mode_id,
                    "severity_score": r.severity_score,
                    "confidence": round(r.confidence_score, 2),
                    "description": r.explanation
                }
                for r in failure_mode_assessments
            ],
            "failure_mode_breakdown": [
                {
                    "failure_mode_id": r.failure_mode_id,
                    "stage": r.stage.value,
                    "risk_score": round(r.risk_score, 1),
                    "confidence": round(r.confidence_score, 2),
                    "skill_level_required": r.skill_level_required.value,
                    "recommended_action": r.recommended_action,
                    "explanation": r.explanation,
                    "indicators": [
                        {
                            "name": ind.name,
                            "value": ind.value,
                            "status": ind.status,
                            "evidence": ind.evidence,
                            "window_hours": ind.window_hours
                        }
                        for ind in r.indicators
                    ]
                }
                for r in failure_mode_assessments
            ],
            "last_updated": max(s.timestamp for s in sensor_data).isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Asset details error for {asset_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Asset details error: {str(e)}")


@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring."""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "assets_monitored": len(asset_data_store),
        "total_sensor_readings": sum(len(data) for data in asset_data_store.values()),
        "total_maintenance_records": sum(len(data) for data in maintenance_data_store.values())
    }


@app.get("/failure_modes/catalog")
async def get_failure_mode_catalog():
    """Return supported failure modes and engineering rationale."""
    return {
        "failure_modes": [item.model_dump() for item in rules_engine.catalog()],
        "generated_at": datetime.now().isoformat()
    }


@app.get("/ingestion/report/{report_id}")
async def get_ingestion_report(report_id: str):
    """Retrieve transformation report for an ingestion event."""
    report = ingestion_report_store.get(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Ingestion report not found")
    return report


@app.post("/time/normalize", response_model=TimeNormalizationResponse)
async def normalize_time_value(payload: TimeNormalizationRequest):
    """Normalize a raw time value using deterministic time intelligence."""
    row_date = datetime.fromisoformat(payload.row_date).date() if payload.row_date else None
    default_date = datetime.fromisoformat(payload.default_date).date() if payload.default_date else None
    start_date = datetime.fromisoformat(payload.start_date).date() if payload.start_date else None

    record, _ = normalize_time(
        raw_value=payload.raw_value,
        row_date=row_date,
        file_metadata=None,
        default_date=default_date,
        start_date=start_date,
        shift_name=payload.shift_name
    )
    return TimeNormalizationResponse(
        raw_value=str(record.raw_value),
        normalized_iso=record.normalized_iso,
        confidence=record.confidence,
        assumptions=record.assumptions,
        time_class=record.time_class
    )


@app.post("/agent/time/recommendation", response_model=AgentRecommendation)
async def time_recommendation(payload: TimeRecommendationRequest):
    """Return a deterministic time resolution recommendation for a report."""
    report = ingestion_report_store.get(payload.report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Ingestion report not found")
    recommendation = time_resolution_agent.analyze(report)
    return AgentRecommendation(**recommendation)


@app.post("/agent/time/policy", response_model=ExecutionPolicyDecision)
async def time_policy_decision(payload: TimeRecommendationRequest):
    """Apply execution policy gate to a recommendation."""
    report = ingestion_report_store.get(payload.report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Ingestion report not found")
    recommendation = time_resolution_agent.analyze(report)
    decision = evaluate_execution_policy(recommendation)
    return ExecutionPolicyDecision(auto_apply=decision.auto_apply, reason=decision.reason)


@app.post("/agent/confirm_fix")
async def confirm_fix(payload: OperatorConfirmationRequest):
    """Record operator confirmation of a suggested fix."""
    record = payload.model_dump()
    operator_confirmation_store.append(record)
    return {"status": "recorded", "record": record}


@app.get("/agent/context/{asset_id}")
async def get_agent_context(asset_id: str):
    """Return historical reasoning context for operator-facing assistance."""
    return await get_copilot_context(asset_id)


@app.get("/copilot/status")
async def get_copilot_status():
    """Return copilot LLM availability and configured model."""
    return {
        "llm_enabled": copilot_service.llm_enabled(),
        "model": copilot_service._resolved_model or copilot_service.model
    }


@app.post("/copilot/model-refresh")
async def refresh_copilot_model():
    """Force refresh of the copilot model selection."""
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY is not configured.")
    model = copilot_service.refresh_model(api_key)
    return {"model": model}


@app.post("/compare/upload")
async def compare_upload(
    baseline_file: UploadFile = File(..., description="Baseline CSV/Excel"),
    experiment_file: UploadFile = File(..., description="Experiment CSV/Excel"),
    asset_id: Optional[str] = Form(None),
    analysis_mode: Optional[str] = Form("ai_assisted")
):
    """Run baseline vs experiment comparison."""
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            baseline_path = os.path.join(temp_dir, baseline_file.filename or "baseline.csv")
            experiment_path = os.path.join(temp_dir, experiment_file.filename or "experiment.csv")
            with open(baseline_path, "wb") as handle:
                handle.write(await baseline_file.read())
            with open(experiment_path, "wb") as handle:
                handle.write(await experiment_file.read())

            report, agent_logs, warnings, errors = run_comparison(
                baseline_path,
                experiment_path,
                asset_id,
                analysis_mode=analysis_mode or "ai_assisted",
                default_date=datetime.now().date()
            )

            comparison_report_store.save(report)
            job_id = report.report_id
            comparison_job_store[job_id] = {
                "status": "completed" if not errors else "failed",
                "report": report.model_dump(),
                "agent_logs": [log.model_dump() for log in agent_logs],
                "warnings": warnings,
                "errors": errors
            }
            if errors:
                return JSONResponse(status_code=400, content={
                    "success": False,
                    "message": "Comparison failed.",
                    "errors": errors,
                    "warnings": warnings,
                    "report_id": report.report_id,
                })

            return build_response(report, warnings)
    except Exception as exc:
        logger.exception("DOE comparison failed")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/compare/report/{report_id}")
async def get_compare_report(report_id: str):
    report = comparison_report_store.get(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@app.get("/compare/health")
async def compare_health():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "reports_cached": comparison_report_store.count()
    }


@app.post("/compare/agent/run")
async def run_compare_agent(
    baseline_file: UploadFile = File(...),
    experiment_file: UploadFile = File(...),
    asset_id: Optional[str] = Form(None),
    analysis_mode: Optional[str] = Form("ai_assisted")
):
    """Run comparison pipeline with agent logging."""
    response = await compare_upload(
        baseline_file=baseline_file,
        experiment_file=experiment_file,
        asset_id=asset_id,
        analysis_mode=analysis_mode
    )
    if isinstance(response, JSONResponse):
        payload = response.body.decode("utf-8")
        return JSONResponse(status_code=response.status_code, content=json.loads(payload))
    return response


@app.get("/compare/agent/status/{job_id}")
async def compare_agent_status(job_id: str):
    job = comparison_job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"job_id": job_id, "status": job.get("status"), "warnings": job.get("warnings"), "errors": job.get("errors")}


@app.get("/compare/agent/logs/{job_id}")
async def compare_agent_logs(job_id: str):
    job = comparison_job_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"job_id": job_id, "logs": job.get("agent_logs")}


@app.get("/compare/copilot/status")
async def get_compare_copilot_status():
    """Return comparison copilot LLM availability and configured model."""
    return {
        "llm_enabled": compare_copilot_service.llm_enabled(),
        "model": compare_copilot_service._resolved_model or compare_copilot_service.model
    }


@app.post("/compare/copilot/model-refresh")
async def refresh_compare_copilot_model():
    """Force refresh of the comparison copilot model selection."""
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY is not configured.")
    model = compare_copilot_service.refresh_model(api_key)
    return {"model": model}


@app.post("/compare/copilot/context/{report_id}")
async def get_compare_copilot_context(
    report_id: str,
    payload: Optional[ComparisonCopilotContextRequest] = None
):
    """Return structured context for comparison copilot prompts."""
    report = comparison_report_store.get(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    session_id = payload.session_id if payload else None
    if not session_id:
        session_id = f"compare_session_{int(datetime.now().timestamp() * 1000)}"

    context = compare_copilot_service.build_context(report)
    compare_copilot_service.set_session_context(session_id, report_id, context)

    return {
        "session_id": session_id,
        "context": context,
        "generated_at": datetime.now().isoformat()
    }


@app.post("/compare/copilot/query", response_model=CopilotResponse)
async def compare_copilot_query(payload: ComparisonCopilotQueryRequest):
    """Return comparison copilot explanation with guardrails."""
    report = comparison_report_store.get(payload.report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    context = compare_copilot_service.get_session_context(payload.session_id, payload.report_id)
    if context is None:
        context = compare_copilot_service.build_context(report)
        if payload.session_id:
            compare_copilot_service.set_session_context(payload.session_id, payload.report_id, context)

    try:
        return compare_copilot_service.answer_query(
            report_id=payload.report_id,
            role=payload.role,
            question=payload.question,
            context=context,
            session_id=payload.session_id
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.post("/compare/copilot/session/{session_id}/reset")
async def reset_compare_copilot_session(session_id: str):
    """Reset comparison copilot memory for a session."""
    compare_copilot_service.reset_memory(session_id)
    return {"status": "reset", "session_id": session_id}


@app.get("/analysis/copilot/status")
async def get_analyzer_copilot_status():
    """Return analyzer copilot LLM availability and configured model."""
    return {
        "llm_enabled": analyzer_copilot_service.llm_enabled(),
        "model": analyzer_copilot_service._resolved_model or analyzer_copilot_service.model
    }


@app.post("/analysis/copilot/model-refresh")
async def refresh_analyzer_copilot_model():
    """Force refresh of the analyzer copilot model selection."""
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY is not configured.")
    model = analyzer_copilot_service.refresh_model(api_key)
    return {"model": model}


@app.post("/analysis/copilot/context/{report_id}", response_model=AnalyzerCopilotContextResponse)
async def get_analyzer_copilot_context(
    report_id: str,
    payload: Optional[AnalyzerCopilotContextRequest] = None,
):
    """Return structured context for analyzer copilot prompts."""
    report = analyzer_report_store.get(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Analyzer report not found")

    session_id = payload.session_id if payload else None
    context = analyzer_copilot_service.build_context(report)
    if session_id:
        analyzer_copilot_service.set_session_context(session_id, report_id, context)
    return AnalyzerCopilotContextResponse(
        report_id=report_id,
        generated_at=datetime.utcnow().isoformat()
    )


@app.post("/analysis/copilot/query", response_model=CopilotResponse)
async def analyzer_copilot_query(payload: AnalyzerCopilotQueryRequest):
    """Return analyzer copilot explanation with guardrails."""
    report = analyzer_report_store.get(payload.report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Analyzer report not found")

    context = analyzer_copilot_service.get_session_context(payload.session_id, payload.report_id)
    if not context:
        context = analyzer_copilot_service.build_context(report)
        if payload.session_id:
            analyzer_copilot_service.set_session_context(payload.session_id, payload.report_id, context)

    try:
        return analyzer_copilot_service.answer_query(
            report_id=payload.report_id,
            role=payload.role,
            question=payload.question,
            context=context,
            session_id=payload.session_id,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.post("/analysis/copilot/session/{session_id}/reset")
async def reset_analyzer_copilot_session(session_id: str):
    """Reset analyzer copilot memory for a session."""
    analyzer_copilot_service.reset_memory(session_id)
    return {"status": "reset", "session_id": session_id}


@app.post("/script/run", response_model=ScriptRunResponse)
async def run_script(payload: ScriptRunRequest):
    """Execute a Python script and return outputs."""
    try:
        code = payload.code
        if payload.session_id:
            session_dir = _get_session_dir(payload.session_id)
            csv_path = session_dir / "data.csv"
            if not csv_path.exists():
                raise HTTPException(status_code=404, detail="Data for this session not found. Please upload again.")
            rejection = _reject_unsafe_code(code)
            if rejection:
                raise HTTPException(status_code=400, detail=f"Unsafe script rejected. {rejection}")
            prelude = (
                "import pandas as pd\n"
                "import numpy as np\n"
                "import matplotlib\n"
                "matplotlib.use('Agg')\n"
                "import matplotlib.pyplot as plt\n"
                "import warnings\n"
                "warnings.filterwarnings('ignore', message='.*FigureCanvasAgg is non-interactive.*')\n"
                "def _noop_show(*args, **kwargs):\n"
                "    return None\n"
                "plt.show = _noop_show\n"
                f"df = pd.read_csv(r\"{str(csv_path)}\")\n"
            )
            code = f"{prelude}\n{code}"
        result = run_python_script(code, timeout_sec=payload.timeout_sec or 20)
        return ScriptRunResponse(**result)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=408, detail="Script execution timed out.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/doe/compare/upload", response_model=DOEUploadResponse)
async def doe_compare_upload(
    baseline_file: UploadFile = File(..., description="Baseline CSV/Excel"),
    experiment_file: UploadFile = File(..., description="Experiment CSV/Excel"),
    process_name: str = Form(...),
    engineer: str = Form(...),
    baseline_description: Optional[str] = Form(None),
    experiment_description: Optional[str] = Form(None),
    doe_factors: Optional[str] = Form(None),
    column_mapping: Optional[str] = Form(None),
    default_date: Optional[str] = Form(None),
    start_date: Optional[str] = Form(None),
):
    """Run DOE-ready baseline vs experiment comparison."""
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            baseline_path = os.path.join(temp_dir, baseline_file.filename or "baseline.csv")
            experiment_path = os.path.join(temp_dir, experiment_file.filename or "experiment.csv")
            with open(baseline_path, "wb") as handle:
                handle.write(await baseline_file.read())
            with open(experiment_path, "wb") as handle:
                handle.write(await experiment_file.read())

            parsed_default_date = datetime.fromisoformat(default_date).date() if default_date else None
            parsed_start_date = datetime.fromisoformat(start_date).date() if start_date else None
            try:
                factors_payload = json.loads(doe_factors) if doe_factors else {}
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid JSON for doe_factors.")
            try:
                mapping_payload = json.loads(column_mapping) if column_mapping else None
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid JSON for column_mapping.")

            report, agent_logs, warnings, errors = run_doe_comparison(
                baseline_path=baseline_path,
                experiment_path=experiment_path,
                process_name=process_name,
                engineer=engineer,
                baseline_description=baseline_description,
                experiment_description=experiment_description,
                doe_factors=factors_payload,
                column_mapping=mapping_payload,
                default_date=parsed_default_date,
                start_date=parsed_start_date,
            )

            doe_report_store.save(report)
            doe_agent_log_store[report.report_id] = [log.model_dump() for log in agent_logs]

            if errors:
                return DOEUploadResponse(
                    success=False,
                    report_id=report.report_id,
                    message="DOE comparison completed with validation issues.",
                    warnings=warnings,
                    errors=errors,
                )

            return DOEUploadResponse(
                success=True,
                report_id=report.report_id,
                message="DOE comparison completed.",
                warnings=warnings,
                errors=[],
            )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/doe/report/{report_id}")
async def get_doe_report(report_id: str):
    report = doe_report_store.get(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="DOE report not found")
    return report


@app.get("/doe/agent/logs/{report_id}")
async def get_doe_agent_logs(report_id: str):
    logs = doe_agent_log_store.get(report_id)
    if not logs:
        raise HTTPException(status_code=404, detail="DOE report logs not found")
    return {"report_id": report_id, "logs": logs}


@app.post("/doe/wizard/recommend")
async def doe_wizard_recommend(payload: DOEWizardRecommendRequest):
    """AI-assisted DOE method recommendation."""
    prompt = (
        "You are a DOE expert. Recommend the best DOE method in JSON.\n"
        "Return JSON with keys: method, reason, plain_english.\n"
        f"INPUT: {payload.model_dump()}\n"
    )
    text = _generate_with_fallback(prompt)
    try:
        data = json.loads(text)
        return data
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI response could not be parsed: {exc}")


@app.post("/doe/wizard/design")
async def doe_wizard_design(payload: DOEWizardDesignRequest):
    """Generate DOE experiment matrix."""
    factors = [
        WizardFactor(
            name=f.name,
            low=f.low,
            high=f.high,
            levels=f.levels,
        )
        for f in payload.factors
    ]
    df, meta = generate_design(
        payload.method,
        factors,
        center_points=payload.center_points or 0,
        replicates=payload.replicates or 1,
    )
    df.insert(0, "run_id", range(1, len(df) + 1))
    return {
        "matrix": df.to_dict(orient="records"),
        "meta": meta,
        "columns": list(df.columns),
    }


@app.post("/doe/wizard/analyze")
async def doe_wizard_analyze(
    results_file: UploadFile = File(..., description="Results CSV/Excel with factor columns and response"),
    response_column: str = Form(...),
    factors_json: str = Form(...),
    include_interactions: bool = Form(True),
):
    """Analyze DOE results with ANOVA, main effects, and optimization."""
    try:
        factors_payload = json.loads(factors_json)
        factors = [WizardFactor(**item) for item in factors_payload]
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid factors_json.")

    suffix = Path(results_file.filename or "").suffix.lower()
    with tempfile.TemporaryDirectory() as temp_dir:
        file_path = Path(temp_dir) / f"results{suffix}"
        file_path.write_bytes(await results_file.read())
        if suffix in {".xls", ".xlsx"}:
            df = pd.read_excel(file_path)
        else:
            df = pd.read_csv(file_path)

    # Resolve response column (case-insensitive), and auto-pick if missing
    col_map = {str(col).strip().lower(): col for col in df.columns}
    response_key = str(response_column or "").strip().lower()
    resolved_response = col_map.get(response_key)
    if not resolved_response:
        # Try common defaults before falling back to a numeric column
        for candidate in ("response", "result", "output", "y"):
            if candidate in col_map:
                resolved_response = col_map[candidate]
                break
    if not resolved_response:
        numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
        if numeric_cols:
            resolved_response = numeric_cols[-1]
    if not resolved_response:
        resolved_response = response_column or ""

    # Pre-clean data to avoid NaN/inf model failures (drop any row with NaN/inf)
    clean_result = _clean_dataframe_for_analysis(df)
    df = clean_result["df"]

    try:
        analysis = analyze_results(
            df,
            response_col=resolved_response,
            factors=[
                WizardFactor(name=f.name, low=f.low, high=f.high, levels=f.levels) for f in factors
            ],
            include_interactions=include_interactions,
        )
    except Exception as exc:
        # Fallback: return summary-only analysis to avoid hard failure
        warnings = [f"Analysis fallback: {exc}"]
        if clean_result["dropped_rows"] > 0:
            warnings.insert(
                0,
                f"Cleaned file: dropped {clean_result['dropped_rows']} rows containing NaN/inf values.",
            )
        if not resolved_response or str(resolved_response).strip() == "":
            warnings.append(
                f"Response column not found. Available columns: {list(df.columns)}"
            )
            summary = {
                "rows": int(df.shape[0]),
                "response_mean": None,
                "response_std": None,
            }
        else:
            series = df[resolved_response]
            summary = {
                "rows": int(df.shape[0]),
                "response_mean": float(series.mean()),
                "response_std": float(series.std()),
            }
        analysis = {
            "formula": None,
            "anova": [],
            "main_effects": {},
            "warnings": warnings,
            "model_summary": {},
            "optimization": {"recommended_settings": {}, "predicted_response": None},
            "confidence": 0.0,
            "summary": summary,
        }

    if isinstance(analysis, dict) and clean_result["dropped_rows"] > 0:
        analysis.setdefault("warnings", [])
        analysis["warnings"].insert(
            0,
            f"Cleaned file: dropped {clean_result['dropped_rows']} rows containing NaN/inf values.",
        )

    # AI-style concise engineering summary
    if isinstance(analysis, dict):
        summary_text = _build_doe_summary(analysis)
        analysis["ai_summary"] = summary_text
        analysis["plot_explanations"] = _build_doe_plot_explanations(analysis)
        try:
            api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if api_key and not (_DOE_TUTOR_LAST_429 and (time.time() - _DOE_TUTOR_LAST_429) < 30):
                prompt = (
                    "You are an engineering DOE analyst. Provide a concise 4-6 sentence summary "
                    "for an engineer. Highlight model fit, strongest effects, and any caveats. "
                    "Do not invent data.\n"
                    f"ANALYSIS: {json.dumps(analysis, default=str)}"
                )
                ai_text = _generate_with_fallback(prompt)
                if ai_text:
                    analysis["ai_summary"] = ai_text.strip()
                # Plot explanations
                plot_prompt = (
                    "Return JSON with keys: main_effects, anova, correlation, regression, residuals_vs_fitted, qq, leverage. "
                    "Each value must be a 1-2 sentence explanation of what the plot indicates for this analysis. "
                    "Do not invent data, use generic interpretation if specifics are unavailable.\n"
                    f"ANALYSIS: {json.dumps(analysis, default=str)}"
                )
                plot_text = _generate_with_fallback(plot_prompt)
                try:
                    plot_json = json.loads(plot_text)
                    if isinstance(plot_json, dict):
                        analysis["plot_explanations"] = plot_json
                except Exception:
                    pass
        except Exception as exc:
            if "429" in str(exc) or "rate limit" in str(exc).lower():
                _DOE_TUTOR_LAST_429 = time.time()

    return JSONResponse(content=_sanitize_jsonable({
        "analysis": analysis,
        "rows": int(df.shape[0]),
        "response_column": resolved_response or response_column,
    }))


@app.post("/doe/wizard/clean")
async def doe_wizard_clean(
    results_file: UploadFile = File(..., description="Results CSV/Excel to clean"),
):
    """Clean DOE results by dropping rows with NaN/inf and return cleaned CSV."""
    suffix = Path(results_file.filename or "").suffix.lower()
    with tempfile.TemporaryDirectory() as temp_dir:
        file_path = Path(temp_dir) / f"results{suffix}"
        file_path.write_bytes(await results_file.read())
        if suffix in {".xls", ".xlsx"}:
            df = pd.read_excel(file_path)
        else:
            df = pd.read_csv(file_path)

    clean_result = _clean_dataframe_for_analysis(df)
    df_clean = clean_result["df"]

    output_name = f"cleaned_{Path(results_file.filename or 'results.csv').stem}.csv"
    csv_bytes = df_clean.to_csv(index=False).encode("utf-8")
    payload = {
        "filename": output_name,
        "cleaned_rows": clean_result["cleaned_rows"],
        "dropped_rows": clean_result["dropped_rows"],
        "file_base64": base64.b64encode(csv_bytes).decode("utf-8"),
    }
    return payload


@app.post("/doe/wizard/chat")
async def doe_wizard_chat(payload: Dict[str, Any]):
    """AI tutor/chat for DOE questions."""
    question = payload.get("question", "")
    context = payload.get("context", {})
    prompt = (
        "You are a senior DOE expert and engineering statistician. "
        "Answer with practical, actionable guidance and correct statistical reasoning. "
        "Use plain English, but do not oversimplify. "
        "If the user asks about factor impact, explain main effects, interactions, and how to verify with ANOVA or plots. "
        "If you need data to be precise, say what data is required. "
        "Keep responses concise and structured. "
        "Return JSON only: {\"answer\": \"...\"}.\n"
        f"CONTEXT: {json.dumps(context, default=str)}\n"
        f"QUESTION: {question}\n"
    )
    try:
        global _DOE_TUTOR_LAST_429
        cache_key = _doe_tutor_cache_key(question, context)
        cached = _DOE_TUTOR_CACHE.get(cache_key)
        if cached and (time.time() - cached["ts"]) < _DOE_TUTOR_CACHE_TTL_SEC:
            return {"answer": cached["answer"]}

        if _DOE_TUTOR_LAST_429 and (time.time() - _DOE_TUTOR_LAST_429) < 30:
            return {"answer": _doe_tutor_fallback(question, context)}

        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            return {"answer": _doe_tutor_fallback(question, context)}

        # Use the same Gemini model resolution as the compare copilot
        _DOE_TUTOR_COPILOT.resolve_model(api_key)

        backoff = 0.5
        last_error: Optional[Exception] = None
        for _ in range(3):
            try:
                raw = _DOE_TUTOR_COPILOT._query_gemini(api_key, prompt)
                data = None
                try:
                    data = json.loads(raw)
                except Exception:
                    data = _DOE_TUTOR_COPILOT._parse_model_response(raw)
                answer = None
                if isinstance(data, dict):
                    answer = data.get("answer")
                if not answer:
                    answer = str(raw).strip()
                _DOE_TUTOR_CACHE[cache_key] = {"ts": time.time(), "answer": answer}
                return {"answer": answer}
            except Exception as exc:
                last_error = exc
                msg = str(exc)
                if "429" in msg or "rate limit" in msg.lower():
                    _DOE_TUTOR_LAST_429 = time.time()
                    time.sleep(backoff)
                    backoff *= 2
                    continue
                time.sleep(backoff)
                backoff *= 2
        raise RuntimeError(last_error) if last_error else RuntimeError("DOE tutor failed.")
    except Exception as exc:
        message = str(exc)
        if "429" in message or "rate limit" in message.lower():
            _DOE_TUTOR_LAST_429 = time.time()
            return {"answer": _doe_tutor_fallback(question, context)}
        raise HTTPException(status_code=502, detail=f"DOE tutor failed: {exc}")


@app.post("/analysis/plan", response_model=AnalyzerPlanResponse)
async def analyzer_plan_endpoint(
    dataset_file: UploadFile = File(..., description="CSV or Excel dataset"),
    column_mapping: Optional[str] = Form(None),
    default_date: Optional[str] = Form(None),
    start_date: Optional[str] = Form(None),
):
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            dataset_path = os.path.join(temp_dir, dataset_file.filename or "dataset.csv")
            with open(dataset_path, "wb") as handle:
                handle.write(await dataset_file.read())

            mapping_payload = json.loads(column_mapping) if column_mapping else None
            parsed_default_date = datetime.fromisoformat(default_date).date() if default_date else None
            parsed_start_date = datetime.fromisoformat(start_date).date() if start_date else None

            profile = profile_dataset(
                dataset_path,
                default_date=parsed_default_date,
                start_date=parsed_start_date,
                column_mapping=mapping_payload,
            )

            plan = analyzer_plan(profile.model_dump())
            return AnalyzerPlanResponse(profile=profile, plan=plan)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON for column_mapping.")
    except RuntimeError as exc:
        message = str(exc)
        lowered = message.lower()
        if "statsmodels is required" in lowered:
            raise HTTPException(
                status_code=400,
                detail="statsmodels is required for stationarity tests. Run: pip install statsmodels==0.14.1"
            )
        if "scipy is required" in lowered:
            raise HTTPException(
                status_code=400,
                detail="SciPy is required for distribution tests. Run: pip install scipy==1.12.0"
            )
        if "rate limit" in lowered or "429" in lowered:
            raise HTTPException(status_code=503, detail="Gemini rate limit hit. Retry after 30-60 seconds.")
        if "planner output" in lowered or "json schema" in lowered:
            recovery = analyzer_recover(
                message,
                {"stage": "plan", "profile": profile.model_dump() if 'profile' in locals() else {}},
            )
            raise HTTPException(status_code=502, detail={"error": message, "recovery": recovery})
        raise
    except Exception as exc:
        logger.exception("Analyzer planning failed")
        recovery = analyzer_recover(str(exc), {"stage": "plan"})
        raise HTTPException(status_code=500, detail={"error": str(exc), "recovery": recovery})


@app.post("/analysis/run", response_model=AnalyzerRunResponse)
async def analyzer_run_endpoint(
    dataset_file: UploadFile = File(..., description="CSV or Excel dataset"),
    plan_json: str = Form(...),
    column_mapping: Optional[str] = Form(None),
    default_date: Optional[str] = Form(None),
    start_date: Optional[str] = Form(None),
):
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            dataset_path = os.path.join(temp_dir, dataset_file.filename or "dataset.csv")
            with open(dataset_path, "wb") as handle:
                handle.write(await dataset_file.read())

            mapping_payload = json.loads(column_mapping) if column_mapping else None
            parsed_default_date = datetime.fromisoformat(default_date).date() if default_date else None
            parsed_start_date = datetime.fromisoformat(start_date).date() if start_date else None

            profile = profile_dataset(
                dataset_path,
                default_date=parsed_default_date,
                start_date=parsed_start_date,
                column_mapping=mapping_payload,
            )
            plan = json.loads(plan_json)

            df = load_dataset(dataset_path, column_mapping=mapping_payload)
            results = analyzer_execute(df, plan)
            validation = analyzer_validate(df, plan, results.statistics)

            max_rows = max((signal.rows for signal in profile.signals.values()), default=0)
            sample_adequacy = min(1.0, max_rows / 500.0)
            noise_scores = []
            p_values = []
            for stat in results.statistics.values():
                if stat.mean and stat.mean != 0 and stat.std is not None:
                    noise_scores.append(max(0.0, 1.0 - abs(stat.std / stat.mean)))
                for value in (stat.p_values or {}).values():
                    if value is not None:
                        p_values.append(value)
            noise_robustness = float(sum(noise_scores) / len(noise_scores)) if noise_scores else 0.5
            statistical_strength = float(sum(1.0 - min(p, 1.0) for p in p_values) / len(p_values)) if p_values else 0.0
            components = {
                "data_completeness": profile.quality_score,
                "sample_adequacy": sample_adequacy,
                "noise_robustness": noise_robustness,
                "statistical_strength": statistical_strength,
                "assumption_risk": 0.2,
            }
            confidence = analyzer_confidence(components, assumption_risk=0.2, penalty=validation["confidence_penalty"])

            report_id = str(uuid.uuid4())

            sample_rows = df.head(500).to_dict(orient="records")
            analyzer_copilot_service.cache_data_sample(report_id, sample_rows)

            explanation_payload = {
                "profile": profile.model_dump(),
                "plan": plan,
                "results": results.model_dump(),
                "validation": validation,
                "confidence": confidence,
            }
            explanation = analyzer_explain(explanation_payload)

            report = analyzer_build_report(
                report_id=report_id,
                profile=profile,
                plan=plan,
                results=results,
                validation=validation,
                confidence=confidence,
                explanation=explanation,
                assumptions=plan.get("assumptions", []),
                warnings=validation.get("warnings", []),
                errors=[],
            )
            analyzer_report_store.save(report)
            return AnalyzerRunResponse(
                success=True,
                report_id=report.report_id,
                message="Analysis completed.",
                errors=[],
            )
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON for plan or column_mapping.")
    except RuntimeError as exc:
        message = str(exc)
        lowered = message.lower()
        if "explanation output" in lowered or "json schema" in lowered:
            recovery = analyzer_recover(message, {"stage": "explain"})
            raise HTTPException(status_code=502, detail={"error": message, "recovery": recovery})
        raise
    except Exception as exc:
        logger.exception("Analyzer execution failed")
        recovery = analyzer_recover(str(exc), {"stage": "run"})
        raise HTTPException(status_code=500, detail={"error": str(exc), "recovery": recovery})


@app.get("/analysis/report/{report_id}")
async def analyzer_report_endpoint(report_id: str):
    report = analyzer_report_store.get(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Analysis report not found")
    return report


@app.post("/copilot/context/{asset_id}")
async def get_copilot_context(asset_id: str, payload: Optional[CopilotContextRequest] = None):
    """Return structured context for copilot prompt building."""
    if asset_id not in asset_data_store:
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")

    sensor_data = asset_data_store[asset_id]
    maintenance_history = maintenance_data_store.get(asset_id, [])
    asset_type = determine_asset_type(asset_id)
    failure_mode_assessments = rules_engine.evaluate_asset(
        asset_id, asset_type, sensor_data, maintenance_history
    )
    assessment = risk_scoring_service.compute_risk_assessment(
        asset_id, asset_type, failure_mode_assessments, sensor_data, maintenance_history
    )
    baselines = baseline_service.compute_baselines(sensor_data[-100:])
    asset_baselines = baselines.get(asset_id, [])
    latest_timestamp = max(s.timestamp for s in sensor_data)

    context = copilot_service.build_context(
        asset_id=asset_id,
        asset_type=asset_type.value,
        sensor_history=_build_sensor_history(sensor_data),
        maintenance_history=[m.model_dump() for m in maintenance_history],
        risk_assessment=assessment.model_dump(),
        failure_mode_breakdown=[
            {
                "failure_mode_id": r.failure_mode_id,
                "stage": r.stage.value,
                "risk_score": r.risk_score,
                "confidence": r.confidence_score,
                "skill_level_required": r.skill_level_required.value,
                "recommended_action": r.recommended_action,
                "explanation": r.explanation,
                "indicators": [ind.model_dump() for ind in r.indicators]
            }
            for r in failure_mode_assessments
        ],
        baseline_bands=_build_baseline_bands(asset_baselines),
        failure_mode_timeline=_build_failure_mode_timeline(
            failure_mode_assessments, latest_timestamp
        )
    )

    return {
        "context": context,
        "generated_at": datetime.now().isoformat()
    }


@app.post("/copilot/query", response_model=CopilotResponse)
async def copilot_query(payload: CopilotQueryRequest):
    """Return copilot explanation with guardrails."""
    asset_id = payload.asset_id
    if asset_id not in asset_data_store:
        raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")

    sensor_data = asset_data_store[asset_id]
    maintenance_history = maintenance_data_store.get(asset_id, [])
    asset_type = determine_asset_type(asset_id)
    failure_mode_assessments = rules_engine.evaluate_asset(
        asset_id, asset_type, sensor_data, maintenance_history
    )
    assessment = risk_scoring_service.compute_risk_assessment(
        asset_id, asset_type, failure_mode_assessments, sensor_data, maintenance_history
    )
    baselines = baseline_service.compute_baselines(sensor_data[-100:])
    asset_baselines = baselines.get(asset_id, [])
    latest_timestamp = max(s.timestamp for s in sensor_data)

    context = copilot_service.build_context(
        asset_id=asset_id,
        asset_type=asset_type.value,
        sensor_history=_build_sensor_history(sensor_data),
        maintenance_history=[m.model_dump() for m in maintenance_history],
        risk_assessment=assessment.model_dump(),
        failure_mode_breakdown=[
            {
                "failure_mode_id": r.failure_mode_id,
                "stage": r.stage.value,
                "risk_score": r.risk_score,
                "confidence": r.confidence_score,
                "skill_level_required": r.skill_level_required.value,
                "recommended_action": r.recommended_action,
                "explanation": r.explanation,
                "indicators": [ind.model_dump() for ind in r.indicators]
            }
            for r in failure_mode_assessments
        ],
        baseline_bands=_build_baseline_bands(asset_baselines),
        failure_mode_timeline=_build_failure_mode_timeline(
            failure_mode_assessments, latest_timestamp
        )
    )

    try:
        return copilot_service.answer_query(
            asset_id=asset_id,
            role=payload.role,
            question=payload.question,
            context=context,
            session_id=payload.session_id
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.post("/copilot/session/{session_id}/reset")
async def reset_copilot_session(session_id: str):
    """Reset copilot memory for a session."""
    copilot_service.reset_memory(session_id)
    return {"status": "reset", "session_id": session_id}


def _build_sensor_history(sensor_data: List[SensorDataPoint], limit: int = 200) -> List[Dict[str, Any]]:
    sorted_data = sorted(sensor_data, key=lambda x: x.timestamp)[-limit:]
    return [
        {
            "timestamp": point.timestamp,
            "temperature": point.temperature,
            "vibration": point.vibration,
            "alarm_frequency": point.alarm_frequency,
            "run_hours": point.run_hours
        }
        for point in sorted_data
    ]


def _build_risk_assessments_for_points(sensor_points: List[SensorDataPoint]) -> List[Any]:
    if not sensor_points:
        return []

    assessments = []
    by_asset: Dict[str, List[SensorDataPoint]] = {}
    for point in sensor_points:
        by_asset.setdefault(point.asset_id, []).append(point)

    for asset_id, asset_points in by_asset.items():
        asset_type = asset_points[0].asset_type or determine_asset_type(asset_id)
        maintenance_history = maintenance_data_store.get(asset_id, [])
        failure_mode_assessments = rules_engine.evaluate_asset(
            asset_id, asset_type, asset_points, maintenance_history
        )
        assessment = risk_scoring_service.compute_risk_assessment(
            asset_id, asset_type, failure_mode_assessments, asset_points, maintenance_history
        )
        assessments.append(assessment)

    return assessments


def _build_failure_mode_timeline(failure_mode_assessments, latest_timestamp) -> List[Dict[str, Any]]:
    events = []
    for assessment in failure_mode_assessments:
        indicator_windows = [
            ind.window_hours for ind in assessment.indicators
            if ind.window_hours and ind.status in ("elevated", "critical")
        ]
        window_hours = max(indicator_windows) if indicator_windows else 24
        events.append({
            "failure_mode_id": assessment.failure_mode_id,
            "stage": assessment.stage.value,
            "timestamp": latest_timestamp,
            "description": assessment.explanation
        })
        if assessment.stage.value in ("mid", "late"):
            events.append({
                "failure_mode_id": assessment.failure_mode_id,
                "stage": "early",
                "timestamp": latest_timestamp - timedelta(hours=window_hours),
                "description": "Early indicators first observed within trend window."
            })
        if assessment.stage.value == "late":
            events.append({
                "failure_mode_id": assessment.failure_mode_id,
                "stage": "mid",
                "timestamp": latest_timestamp - timedelta(hours=window_hours // 2),
                "description": "Mid-stage persistence established."
            })
    return sorted(events, key=lambda x: x["timestamp"])


def _build_baseline_bands(asset_baselines) -> Dict[str, Any]:
    bands = {}
    for baseline in asset_baselines:
        bands[baseline.parameter] = {
            "mean": baseline.baseline_metrics.mean,
            "std": baseline.baseline_metrics.std
        }
    return bands


def determine_asset_type(asset_id: str) -> AssetType:
    """
    Determine asset type from asset ID.

    Engineering Logic:
    - Uses naming conventions to identify asset types
    - Supports electric motors and pumps
    - Production system would have asset registry
    """
    asset_id_lower = asset_id.lower()

    if 'motor' in asset_id_lower or 'mtr' in asset_id_lower:
        return AssetType.ELECTRIC_MOTOR
    elif 'pump' in asset_id_lower or 'pmp' in asset_id_lower:
        return AssetType.PUMP
    else:
        # Default to electric motor if unclear
        return AssetType.ELECTRIC_MOTOR


async def update_risk_assessments():
    """
    Background task to update risk assessments after data upload.

    This ensures that risk assessments are kept current as new data arrives.
    """
    try:
        logger.info("Starting background risk assessment update")

        # This would typically update a database or cache
        # For this demo, we rely on the GET endpoint to compute on-demand

        logger.info("Background risk assessment update completed")

    except Exception as e:
        logger.error(f"Background risk assessment update failed: {str(e)}")


if __name__ == "__main__":
    # Run with uvicorn for development
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
