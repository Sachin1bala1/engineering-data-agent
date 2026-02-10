from predictive_maintenance.rules.engine import FailureModeEngine
from predictive_maintenance.baseline.baseline import BaselineService
from predictive_maintenance.models.data_models import SensorDataPoint, AssetType
from datetime import datetime, timedelta, timezone


def test_failure_mode_engine_runs():
    baseline = BaselineService()
    engine = FailureModeEngine(baseline)
    now = datetime.now(timezone.utc)
    sensor_data = [
        SensorDataPoint(timestamp=now - timedelta(hours=i), asset_id="MOTOR-001",
                        temperature=70 + i * 0.1, vibration=2.0 + i * 0.05, run_hours=1000 + i)
        for i in range(60)
    ]
    results = engine.evaluate_asset("MOTOR-001", AssetType.ELECTRIC_MOTOR, sensor_data, [])
    assert isinstance(results, list)
