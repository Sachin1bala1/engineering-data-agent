"""DOE baseline vs experiment models."""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class DOEContext(BaseModel):
    process_name: str
    engineer: str
    baseline_description: Optional[str] = None
    experiment_description: Optional[str] = None
    doe_factors: Dict[str, Any] = Field(default_factory=dict)
    alignment_method: str
    time_assumptions: List[str] = Field(default_factory=list)


class DOEAnalysisPlan(BaseModel):
    alignment_method: str
    windowing: Optional[str] = None
    transformations: List[str] = Field(default_factory=list)
    tests: List[str] = Field(default_factory=list)
    excluded_parameters: List[str] = Field(default_factory=list)
    assumptions: List[str] = Field(default_factory=list)
    rationale: str


class DOEComparisonRow(BaseModel):
    parameter: str
    baseline_mean: float
    experiment_mean: float
    delta_percent: Optional[float]
    variance_change: Optional[float]
    test_used: Optional[str]
    p_value: Optional[float]
    baseline_std: float
    experiment_std: float
    baseline_n: int
    experiment_n: int


class DOEStabilityRisk(BaseModel):
    drift_detected: bool
    noise_amplification: bool
    transient_behavior: bool
    control_limit_proximity: str
    details: List[str] = Field(default_factory=list)


class DOEEngineeringInterpretation(BaseModel):
    summary: str
    material_changes: List[str] = Field(default_factory=list)
    implications: List[str] = Field(default_factory=list)
    recommended_actions: List[str] = Field(default_factory=list)


class DOEConfidenceComponents(BaseModel):
    data_completeness: float
    sample_adequacy: float
    noise_ratio: float
    significance_robustness: float
    assumption_risk: float


class DOEConfidenceWeights(BaseModel):
    data_completeness: float
    sample_adequacy: float
    noise_ratio: float
    significance_robustness: float
    assumption_risk: float


class DOEConfidenceScore(BaseModel):
    score: float
    components: DOEConfidenceComponents
    weights: DOEConfidenceWeights


class DOEPlotScript(BaseModel):
    title: str
    code: str


class DOEReport(BaseModel):
    report_id: str
    created_at: datetime
    context: DOEContext
    analysis_plan: DOEAnalysisPlan
    comparison_table: List[DOEComparisonRow]
    stability_risk: DOEStabilityRisk
    engineering_interpretation: DOEEngineeringInterpretation
    confidence: DOEConfidenceScore
    verdict: str
    plot_scripts: List[DOEPlotScript] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    raw_metadata: Dict[str, Any] = Field(default_factory=dict)


class DOEUploadResponse(BaseModel):
    success: bool
    report_id: Optional[str] = None
    message: str
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)


class DOEReportSummary(BaseModel):
    report_id: str
    created_at: datetime
    verdict: str
    confidence_score: float
