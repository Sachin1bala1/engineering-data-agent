"""Models for Engineering Data Analyzer."""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class SignalProfile(BaseModel):
    type: str
    rows: int
    missing_pct: float
    distribution: str
    stationarity: Optional[str] = None
    units: Optional[str] = None


class DatasetProfile(BaseModel):
    dataset_type: str
    quality_score: float
    signals: Dict[str, SignalProfile]
    preview_rows: List[Dict[str, Any]]
    time_assumptions: List[str] = Field(default_factory=list)


class PlannerTest(BaseModel):
    test: str
    applies_to: str
    reason: str


class AnalysisPlan(BaseModel):
    analysis_goal: str
    recommended_tests: List[PlannerTest]
    recommended_plots: List[str]
    assumptions: List[str]


class AnalyzerPlanResponse(BaseModel):
    profile: DatasetProfile
    plan: AnalysisPlan


class ExecutionStatistic(BaseModel):
    mean: Optional[float] = None
    std: Optional[float] = None
    median: Optional[float] = None
    min: Optional[float] = None
    max: Optional[float] = None
    p_values: Dict[str, Optional[float]] = Field(default_factory=dict)
    notes: List[str] = Field(default_factory=list)


class PlotArtifact(BaseModel):
    title: str
    data_uri: str


class AnalyzerExecutionResults(BaseModel):
    statistics: Dict[str, ExecutionStatistic]
    plots: List[PlotArtifact]


class ValidationOutput(BaseModel):
    valid: bool
    warnings: List[str] = Field(default_factory=list)
    confidence_penalty: float = 0.0


class ConfidenceScore(BaseModel):
    score: float
    components: Dict[str, float]


class EngineeringExplanation(BaseModel):
    summary: str
    conclusions: List[str]
    limitations: List[str]
    tests_used: List[str]
    signals_used: List[str]


class AnalyzerReport(BaseModel):
    report_id: str
    created_at: datetime
    profile: DatasetProfile
    plan: AnalysisPlan
    results: AnalyzerExecutionResults
    validation: ValidationOutput
    confidence: ConfidenceScore
    explanation: EngineeringExplanation
    assumptions: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)


class AnalyzerRunResponse(BaseModel):
    success: bool
    report_id: Optional[str] = None
    message: str
    errors: List[str] = Field(default_factory=list)
