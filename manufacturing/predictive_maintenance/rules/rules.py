"""
Failure Mode Intelligence Rules Engine (deterministic).
"""

from typing import List
import logging

from ..baseline.baseline import BaselineService
from ..models.data_models import AssetType, FailureModeAssessment
from .engine import FailureModeEngine

logger = logging.getLogger(__name__)


class RulesEngine:
    """
    Backwards-compatible wrapper exposing failure mode intelligence results.
    """

    def __init__(self, baseline_service: BaselineService):
        self.failure_mode_engine = FailureModeEngine(baseline_service)

    def evaluate_asset(self, asset_id: str, asset_type: AssetType,
                      sensor_data: list, maintenance_history: list) -> List[FailureModeAssessment]:
        return self.failure_mode_engine.evaluate_asset(
            asset_id, asset_type, sensor_data, maintenance_history
        )

    def catalog(self):
        return self.failure_mode_engine.catalog()
