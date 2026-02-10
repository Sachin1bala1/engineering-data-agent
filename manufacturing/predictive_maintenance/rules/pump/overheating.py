"""
Centrifugal pump overheating detection.
"""

from ..definitions import FailureModeDefinition, DetectionResult
from ..utils import (
    get_recent_points, compute_trend, build_indicator,
    classify_stage, compute_confidence, persistence_ratio
)
from ...models.data_models import AssetType, SkillLevel


def _z_score(context, parameter: str) -> float:
    value = context['current_values'].get(parameter)
    if value is None:
        return 0.0
    return context['baseline_service'].compute_z_score(
        context['asset_id'], parameter, value
    ) or 0.0


def _detect(context) -> DetectionResult:
    sensor_data = context['sensor_data']
    recent_4h = get_recent_points(sensor_data, hours=4)
    recent_24h = get_recent_points(sensor_data, hours=24)

    temp_values_4h = [p.temperature for p in recent_4h if p.temperature is not None]
    temp_values_24h = [p.temperature for p in recent_24h if p.temperature is not None]
    temp_trend = compute_trend(temp_values_24h)
    temp_z = _z_score(context, 'temperature')
    temp_persist = persistence_ratio(temp_values_4h, threshold=80.0)

    indicators = [
        build_indicator("temperature_z_score", temp_z,
                        "critical" if temp_z >= 3.0 else "elevated" if temp_z >= 2.0 else "normal",
                        "High temperature deviation"),
        build_indicator("temperature_trend", temp_trend,
                        "elevated" if temp_trend > 0.03 else "normal",
                        "Rapid temperature rise over 24 hours", 24),
        build_indicator("temperature_persistence", temp_persist,
                        "critical" if temp_persist >= 0.7 else "elevated" if temp_persist >= 0.5 else "normal",
                        "Sustained high temperature over 4 hours", 4)
    ]

    early = temp_z >= 2.0 and temp_trend > 0.03
    mid = temp_z >= 2.5 and temp_persist >= 0.5
    late = temp_z >= 3.0 and temp_persist >= 0.7

    triggered = early or mid or late
    stage = classify_stage(early, mid, late)

    indicator_hits = sum(1 for ind in indicators if ind.status in ("elevated", "critical"))
    confidence = compute_confidence(indicator_hits, len(indicators), temp_persist)

    explanation = (
        "Sustained high temperature with rapid trend indicates pump overheating "
        "due to hydraulic or mechanical stress."
    )

    detection_logic = (
        "Trigger when temperature deviation is high with sustained 4h persistence "
        "and rapid 24h temperature trend."
    )

    return DetectionResult(
        triggered=triggered,
        stage=stage,
        indicators=indicators,
        confidence_score=confidence,
        explanation=explanation,
        detection_logic=detection_logic
    )


def build_definition() -> FailureModeDefinition:
    return FailureModeDefinition(
        failure_mode_id="pump_overheating",
        asset_type=AssetType.PUMP,
        physical_root_cause="Thermal overload from hydraulic or mechanical stress",
        observable_indicators=[
            "High temperature deviation",
            "Rapid temperature trend over 24 hours",
            "Persistence above 80 degC over 4 hours"
        ],
        early_indicators=[
            "Temperature trend acceleration",
            "Temperature deviation with short persistence"
        ],
        mid_stage_indicators=[
            "Sustained temperature above 80 degC",
            "Rapid temperature rise over 24 hours"
        ],
        late_stage_indicators=[
            "Critical temperature deviation with sustained persistence",
            "High risk of seal or bearing damage"
        ],
        severity_score=0.85,
        risk_severity_impact="Critical impact with potential for immediate damage",
        recommended_action=(
            "Inspect cooling, verify pump operating point, and check for obstruction."
        ),
        urgency_days=5,
        skill_level_required=SkillLevel.RELIABILITY_ENGINEER,
        detection_logic_text=(
            "Temperature z-score >= 2.0 with sustained persistence above 80 degC "
            "and rapid temperature trend."
        ),
        detection_logic=_detect,
        confidence_calculation="Indicator coverage weighted by temperature persistence."
    )
