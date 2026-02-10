"""
Centrifugal pump bearing degradation detection.
"""

from ..definitions import FailureModeDefinition, DetectionResult
from ..utils import (
    get_recent_points, compute_trend, persistence_ratio,
    build_indicator, classify_stage, compute_confidence
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
    recent_8h = get_recent_points(sensor_data, hours=8)
    recent_48h = get_recent_points(sensor_data, hours=48)

    vib_values = [p.vibration for p in recent_48h if p.vibration is not None]
    temp_values = [p.temperature for p in recent_48h if p.temperature is not None]
    vib_trend = compute_trend(vib_values)
    vib_z = _z_score(context, 'vibration')
    temp_z = _z_score(context, 'temperature')
    vib_persist = persistence_ratio(
        [p.vibration for p in recent_8h if p.vibration is not None],
        threshold=(context['current_values'].get('vibration') or 0) * 0.9
    )

    indicators = [
        build_indicator("vibration_z_score", vib_z,
                        "critical" if vib_z >= 3.0 else "elevated" if vib_z >= 2.0 else "normal",
                        "Vibration deviation from baseline"),
        build_indicator("vibration_trend", vib_trend,
                        "elevated" if vib_trend > 0.02 else "normal",
                        "Rising vibration trend over 48 hours", 48),
        build_indicator("temperature_z_score", temp_z,
                        "elevated" if temp_z >= 1.5 else "normal",
                        "Temperature deviation correlated to vibration"),
        build_indicator("vibration_persistence", vib_persist,
                        "elevated" if vib_persist >= 0.5 else "normal",
                        "Persistence of elevated vibration over 8 hours", 8)
    ]

    early = vib_z >= 1.8 and vib_trend > 0.02 and temp_z >= 0.5
    mid = vib_z >= 2.5 and vib_persist >= 0.5 and temp_z >= 1.0
    late = vib_z >= 3.2 and temp_z >= 1.8 and vib_persist >= 0.7

    triggered = early or mid or late
    stage = classify_stage(early, mid, late)

    indicator_hits = sum(1 for ind in indicators if ind.status in ("elevated", "critical"))
    confidence = compute_confidence(indicator_hits, len(indicators), vib_persist)

    explanation = (
        "Pump bearing degradation indicated by sustained vibration deviation "
        "with correlated temperature rise."
    )

    detection_logic = (
        "Trigger when vibration deviation is elevated with rising trend and "
        "temperature deviation with persistence over 8 hours."
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
        failure_mode_id="pump_bearing_degradation",
        asset_type=AssetType.PUMP,
        physical_root_cause="Bearing surface wear and lubrication loss in pump bearings",
        observable_indicators=[
            "Vibration z-score elevation",
            "Rising vibration trend over 48 hours",
            "Correlated temperature rise",
            "Persistence over 8 hours"
        ],
        early_indicators=[
            "Moderate vibration elevation with rising trend",
            "Slight temperature correlation"
        ],
        mid_stage_indicators=[
            "Sustained vibration elevation over 8 hours",
            "Temperature rise aligned with vibration"
        ],
        late_stage_indicators=[
            "High vibration z-score with persistence",
            "Elevated temperature indicating advanced wear"
        ],
        severity_score=0.75,
        risk_severity_impact="High impact with increased mechanical failure risk",
        recommended_action=(
            "Inspect pump bearings, verify lubrication condition, and plan replacement."
        ),
        urgency_days=10,
        skill_level_required=SkillLevel.MAINTENANCE_TECHNICIAN,
        detection_logic_text=(
            "Vibration z-score >= 1.8 with rising trend and temperature correlation, "
            "persisting over 8 hours."
        ),
        detection_logic=_detect,
        confidence_calculation="Indicator coverage weighted by persistence."
    )
