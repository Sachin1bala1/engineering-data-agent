"""
Failure Mode Intelligence Engine.
"""

from typing import Dict, List
import logging

from ..baseline.baseline import BaselineService
from ..models.data_models import (
    AssetType, FailureModeAssessment, FailureModeCatalogItem
)
from .definitions import FailureModeDefinition
from .motor import bearing as motor_bearing
from .motor import misalignment as motor_misalignment
from .motor import lubrication as motor_lubrication
from .motor import overheating as motor_overheating
from .motor import electrical as motor_electrical
from .pump import bearing as pump_bearing
from .pump import misalignment as pump_misalignment
from .pump import lubrication as pump_lubrication
from .pump import overheating as pump_overheating
from .pump import hydraulic as pump_hydraulic

logger = logging.getLogger(__name__)


class FailureModeEngine:
    """
    Evaluates deterministic failure modes per asset using multi-indicator correlation.
    """

    def __init__(self, baseline_service: BaselineService):
        self.baseline_service = baseline_service
        self._definitions = self._load_definitions()

    def _load_definitions(self) -> List[FailureModeDefinition]:
        return [
            motor_bearing.build_definition(),
            motor_misalignment.build_definition(),
            motor_lubrication.build_definition(),
            motor_overheating.build_definition(),
            motor_electrical.build_definition(),
            pump_bearing.build_definition(),
            pump_misalignment.build_definition(),
            pump_lubrication.build_definition(),
            pump_overheating.build_definition(),
            pump_hydraulic.build_definition()
        ]

    def evaluate_asset(self, asset_id: str, asset_type: AssetType,
                       sensor_data: list, maintenance_history: list) -> List[FailureModeAssessment]:
        if not sensor_data:
            return []

        # Prime baseline cache for z-score calculations
        self.baseline_service.compute_baselines(sensor_data[-200:])

        latest = max(sensor_data, key=lambda x: x.timestamp)
        current_values = {
            'temperature': latest.temperature,
            'vibration': latest.vibration,
            'run_hours': latest.run_hours,
            'alarm_frequency': latest.alarm_frequency
        }

        context = {
            'asset_id': asset_id,
            'asset_type': asset_type,
            'sensor_data': sensor_data,
            'maintenance_history': maintenance_history,
            'baseline_service': self.baseline_service,
            'current_values': current_values
        }

        assessments = []
        for definition in self._definitions:
            if definition.asset_type != asset_type:
                continue
            try:
                result = definition.detection_logic(context)
                if not result.triggered:
                    continue
                assessments.append(FailureModeAssessment(
                    failure_mode_id=definition.failure_mode_id,
                    asset_type=definition.asset_type,
                    physical_root_cause=definition.physical_root_cause,
                    stage=result.stage,
                    indicators=result.indicators,
                    detection_logic=result.detection_logic,
                    severity_score=definition.severity_score,
                    confidence_score=result.confidence_score,
                    risk_score=0.0,
                    recommended_action=definition.recommended_action,
                    urgency_days=definition.urgency_days,
                    skill_level_required=definition.skill_level_required,
                    explanation=result.explanation,
                    triggered=True
                ))
            except Exception as exc:
                logger.error("Failure mode evaluation error for %s: %s", definition.failure_mode_id, exc)

        return assessments

    def catalog(self) -> List[FailureModeCatalogItem]:
        items = []
        for definition in self._definitions:
            items.append(FailureModeCatalogItem(
                failure_mode_id=definition.failure_mode_id,
                asset_type=definition.asset_type,
                physical_root_cause=definition.physical_root_cause,
                observable_indicators=definition.observable_indicators,
                early_indicators=definition.early_indicators,
                mid_stage_indicators=definition.mid_stage_indicators,
                late_stage_indicators=definition.late_stage_indicators,
                detection_logic=definition.detection_logic_text,
                severity_score=definition.severity_score,
                risk_severity_impact=definition.risk_severity_impact,
                confidence_calculation=definition.confidence_calculation,
                recommended_action=definition.recommended_action,
                urgency_days=definition.urgency_days,
                skill_level_required=definition.skill_level_required
            ))
        return items
