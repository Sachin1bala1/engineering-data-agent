"""
Risk scoring service for predictive maintenance system.

This module computes risk scores (0-100) based on deterministic engineering factors:
- Severity: Impact if failure occurs
- Persistence: How long the issue has persisted
- Rate of change: Speed at which condition is deteriorating

Engineering Logic:
- Risk scores calibrated to maintenance priorities
- Weighted combination of multiple risk factors
- Historical failure data integration
- Actionable thresholds for maintenance decisions
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum
import logging

from ..models.data_models import (
    SensorDataPoint, MaintenanceLog, FailureModeAssessment,
    RiskAssessment, RiskFactors, AssetType, FailureStage
)

logger = logging.getLogger(__name__)


class RiskLevel(Enum):
    """Risk level categories for maintenance prioritization."""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


@dataclass
class RiskComponents:
    """Individual components that contribute to overall risk score."""
    severity: float  # 0-1 scale
    persistence: float  # 0-1 scale
    rate_of_change: float  # 0-1 scale
    historical_factor: float  # 0-1 scale
    operational_factor: float  # 0-1 scale


class RiskScoringService:
    """
    Service for computing risk scores based on engineering principles.

    Combines multiple factors to produce actionable risk assessments
    that guide maintenance decision making in industrial environments.
    """

    # Risk score thresholds and mappings
    RISK_THRESHOLDS = {
        0: RiskLevel.LOW,
        30: RiskLevel.MEDIUM,
        70: RiskLevel.HIGH,
        90: RiskLevel.CRITICAL
    }

    # Risk factor weights (sum to 1.0)
    RISK_WEIGHTS = {
        'severity': 0.4,
        'persistence': 0.25,
        'rate_of_change': 0.2,
        'historical_factor': 0.1,
        'operational_factor': 0.05
    }

    def __init__(self):
        """Initialize risk scoring service."""
        self.logger = logging.getLogger(__name__)

    def compute_risk_assessment(self, asset_id: str, asset_type: AssetType,
                               failure_mode_assessments: List[FailureModeAssessment],
                               sensor_data: List[SensorDataPoint],
                               maintenance_history: List[MaintenanceLog]) -> RiskAssessment:
        """
        Compute comprehensive risk assessment for an asset.

        Args:
            asset_id: Asset identifier
            asset_type: Type of asset
            rule_evaluations: Results from rules engine
            sensor_data: Historical sensor data
            maintenance_history: Maintenance history

        Returns:
            Complete risk assessment with score and recommendations

        Engineering Logic:
        - Combines multiple risk factors using weighted scoring
        - Considers asset criticality and failure consequences
        - Accounts for historical failure patterns
        - Provides maintenance recommendations based on risk level
        """
        # Calculate individual risk components
        risk_components = self._calculate_risk_components(
            asset_id, failure_mode_assessments, sensor_data, maintenance_history
        )

        mode_scores = self._score_failure_modes(failure_mode_assessments)
        risk_score = self._aggregate_asset_risk(mode_scores)

        risk_level = self._determine_risk_level(risk_score)
        primary_failure_mode, secondary_modes = self._determine_primary_failure_modes(mode_scores)
        recommended_action = self._generate_recommendation(risk_level, primary_failure_mode, asset_type)
        next_inspection_days = self._calculate_next_inspection(risk_score, risk_components)
        urgency_bucket = self._determine_urgency_bucket(failure_mode_assessments)
        inspection_interval = self._calculate_inspection_interval(risk_score)

        return RiskAssessment(
            asset_id=asset_id,
            asset_type=asset_type,
            risk_score=risk_score,
            risk_level=risk_level.value,
            failure_mode=primary_failure_mode,
            recommended_action=recommended_action,
            risk_factors=RiskFactors(
                severity=risk_components.severity,
                persistence=risk_components.persistence,
                rate_of_change=risk_components.rate_of_change,
                historical_failure_rate=risk_components.historical_factor
            ),
            confidence_level=self._calculate_confidence_level(failure_mode_assessments),
            next_inspection_days=next_inspection_days,
            urgency_bucket=urgency_bucket,
            inspection_interval_days=inspection_interval,
            primary_failure_mode=primary_failure_mode,
            secondary_failure_modes=secondary_modes,
            failure_mode_assessments=failure_mode_assessments
        )

    def _calculate_risk_components(self, asset_id: str,
                                  failure_mode_assessments: List[FailureModeAssessment],
                                  sensor_data: List[SensorDataPoint],
                                  maintenance_history: List[MaintenanceLog]) -> RiskComponents:
        """
        Calculate individual risk components that contribute to overall score.

        Engineering Logic:
        - Severity based on potential failure impact and rule evaluations
        - Persistence considers how long issues have been present
        - Rate of change measures speed of deterioration
        - Historical factor accounts for past failure frequency
        - Operational factor considers current operational context
        """
        # Severity: Based on highest severity rule that triggered
        severity = 0.0
        if failure_mode_assessments:
            max_severity = max(failure_mode_assessments, key=lambda r: r.severity_score)
            severity = max_severity.severity_score
            critical_modes = [m for m in failure_mode_assessments if m.severity_score >= 0.8]
            if len(critical_modes) > 1:
                severity = min(1.0, severity + 0.1)

        # Persistence: How long issues have been detected
        persistence = self._calculate_persistence_factor(failure_mode_assessments, sensor_data)

        # Rate of change: Speed of parameter deterioration
        rate_of_change = self._calculate_rate_of_change(sensor_data)

        # Historical failure rate: Based on maintenance history
        historical_factor = self._calculate_historical_factor(asset_id, maintenance_history)

        # Operational factor: Based on run hours and current conditions
        operational_factor = self._calculate_operational_factor(sensor_data)

        return RiskComponents(
            severity=severity,
            persistence=persistence,
            rate_of_change=rate_of_change,
            historical_factor=historical_factor,
            operational_factor=operational_factor
        )

    def _calculate_persistence_factor(self, failure_mode_assessments: List[FailureModeAssessment],
                                    sensor_data: List[SensorDataPoint]) -> float:
        """
        Calculate how persistent the detected issues are.

        Engineering Logic:
        - Considers duration of elevated parameters
        - Accounts for continuous vs intermittent issues
        - Higher persistence indicates higher risk
        """
        if not failure_mode_assessments or not sensor_data:
            return 0.0
        avg_confidence = np.mean([r.confidence_score for r in failure_mode_assessments])
        stage_weight = np.mean([
            0.4 if r.stage == FailureStage.EARLY else 0.7 if r.stage == FailureStage.MID else 1.0
            for r in failure_mode_assessments
        ])
        mode_count_factor = min(1.0, len(failure_mode_assessments) / 3.0)

        return min(1.0, (avg_confidence * 0.5 + stage_weight * 0.3 + mode_count_factor * 0.2))

    def _calculate_rate_of_change(self, sensor_data: List[SensorDataPoint]) -> float:
        """
        Calculate rate of change in sensor parameters.

        Engineering Logic:
        - Measures speed of deterioration using trend analysis
        - Rapid changes indicate imminent failure
        - Uses statistical measures of parameter trends
        """
        if len(sensor_data) < 10:
            return 0.0

        # Analyze temperature and vibration trends
        recent_data = sorted(sensor_data, key=lambda x: x.timestamp)[-50:]  # Last 50 readings

        temp_trend = self._calculate_trend([s.temperature for s in recent_data if s.temperature])
        vib_trend = self._calculate_trend([s.vibration for s in recent_data if s.vibration])

        # Combine trends (absolute values since both increasing trends are bad)
        combined_trend = (abs(temp_trend) + abs(vib_trend)) / 2.0

        # Normalize to 0-1 scale (trends > 0.5 indicate rapid change)
        return min(1.0, combined_trend / 0.5)

    def _calculate_trend(self, values: List[float]) -> float:
        """Calculate linear trend slope for a parameter."""
        if len(values) < 5:
            return 0.0

        # Simple linear regression slope
        x = np.arange(len(values))
        y = np.array(values)

        # Remove NaN values
        valid_mask = ~np.isnan(y)
        if np.sum(valid_mask) < 5:
            return 0.0

        x_valid = x[valid_mask]
        y_valid = y[valid_mask]

        # Calculate slope
        slope = np.polyfit(x_valid, y_valid, 1)[0]
        return slope

    def _calculate_historical_factor(self, asset_id: str,
                                   maintenance_history: List[MaintenanceLog]) -> float:
        """
        Calculate historical failure factor based on maintenance records.

        Engineering Logic:
        - Considers frequency of past failures
        - Accounts for similar failure types
        - Indicates assets with poor maintenance history
        """
        if not maintenance_history:
            return 0.0

        # Count failures in last year
        one_year_ago = datetime.now() - timedelta(days=365)
        recent_failures = [
            log for log in maintenance_history
            if log.failure_date > one_year_ago and log.asset_id == asset_id
        ]

        # Calculate failure rate (failures per year)
        failure_rate = len(recent_failures)

        # Normalize to 0-1 scale (more than 4 failures/year is high risk)
        return min(1.0, failure_rate / 4.0)

    def _calculate_operational_factor(self, sensor_data: List[SensorDataPoint]) -> float:
        """
        Calculate operational context factor.

        Engineering Logic:
        - Considers run hours (higher hours = higher risk)
        - Accounts for continuous operation periods
        - Factors in current operational stress
        """
        if not sensor_data:
            return 0.0

        # Get latest run hours
        latest_data = max(sensor_data, key=lambda x: x.timestamp)
        run_hours = latest_data.run_hours or 0

        # Risk increases with run hours (high risk after 8000 hours)
        operational_risk = min(1.0, run_hours / 8000.0)

        return operational_risk

    def _compute_overall_risk_score(self, components: RiskComponents) -> float:
        """
        Compute overall risk score (0-100) from risk components.

        Engineering Logic:
        - Weighted combination of risk factors
        - Non-linear scaling for critical thresholds
        - Calibrated to maintenance decision making
        """
        # Weighted sum of components
        weighted_score = (
            components.severity * self.RISK_WEIGHTS['severity'] +
            components.persistence * self.RISK_WEIGHTS['persistence'] +
            components.rate_of_change * self.RISK_WEIGHTS['rate_of_change'] +
            components.historical_factor * self.RISK_WEIGHTS['historical_factor'] +
            components.operational_factor * self.RISK_WEIGHTS['operational_factor']
        )

        # Apply non-linear scaling for better discrimination at high risk levels
        if weighted_score > 0.7:
            # Exponential scaling for high-risk situations
            scaled_score = 70 + 30 * ((weighted_score - 0.7) / 0.3) ** 1.5
        else:
            # Linear scaling for normal to medium risk
            scaled_score = 100 * (weighted_score / 0.7)

        return min(100.0, max(0.0, scaled_score))

    def _determine_risk_level(self, risk_score: float) -> RiskLevel:
        """Determine risk level category from risk score."""
        for threshold, level in sorted(self.RISK_THRESHOLDS.items(), reverse=True):
            if risk_score >= threshold:
                return level

        return RiskLevel.LOW

    def _score_failure_modes(self, assessments: List[FailureModeAssessment]) -> Dict[str, float]:
        scores = {}
        for assessment in assessments:
            stage_multiplier = 0.5 if assessment.stage == FailureStage.EARLY else \
                0.75 if assessment.stage == FailureStage.MID else 1.0
            score = assessment.severity_score * 100 * stage_multiplier * assessment.confidence_score
            scores[assessment.failure_mode_id] = min(100.0, max(0.0, score))
            assessment.risk_score = scores[assessment.failure_mode_id]
        return scores

    def _aggregate_asset_risk(self, mode_scores: Dict[str, float]) -> float:
        if not mode_scores:
            return 0.0
        sorted_scores = sorted(mode_scores.values(), reverse=True)
        base = sorted_scores[0]
        secondary = sum(sorted_scores[1:3]) if len(sorted_scores) > 1 else 0.0
        return min(100.0, base + 0.2 * secondary)

    def _determine_primary_failure_modes(self, mode_scores: Dict[str, float]) -> Tuple[Optional[str], List[str]]:
        if not mode_scores:
            return None, []
        sorted_modes = sorted(mode_scores.items(), key=lambda x: x[1], reverse=True)
        primary = sorted_modes[0][0]
        secondary = [m[0] for m in sorted_modes[1:3] if m[1] >= 10.0]
        return primary, secondary

    def _generate_recommendation(self, risk_level: RiskLevel,
                               failure_mode: Optional[str],
                               asset_type: AssetType) -> str:
        """
        Generate maintenance recommendation based on risk assessment.

        Engineering Logic:
        - Provides specific, actionable recommendations
        - Considers failure mode and asset type
        - Escalates urgency based on risk level
        """
        base_recommendations = {
            RiskLevel.LOW: "Continue normal monitoring. No immediate action required.",
            RiskLevel.MEDIUM: "Schedule inspection within next maintenance window.",
            RiskLevel.HIGH: "Schedule maintenance within 1-2 weeks. Increase monitoring frequency.",
            RiskLevel.CRITICAL: "URGENT: Schedule maintenance immediately. Consider temporary shutdown if safe."
        }

        recommendation = base_recommendations[risk_level]

        # Add failure-specific guidance
        if failure_mode:
            recommendation += f" Primary failure mode: {failure_mode}."

        return recommendation

    def _calculate_next_inspection(self, risk_score: float,
                                 components: RiskComponents) -> Optional[int]:
        """
        Calculate days until next recommended inspection.

        Engineering Logic:
        - Higher risk scores require more frequent inspections
        - Considers deterioration rate in scheduling
        - Provides operational planning guidance
        """
        if risk_score >= 90:
            return 1  # Daily inspection for critical assets
        elif risk_score >= 70:
            return 3  # Every 3 days for high risk
        elif risk_score >= 30:
            return 7  # Weekly for medium risk
        else:
            return 30  # Monthly for low risk

    def _calculate_confidence_level(self, assessments: List[FailureModeAssessment]) -> float:
        """Calculate overall confidence in the risk assessment."""
        if not assessments:
            return 0.0
        confidences = [r.confidence_score for r in assessments]
        return np.mean(confidences) if confidences else 0.0

    def _determine_urgency_bucket(self, assessments: List[FailureModeAssessment]) -> Optional[str]:
        if not assessments:
            return None
        min_days = min(a.urgency_days for a in assessments)
        if min_days <= 3:
            return "0-3 days"
        if min_days <= 7:
            return "3-7 days"
        return "7-30 days"

    def _calculate_inspection_interval(self, risk_score: float) -> int:
        if risk_score >= 90:
            return 1
        if risk_score >= 70:
            return 3
        if risk_score >= 40:
            return 7
        return 30
