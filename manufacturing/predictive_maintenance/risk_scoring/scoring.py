"""
Risk scoring module for predictive maintenance system.

Calculates risk scores (0-100) based on deterministic engineering factors:
- Severity: Based on failure mode and alert severity
- Persistence: How long issues have been occurring
- Rate of change: How quickly conditions are deteriorating

Risk scores guide maintenance prioritization and resource allocation.
"""

import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from collections import defaultdict

from ..models import FailureAlert, RiskScore, SensorData, MaintenanceLog, FAILURE_MODES

logger = logging.getLogger(__name__)


class RiskScorer:
    """
    Calculates risk scores for assets based on multiple engineering factors.

    Risk scoring combines:
    1. Severity (0-100): Based on failure mode criticality and alert confidence
    2. Persistence (0-100): How long issues have been present
    3. Rate of Change (0-100): Speed of deterioration

    Final risk score is a weighted combination of these factors.
    """

    # Severity multipliers for different alert levels
    SEVERITY_MULTIPLIERS = {
        "LOW": 0.2,
        "MEDIUM": 0.5,
        "HIGH": 0.8,
        "CRITICAL": 1.0
    }

    # Failure mode base risk scores
    FAILURE_MODE_BASE_SCORES = {
        "Normal Operation": 5,
        "Maintenance Due": 25,
        "Overheating": 70,
        "Bearing Wear": 65,
        "Abnormal Vibration": 75,
        "Impending Failure": 85
    }

    def __init__(self):
        """Initialize the risk scorer."""
        self.asset_alert_history = defaultdict(list)  # asset_id -> List[FailureAlert]
        self.asset_risk_history = defaultdict(list)   # asset_id -> List[RiskScore]

    def calculate_risk_scores(self, current_alerts: Dict[str, List[FailureAlert]],
                             sensor_history: Dict[str, List[SensorData]],
                             maintenance_history: Dict[str, List[MaintenanceLog]]) -> Dict[str, RiskScore]:
        """
        Calculate risk scores for all assets with current data.

        Args:
            current_alerts: Current failure alerts by asset
            sensor_history: Recent sensor data by asset
            maintenance_history: Maintenance history by asset

        Returns:
            Dictionary of asset risk scores
        """
        risk_scores = {}

        # Get all unique assets
        all_assets = set(current_alerts.keys()) | set(sensor_history.keys()) | set(maintenance_history.keys())

        for asset_id in all_assets:
            try:
                alerts = current_alerts.get(asset_id, [])
                sensors = sensor_history.get(asset_id, [])
                maintenance = maintenance_history.get(asset_id, [])

                risk_score = self._calculate_asset_risk(
                    asset_id=asset_id,
                    current_alerts=alerts,
                    sensor_history=sensors,
                    maintenance_history=maintenance
                )

                risk_scores[asset_id] = risk_score

                # Store in history
                self.asset_risk_history[asset_id].append(risk_score)

            except Exception as e:
                logger.error(f"Failed to calculate risk score for asset {asset_id}: {str(e)}")
                # Return minimal risk score for assets with calculation errors
                risk_scores[asset_id] = RiskScore(
                    asset_id=asset_id,
                    risk_score=10,
                    failure_mode="Calculation Error",
                    recommended_action="Review asset data and recalculate",
                    severity_factors={"severity": 0.1, "persistence": 0.1, "rate_of_change": 0.1},
                    last_calculated=datetime.now()
                )

        return risk_scores

    def _calculate_asset_risk(self, asset_id: str, current_alerts: List[FailureAlert],
                             sensor_history: List[SensorData],
                             maintenance_history: List[MaintenanceLog]) -> RiskScore:
        """
        Calculate comprehensive risk score for a single asset.

        Risk Score Formula:
        severity_score = max_alert_severity * failure_mode_multiplier * confidence
        persistence_score = duration_of_issues / max_expected_duration
        rate_of_change_score = slope_of_deterioration_trend

        final_risk = (severity_score * 0.5) + (persistence_score * 0.3) + (rate_of_change_score * 0.2)
        """
        # Calculate severity factor
        severity_score, failure_mode = self._calculate_severity(current_alerts)

        # Calculate persistence factor
        persistence_score = self._calculate_persistence(asset_id, current_alerts)

        # Calculate rate of change factor
        rate_of_change_score = self._calculate_rate_of_change(sensor_history)

        # Calculate final risk score (0-100)
        final_risk = min(100.0, (
            severity_score * 0.5 +
            persistence_score * 0.3 +
            rate_of_change_score * 0.2
        ))

        # Determine recommended action based on risk level
        recommended_action = self._get_recommended_action(final_risk, failure_mode)

        return RiskScore(
            asset_id=asset_id,
            risk_score=round(final_risk, 1),
            failure_mode=failure_mode,
            recommended_action=recommended_action,
            severity_factors={
                "severity": round(severity_score, 1),
                "persistence": round(persistence_score, 1),
                "rate_of_change": round(rate_of_change_score, 1)
            },
            last_calculated=datetime.now()
        )

    def _calculate_severity(self, alerts: List[FailureAlert]) -> Tuple[float, str]:
        """
        Calculate severity score based on active failure alerts.

        Severity considers:
        - Highest severity alert level (CRITICAL > HIGH > MEDIUM > LOW)
        - Failure mode criticality
        - Alert confidence levels

        Returns:
            Tuple of (severity_score, primary_failure_mode)
        """
        if not alerts:
            return 10.0, "Normal Operation"  # Base risk for normal operation

        # Find the most severe alert
        severity_levels = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
        max_severity_alert = max(alerts, key=lambda a: severity_levels.get(a.severity, 0))

        # Get base score for failure mode
        base_score = self.FAILURE_MODE_BASE_SCORES.get(
            max_severity_alert.failure_mode,
            self.FAILURE_MODE_BASE_SCORES["Impending Failure"]
        )

        # Apply severity multiplier
        severity_multiplier = self.SEVERITY_MULTIPLIERS.get(max_severity_alert.severity, 0.2)

        # Apply confidence adjustment
        confidence_adjustment = max_severity_alert.confidence

        severity_score = base_score * severity_multiplier * confidence_adjustment

        # Boost score if multiple alerts are present (indicates multiple issues)
        if len(alerts) > 1:
            severity_score *= min(1.5, 1.0 + (len(alerts) - 1) * 0.2)

        return min(100.0, severity_score), max_severity_alert.failure_mode

    def _calculate_persistence(self, asset_id: str, current_alerts: List[FailureAlert]) -> float:
        """
        Calculate persistence score based on how long issues have been occurring.

        Persistence considers:
        - Duration of current alerts
        - Frequency of similar alerts in history
        - Time since last normal operation

        Returns:
            Persistence score (0-100)
        """
        if not current_alerts:
            return 5.0  # Low persistence for normal operation

        # Store current alerts in history
        self.asset_alert_history[asset_id].extend(current_alerts)

        # Get recent alert history (last 30 days)
        thirty_days_ago = datetime.now() - timedelta(days=30)
        recent_alerts = [
            alert for alert in self.asset_alert_history[asset_id]
            if alert.timestamp > thirty_days_ago
        ]

        if not recent_alerts:
            return 10.0

        # Calculate persistence based on:
        # 1. How many days have had alerts
        # 2. Frequency of alerts
        # 3. Duration of current issues

        alert_dates = set(alert.timestamp.date() for alert in recent_alerts)
        days_with_alerts = len(alert_dates)
        total_days = 30

        # Base persistence on percentage of days with alerts
        base_persistence = (days_with_alerts / total_days) * 100

        # Boost for frequent alerts (more than one per day on average)
        alerts_per_day = len(recent_alerts) / total_days
        if alerts_per_day > 1.0:
            base_persistence *= min(1.8, 1.0 + (alerts_per_day - 1.0) * 0.3)

        # Boost for high-severity persistent alerts
        high_severity_alerts = [a for a in recent_alerts if a.severity in ["HIGH", "CRITICAL"]]
        if high_severity_alerts:
            base_persistence *= 1.2

        return min(100.0, base_persistence)

    def _calculate_rate_of_change(self, sensor_history: List[SensorData]) -> float:
        """
        Calculate rate of change score based on deterioration trends.

        Rate of change considers:
        - Trend slopes for temperature and vibration
        - Acceleration of parameter changes
        - Sudden spikes or drops

        Returns:
            Rate of change score (0-100)
        """
        if len(sensor_history) < 5:
            return 5.0  # Insufficient data for trend analysis

        try:
            # Sort by timestamp
            sorted_history = sorted(sensor_history, key=lambda x: x.timestamp)

            # Calculate trends for key parameters
            temp_trend = self._calculate_parameter_trend([s.temperature for s in sorted_history])
            vib_trend = self._calculate_parameter_trend([s.vibration for s in sorted_history])

            # Normalize trends to 0-100 scale
            # Temperature: 0.5°C/day increase = 50 points, max at 2°C/day
            temp_score = min(100.0, abs(temp_trend) * 25)

            # Vibration: 0.1 mm/s/day increase = 50 points, max at 0.4 mm/s/day
            vib_score = min(100.0, abs(vib_trend) * 250)

            # Combine scores (weighted average)
            combined_score = (temp_score * 0.4 + vib_score * 0.6)

            # Boost for accelerating deterioration
            if self._check_acceleration(sorted_history):
                combined_score *= 1.3

            return min(100.0, combined_score)

        except Exception as e:
            logger.warning(f"Error calculating rate of change: {str(e)}")
            return 25.0  # Moderate default

    def _calculate_parameter_trend(self, values: List[float]) -> float:
        """
        Calculate linear trend slope for a parameter.

        Args:
            values: List of parameter values in chronological order

        Returns:
            Slope (change per time unit)
        """
        if len(values) < 3:
            return 0.0

        n = len(values)
        x = list(range(n))  # Time indices

        # Calculate slope using simple linear regression
        sum_x = sum(x)
        sum_y = sum(values)
        sum_xy = sum(xi * yi for xi, yi in zip(x, values))
        sum_xx = sum(xi * xi for xi in x)

        denominator = n * sum_xx - sum_x * sum_x
        if denominator == 0:
            return 0.0

        slope = (n * sum_xy - sum_x * sum_y) / denominator
        return slope

    def _check_acceleration(self, sensor_history: List[SensorData]) -> bool:
        """
        Check if parameter changes are accelerating (indicating rapid deterioration).

        Args:
            sensor_history: Sensor data in chronological order

        Returns:
            True if acceleration detected
        """
        if len(sensor_history) < 7:
            return False

        try:
            # Check for accelerating trends in recent data
            recent = sensor_history[-7:]

            # Calculate first differences (daily changes)
            temp_changes = [recent[i+1].temperature - recent[i].temperature
                          for i in range(len(recent)-1)]
            vib_changes = [recent[i+1].vibration - recent[i].vibration
                          for i in range(len(recent)-1)]

            # Check if changes are getting larger (acceleration)
            temp_accelerating = all(temp_changes[i] <= temp_changes[i+1]
                                  for i in range(len(temp_changes)-1))
            vib_accelerating = all(vib_changes[i] <= vib_changes[i+1]
                                 for i in range(len(vib_changes)-1))

            return temp_accelerating or vib_accelerating

        except Exception:
            return False

    def _get_recommended_action(self, risk_score: float, failure_mode: str) -> str:
        """
        Determine recommended maintenance action based on risk score and failure mode.

        Args:
            risk_score: Calculated risk score (0-100)
            failure_mode: Identified failure mode

        Returns:
            Recommended action string
        """
        if risk_score < 20:
            return "Continue normal monitoring"
        elif risk_score < 40:
            return "Schedule routine inspection within 30 days"
        elif risk_score < 60:
            if "Overheating" in failure_mode:
                return "Inspect cooling system and schedule maintenance within 7 days"
            elif "Bearing" in failure_mode:
                return "Schedule vibration analysis and bearing inspection within 14 days"
            else:
                return "Increase monitoring frequency and schedule inspection within 14 days"
        elif risk_score < 80:
            if "Overheating" in failure_mode:
                return "URGENT: Shutdown and inspect cooling system immediately"
            elif "Impending" in failure_mode:
                return "URGENT: Schedule immediate maintenance and prepare spare parts"
            else:
                return "URGENT: Schedule maintenance within 72 hours"
        else:  # risk_score >= 80
            if "Overheating" in failure_mode or "Critical" in failure_mode:
                return "CRITICAL: Shutdown equipment immediately for safety inspection"
            else:
                return "CRITICAL: Schedule emergency maintenance within 24 hours"

    def get_risk_trends(self, asset_id: str, days: int = 30) -> List[RiskScore]:
        """
        Get risk score history for trend analysis.

        Args:
            asset_id: Asset identifier
            days: Number of days of history to return

        Returns:
            List of recent risk scores for the asset
        """
        cutoff_date = datetime.now() - timedelta(days=days)
        return [
            score for score in self.asset_risk_history.get(asset_id, [])
            if score.last_calculated > cutoff_date
        ]
