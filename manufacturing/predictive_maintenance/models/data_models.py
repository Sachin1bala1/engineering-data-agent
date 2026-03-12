"""
Data models for the predictive maintenance system.

This module defines Pydantic models for API requests, responses, and internal data structures.
All models include validation and documentation for production use.
"""

from datetime import datetime
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field, field_validator
from enum import Enum


class AssetType(str, Enum):
    """Supported asset types in the manufacturing plant."""
    ELECTRIC_MOTOR = "electric_motor"
    PUMP = "pump"


class FailureType(str, Enum):
    """Common failure modes for industrial assets."""
    BEARING_WEAR = "bearing_wear"
    OVERHEATING = "overheating"
    VIBRATION_ISSUE = "vibration_issue"
    SEAL_FAILURE = "seal_failure"
    IMPELLER_WEAR = "impeller_wear"
    MOTOR_BURNOUT = "motor_burnout"


class SkillLevel(str, Enum):
    """Required skill level for corrective action execution."""
    OPERATOR = "operator"
    MAINTENANCE_TECHNICIAN = "maintenance_technician"
    RELIABILITY_ENGINEER = "reliability_engineer"


class FailureStage(str, Enum):
    """Failure progression stage based on indicator severity and persistence."""
    EARLY = "early"
    MID = "mid"
    LATE = "late"


class SensorDataPoint(BaseModel):
    """Individual sensor reading from an asset."""
    timestamp: datetime = Field(..., description="ISO 8601 timestamp of the reading")
    asset_id: str = Field(..., min_length=1, description="Unique identifier for the asset")
    asset_type: Optional[AssetType] = Field(None, description="Asset type if known")
    temperature: Optional[float] = Field(None, description="Temperature reading in Celsius")
    vibration: Optional[float] = Field(None, description="Vibration amplitude in mm/s")
    run_hours: Optional[float] = Field(None, description="Cumulative operating hours")
    alarm_count: Optional[float] = Field(None, description="Alarm count per hour or reporting interval")
    alarm_frequency: Optional[float] = Field(
        None, description="Alias for alarm_count for UI continuity"
    )
    raw_signal_metadata: Optional[Dict[str, Any]] = Field(
        None, description="Raw signal columns preserved for traceability"
    )

    @field_validator('timestamp', mode='before')
    def parse_timestamp(cls, v):
        """Parse timestamp from string or datetime object."""
        if isinstance(v, str):
            return datetime.fromisoformat(v.replace('Z', '+00:00'))
        return v


class MaintenanceLog(BaseModel):
    """Historical maintenance or failure record."""
    asset_id: str = Field(..., min_length=1, description="Asset identifier")
    failure_type: FailureType = Field(..., description="Type of failure or maintenance performed")
    failure_date: datetime = Field(..., description="Date of the failure/maintenance event")

    @field_validator('failure_date', mode='before')
    def parse_failure_date(cls, v):
        """Parse failure date from string or datetime object."""
        if isinstance(v, str):
            return datetime.fromisoformat(v.replace('Z', '+00:00'))
        return v


class FailureModeIndicator(BaseModel):
    """Observable indicator used in failure mode detection."""
    name: str
    value: Optional[float] = None
    status: str = Field(..., description="normal/elevated/critical")
    evidence: Optional[str] = None
    window_hours: Optional[int] = None


class FailureModeAssessment(BaseModel):
    """Deterministic assessment for a specific failure mode."""
    failure_mode_id: str
    asset_type: AssetType
    physical_root_cause: str
    stage: FailureStage
    indicators: List[FailureModeIndicator]
    detection_logic: str
    severity_score: float = Field(..., ge=0, le=1)
    confidence_score: float = Field(..., ge=0, le=1)
    risk_score: float = Field(..., ge=0, le=100)
    recommended_action: str
    urgency_days: int
    skill_level_required: SkillLevel
    explanation: str
    triggered: bool = True


class BaselineMetrics(BaseModel):
    """Computed baseline statistics for an asset parameter."""
    asset_id: str
    parameter: str  # 'temperature', 'vibration', etc.
    mean: float = Field(..., description="Rolling mean value")
    std: float = Field(..., description="Rolling standard deviation")
    window_size: int = Field(..., description="Number of data points used for baseline")
    last_updated: datetime = Field(default_factory=datetime.now)


class RuleEvaluation(BaseModel):
    """Result of applying a maintenance rule to asset data."""
    rule_name: str
    asset_id: str
    triggered: bool = Field(..., description="Whether the rule conditions were met")
    severity_score: float = Field(..., ge=0, le=1, description="Severity score from 0-1")
    confidence: float = Field(..., ge=0, le=1, description="Confidence in the rule evaluation")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional rule-specific data")


class RiskFactors(BaseModel):
    """Individual risk factors contributing to overall risk score."""
    severity: float = Field(..., ge=0, le=1, description="Impact severity if failure occurs")
    persistence: float = Field(..., ge=0, le=1, description="How long the issue has persisted")
    rate_of_change: float = Field(..., ge=0, le=1, description="Rate at which condition is deteriorating")
    historical_failure_rate: float = Field(..., ge=0, le=1, description="Historical failure frequency")


class RiskAssessment(BaseModel):
    """Complete risk assessment for an asset."""
    asset_id: str
    asset_type: AssetType
    risk_score: float = Field(..., ge=0, le=100, description="Overall risk score (0-100)")
    risk_level: str = Field(..., description="Risk level: LOW/MEDIUM/HIGH/CRITICAL")
    failure_mode: Optional[str] = Field(None, description="Primary failure mode identifier")
    recommended_action: str = Field(..., description="Recommended maintenance action")
    risk_factors: RiskFactors
    confidence_level: float = Field(..., ge=0, le=1, description="Confidence in the assessment")
    assessment_timestamp: datetime = Field(default_factory=datetime.now)
    next_inspection_days: Optional[int] = Field(None, description="Days until next recommended inspection")
    urgency_bucket: Optional[str] = Field(None, description="0-3 days, 3-7 days, 7-30 days")
    inspection_interval_days: Optional[int] = Field(None, description="Recommended inspection interval")
    primary_failure_mode: Optional[str] = None
    secondary_failure_modes: List[str] = Field(default_factory=list)
    failure_mode_assessments: List[FailureModeAssessment] = Field(default_factory=list)


class FailureModeCatalogItem(BaseModel):
    """Catalog entry for supported failure modes."""
    failure_mode_id: str
    asset_type: AssetType
    physical_root_cause: str
    observable_indicators: List[str]
    early_indicators: List[str]
    mid_stage_indicators: List[str]
    late_stage_indicators: List[str]
    detection_logic: str
    severity_score: float = Field(..., ge=0, le=1)
    risk_severity_impact: str
    confidence_calculation: str
    recommended_action: str
    urgency_days: int
    skill_level_required: SkillLevel


class FailureModeTimelineEvent(BaseModel):
    """Timeline event for failure mode progression."""
    failure_mode_id: str
    stage: FailureStage
    timestamp: datetime
    description: str


class SensorTrendPoint(BaseModel):
    """Time-series point for sensor trend charts."""
    timestamp: datetime
    temperature: Optional[float] = None
    vibration: Optional[float] = None
    alarm_frequency: Optional[float] = None
    run_hours: Optional[float] = None


class BaselineBand(BaseModel):
    """Baseline band for a parameter."""
    mean: float
    std: float


class CopilotContextRequest(BaseModel):
    """Optional request data for building copilot context."""
    role: Optional[str] = Field(None, description="operator/technician/engineer")


class CopilotQueryRequest(BaseModel):
    """Request payload for copilot query."""
    asset_id: str
    question: str
    role: str
    session_id: Optional[str] = None


class ComparisonCopilotContextRequest(BaseModel):
    """Optional request payload for comparison copilot context setup."""
    session_id: Optional[str] = None


class ComparisonCopilotQueryRequest(BaseModel):
    """Request payload for comparison copilot query."""
    report_id: str
    question: str
    role: str
    session_id: Optional[str] = None


class AnalyzerCopilotContextRequest(BaseModel):
    """Optional request payload for analyzer copilot context setup."""
    session_id: Optional[str] = None


class AnalyzerCopilotQueryRequest(BaseModel):
    """Request payload for analyzer copilot query."""
    report_id: str
    question: str
    role: str
    session_id: Optional[str] = None


class AnalyzerCopilotContextResponse(BaseModel):
    """Response payload for analyzer copilot context setup."""
    report_id: str
    generated_at: str


class CopilotEvidence(BaseModel):
    """Evidence entry used by copilot response."""
    source: str
    detail: str


class CopilotResponse(BaseModel):
    """Structured copilot response."""
    summary: str
    evidence_used: List[CopilotEvidence]
    suggested_next_checks: List[str]
    confidence_disclaimer: str
    decision_support: str = Field(default="Decision Support Only")
    hypotheses: Optional[List[Dict[str, Any]]] = None
    llm_used: Optional[bool] = None
    python_script: Optional[str] = None


class ScriptRunRequest(BaseModel):
    """Request payload for executing a Python script."""
    code: str
    timeout_sec: Optional[int] = Field(default=20, ge=1, le=120)
    session_id: Optional[str] = None
    persist_changes: bool = False


class ScriptRunImage(BaseModel):
    filename: str
    data_uri: str


class ScriptRunResponse(BaseModel):
    """Response payload for Python script execution."""
    stdout: str
    stderr: str
    images: List[ScriptRunImage] = Field(default_factory=list)
    chartSpec: Optional[Dict[str, Any]] = None


class TimeNormalizationRequest(BaseModel):
    raw_value: str
    row_date: Optional[str] = None
    default_date: Optional[str] = None
    start_date: Optional[str] = None
    shift_name: Optional[str] = None


class TimeNormalizationResponse(BaseModel):
    raw_value: str
    normalized_iso: Optional[str]
    confidence: float
    assumptions: List[str]
    time_class: str


class AgentRecommendation(BaseModel):
    diagnosis: str
    root_cause: str
    recommended_fix: Dict[str, Any]
    confidence: float
    explanation: str


class OperatorConfirmationRequest(BaseModel):
    report_id: str
    action: str
    approved: bool
    notes: Optional[str] = None


class TimeRecommendationRequest(BaseModel):
    report_id: str


class ExecutionPolicyDecision(BaseModel):
    auto_apply: bool
    reason: str


class UploadResponse(BaseModel):
    """Response from data upload endpoint."""
    success: bool
    message: str
    records_processed: int
    assets_updated: List[str]
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    ingestion_report_id: Optional[str] = None
    transformation_report: Optional[Dict[str, Any]] = None


class FileAnalysisSummary(BaseModel):
    """Per-file deterministic analysis summary."""
    file_name: str
    success: bool
    message: str
    records_processed: int
    assets_updated: List[str]
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    ingestion_report_id: Optional[str] = None
    risk_assessments: List[RiskAssessment] = Field(default_factory=list)


class BatchUploadResponse(BaseModel):
    """Response from batch data upload endpoint."""
    success: bool
    message: str
    files_processed: int
    total_records_processed: int
    assets_updated: List[str]
    file_results: List[FileAnalysisSummary]


class RiskSummaryResponse(BaseModel):
    """Response from risk summary endpoint."""
    total_assets: int
    high_risk_assets: int
    critical_assets: int
    assessments: List[RiskAssessment]
    generated_at: datetime = Field(default_factory=datetime.now)


class APIError(BaseModel):
    """Standard error response format."""
    error: str
    message: str
    details: Optional[Dict[str, Any]] = None
