import pandas as pd

from predictive_maintenance.analysis_engine.dataset_profiler import profile_dataset
from predictive_maintenance.analysis_engine.execution_engine import run_execution


def test_profile_dataset_basic(tmp_path):
    df = pd.DataFrame({
        "timestamp": pd.date_range("2024-01-01", periods=20, freq="H"),
        "temperature": [70 + i * 0.1 for i in range(20)],
        "state": ["A"] * 10 + ["B"] * 10,
    })
    file_path = tmp_path / "data.csv"
    df.to_csv(file_path, index=False)

    profile = profile_dataset(str(file_path))
    assert profile.dataset_type == "time_series"
    assert "temperature" in profile.signals
    assert "state" in profile.signals


def test_execution_engine_stats(tmp_path):
    df = pd.DataFrame({
        "temperature": [70, 71, 72, 73, 74, 75],
        "pressure": [100, 101, 102, 103, 104, 105],
    })
    file_path = tmp_path / "data.csv"
    df.to_csv(file_path, index=False)

    plan = {
        "recommended_tests": [
            {"test": "shapiro_wilk", "applies_to": "temperature", "reason": "normality"},
        ],
        "recommended_plots": ["boxplot"],
    }
    results = run_execution(df, plan)
    assert "temperature" in results.statistics
    assert results.plots
