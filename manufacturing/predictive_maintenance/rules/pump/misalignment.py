"""
Centrifugal pump misalignment detection.
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
    recent_24h = get_recent_points(sensor_data, hours=24)
    recent_72h = get_recent_points(sensor_data, hours=72)

    vib_values = [p.vibration for p in recent_72h if p.vibration is not None]
    temp_values = [p.temperature for p in recent_72h if p.temperature is not None]
    vib_trend = compute_trend(vib_values)
    temp_trend = compute_trend(temp_values)
    vib_z = _z_score(context, 'vibration')
    temp_z = _z_score(context, 'temperature')
    vib_persist = persistence_ratio(
        [p.vibration for p in recent_24h if p.vibration is not None],
        threshold=(context['current_values'].get('vibration') or 0) * 0.9
    )

    indicators = [
        build_indicator("vibration_z_score", vib_z,
                        "elevated" if vib_z >= 1.6 else "normal",
                        "Moderate vibration elevation"),
        build_indicator("vibration_trend", vib_trend,
                        "elevated" if vib_trend > 0.01 else "normal",
                        "Progressive vibration trend", 72),
        build_indicator("temperature_trend", temp_trend,
                        "elevated" if temp_trend > 0.01 else "normal",
                        "Temperature trend following vibration", 72),
        build_indicator("vibration_persistence", vib_persist,
                        "elevated" if vib_persist >= 0.4 else "normal",
                        "Persistence of vibration elevation over 24h", 24)
    ]

    early = vib_z >= 1.6 and vib_trend > 0.01
    mid = vib_z >= 2.2 and vib_persist >= 0.5 and temp_z >= 0.5
    late = vib_z >= 2.8 and temp_z >= 1.2 and vib_persist >= 0.6

    triggered = early or mid or late
    stage = classify_stage(early, mid, late)

    indicator_hits = sum(1 for ind in indicators if ind.status in ("elevated", "critical"))
    confidence = compute_confidence(indicator_hits, len(indicators), vib_persist)

    explanation = (
        "Sustained vibration elevation with aligned temperature trend indicates pump "
        "shaft or coupling misalignment."
    )

    detection_logic = (
        "Trigger when vibration deviation is moderate with persistent trend "
        "and temperature trend follows vibration over 24-72 hours."
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
        failure_mode_id="pump_misalignment",
        asset_type=AssetType.PUMP,
        physical_root_cause="Coupling misalignment or baseplate movement",
        observable_indicators=[
            "Moderate vibration elevation",
            "Vibration trend increase over 72 hours",
            "Temperature trend following vibration",
            "Persistence over 24 hours"
        ],
        early_indicators=[
            "Moderate vibration increase with trend",
            "Temperature trend begins to align with vibration"
        ],
        mid_stage_indicators=[
            "Persistent vibration elevation over 24 hours",
            "Temperature deviation becomes noticeable"
        ],
        late_stage_indicators=[
            "High vibration with sustained temperature rise",
            "Increased risk of coupling wear"
        ],
        severity_score=0.65,
        risk_severity_impact="Moderate impact with alignment-related wear risk",
        recommended_action=(
            "Inspect coupling alignment and baseplate condition. Realign pump and motor."
        ),
        urgency_days=14,
        skill_level_required=SkillLevel.MAINTENANCE_TECHNICIAN,
        detection_logic_text=(
            "Vibration z-score >= 1.6 with persistent trend and temperature trend "
            "tracking vibration over 24-72 hours."
        ),
        detection_logic=_detect,
        confidence_calculation="Indicator coverage weighted by persistence."
    )
