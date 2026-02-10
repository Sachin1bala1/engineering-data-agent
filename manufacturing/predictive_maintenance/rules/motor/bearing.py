"""
Electric motor bearing degradation detection.
"""

from ..definitions import FailureModeDefinition, DetectionResult
from ..utils import (
    get_recent_points, compute_trend, persistence_ratio,
    build_indicator, classify_stage, compute_confidence
)
from ...models.data_models import AssetType, SkillLevel, FailureStage


def _z_score(context, parameter: str) -> float:
    value = context['current_values'].get(parameter)
    if value is None:
        return 0.0
    return context['baseline_service'].compute_z_score(
        context['asset_id'], parameter, value
    ) or 0.0


def _detect(context) -> DetectionResult:
    sensor_data = context['sensor_data']
    recent_8h = get_recent_points(sensor_data, hours=8)
    recent_72h = get_recent_points(sensor_data, hours=72)

    vib_values = [p.vibration for p in recent_72h if p.vibration is not None]
    temp_values = [p.temperature for p in recent_72h if p.temperature is not None]
    vib_trend = compute_trend(vib_values)
    vib_z = _z_score(context, 'vibration')
    temp_z = _z_score(context, 'temperature')
    vib_persist = persistence_ratio(
        [p.vibration for p in recent_8h if p.vibration is not None],
        threshold=(context['current_values'].get('vibration') or 0) * 0.9
    )

    indicators = [
        build_indicator("vibration_z_score", vib_z,
                        "critical" if vib_z >= 3.5 else "elevated" if vib_z >= 2.0 else "normal",
                        "Vibration deviation from baseline"),
        build_indicator("vibration_trend", vib_trend,
                        "elevated" if vib_trend > 0.02 else "normal",
                        "Rising vibration trend over 72 hours", 72),
        build_indicator("temperature_z_score", temp_z,
                        "elevated" if temp_z >= 1.5 else "normal",
                        "Temperature deviation from baseline"),
        build_indicator("vibration_persistence", vib_persist,
                        "elevated" if vib_persist >= 0.5 else "normal",
                        "Proportion of 8h window with elevated vibration", 8)
    ]

    early = vib_z >= 1.5 and vib_trend > 0.02 and temp_z >= 0.5
    mid = vib_z >= 2.5 and vib_persist >= 0.5 and temp_z >= 1.0
    late = vib_z >= 3.5 and temp_z >= 2.0 and vib_persist >= 0.7

    triggered = early or mid or late
    stage = classify_stage(early, mid, late)

    indicator_hits = sum(1 for ind in indicators if ind.status in ("elevated", "critical"))
    confidence = compute_confidence(indicator_hits, len(indicators), vib_persist)

    explanation = (
        "Vibration deviation with rising trend and associated temperature rise indicates "
        "progressive bearing surface degradation."
    )

    detection_logic = (
        "Trigger when vibration z-score is elevated, vibration trend is rising, and "
        "temperature deviation is present with persistence over an 8h window."
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
        failure_mode_id="motor_bearing_degradation",
        asset_type=AssetType.ELECTRIC_MOTOR,
        physical_root_cause="Rolling element wear and raceway surface fatigue",
        observable_indicators=[
            "Vibration z-score elevation",
            "Rising vibration trend",
            "Temperature rise correlated with vibration",
            "Persistence of elevated vibration over 4-8 hours"
        ],
        early_indicators=[
            "Slight vibration z-score elevation with rising trend",
            "Minor temperature rise aligned with vibration"
        ],
        mid_stage_indicators=[
            "Sustained vibration elevation over multiple hours",
            "Temperature rise accompanies vibration persistence"
        ],
        late_stage_indicators=[
            "High vibration z-score with sustained persistence",
            "Elevated temperature indicating advanced bearing wear"
        ],
        severity_score=0.8,
        risk_severity_impact="High impact with risk of rapid degradation if not corrected",
        recommended_action=(
            "Schedule bearing inspection and lubrication check. Verify alignment and balance."
        ),
        urgency_days=7,
        skill_level_required=SkillLevel.MAINTENANCE_TECHNICIAN,
        detection_logic_text=(
            "Vibration z-score >= 1.5 with positive trend and temperature deviation, "
            "persisting over 8 hours."
        ),
        detection_logic=_detect,
        confidence_calculation=(
            "Indicator coverage weighted by persistence of elevated vibration."
        )
    )
