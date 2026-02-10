#!/usr/bin/env python3
"""
Test script for the Predictive Maintenance API.
This script tests the API endpoints and demonstrates functionality.
"""

import os
import sys
import json
import time
from pathlib import Path

# Ensure project root is on Python path for package imports
sys.path.insert(0, str(Path(__file__).parent))

def _check_imports() -> bool:
    """Return True if all modules can be imported."""
    print("Testing module imports...")

    try:
        # Test core dependencies
        import pandas as pd
        import numpy as np
        from pydantic import BaseModel
        print("[OK] Core dependencies imported")

        # Import our modules
        from predictive_maintenance.models.data_models import SensorDataPoint, MaintenanceLog, RiskAssessment
        print("[OK] Data models imported")

        from predictive_maintenance.ingestion.ingestion import DataIngestionService
        print("[OK] Ingestion service imported")

        from predictive_maintenance.baseline.baseline import BaselineService
        print("[OK] Baseline service imported")

        from predictive_maintenance.rules.rules import RulesEngine
        print("[OK] Rules engine imported")

        from predictive_maintenance.risk_scoring.risk_scoring import RiskScoringService
        print("[OK] Risk scoring service imported")

        from predictive_maintenance.reports.reports import ReportsService
        print("[OK] Reports service imported")

        from predictive_maintenance.main import app
        print("[OK] FastAPI app imported")

        return True

    except Exception as e:
        print(f"[ERROR] Import error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_imports():
    """Test that all modules can be imported."""
    assert _check_imports()

def _check_data_processing() -> bool:
    """Return True if sample data can be processed."""
    print("\nTesting data processing...")

    try:
        from predictive_maintenance.ingestion.ingestion import DataIngestionService
        from predictive_maintenance.models.data_models import SensorDataPoint

        # Create sample data
        sample_data = [
            SensorDataPoint(
                timestamp="2024-01-20T08:00:00Z",
                asset_id="MOTOR-001",
                temperature=75.2,
                vibration=2.1,
                run_hours=1200.5
            ),
            SensorDataPoint(
                timestamp="2024-01-20T09:00:00Z",
                asset_id="MOTOR-001",
                temperature=76.8,
                vibration=2.3,
                run_hours=1201.5
            )
        ]

        print(f"[OK] Created {len(sample_data)} sample sensor readings")

        # Test baseline computation
        from predictive_maintenance.baseline.baseline import BaselineService
        baseline_service = BaselineService()
        baselines = baseline_service.compute_baselines(sample_data)

        print(f"[OK] Computed baselines for {len(baselines)} assets")

        # Test rules engine
        from predictive_maintenance.rules.rules import RulesEngine
        rules_engine = RulesEngine(baseline_service)
        rules_evaluations = rules_engine.evaluate_asset(
            "MOTOR-001", "electric_motor", sample_data, []
        )

        print(f"[OK] Rules engine evaluated {len(rules_evaluations)} rules")

        # Test risk scoring
        from predictive_maintenance.risk_scoring.risk_scoring import RiskScoringService
        risk_service = RiskScoringService()
        assessment = risk_service.compute_risk_assessment(
            "MOTOR-001", "electric_motor", rules_evaluations, sample_data, []
        )

        print(f"[OK] Risk assessment: {assessment.risk_score:.1f} ({assessment.risk_level})")

        return True

    except Exception as e:
        print(f"[ERROR] Data processing error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_data_processing():
    """Test data processing with sample data."""
    assert _check_data_processing()

def _check_csv_processing() -> bool:
    """Return True if CSVs can be processed."""
    print("\nTesting CSV processing...")

    try:
        from predictive_maintenance.ingestion.ingestion import DataIngestionService

        service = DataIngestionService()

        # Test sensor data CSV
        sensor_file = "predictive_maintenance/example_sensor_data.csv"
        if os.path.exists(sensor_file):
            sensor_data, errors = service.process_sensor_csv(sensor_file)
            print(f"[OK] Processed {len(sensor_data)} sensor readings from CSV")
            if errors:
                print(f"   [WARN] {len(errors)} warnings/errors")
        else:
            print("[WARN] Sensor data CSV not found")

        # Test maintenance CSV
        maintenance_file = "predictive_maintenance/example_maintenance_logs.csv"
        if os.path.exists(maintenance_file):
            maintenance_data, errors = service.process_maintenance_csv(maintenance_file)
            print(f"[OK] Processed {len(maintenance_data)} maintenance records from CSV")
            if errors:
                print(f"   [WARN] {len(errors)} warnings/errors")
        else:
            print("[WARN] Maintenance logs CSV not found")

        return True

    except Exception as e:
        print(f"[ERROR] CSV processing error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_csv_processing():
    """Test CSV file processing."""
    assert _check_csv_processing()

def main():
    """Run all tests."""
    print("PREDICTIVE MAINTENANCE SYSTEM TEST")
    print("=" * 50)

    # Test imports
    if not _check_imports():
        print("\n[X] Import tests failed. Cannot continue.")
        return False

    # Test data processing
    if not _check_data_processing():
        print("\n[X] Data processing tests failed.")
        return False

    # Test CSV processing
    if not _check_csv_processing():
        print("\n[X] CSV processing tests failed.")
        return False

    print("\n[SUCCESS] ALL TESTS PASSED!")
    print("\nTo start the API server, run:")
    print("   python -m uvicorn predictive_maintenance.main:app --host 0.0.0.0 --port 8000 --reload")
    print("\nAPI Documentation will be available at:")
    print("   http://localhost:8000/docs")

    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
