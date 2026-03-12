"""Python execution engine for analysis plans."""

from __future__ import annotations

import io
from typing import Dict, Any, List

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
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


def _canonical_test_name(name: str) -> str:
    raw = str(name or "").strip().lower().replace(" ", "_")
    aliases = {
        "anova_analysis_of_variance": "anova",
        "analysis_of_variance": "anova",
        "t_tests": "t_test",
        "ttest": "t_test",
        "regression_analysis_to_model_relationships_between_variables_e_g_load_vs_response_time": "regression",
        "regression_analysis": "regression",
        "chi_squared_test": "chi_squared",
        "chi_square_test": "chi_squared",
        "chi_square": "chi_squared",
        "statistical_process_control_spc_charts": "spc",
        "statistical_process_control": "spc",
        "control_chart": "spc",
    }
    return aliases.get(raw, raw)


def run_execution(df: pd.DataFrame, plan: Dict[str, Any]) -> AnalyzerExecutionResults:
    stats_by_signal: Dict[str, ExecutionStatistic] = {}
    plots: List[PlotArtifact] = []

    recommended_tests = plan.get("recommended_tests", [])
    recommended_plots = plan.get("recommended_plots", [])

    numeric_columns = df.select_dtypes(include=[np.number]).columns.tolist()

    for test in recommended_tests:
        test_name = _canonical_test_name(test.get("test"))
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
            elif test_name == "t_test":
                if values.size >= 6:
                    median = np.nanmedian(values)
                    g1 = values[values <= median]
                    g2 = values[values > median]
                    if g1.size >= 3 and g2.size >= 3:
                        _require_scipy("t_test")
                        _, p_value = stats.ttest_ind(g1, g2, equal_var=False, nan_policy="omit")
                        stat_record.p_values["t_test_split"] = float(p_value)
                    else:
                        stat_record.notes.append("t_test split produced insufficient group sizes.")
                else:
                    stat_record.notes.append("t_test requires >=6 samples.")
            elif test_name == "anova":
                if values.size >= 9:
                    try:
                        bins = pd.qcut(values, q=3, duplicates="drop")
                        groups = []
                        for cat in pd.Series(bins).dropna().unique():
                            grp = values[pd.Series(bins) == cat]
                            if grp.size:
                                groups.append(grp)
                        if len(groups) >= 2:
                            _require_scipy("anova")
                            _, p_value = stats.f_oneway(*groups)
                            stat_record.p_values["anova_bins"] = float(p_value)
                        else:
                            stat_record.notes.append("anova could not create enough groups.")
                    except Exception:
                        stat_record.notes.append("anova failed to bin data.")
                else:
                    stat_record.notes.append("anova requires >=9 samples.")
            elif test_name == "regression":
                peers = [c for c in numeric_columns if c != column]
                if peers and values.size >= 6:
                    peer = peers[0]
                    x = _numeric_series(df, peer)
                    y = _numeric_series(df, column)
                    length = min(x.size, y.size)
                    if length >= 6:
                        _require_scipy("regression")
                        slope, intercept, r_value, p_value, _ = stats.linregress(x[:length], y[:length])
                        stat_record.p_values["regression_p"] = float(p_value)
                        stat_record.p_values["regression_r2"] = float(r_value ** 2)
                        stat_record.notes.append(f"regression using predictor {peer}; slope={slope:.4g}, intercept={intercept:.4g}")
                    else:
                        stat_record.notes.append("regression has insufficient paired samples.")
                else:
                    stat_record.notes.append("regression needs another numeric predictor and >=6 samples.")
            elif test_name == "chi_squared":
                peers = [c for c in numeric_columns if c != column]
                if peers and values.size >= 10:
                    peer = peers[0]
                    x = pd.to_numeric(df[column], errors="coerce")
                    y = pd.to_numeric(df[peer], errors="coerce")
                    mask = x.notna() & y.notna()
                    x = x[mask]
                    y = y[mask]
                    if len(x) >= 10:
                        _require_scipy("chi_squared")
                        x_cat = pd.qcut(x, q=3, duplicates="drop")
                        y_cat = pd.qcut(y, q=3, duplicates="drop")
                        contingency = pd.crosstab(x_cat, y_cat)
                        if contingency.shape[0] >= 2 and contingency.shape[1] >= 2:
                            chi2, p_value, _, _ = stats.chi2_contingency(contingency)
                            stat_record.p_values["chi_squared_p"] = float(p_value)
                            stat_record.p_values["chi_squared_stat"] = float(chi2)
                        else:
                            stat_record.notes.append("chi_squared contingency too small.")
                    else:
                        stat_record.notes.append("chi_squared insufficient valid paired samples.")
                else:
                    stat_record.notes.append("chi_squared needs another numeric signal and >=10 samples.")
            elif test_name == "spc":
                if values.size >= 5:
                    mean = float(np.mean(values))
                    std = float(np.std(values, ddof=1)) if values.size > 1 else 0.0
                    ucl = mean + 3 * std
                    lcl = mean - 3 * std
                    out_rate = float(np.mean((values > ucl) | (values < lcl)))
                    stat_record.p_values["spc_out_of_control_rate"] = out_rate
                    stat_record.notes.append(f"SPC limits: LCL={lcl:.4g}, UCL={ucl:.4g}")
                else:
                    stat_record.notes.append("spc needs >=5 samples.")
            elif test_name == "correlation":
                peers = [c for c in numeric_columns if c != column]
                if peers and values.size >= 3:
                    peer = peers[0]
                    a = pd.to_numeric(df[column], errors="coerce")
                    b = pd.to_numeric(df[peer], errors="coerce")
                    mask = a.notna() & b.notna()
                    if int(mask.sum()) >= 3:
                        corr = float(np.corrcoef(a[mask], b[mask])[0, 1])
                        stat_record.p_values["correlation_r"] = corr
                    else:
                        stat_record.notes.append("correlation insufficient paired samples.")
                else:
                    stat_record.notes.append("correlation needs another numeric signal.")
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
        if "hist" in normalized_plot or "distribution" in normalized_plot or "kde" in normalized_plot:
            for col in numeric_columns[:3]:
                fig, ax = plt.subplots(figsize=(6, 4))
                sns.histplot(pd.to_numeric(df[col], errors="coerce").dropna(), kde=True, ax=ax)
                ax.set_title(f"Distribution: {col}")
                plots.append(PlotArtifact(title=f"Distribution: {col}", data_uri=_plot_to_data_uri(fig)))
        if "scatter" in normalized_plot and len(numeric_columns) >= 2:
            a, b = numeric_columns[0], numeric_columns[1]
            fig, ax = plt.subplots(figsize=(6, 4))
            sns.scatterplot(x=df[a], y=df[b], ax=ax)
            ax.set_title(f"Scatter: {a} vs {b}")
            plots.append(PlotArtifact(title=f"Scatter: {a} vs {b}", data_uri=_plot_to_data_uri(fig)))
        if "control" in normalized_plot or "spc" in normalized_plot:
            for col in numeric_columns[:2]:
                series = pd.to_numeric(df[col], errors="coerce").dropna()
                if len(series) < 5:
                    continue
                mean = series.mean()
                std = series.std(ddof=1) if len(series) > 1 else 0.0
                ucl = mean + 3 * std
                lcl = mean - 3 * std
                fig, ax = plt.subplots(figsize=(7, 4))
                ax.plot(series.values, marker="o", markersize=2, linewidth=1)
                ax.axhline(mean, linestyle="--", label="Center")
                ax.axhline(ucl, color="red", linestyle="--", label="UCL")
                ax.axhline(lcl, color="red", linestyle="--", label="LCL")
                ax.set_title(f"SPC Chart: {col}")
                ax.legend()
                plots.append(PlotArtifact(title=f"SPC Chart: {col}", data_uri=_plot_to_data_uri(fig)))

    return AnalyzerExecutionResults(statistics=stats_by_signal, plots=plots)
