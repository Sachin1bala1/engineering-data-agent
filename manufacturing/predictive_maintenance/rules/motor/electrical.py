"""
Electric motor electrical fault detection.
"""

from ..definitions import FailureModeDefinition, DetectionResult
from ..utils import (
    get_recent_points, compute_trend, build_indicator,
    classify_stage, compute_confidence, safe_std
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
    recent_24h = get_recent_points(sensor_data, hours=24)
    temp_values = [p.temperature for p in recent_24h if p.temperature is not None]
    vib_values = [p.vibration for p in recent_24h if p.vibration is not None]
    alarm_values = [p.alarm_frequency for p in recent_24h if p.alarm_frequency is not None]

    temp_z = _z_score(context, 'temperature')
    vib_z = _z_score(context, 'vibration')
    temp_trend = compute_trend(temp_values)
    temp_variability = safe_std(temp_values)
    alarm_rate = sum(alarm_values) / len(alarm_values) if alarm_values else 0.0

    indicators = [
        build_indicator("temperature_z_score", temp_z,
                        "critical" if temp_z >= 3.0 else "elevated" if temp_z >= 2.0 else "normal",
                        "High temperature deviation without matching vibration"),
        build_indicator("vibration_z_score", vib_z,
                        "normal" if vib_z < 1.5 else "elevated",
                        "Lower vibration relative to temperature rise"),
        build_indicator("temperature_trend", temp_trend,
                        "elevated" if temp_trend > 0.03 else "normal",
                        "Temperature rise over 24 hours", 24),
        build_indicator("temperature_variability", temp_variability,
                        "elevated" if temp_variability >= 5.0 else "normal",
                        "Temperature variability indicating electrical imbalance", 24),
        build_indicator("alarm_frequency", alarm_rate,
                        "elevated" if alarm_rate >= 2.0 else "normal",
                        "Increased electrical or protective alarms", 24)
    ]

    early = temp_z >= 2.0 and vib_z < 1.5 and temp_trend > 0.02
    mid = temp_z >= 2.5 and temp_variability >= 4.0 and alarm_rate >= 1.5
    late = temp_z >= 3.0 and alarm_rate >= 2.0

    triggered = early or mid or late
    stage = classify_stage(early, mid, late)

    indicator_hits = sum(1 for ind in indicators if ind.status in ("elevated", "critical"))
    confidence = compute_confidence(indicator_hits, len(indicators), 0.6 if alarm_rate >= 2.0 else 0.3)

    explanation = (
        "High temperature with limited vibration increase and elevated alarm rate "
        "indicates electrical imbalance or insulation stress."
    )

    detection_logic = (
        "Trigger when temperature deviation is high with low vibration coupling and "
        "elevated alarm frequency over 24 hours."
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
        failure_mode_id="motor_electrical_fault",
        asset_type=AssetType.ELECTRIC_MOTOR,
        physical_root_cause="Electrical imbalance, insulation degradation, or winding fault",
        observable_indicators=[
            "High temperature without matching vibration",
            "Temperature variability over 24 hours",
            "Elevated alarm frequency"
        ],
        early_indicators=[
            "Temperature deviation with low vibration response",
            "Rising temperature trend"
        ],
        mid_stage_indicators=[
            "Temperature variability increases",
            "Alarm frequency increases over 24 hours"
        ],
        late_stage_indicators=[
            "High temperature deviation with elevated alarms",
            "Risk of insulation breakdown"
        ],
        severity_score=0.85,
        risk_severity_impact="High impact with electrical failure risk",
        recommended_action=(
            "Inspect insulation resistance, verify power quality, and check protection logs."
        ),
        urgency_days=5,
        skill_level_required=SkillLevel.RELIABILITY_ENGINEER,
        detection_logic_text=(
            "Temperature z-score >= 2.0 with low vibration coupling and elevated alarm "
            "frequency/variability over 24 hours."
        ),
        detection_logic=_detect,
        confidence_calculation=(
            "Indicator coverage weighted by alarm frequency evidence."
        )
    )
