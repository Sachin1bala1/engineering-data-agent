"""Python execution engine for analysis plans."""

from __future__ import annotations

import io
from typing import Dict, Any, List

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

try:
    from scipy import stats
    SCIPY_AVAILABLE = True
except Exception:
    stats = None
    SCIPY_AVAILABLE = False

from .models import AnalyzerExecutionResults, ExecutionStatistic, PlotArtifact


def _require_scipy(test_name: str) -> None:
    if not SCIPY_AVAILABLE:
        raise RuntimeError(f"SciPy is required for {test_name}. Install scipy and retry.")


def _numeric_series(df: pd.DataFrame, column: str) -> np.ndarray:
    values = pd.to_numeric(df[column], errors="coerce").to_numpy(dtype=float)
    return values[~np.isnan(values)]


def _compute_stats(values: np.ndarray) -> Dict[str, float]:
    if values.size == 0:
        return {"mean": 0.0, "std": 0.0, "median": 0.0, "min": 0.0, "max": 0.0}
    return {
        "mean": float(np.mean(values)),
        "std": float(np.std(values, ddof=1)) if values.size > 1 else 0.0,
        "median": float(np.median(values)),
        "min": float(np.min(values)),
        "max": float(np.max(values)),
    }


def _plot_to_data_uri(fig) -> str:
    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", dpi=200, bbox_inches="tight")
    plt.close(fig)
    buffer.seek(0)
    data = buffer.read()
    import base64
    return f"data:image/png;base64,{base64.b64encode(data).decode('ascii')}"


def run_execution(df: pd.DataFrame, plan: Dict[str, Any]) -> AnalyzerExecutionResults:
    stats_by_signal: Dict[str, ExecutionStatistic] = {}
    plots: List[PlotArtifact] = []

    recommended_tests = plan.get("recommended_tests", [])
    recommended_plots = plan.get("recommended_plots", [])

    numeric_columns = df.select_dtypes(include=[np.number]).columns.tolist()

    for test in recommended_tests:
        test_name = test.get("test")
        applies_to = test.get("applies_to")
        if isinstance(applies_to, list):
            columns = [col for col in applies_to if col in df.columns]
        elif applies_to in ("all_numeric", "*", "all"):
            columns = numeric_columns
        elif isinstance(applies_to, str):
            columns = [applies_to] if applies_to in df.columns else []
        else:
            columns = []

        if not columns:
            continue

        for column in columns:
            values = _numeric_series(df, column)
            stat_record = stats_by_signal.get(column, ExecutionStatistic())
            stat_values = _compute_stats(values)
            stat_record.mean = stat_values["mean"]
            stat_record.std = stat_values["std"]
            stat_record.median = stat_values["median"]
            stat_record.min = stat_values["min"]
            stat_record.max = stat_values["max"]

            if test_name == "shapiro_wilk":
                _require_scipy("shapiro_wilk")
                if values.size >= 3 and values.size <= 5000:
                    _, p_value = stats.shapiro(values)
                    stat_record.p_values["shapiro_wilk"] = float(p_value)
                else:
                    stat_record.notes.append("Shapiro-Wilk requires 3-5000 samples.")
            elif test_name == "normaltest":
                _require_scipy("normaltest")
                if values.size >= 20:
                    _, p_value = stats.normaltest(values)
                    stat_record.p_values["normaltest"] = float(p_value)
                else:
                    stat_record.notes.append("Normality test requires >=20 samples.")
            elif test_name == "autocorr":
                if values.size >= 2:
                    stat_record.p_values["autocorr_lag1"] = float(np.corrcoef(values[:-1], values[1:])[0, 1])
            else:
                stat_record.notes.append(f"Test '{test_name}' is not implemented.")
            stats_by_signal[column] = stat_record

    for column, stat_record in stats_by_signal.items():
        if stat_record.mean is None:
            values = _numeric_series(df, column)
            stat_values = _compute_stats(values)
            stat_record.mean = stat_values["mean"]
            stat_record.std = stat_values["std"]
            stat_record.median = stat_values["median"]
            stat_record.min = stat_values["min"]
            stat_record.max = stat_values["max"]

    for plot_name in recommended_plots:
        normalized_plot = str(plot_name).strip().lower()
        if "time series" in normalized_plot or normalized_plot == "time_series":
            time_col = next((c for c in df.columns if "time" in c.lower() or "timestamp" in c.lower()), None)
            for col in numeric_columns[:3]:
                fig, ax = plt.subplots(figsize=(7, 4))
                if time_col and time_col in df.columns:
                    ax.plot(pd.to_datetime(df[time_col], errors="coerce"), df[col])
                else:
                    ax.plot(df[col])
                ax.set_title(f"Time Series: {col}")
                ax.set_xlabel(time_col or "Index")
                ax.set_ylabel(col)
                plots.append(PlotArtifact(title=f"Time Series: {col}", data_uri=_plot_to_data_uri(fig)))
        if "box" in normalized_plot:
            for col in numeric_columns[:3]:
                fig, ax = plt.subplots(figsize=(6, 4))
                sns.boxplot(x=df[col], ax=ax)
                ax.set_title(f"Boxplot: {col}")
                plots.append(PlotArtifact(title=f"Boxplot: {col}", data_uri=_plot_to_data_uri(fig)))
        if "corr" in normalized_plot:
            if len(numeric_columns) >= 2:
                fig, ax = plt.subplots(figsize=(6, 5))
                corr = df[numeric_columns].corr()
                sns.heatmap(corr, ax=ax, cmap="coolwarm", center=0)
                ax.set_title("Correlation Heatmap")
                plots.append(PlotArtifact(title="Correlation Heatmap", data_uri=_plot_to_data_uri(fig)))

    return AnalyzerExecutionResults(statistics=stats_by_signal, plots=plots)
