"""
Pump hydraulic issue detection (impeller wear / cavitation proxy).
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
    recent_72h = get_recent_points(sensor_data, hours=72)

    vib_values_24h = [p.vibration for p in recent_24h if p.vibration is not None]
    temp_values_24h = [p.temperature for p in recent_24h if p.temperature is not None]
    vib_values_72h = [p.vibration for p in recent_72h if p.vibration is not None]

    vib_z = _z_score(context, 'vibration')
    vib_trend = compute_trend(vib_values_72h)
    vib_variability = safe_std(vib_values_24h)
    temp_z = _z_score(context, 'temperature')

    indicators = [
        build_indicator("vibration_z_score", vib_z,
                        "elevated" if vib_z >= 1.8 else "normal",
                        "Vibration elevation indicating hydraulic instability"),
        build_indicator("vibration_trend", vib_trend,
                        "elevated" if vib_trend > 0.02 else "normal",
                        "Vibration trend over 72 hours", 72),
        build_indicator("vibration_variability", vib_variability,
                        "elevated" if vib_variability >= 1.5 else "normal",
                        "Vibration variability from cavitation or impeller wear", 24),
        build_indicator("temperature_z_score", temp_z,
                        "normal" if temp_z < 1.5 else "elevated",
                        "Temperature modest relative to vibration")
    ]

    early = vib_z >= 1.8 and vib_variability >= 1.5
    mid = vib_z >= 2.3 and vib_trend > 0.02 and temp_z < 1.5
    late = vib_z >= 3.0 and vib_variability >= 2.0

    triggered = early or mid or late
    stage = classify_stage(early, mid, late)

    indicator_hits = sum(1 for ind in indicators if ind.status in ("elevated", "critical"))
    confidence = compute_confidence(indicator_hits, len(indicators), 0.5)

    explanation = (
        "Elevated and variable vibration with modest temperature rise indicates "
        "hydraulic instability such as cavitation or impeller wear."
    )

    detection_logic = (
        "Trigger when vibration elevation combines with high variability or trend "
        "while temperature remains modest."
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
        failure_mode_id="pump_hydraulic_instability",
        asset_type=AssetType.PUMP,
        physical_root_cause="Impeller wear, cavitation, or hydraulic instability",
        observable_indicators=[
            "Vibration elevation with high variability",
            "Vibration trend increase over 72 hours",
            "Modest temperature rise relative to vibration"
        ],
        early_indicators=[
            "Vibration variability increases",
            "Vibration elevation with minimal temperature rise"
        ],
        mid_stage_indicators=[
            "Vibration trend increase over 72 hours",
            "Persistent vibration variability"
        ],
        late_stage_indicators=[
            "High vibration with strong variability",
            "Hydraulic instability likely (cavitation risk)"
        ],
        severity_score=0.7,
        risk_severity_impact="Moderate to high impact with hydraulic efficiency loss",
        recommended_action=(
            "Inspect impeller and suction conditions. Verify NPSH margin and "
            "check for cavitation signs."
        ),
        urgency_days=14,
        skill_level_required=SkillLevel.RELIABILITY_ENGINEER,
        detection_logic_text=(
            "Vibration z-score >= 1.8 with high variability or trend increase "
            "while temperature deviation remains modest."
        ),
        detection_logic=_detect,
        confidence_calculation="Indicator coverage weighted by vibration variability."
    )
