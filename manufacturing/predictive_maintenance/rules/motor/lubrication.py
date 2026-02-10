"""
Electric motor lubrication breakdown detection.
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
    recent_12h = get_recent_points(sensor_data, hours=12)
    recent_48h = get_recent_points(sensor_data, hours=48)

    temp_values = [p.temperature for p in recent_48h if p.temperature is not None]
    vib_values = [p.vibration for p in recent_48h if p.vibration is not None]
    temp_trend = compute_trend(temp_values)
    vib_trend = compute_trend(vib_values)
    temp_z = _z_score(context, 'temperature')
    vib_z = _z_score(context, 'vibration')
    temp_persist = persistence_ratio(
        [p.temperature for p in recent_12h if p.temperature is not None],
        threshold=(context['current_values'].get('temperature') or 0) * 0.95
    )

    indicators = [
        build_indicator("temperature_z_score", temp_z,
                        "critical" if temp_z >= 3.0 else "elevated" if temp_z >= 1.5 else "normal",
                        "Temperature rise relative to baseline"),
        build_indicator("temperature_trend", temp_trend,
                        "elevated" if temp_trend > 0.02 else "normal",
                        "Consistent temperature increase over 48 hours", 48),
        build_indicator("vibration_z_score", vib_z,
                        "elevated" if vib_z >= 1.5 else "normal",
                        "Secondary vibration elevation"),
        build_indicator("temperature_persistence", temp_persist,
                        "elevated" if temp_persist >= 0.5 else "normal",
                        "Sustained high temperature over 12 hours", 12)
    ]

    early = temp_z >= 1.5 and temp_trend > 0.02
    mid = temp_z >= 2.5 and temp_persist >= 0.5 and vib_z >= 1.0
    late = temp_z >= 3.0 and temp_persist >= 0.7

    triggered = early or mid or late
    stage = classify_stage(early, mid, late)

    indicator_hits = sum(1 for ind in indicators if ind.status in ("elevated", "critical"))
    confidence = compute_confidence(indicator_hits, len(indicators), temp_persist)

    explanation = (
        "Sustained temperature rise with secondary vibration increase indicates "
        "lubricant degradation or insufficient lubrication film."
    )

    detection_logic = (
        "Trigger when temperature deviation is elevated with sustained rise "
        "and secondary vibration elevation over 12-48 hours."
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
        failure_mode_id="motor_lubrication_breakdown",
        asset_type=AssetType.ELECTRIC_MOTOR,
        physical_root_cause="Lubricant film breakdown or contamination",
        observable_indicators=[
            "Sustained temperature rise",
            "Temperature trend increase over 48 hours",
            "Secondary vibration elevation",
            "Persistence over 12 hours"
        ],
        early_indicators=[
            "Temperature trend increase with minor vibration rise",
            "Early persistence of elevated temperature"
        ],
        mid_stage_indicators=[
            "Sustained temperature elevation over 12 hours",
            "Vibration deviation becomes noticeable"
        ],
        late_stage_indicators=[
            "High temperature with persistent elevation",
            "Increasing vibration indicating lubricant loss"
        ],
        severity_score=0.75,
        risk_severity_impact="High impact due to accelerated bearing wear",
        recommended_action=(
            "Inspect lubrication system, check grease condition, "
            "and relubricate bearings per OEM guidance."
        ),
        urgency_days=10,
        skill_level_required=SkillLevel.MAINTENANCE_TECHNICIAN,
        detection_logic_text=(
            "Temperature z-score >= 1.5 with rising trend and persistence, "
            "plus secondary vibration elevation."
        ),
        detection_logic=_detect,
        confidence_calculation=(
            "Indicator coverage weighted by temperature persistence."
        )
    )
