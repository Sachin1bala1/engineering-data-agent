"""
Failure mode definitions and detection result structures.
"""

from dataclasses import dataclass
from typing import Callable, List

from ..models.data_models import (
    AssetType, SkillLevel, FailureStage, FailureModeIndicator
)


@dataclass
class DetectionResult:
    """Result of deterministic failure mode detection."""
    triggered: bool
    stage: FailureStage
    indicators: List[FailureModeIndicator]
    confidence_score: float
    explanation: str
    detection_logic: str


@dataclass
class FailureModeDefinition:
    """Formal failure mode knowledge definition."""
    failure_mode_id: str
    asset_type: AssetType
    physical_root_cause: str
    observable_indicators: List[str]
    early_indicators: List[str]
    mid_stage_indicators: List[str]
    late_stage_indicators: List[str]
    severity_score: float
    risk_severity_impact: str
    recommended_action: str
    urgency_days: int
    skill_level_required: SkillLevel
    detection_logic_text: str
    detection_logic: Callable[[dict], DetectionResult]
    confidence_calculation: str
