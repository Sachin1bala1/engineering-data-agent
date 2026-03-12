"""DOE Wizard engine: design generation, AI recommendation, and analysis."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Tuple

import numpy as np
import pandas as pd

def _import_pydoe_symbol(name: str):
    try:
        module = __import__("pyDOE2", fromlist=[name])
        return getattr(module, name, None)
    except Exception:
        return None


ff2n = _import_pydoe_symbol("ff2n")
fracfact = _import_pydoe_symbol("fracfact")
pbdesign = _import_pydoe_symbol("pbdesign")
ccdesign = _import_pydoe_symbol("ccdesign")
bbdesign = _import_pydoe_symbol("bbdesign")
oa_design = _import_pydoe_symbol("oa_design")

import statsmodels.api as sm
import statsmodels.formula.api as smf
from statsmodels.nonparametric.smoothers_lowess import lowess


@dataclass
class Factor:
    name: str
    low: Optional[float] = None
    high: Optional[float] = None
    levels: Optional[List[str]] = None


def _safe_float(value: Any) -> Optional[float]:
    try:
        f = float(value)
    except Exception:
        return None
    if np.isnan(f) or np.isinf(f):
        return None
    return f


def _summary_stats(df: pd.DataFrame, response_col: str) -> Dict[str, Any]:
    if len(df) == 0:
        return {"rows": 0, "response_mean": None, "response_std": None}
    return {
        "rows": int(len(df)),
        "response_mean": _safe_float(df[response_col].mean()),
        "response_std": _safe_float(df[response_col].std()),
    }


def _factor_levels(factor: Factor) -> List[Any]:
    if factor.levels:
        return factor.levels
    if factor.low is None or factor.high is None:
        raise ValueError(f"Factor {factor.name} missing low/high")
    return [factor.low, factor.high]


def recommend_method(payload: Dict[str, Any]) -> Dict[str, Any]:
    # Deterministic baseline recommendation (used if AI unavailable)
    factors = int(payload.get("factors", 0))
    goal = (payload.get("goal") or "").lower()
    budget = (payload.get("budget") or "medium").lower()
    interactions = (payload.get("interactions") or "medium").lower()
    nonlinearity = (payload.get("nonlinearity") or "medium").lower()

    if goal in {"explore unknowns", "screen", "screening"} or factors >= 8:
        return {
            "method": "plackett_burman",
            "reason": "Great for quickly screening many factors with few runs.",
        }
    if nonlinearity in {"high", "unknown"} or goal in {"optimize", "maximize yield"}:
        return {
            "method": "response_surface",
            "reason": "Best for optimization and capturing curved effects.",
        }
    if budget in {"low", "tight"}:
        return {
            "method": "fractional_factorial",
            "reason": "Uses fewer runs while still estimating key effects.",
        }
    if interactions in {"high"} and factors <= 6:
        return {
            "method": "full_factorial",
            "reason": "Captures all interactions when factor count is manageable.",
        }
    return {
        "method": "taguchi",
        "reason": "Balanced, robust designs with fewer runs for practical use.",
    }


def generate_design(
    method: str,
    factors: List[Factor],
    center_points: int = 0,
    replicates: int = 1,
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    method = method.lower().replace(" ", "_")
    replicates = max(1, int(replicates or 1))
    meta: Dict[str, Any] = {"method": method, "runs": 0, "replicates": replicates, "center_points": center_points}

    if method == "full_factorial":
        grid = _full_factorial_grid(factors)
        df = pd.DataFrame(grid, columns=[f.name for f in factors])
    elif method == "fractional_factorial":
        if fracfact is not None:
            gen = " ".join([chr(ord("A") + i) for i in range(len(factors))])
            design = fracfact(gen)
            df = _decode_two_level_design(design, factors)
        else:
            grid = _full_factorial_grid(factors)
            df = pd.DataFrame(grid[::2], columns=[f.name for f in factors])
            meta["note"] = "Fractional factorial fallback used (half-fraction from full factorial)."
    elif method == "taguchi":
        if oa_design is not None:
            strength = 2
            n_factors = len(factors)
            oa = oa_design(strength, n_factors)
            df = _decode_two_level_design(oa, factors)
            meta["note"] = "Taguchi orthogonal array generated via pyDOE2."
        else:
            levels = [_factor_levels(f) for f in factors]
            grid = np.array(np.meshgrid(*levels)).T.reshape(-1, len(factors))
            target_runs = min(len(grid), max(8, 2 * len(factors)))
            if target_runs < len(grid):
                idx = np.linspace(0, len(grid) - 1, num=target_runs, dtype=int)
                grid = grid[idx]
            df = pd.DataFrame(grid, columns=[f.name for f in factors])
            meta["note"] = "Taguchi fallback used (balanced screening subset; install pyDOE2 with oa_design for native OA)."
    elif method == "plackett_burman":
        if pbdesign is not None:
            design = pbdesign(len(factors))
            df = _decode_two_level_design(design, factors)
        else:
            grid = _full_factorial_grid(factors)
            target_runs = min(len(grid), max(8, 2 * len(factors)))
            idx = np.linspace(0, len(grid) - 1, num=target_runs, dtype=int)
            df = pd.DataFrame(grid[idx], columns=[f.name for f in factors])
            meta["note"] = "Plackett-Burman fallback used (balanced screening subset)."
    elif method == "response_surface":
        if ccdesign is not None:
            design = ccdesign(len(factors), center=(center_points, center_points))
        else:
            design = _ccd_fallback_design(len(factors))
            meta["note"] = "Response surface fallback used (face-centered CCD)."
        df = _decode_ccd_design(design, factors)
    elif method == "box_behnken":
        if bbdesign is not None:
            design = bbdesign(len(factors), center=center_points)
        else:
            design = _box_behnken_fallback_design(len(factors))
            meta["note"] = "Box-Behnken fallback used (pairwise-midpoint design)."
        df = _decode_ccd_design(design, factors)
    elif method in {"sequential", "bayesian_optimization"}:
        grid = _full_factorial_grid(factors)
        df = pd.DataFrame(grid, columns=[f.name for f in factors])
        if center_points > 0:
            center = []
            for f in factors:
                if f.levels:
                    center.append(f.levels[0])
                else:
                    center.append((f.low + f.high) / 2)
            center_df = pd.DataFrame([center] * center_points, columns=[f.name for f in factors])
            df = pd.concat([df, center_df], ignore_index=True)
        meta["note"] = "Starter design for adaptive DOE. Next runs recommended after results."
    else:
        raise ValueError(f"Unsupported DOE method: {method}")

    # Optional center points for two-level designs (not for CCD/Box-Behnken)
    if center_points > 0 and method in {
        "full_factorial",
        "fractional_factorial",
        "taguchi",
        "plackett_burman",
        "sequential",
        "bayesian_optimization",
    }:
        center = []
        for f in factors:
            if f.levels:
                center.append(f.levels[0])
            else:
                center.append((f.low + f.high) / 2)
        center_df = pd.DataFrame([center] * center_points, columns=[f.name for f in factors])
        df = pd.concat([df, center_df], ignore_index=True)

    if replicates and replicates > 1:
        df = pd.concat([df] * int(replicates), ignore_index=True)

    meta["runs"] = int(len(df))
    return df, meta


def _decode_two_level_design(design: np.ndarray, factors: List[Factor]) -> pd.DataFrame:
    rows = []
    for row in design:
        record = {}
        for idx, f in enumerate(factors):
            if f.levels:
                record[f.name] = f.levels[0] if row[idx] == -1 else f.levels[-1]
            else:
                record[f.name] = f.low if row[idx] == -1 else f.high
        rows.append(record)
    return pd.DataFrame(rows)


def _decode_ccd_design(design: np.ndarray, factors: List[Factor]) -> pd.DataFrame:
    rows = []
    for row in design:
        record = {}
        for idx, f in enumerate(factors):
            if f.levels:
                record[f.name] = f.levels[0] if row[idx] <= 0 else f.levels[-1]
            else:
                center = (f.low + f.high) / 2
                span = (f.high - f.low) / 2
                record[f.name] = center + (row[idx] * span)
        rows.append(record)
    return pd.DataFrame(rows)


def _full_factorial_grid(factors: List[Factor]) -> np.ndarray:
    levels = [_factor_levels(f) for f in factors]
    return np.array(np.meshgrid(*levels)).T.reshape(-1, len(factors))


def _ccd_fallback_design(n_factors: int) -> np.ndarray:
    # Face-centered CCD fallback: factorial (+/-1), axial points, and one center.
    factorial = ff2n(n_factors) if ff2n is not None else np.array(np.meshgrid(*([[-1, 1]] * n_factors))).T.reshape(-1, n_factors)
    axial_rows = []
    for i in range(n_factors):
        plus = np.zeros(n_factors)
        minus = np.zeros(n_factors)
        plus[i] = 1.0
        minus[i] = -1.0
        axial_rows.append(plus)
        axial_rows.append(minus)
    center = np.zeros((1, n_factors))
    return np.vstack([factorial, np.array(axial_rows), center])


def _box_behnken_fallback_design(n_factors: int) -> np.ndarray:
    if n_factors < 3:
        return _ccd_fallback_design(n_factors)
    rows = []
    for i in range(n_factors):
        for j in range(i + 1, n_factors):
            for a in (-1.0, 1.0):
                for b in (-1.0, 1.0):
                    row = np.zeros(n_factors)
                    row[i] = a
                    row[j] = b
                    rows.append(row)
    rows.append(np.zeros(n_factors))
    return np.array(rows)


def analyze_results(
    df: pd.DataFrame,
    response_col: str,
    factors: List[Factor],
    include_interactions: bool = True,
) -> Dict[str, Any]:
    df = df.copy()
    warnings: List[str] = []

    # Normalize column names (case-insensitive match)
    col_map = {str(col).strip().lower(): col for col in df.columns}
    response_key = str(response_col).strip().lower()
    if response_key not in col_map:
        raise ValueError("Response column not found.")
    response_col = col_map[response_key]

    resolved_factors: List[Factor] = []
    missing: List[str] = []
    for f in factors:
        key = str(f.name).strip().lower()
        if key in col_map:
            resolved_factors.append(Factor(name=col_map[key], low=f.low, high=f.high, levels=f.levels))
        else:
            missing.append(f.name)

    if missing:
        warnings.append(f"Missing factors ignored: {', '.join(missing)}")
    if not resolved_factors:
        raise ValueError("No valid factor columns found in results file.")

    # Coerce response to numeric (DOE responses must be numeric)
    df[response_col] = pd.to_numeric(df[response_col], errors="coerce")

    for f in resolved_factors:
        if f.name not in df.columns:
            continue
        if f.levels:
            df[f.name] = df[f.name].astype("category")
            continue
        if np.issubdtype(df[f.name].dtype, np.number):
            continue
        numeric = pd.to_numeric(df[f.name], errors="coerce")
        non_null = int(numeric.notna().sum())
        if non_null >= max(3, int(0.7 * len(df))):
            df[f.name] = numeric
        else:
            df[f.name] = df[f.name].astype("category")

    # Drop rows with missing/inf in response or factor columns
    used_cols = [response_col] + [f.name for f in resolved_factors]
    df = df.replace([np.inf, -np.inf], np.nan)
    before_rows = len(df)
    df = df.dropna(subset=used_cols)
    dropped = before_rows - len(df)
    if dropped > 0:
        warnings.append(f"Dropped {dropped} rows with missing/inf values.")
    if df[response_col].notna().sum() == 0:
        raise ValueError("Response column could not be parsed as numeric.")
    if df[response_col].nunique(dropna=True) < 2:
        warnings.append("Response column has <2 unique values; model fit skipped.")
        summary = _summary_stats(df, response_col)
        return {
            "formula": None,
            "anova": [],
            "main_effects": {},
            "warnings": warnings,
            "model_summary": {},
            "optimization": {"recommended_settings": {}, "predicted_response": None},
            "confidence": 0.0,
            "summary": summary,
        }
    if len(df) < max(4, len(resolved_factors) + 2):
        # If too few rows remain, return a minimal analysis instead of erroring
        warnings.append("Too few valid rows to fit a full model. Showing summary only.")
        summary = _summary_stats(df, response_col)
        return {
            "formula": None,
            "anova": [],
            "main_effects": {},
            "warnings": warnings,
            "model_summary": {},
            "optimization": {"recommended_settings": {}, "predicted_response": None},
            "confidence": 0.0,
            "summary": summary,
        }

    factor_terms = [
        f"C({f.name})" if not np.issubdtype(df[f.name].dtype, np.number) else f.name
        for f in resolved_factors
    ]
    def _build_terms(use_interactions: bool) -> Tuple[List[str], str]:
        terms = []
        if use_interactions:
            for i in range(len(factor_terms)):
                for j in range(i + 1, len(factor_terms)):
                    terms.append(f"{factor_terms[i]}:{factor_terms[j]}")
        formula_local = f"{response_col} ~ " + " + ".join(factor_terms + terms)
        return terms, formula_local

    interactions, formula = _build_terms(include_interactions)

    # Guard against over-parameterized models (df_resid <= 0)
    param_count = 1 + len(factor_terms) + len(interactions)
    if len(df) <= param_count and include_interactions:
        warnings.append("Interactions disabled due to small sample size.")
        interactions, formula = _build_terms(False)
        param_count = 1 + len(factor_terms) + len(interactions)

    if len(df) <= param_count:
        warnings.append(
            "Too few rows to fit the model. Showing summary only."
        )
        summary = _summary_stats(df, response_col)
        return {
            "formula": formula,
            "anova": [],
            "main_effects": {},
            "warnings": warnings,
            "model_summary": {},
            "optimization": {"recommended_settings": {}, "predicted_response": None},
            "confidence": 0.0,
            "summary": summary,
        }

    try:
        model = smf.ols(formula, data=df).fit()
        anova = sm.stats.anova_lm(model, typ=2).reset_index().rename(columns={"index": "term"})
    except Exception as exc:
        warnings.append(f"Model fit failed: {exc}")
        summary = _summary_stats(df, response_col)
        return {
            "formula": formula,
            "anova": [],
            "main_effects": {},
            "warnings": warnings,
            "model_summary": {},
            "optimization": {"recommended_settings": {}, "predicted_response": None},
            "confidence": 0.0,
            "summary": summary,
        }

    # Correlation map for numeric columns (factors + response)
    numeric_cols = []
    for f in resolved_factors:
        if f.name in df.columns and np.issubdtype(df[f.name].dtype, np.number):
            numeric_cols.append(f.name)
    if response_col not in numeric_cols and np.issubdtype(df[response_col].dtype, np.number):
        numeric_cols.append(response_col)
    correlation = None
    if len(numeric_cols) >= 2:
        corr_df = df[numeric_cols].corr().round(3)
        correlation = {
            "columns": numeric_cols,
            "matrix": corr_df.values.tolist(),
        }

    main_effects = {}
    for f in resolved_factors:
        if f.name in df.columns:
            main_effects[f.name] = df.groupby(f.name)[response_col].mean().reset_index().to_dict(orient="records")

    grid = df[[f.name for f in resolved_factors]].drop_duplicates()
    preds = model.predict(grid)
    best_idx = int(np.argmax(preds))
    best_row = grid.iloc[best_idx].to_dict()

    r2 = float(model.rsquared)
    pvals = anova["PR(>F)"].dropna().values
    sig = float(np.mean(pvals < 0.05)) if len(pvals) else 0.0
    confidence = round(0.6 * r2 + 0.4 * sig, 3)

    # Regression diagnostics
    diagnostics = {}
    try:
        fitted = model.fittedvalues.tolist()
        residuals = model.resid.tolist()
        influence = model.get_influence()
        leverage = influence.hat_matrix_diag.tolist()
        cooks = influence.cooks_distance[0].tolist() if hasattr(influence, 'cooks_distance') else [None] * len(fitted)
        std_resid = influence.resid_studentized_internal.tolist()
        diagnostics["residuals_vs_fitted"] = [
            {"fitted": float(f), "residual": float(r)}
            for f, r in zip(fitted, residuals)
        ]
        # LOWESS smooth line for residuals vs fitted
        try:
            smooth = lowess(residuals, fitted, frac=0.5, return_sorted=True)
            diagnostics["residuals_vs_fitted_smooth"] = [
                {"fitted": float(x), "residual": float(y)}
                for x, y in smooth
            ]
        except Exception:
            diagnostics["residuals_vs_fitted_smooth"] = []
        # Q-Q plot data
        try:
            prob = sm.ProbPlot(model.resid)
            theoretical = prob.theoretical_quantiles.tolist()
            ordered = prob.sample.tolist()
            diagnostics["qq"] = [
                {"theoretical": float(t), "residual": float(r)}
                for t, r in zip(theoretical, ordered)
            ]
        except Exception:
            diagnostics["qq"] = []
        diagnostics["leverage"] = [
            {"leverage": float(h), "cooks": float(c) if c is not None else None, "residual": float(r), "fitted": float(f), "std_resid": float(s)}
            for h, c, r, f, s in zip(leverage, cooks, residuals, fitted, std_resid)
        ]
        n = len(fitted) if len(fitted) else 1
        p = int(model.df_model) + 1
        diagnostics["thresholds"] = {
            "leverage": float(2 * p / n),
            "cooks": float(4 / n),
            "std_resid": 2.0,
        }
    except Exception:
        diagnostics = {}

    # Build regression equation string
    try:
        terms = []
        for term in model.params.index:
            coef = float(model.params[term])
            label = "Intercept" if term == "Intercept" else term
            terms.append((label, coef))
        equation = "y = " + " + ".join([
            f"{coef:.4g}" if label == "Intercept" else f"{coef:.4g}*{label}"
            for label, coef in terms
        ])
        equation_str = equation
    except Exception:
        equation_str = None

    return {
        "formula": formula,
        "anova": anova.to_dict(orient="records"),
        "main_effects": main_effects,
        "warnings": warnings,
        "model_summary": {
            "r2": r2,
            "adj_r2": float(model.rsquared_adj),
            "aic": float(model.aic),
            "bic": float(model.bic),
        },
        "regression": {
            "equation": equation_str,
            "coefficients": [
                {
                    "term": term,
                    "coef": float(model.params[term]),
                    "stderr": float(model.bse[term]) if term in model.bse else None,
                    "p_value": float(model.pvalues[term]) if term in model.pvalues else None,
                }
                for term in model.params.index
            ],
            "predicted_vs_actual": [
                {"actual": float(a), "predicted": float(p), "residual": float(a - p)}
                for a, p in zip(df[response_col].tolist(), model.predict(df).tolist())
            ],
        },
        "correlation": correlation,
        "diagnostics": diagnostics,
        "optimization": {
            "recommended_settings": best_row,
            "predicted_response": float(preds.iloc[best_idx]),
        },
        "confidence": confidence,
        "summary": _summary_stats(df, response_col),
    }
