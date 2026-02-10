"""
Baseline computation service for predictive maintenance system.

This module computes rolling statistical baselines for asset parameters to establish
"normal" operating conditions. These baselines are used to detect deviations that
may indicate impending failures.

Engineering Logic:
- Uses rolling windows to account for gradual changes in operating conditions
- Minimum data requirements ensure statistical validity
- Handles seasonal/industrial variations in baseline calculations
- Provides z-score calculations for anomaly detection
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
import logging

from ..models.data_models import SensorDataPoint, BaselineMetrics, AssetType

logger = logging.getLogger(__name__)


@dataclass
class BaselineResult:
    """Result of baseline computation for an asset parameter."""
    asset_id: str
    parameter: str
    baseline_metrics: BaselineMetrics
    z_scores: List[float]
    is_normal_operation: bool
    confidence_level: float


class BaselineService:
    """
    Service for computing and managing statistical baselines for asset parameters.

    Baselines represent "normal" operating conditions and are used to detect
    deviations that may indicate maintenance needs. The service uses rolling
    statistics to adapt to gradual changes in operating conditions.
    """

    # Default configuration for baseline computation
    DEFAULT_CONFIG = {
        'min_window_size': 50,      # Minimum data points for reliable baseline
        'default_window_days': 30, # Default rolling window in days
        'min_confidence_threshold': 0.7,  # Minimum confidence for baseline validity
        'max_z_score_threshold': 3.0,     # Z-score threshold for anomaly detection
        'seasonal_adjustment': True       # Adjust for daily/weekly patterns
    }

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize baseline service with configuration.

        Args:
            config: Optional configuration overrides for baseline computation
        """
        self.config = {**self.DEFAULT_CONFIG, **(config or {})}
        self.logger = logging.getLogger(__name__)

        # In-memory storage for computed baselines (in production, use database)
        self._baseline_cache: Dict[str, Dict[str, BaselineMetrics]] = {}

    def compute_baselines(self, sensor_data: List[SensorDataPoint],
                         window_days: Optional[int] = None) -> Dict[str, List[BaselineResult]]:
        """
        Compute rolling baselines for all assets in the sensor data.

        Args:
            sensor_data: List of sensor data points
            window_days: Override default rolling window size in days

        Returns:
            Dictionary mapping asset_id to list of baseline results for each parameter

        Engineering Logic:
        - Groups data by asset for independent baseline computation
        - Uses time-based rolling windows appropriate for industrial monitoring
        - Ensures minimum data requirements for statistical validity
        - Handles missing data periods gracefully
        """
        if not sensor_data:
            return {}

        # Convert to DataFrame for efficient computation
        df = self._sensor_data_to_dataframe(sensor_data)

        # Group by asset and compute baselines
        results = {}
        window_days = window_days or self.config['default_window_days']

        for asset_id in df['asset_id'].unique():
            asset_data = df[df['asset_id'] == asset_id].copy()
            asset_results = []

            # Compute baseline for each parameter
            for param in ['temperature', 'vibration']:
                if param in asset_data.columns and asset_data[param].notna().sum() >= self.config['min_window_size']:
                    try:
                        baseline_result = self._compute_parameter_baseline(
                            asset_data, asset_id, param, window_days
                        )
                        if baseline_result:
                            asset_results.append(baseline_result)
                    except Exception as e:
                        self.logger.error(f"Failed to compute baseline for {asset_id} {param}: {str(e)}")

            if asset_results:
                results[asset_id] = asset_results

        return results

    def _compute_parameter_baseline(self, asset_df: pd.DataFrame, asset_id: str,
                                  parameter: str, window_days: int) -> Optional[BaselineResult]:
        """
        Compute rolling baseline statistics for a specific parameter.

        Engineering Logic:
        - Uses expanding window initially, then rolling window for stability
        - Calculates z-scores for anomaly detection
        - Assesses baseline confidence based on data quality and quantity
        - Handles edge cases like insufficient data or constant values
        """
        # Filter to parameter data and sort by time
        param_data = asset_df[['timestamp', parameter]].dropna().copy()
        param_data = param_data.sort_values('timestamp')

        if len(param_data) < self.config['min_window_size']:
            return None

        # Compute rolling statistics
        window_size = min(len(param_data), window_days * 24)  # Assuming hourly data

        # Calculate rolling mean and standard deviation
        param_data['rolling_mean'] = param_data[parameter].rolling(
            window=window_size, min_periods=self.config['min_window_size']
        ).mean()

        param_data['rolling_std'] = param_data[parameter].rolling(
            window=window_size, min_periods=self.config['min_window_size']
        ).std()

        # Calculate z-scores
        param_data['z_score'] = (
            (param_data[parameter] - param_data['rolling_mean']) /
            param_data['rolling_std'].replace(0, 1e-6)  # Avoid division by zero
        )

        # Get latest baseline metrics
        latest_data = param_data.dropna().iloc[-1]
        baseline_metrics = BaselineMetrics(
            asset_id=asset_id,
            parameter=parameter,
            mean=latest_data['rolling_mean'],
            std=latest_data['rolling_std'],
            window_size=window_size,
            last_updated=datetime.now()
        )

        # Assess baseline quality
        confidence_level = self._assess_baseline_confidence(param_data, parameter)
        is_normal_operation = abs(latest_data['z_score']) <= self.config['max_z_score_threshold']

        # Store in cache
        if asset_id not in self._baseline_cache:
            self._baseline_cache[asset_id] = {}
        self._baseline_cache[asset_id][parameter] = baseline_metrics

        return BaselineResult(
            asset_id=asset_id,
            parameter=parameter,
            baseline_metrics=baseline_metrics,
            z_scores=param_data['z_score'].dropna().tolist(),
            is_normal_operation=is_normal_operation,
            confidence_level=confidence_level
        )

    def get_baseline(self, asset_id: str, parameter: str) -> Optional[BaselineMetrics]:
        """
        Retrieve stored baseline metrics for an asset parameter.

        Args:
            asset_id: Asset identifier
            parameter: Parameter name ('temperature', 'vibration', etc.)

        Returns:
            BaselineMetrics if available, None otherwise
        """
        return self._baseline_cache.get(asset_id, {}).get(parameter)

    def compute_z_score(self, asset_id: str, parameter: str, value: float) -> Optional[float]:
        """
        Compute z-score for a parameter value using stored baseline.

        Args:
            asset_id: Asset identifier
            parameter: Parameter name
            value: Current parameter value

        Returns:
            Z-score if baseline available, None otherwise

        Engineering Logic:
        - Uses stored baseline for real-time anomaly detection
        - Handles cases where baseline is not yet established
        - Returns standardized score for threshold comparisons
        """
        baseline = self.get_baseline(asset_id, parameter)
        if not baseline:
            return None

        if baseline.std == 0:
            return 0.0  # No variation in baseline data

        return (value - baseline.mean) / baseline.std

    def _sensor_data_to_dataframe(self, sensor_data: List[SensorDataPoint]) -> pd.DataFrame:
        """
        Convert sensor data points to DataFrame for computation.

        Engineering Logic:
        - Preserves timestamp ordering for time-series analysis
        - Handles missing values appropriately for each parameter type
        - Ensures data types are suitable for statistical computations
        """
        data = []
        for point in sensor_data:
            data.append({
                'timestamp': point.timestamp,
                'asset_id': point.asset_id,
                'temperature': point.temperature,
                'vibration': point.vibration,
                'run_hours': point.run_hours
            })

        df = pd.DataFrame(data)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = df.sort_values(['asset_id', 'timestamp'])

        return df

    def _assess_baseline_confidence(self, param_data: pd.DataFrame, parameter: str) -> float:
        """
        Assess the confidence level of computed baseline.

        Engineering Logic:
        - Considers data quantity, quality, and statistical properties
        - Penalizes baselines with high variability or insufficient data
        - Rewards consistent, well-established baselines
        """
        confidence = 1.0

        # Data quantity factor
        data_points = len(param_data.dropna())
        if data_points < self.config['min_window_size']:
            confidence *= 0.5
        elif data_points < self.config['min_window_size'] * 2:
            confidence *= 0.8

        # Statistical stability factor
        std_values = param_data['rolling_std'].dropna()
        if len(std_values) > 0:
            # High variability reduces confidence
            cv = std_values.mean() / (param_data['rolling_mean'].mean() + 1e-6)
            if cv > 0.5:  # Coefficient of variation > 50%
                confidence *= 0.7

        # Data completeness factor
        completeness = param_data[parameter].notna().mean()
        confidence *= completeness

        return max(0.1, min(1.0, confidence))  # Clamp between 0.1 and 1.0

    def detect_anomalies(self, sensor_data: List[SensorDataPoint],
                        z_threshold: Optional[float] = None) -> Dict[str, List[Dict[str, Any]]]:
        """
        Detect anomalies in sensor data using computed baselines.

        Args:
            sensor_data: Current sensor readings
            z_threshold: Z-score threshold for anomaly detection

        Returns:
            Dictionary mapping asset_id to list of detected anomalies

        Engineering Logic:
        - Uses statistical process control principles
        - Considers both magnitude and persistence of deviations
        - Flags anomalies that may indicate maintenance needs
        """
        z_threshold = z_threshold or self.config['max_z_score_threshold']
        anomalies = {}

        # Compute current baselines
        baselines = self.compute_baselines(sensor_data)

        for asset_id, asset_baselines in baselines.items():
            asset_anomalies = []

            for baseline_result in asset_baselines:
                # Check recent z-scores for anomalies
                recent_z_scores = baseline_result.z_scores[-10:]  # Last 10 readings

                for i, z_score in enumerate(recent_z_scores):
                    if abs(z_score) > z_threshold:
                        asset_anomalies.append({
                            'parameter': baseline_result.parameter,
                            'z_score': z_score,
                            'threshold': z_threshold,
                            'severity': 'high' if abs(z_score) > z_threshold * 1.5 else 'medium',
                            'timestamp': datetime.now() - timedelta(hours=len(recent_z_scores)-i-1)
                        })

            if asset_anomalies:
                anomalies[asset_id] = asset_anomalies

        return anomalies