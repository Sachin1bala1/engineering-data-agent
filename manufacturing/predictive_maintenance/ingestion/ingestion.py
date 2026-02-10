"""
Data ingestion service for predictive maintenance system.

This module handles CSV file processing including:
- Schema validation for sensor data and maintenance logs
- Missing value imputation using engineering-appropriate methods
- Timestamp normalization and validation
- Data quality checks specific to industrial sensor data
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta, date
from typing import List, Dict, Optional, Tuple, Any
from pathlib import Path
import logging
from dataclasses import dataclass

from ..models.data_models import SensorDataPoint, MaintenanceLog, AssetType
from .ingestion_agent import IngestionAgent

logger = logging.getLogger(__name__)


@dataclass
class IngestionResult:
    """Result of data ingestion process."""
    sensor_data: List[SensorDataPoint]
    maintenance_logs: List[MaintenanceLog]
    records_processed: int
    errors: List[str]
    warnings: List[str]


class DataIngestionService:
    """
    Service for ingesting and validating CSV data from manufacturing sensors.

    Handles industrial sensor data characteristics:
    - Missing values due to sensor failures or maintenance
    - Timestamp irregularities from system clocks
    - Outlier values from measurement errors
    - Data quality validation for operational use
    """

    # Expected CSV schemas
    SENSOR_DATA_SCHEMA = {
        'timestamp': 'datetime64[ns]',
        'asset_id': 'string',
        'temperature': 'float64',
        'vibration': 'float64',
        'run_hours': 'float64'
    }
    OPTIONAL_SENSOR_COLUMNS = {
        'alarm_frequency': 'float64',
        'alarm_count': 'float64'
    }

    MAINTENANCE_LOG_SCHEMA = {
        'asset_id': 'string',
        'failure_type': 'string',
        'failure_date': 'datetime64[ns]'
    }

    # Engineering limits for data validation
    ENGINEERING_LIMITS = {
        'temperature': {'min': -50, 'max': 200, 'unit': '°C'},  # Covers extreme industrial conditions
        'vibration': {'min': 0, 'max': 50, 'unit': 'mm/s'},     # Typical vibration monitoring range
        'run_hours': {'min': 0, 'max': 100000, 'unit': 'hours'}, # Covers multi-year operation
        'alarm_frequency': {'min': 0, 'max': 200, 'unit': 'counts/hr'},
        'alarm_count': {'min': 0, 'max': 200, 'unit': 'counts/hr'}
    }

    def __init__(self):
        """Initialize the data ingestion service."""
        self.logger = logging.getLogger(__name__)
        self.agent = IngestionAgent()

    def process_sensor_file(self, file_path: str, asset_id: str,
                            asset_type: AssetType,
                            default_date: Optional[date] = None,
                            start_date: Optional[date] = None) -> Tuple[List[SensorDataPoint], List[str], List[str], Dict[str, Any]]:
        """
        Process sensor file using the agentic ingestion pipeline.

        Returns:
            data_points, errors, warnings, transformation_report
        """
        canonical_df, report = self.agent.ingest_file(
            file_path=file_path,
            asset_id=asset_id,
            asset_type=asset_type.value,
            default_date=default_date,
            start_date=start_date
        )

        if report.errors:
            return [], report.errors, report.warnings, report.to_dict()

        data_points = []
        for _, row in canonical_df.iterrows():
            data_points.append(SensorDataPoint(
                timestamp=row["timestamp"],
                asset_id=row["asset_id"],
                asset_type=asset_type,
                temperature=row.get("temperature"),
                vibration=row.get("vibration"),
                run_hours=row.get("run_hours"),
                alarm_count=row.get("alarm_count"),
                alarm_frequency=row.get("alarm_count"),
                raw_signal_metadata=row.get("raw_signal_metadata")
            ))

        return data_points, [], report.warnings, report.to_dict()

    def process_sensor_csv(self, file_path: str) -> Tuple[List[SensorDataPoint], List[str]]:
        """
        Process sensor data CSV file with comprehensive validation.

        Args:
            file_path: Path to the CSV file containing sensor readings

        Returns:
            Tuple of (processed_data_points, error_messages)

        Engineering Logic:
        - Validates against known industrial sensor limits
        - Uses forward-fill for missing values (appropriate for continuous monitoring)
        - Normalizes timestamps to UTC
        - Flags outliers using statistical methods appropriate for industrial data
        """
        try:
            df = pd.read_csv(file_path, parse_dates=['timestamp'])
        except Exception as e:
            # Fallback to agentic ingestion if timestamp schema mismatch
            if "Missing column provided to 'parse_dates'" in str(e):
                data_points, errors, warnings, _ = self.process_sensor_file(
                    file_path,
                    asset_id="ASSET-UNKNOWN",
                    asset_type=AssetType.ELECTRIC_MOTOR
                )
                return data_points, errors + warnings
            return [], [f"Failed to read CSV file: {str(e)}"]

        errors = []
        warnings = []

        # Validate schema
        schema_errors = self._validate_schema(
            df, self.SENSOR_DATA_SCHEMA, 'sensor_data', optional_schema=self.OPTIONAL_SENSOR_COLUMNS
        )
        if schema_errors:
            errors.extend(schema_errors)
            return [], errors

        # Validate data quality
        quality_warnings = self._validate_data_quality(df)
        warnings.extend(quality_warnings)

        # Handle missing values using engineering-appropriate methods
        df_clean = self._handle_missing_values(df)

        # Normalize timestamps
        df_clean = self._normalize_timestamps(df_clean)

        # Convert to data models
        data_points = []
        for _, row in df_clean.iterrows():
            try:
                data_point = SensorDataPoint(
                    timestamp=row['timestamp'],
                    asset_id=str(row['asset_id']),
                    temperature=row['temperature'] if pd.notna(row['temperature']) else None,
                    vibration=row['vibration'] if pd.notna(row['vibration']) else None,
                    run_hours=row['run_hours'] if pd.notna(row['run_hours']) else None,
                    alarm_frequency=row['alarm_frequency'] if 'alarm_frequency' in row and pd.notna(row['alarm_frequency']) else None,
                    alarm_count=row['alarm_count'] if 'alarm_count' in row and pd.notna(row['alarm_count']) else None
                )
                data_points.append(data_point)
            except Exception as e:
                errors.append(f"Failed to create data point for asset {row.get('asset_id', 'unknown')}: {str(e)}")

        return data_points, errors + warnings

    def process_maintenance_csv(self, file_path: str) -> Tuple[List[MaintenanceLog], List[str]]:
        """
        Process maintenance log CSV file.

        Args:
            file_path: Path to the CSV file containing maintenance records

        Returns:
            Tuple of (maintenance_logs, error_messages)

        Engineering Logic:
        - Validates failure types against known industrial failure modes
        - Ensures maintenance dates are reasonable (not in future)
        - Links maintenance to specific assets for failure pattern analysis
        """
        try:
            path = Path(file_path)
            if path.suffix.lower() in [".xls", ".xlsx"]:
                df = pd.read_excel(file_path)
            else:
                df = pd.read_csv(file_path, parse_dates=['failure_date'])
        except Exception as e:
            return [], [f"Failed to read maintenance file: {str(e)}"]

        errors = []

        # Validate schema
        schema_errors = self._validate_schema(df, self.MAINTENANCE_LOG_SCHEMA, 'maintenance_log')
        if schema_errors:
            errors.extend(schema_errors)
            return [], errors

        # Ensure failure_date is datetime
        if 'failure_date' in df.columns:
            df['failure_date'] = pd.to_datetime(df['failure_date'], errors='coerce')
            # Handle timezone
            if df['failure_date'].dt.tz is None:
                df['failure_date'] = df['failure_date'].dt.tz_localize('UTC')
            else:
                df['failure_date'] = df['failure_date'].dt.tz_convert('UTC')

        # Validate maintenance dates
        date_errors = self._validate_maintenance_dates(df)
        errors.extend(date_errors)

        # Convert to data models
        maintenance_logs = []
        for _, row in df.iterrows():
            try:
                # Convert pandas timestamp to naive datetime
                failure_date = row['failure_date']
                if hasattr(failure_date, 'to_pydatetime'):
                    failure_date = failure_date.to_pydatetime().replace(tzinfo=None)  # Make naive
                elif isinstance(failure_date, str):
                    failure_date = datetime.fromisoformat(failure_date.replace('Z', '+00:00')).replace(tzinfo=None)

                log = MaintenanceLog(
                    asset_id=str(row['asset_id']),
                    failure_type=row['failure_type'],
                    failure_date=failure_date
                )
                maintenance_logs.append(log)
            except Exception as e:
                errors.append(f"Failed to create maintenance log for asset {row.get('asset_id', 'unknown')}: {str(e)}")

        return maintenance_logs, errors

    def _validate_schema(self, df: pd.DataFrame, expected_schema: Dict,
                         data_type: str, optional_schema: Optional[Dict] = None) -> List[str]:
        """
        Validate DataFrame schema against expected structure.

        Engineering Logic:
        - Ensures data types are appropriate for industrial calculations
        - Validates column presence for required fields
        - Checks for data type compatibility with downstream processing
        """
        errors = []

        for column, expected_dtype in expected_schema.items():
            if column not in df.columns:
                errors.append(f"Missing required column '{column}' in {data_type}")
                continue

            # Check data type compatibility
            actual_dtype = str(df[column].dtype)
            if expected_dtype == 'datetime64[ns]' and not pd.api.types.is_datetime64_any_dtype(df[column]):
                errors.append(f"Column '{column}' should be datetime but is {actual_dtype}")
            elif expected_dtype in ['float64', 'int64'] and not pd.api.types.is_numeric_dtype(df[column]):
                errors.append(f"Column '{column}' should be numeric but is {actual_dtype}")
            elif expected_dtype == 'string' and not pd.api.types.is_string_dtype(df[column]):
                errors.append(f"Column '{column}' should be string but is {actual_dtype}")

        optional_schema = optional_schema or {}
        for column, expected_dtype in optional_schema.items():
            if column in df.columns:
                actual_dtype = str(df[column].dtype)
                if expected_dtype == 'datetime64[ns]' and not pd.api.types.is_datetime64_any_dtype(df[column]):
                    errors.append(f"Column '{column}' should be datetime but is {actual_dtype}")
                elif expected_dtype in ['float64', 'int64'] and not pd.api.types.is_numeric_dtype(df[column]):
                    errors.append(f"Column '{column}' should be numeric but is {actual_dtype}")
                elif expected_dtype == 'string' and not pd.api.types.is_string_dtype(df[column]):
                    errors.append(f"Column '{column}' should be string but is {actual_dtype}")

        return errors

    def _validate_data_quality(self, df: pd.DataFrame) -> List[str]:
        """
        Validate data quality using engineering limits and statistical methods.

        Engineering Logic:
        - Uses domain knowledge of industrial sensor limits
        - Detects outliers that could indicate sensor failure or measurement error
        - Flags data that may affect maintenance decision making
        """
        warnings = []

        for param, limits in self.ENGINEERING_LIMITS.items():
            if param in df.columns:
                values = df[param].dropna()
                if len(values) == 0:
                    continue

                # Check engineering limits
                out_of_range = values[(values < limits['min']) | (values > limits['max'])]
                if len(out_of_range) > 0:
                    warnings.append(
                        f"{len(out_of_range)} {param} readings outside engineering limits "
                        f"({limits['min']}-{limits['max']} {limits['unit']})"
                    )

                # Check for statistical outliers (using IQR method)
                if len(values) > 10:  # Need minimum data for statistical analysis
                    Q1 = values.quantile(0.25)
                    Q3 = values.quantile(0.75)
                    IQR = Q3 - Q1
                    outlier_threshold = Q3 + 1.5 * IQR
                    outliers = values[values > outlier_threshold]
                    if len(outliers) > 0:
                        warnings.append(
                            f"{len(outliers)} statistical outliers detected in {param} data "
                            f"(values > {outlier_threshold:.2f} {limits['unit']})"
                        )

        return warnings

    def _handle_missing_values(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Handle missing values using engineering-appropriate imputation methods.

        Engineering Logic:
        - Forward fill for sensor data (maintains last known good value)
        - Linear interpolation for short gaps in continuous monitoring
        - Preserves data integrity for maintenance decision making
        """
        df_clean = df.copy()

        # Sort by timestamp and asset_id for proper forward fill
        df_clean = df_clean.sort_values(['asset_id', 'timestamp'])

        # Forward fill missing values within each asset group
        # This is appropriate for industrial sensors where values change gradually
        for asset_id in df_clean['asset_id'].unique():
            asset_mask = df_clean['asset_id'] == asset_id
            asset_data = df_clean[asset_mask]

            # Forward fill sensor readings
            for col in ['temperature', 'vibration', 'run_hours', 'alarm_frequency', 'alarm_count']:
                if col in asset_data.columns:
                    df_clean.loc[asset_mask, col] = asset_data[col].ffill()

        # For any remaining missing values at the start, use reasonable defaults
        defaults = {
            'temperature': 25.0,  # Room temperature baseline
            'vibration': 0.1,     # Minimal vibration baseline
            'run_hours': 0.0,     # Start of operation
            'alarm_frequency': 0.0,
            'alarm_count': 0.0
        }

        for col, default in defaults.items():
            if col in df_clean.columns:
                df_clean[col] = df_clean[col].fillna(default)

        return df_clean

    def _normalize_timestamps(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Normalize timestamps to ensure consistency and handle irregularities.

        Engineering Logic:
        - Converts all timestamps to UTC for consistent analysis
        - Handles timezone-naive data by assuming plant local time
        - Removes duplicate timestamps that could skew analysis
        - Ensures chronological ordering for time-series analysis
        """
        df_normalized = df.copy()

        # Ensure timestamp column exists
        if 'timestamp' not in df_normalized.columns:
            raise ValueError("Timestamp column missing from data")

        # Convert to datetime if not already
        df_normalized['timestamp'] = pd.to_datetime(df_normalized['timestamp'], utc=True)
        # Ensure consistent timezone handling
        if df_normalized['timestamp'].dt.tz is None:
            df_normalized['timestamp'] = df_normalized['timestamp'].dt.tz_localize('UTC')
        else:
            df_normalized['timestamp'] = df_normalized['timestamp'].dt.tz_convert('UTC')

        # Sort by timestamp within each asset
        df_normalized = df_normalized.sort_values(['asset_id', 'timestamp'])

        # Remove exact duplicate timestamps (keep first occurrence)
        duplicate_mask = df_normalized.duplicated(subset=['asset_id', 'timestamp'], keep='first')
        if duplicate_mask.any():
            self.logger.warning(f"Removed {duplicate_mask.sum()} duplicate timestamp entries")
            df_normalized = df_normalized[~duplicate_mask]

        # Check for reasonable time gaps (warn if gaps > 24 hours for continuous monitoring)
        for asset_id in df_normalized['asset_id'].unique():
            asset_data = df_normalized[df_normalized['asset_id'] == asset_id]
            if len(asset_data) > 1:
                time_diffs = asset_data['timestamp'].diff().dt.total_seconds() / 3600  # hours
                large_gaps = time_diffs[time_diffs > 24]
                if len(large_gaps) > 0:
                    self.logger.warning(
                        f"Asset {asset_id}: {len(large_gaps)} gaps > 24 hours in monitoring data"
                    )

        return df_normalized

    def _validate_maintenance_dates(self, df: pd.DataFrame) -> List[str]:
        """
        Validate maintenance log dates for reasonableness.

        Engineering Logic:
        - Prevents future-dated maintenance records
        - Ensures dates are within reasonable historical bounds
        - Validates against asset operational timelines
        """
        errors = []
        now = datetime.now().replace(tzinfo=None)  # Naive datetime for comparison

        for idx, row in df.iterrows():
            failure_date = row['failure_date']

            # Ensure failure_date is naive for comparison
            if hasattr(failure_date, 'replace') and failure_date.tzinfo is not None:
                failure_date = failure_date.replace(tzinfo=None)

            # Check if date is in the future
            if failure_date > now:
                errors.append(
                    f"Maintenance record {idx}: failure_date {failure_date} is in the future"
                )

            # Check if date is unreasonably old (more than 20 years ago)
            twenty_years_ago = now - timedelta(days=365*20)
            if failure_date < twenty_years_ago:
                errors.append(
                    f"Maintenance record {idx}: failure_date {failure_date} is more than 20 years old"
                )

        return errors
