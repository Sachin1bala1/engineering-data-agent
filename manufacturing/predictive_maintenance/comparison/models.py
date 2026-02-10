"""Pydantic models for baseline vs experiment comparison."""

from datetime import datetime
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class SignalStats(BaseModel):
    mean: float
    std: float
    count: int
    min: Optional[float] = None
    max: Optional[float] = None


class DeviationMetrics(BaseModel):
    absolute_delta: float
    percent_delta: Optional[float]
    z_score_vs_baseline: Optional[float]
    trend_difference: Optional[float]
    persistence_above_baseline: Optional[float]


class SignalComparison(BaseModel):
    signal_name: str
    baseline_stats: SignalStats
    experiment_stats: SignalStats
    deviation_metrics: DeviationMetrics
    severity: str
    persistence: Optional[float] = None
    explanation: str


class AlignmentMetadata(BaseModel):
    alignment_method: str
    baseline_points: int
    experiment_points: int
    aligned_points: int
    data_loss_percent: float
    warnings: List[str] = Field(default_factory=list)


class ComparisonSummary(BaseModel):
    asset_id: str
    comparison_status: str
    primary_deviation_signal: Optional[str]
    confidence_level: float
    recommended_action: str
    engineering_rationale: str


class ComparisonReport(BaseModel):
    report_id: str
    created_at: datetime
    comparison_summary: ComparisonSummary
    signal_comparison: List[SignalComparison]
    alignment_metadata: AlignmentMetadata
    raw_metadata: Dict[str, Any] = Field(default_factory=dict)


class ComparisonUploadResponse(BaseModel):
    success: bool
    report_id: Optional[str] = None
    message: str
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class ComparisonHealth(BaseModel):
    status: str
    timestamp: datetime
    reports_cached: int
