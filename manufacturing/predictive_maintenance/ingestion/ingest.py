"""
Data ingestion module for predictive maintenance system.

Handles CSV file validation, preprocessing, and data normalization.
Supports sensor data and maintenance log ingestion with robust error handling.
"""

import pandas as pd
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Tuple, Optional, Union
from pathlib import Path

from ..models import SensorData, MaintenanceLog, ASSET_TYPES

logger = logging.getLogger(__name__)


class DataIngestion:
    """
    Handles data ingestion and preprocessing for manufacturing predictive maintenance.

    Provides methods to validate CSV schemas, handle missing values, and normalize
    timestamps for both sensor data and maintenance logs.
    """

    # Expected schemas for different data types
    SENSOR_DATA_SCHEMA = {
        'timestamp': 'datetime64[ns]',
        'asset_id': 'object',
        'temperature': 'float64',
        'vibration': 'float64',
        'run_hours': 'float64'
    }

    MAINTENANCE_LOG_SCHEMA = {
        'asset_id': 'object',
        'failure_type': 'object',
        'failure_date': 'datetime64[ns]'
    }

    def __init__(self):
        """Initialize the data ingestion handler."""
        self.validation_errors = []
        self.ingestion_stats = {
            'files_processed': 0,
            'records_ingested': 0,
            'errors': []
        }

    def ingest_csv_file(self, file_path: Union[str, Path], data_type: str) -> Tuple[List[Dict], List[str]]:
        """
        Ingest a CSV file and return processed data with any errors.

        Args:
            file_path: Path to the CSV file
            data_type: Type of data ('sensor_data' or 'maintenance_logs')

        Returns:
            Tuple of (processed_data_list, error_list)
        """
        file_path = Path(file_path)
        self.validation_errors = []

        try:
            # Read CSV file
            df = pd.read_csv(file_path)

            # Validate schema
            if not self._validate_schema(df, data_type):
                return [], self.validation_errors

            # Handle missing values
            df = self._handle_missing_values(df, data_type)

            # Normalize timestamps
            df = self._normalize_timestamps(df, data_type)

            # Validate data ranges and logic
            df = self._validate_data_ranges(df, data_type)

            # Convert to model objects
            processed_data = self._convert_to_models(df, data_type)

            self.ingestion_stats['files_processed'] += 1
            self.ingestion_stats['records_ingested'] += len(processed_data)

            return processed_data, self.validation_errors

        except Exception as e:
            error_msg = f"Failed to process {file_path}: {str(e)}"
            logger.error(error_msg)
            self.validation_errors.append(error_msg)
            return [], self.validation_errors

    def _validate_schema(self, df: pd.DataFrame, data_type: str) -> bool:
        """
        Validate that the DataFrame matches the expected schema.

        Args:
            df: DataFrame to validate
            data_type: Type of data being validated

        Returns:
            True if schema is valid, False otherwise
        """
        expected_columns = {
            'sensor_data': set(self.SENSOR_DATA_SCHEMA.keys()),
            'maintenance_logs': set(self.MAINTENANCE_LOG_SCHEMA.keys())
        }

        actual_columns = set(df.columns)
        expected = expected_columns.get(data_type)

        if not expected:
            self.validation_errors.append(f"Unknown data type: {data_type}")
            return False

        if actual_columns != expected:
            missing = expected - actual_columns
            extra = actual_columns - expected
            error_msg = f"Schema validation failed for {data_type}:"
            if missing:
                error_msg += f" Missing columns: {missing}"
            if extra:
                error_msg += f" Extra columns: {extra}"
            self.validation_errors.append(error_msg)
            return False

        return True

    def _handle_missing_values(self, df: pd.DataFrame, data_type: str) -> pd.DataFrame:
        """
        Handle missing values in the DataFrame using engineering-appropriate methods.

        Args:
            df: DataFrame with potential missing values
            data_type: Type of data being processed

        Returns:
            DataFrame with missing values handled
        """
        if df.isnull().sum().sum() == 0:
            return df

        logger.info(f"Handling missing values in {data_type} data")

        if data_type == 'sensor_data':
            # For sensor data, use forward fill for time-series continuity
            # Temperature and vibration: forward fill (last known good value)
            df['temperature'] = df['temperature'].fillna(method='ffill')
            df['vibration'] = df['vibration'].fillna(method='ffill')

            # Run hours: should be monotonically increasing, interpolate
            df['run_hours'] = df['run_hours'].interpolate(method='linear')

            # If still missing at start, use reasonable defaults
            df['temperature'] = df['temperature'].fillna(25.0)  # Room temperature
            df['vibration'] = df['vibration'].fillna(0.1)  # Low baseline vibration
            df['run_hours'] = df['run_hours'].fillna(0.0)

        elif data_type == 'maintenance_logs':
            # For maintenance logs, drop rows with missing critical fields
            critical_fields = ['asset_id', 'failure_type', 'failure_date']
            before_count = len(df)
            df = df.dropna(subset=critical_fields)
            after_count = len(df)

            if before_count != after_count:
                logger.warning(f"Dropped {before_count - after_count} maintenance log entries with missing critical fields")

        return df

    def _normalize_timestamps(self, df: pd.DataFrame, data_type: str) -> pd.DataFrame:
        """
        Normalize timestamp formats to consistent datetime objects.

        Args:
            df: DataFrame with timestamp columns
            data_type: Type of data being processed

        Returns:
            DataFrame with normalized timestamps
        """
        if data_type == 'sensor_data':
            timestamp_col = 'timestamp'
        elif data_type == 'maintenance_logs':
            timestamp_col = 'failure_date'
        else:
            return df

        try:
            # Attempt to parse various timestamp formats
            df[timestamp_col] = pd.to_datetime(df[timestamp_col], errors='coerce')

            # Check for any parsing failures
            null_timestamps = df[timestamp_col].isnull().sum()
            if null_timestamps > 0:
                self.validation_errors.append(f"Failed to parse {null_timestamps} timestamp values")
                # Drop rows with invalid timestamps
                df = df.dropna(subset=[timestamp_col])

            # Ensure timestamps are in chronological order
            df = df.sort_values(timestamp_col).reset_index(drop=True)

        except Exception as e:
            self.validation_errors.append(f"Timestamp normalization failed: {str(e)}")

        return df

    def _validate_data_ranges(self, df: pd.DataFrame, data_type: str) -> pd.DataFrame:
        """
        Validate that data values are within reasonable engineering ranges.

        Args:
            df: DataFrame to validate
            data_type: Type of data being validated

        Returns:
            DataFrame with invalid records filtered out
        """
        if data_type == 'sensor_data':
            # Temperature validation (reasonable range for industrial equipment)
            temp_mask = (df['temperature'] >= -50) & (df['temperature'] <= 200)
            invalid_temp = len(df) - temp_mask.sum()
            if invalid_temp > 0:
                logger.warning(f"Filtered {invalid_temp} records with invalid temperature values")

            # Vibration validation (reasonable range for rotating equipment)
            vib_mask = (df['vibration'] >= 0) & (df['vibration'] <= 10)
            invalid_vib = len(df) - vib_mask.sum()
            if invalid_vib > 0:
                logger.warning(f"Filtered {invalid_vib} records with invalid vibration values")

            # Run hours validation (should be non-negative and reasonable)
            hours_mask = (df['run_hours'] >= 0) & (df['run_hours'] <= 200000)  # 20+ years
            invalid_hours = len(df) - hours_mask.sum()
            if invalid_hours > 0:
                logger.warning(f"Filtered {invalid_hours} records with invalid run hours")

            # Apply all filters
            valid_mask = temp_mask & vib_mask & hours_mask
            df = df[valid_mask].reset_index(drop=True)

        elif data_type == 'maintenance_logs':
            # Validate asset_id exists in our known asset types
            valid_assets = set()
            for asset_type in ASSET_TYPES.values():
                # Assuming asset_ids follow pattern like "motor_001", "pump_001"
                valid_assets.update([f"{asset_type.lower()}_" for asset_type in ASSET_TYPES.keys()])

            # More flexible validation - just check if asset_id is not empty
            df = df[df['asset_id'].str.len() > 0].reset_index(drop=True)

        return df

    def _convert_to_models(self, df: pd.DataFrame, data_type: str) -> List[Dict]:
        """
        Convert DataFrame rows to model objects.

        Args:
            df: Processed DataFrame
            data_type: Type of data being converted

        Returns:
            List of model dictionaries
        """
        result = []

        for _, row in df.iterrows():
            try:
                if data_type == 'sensor_data':
                    model = SensorData(
                        timestamp=row['timestamp'].to_pydatetime(),
                        asset_id=str(row['asset_id']),
                        temperature=float(row['temperature']),
                        vibration=float(row['vibration']),
                        run_hours=float(row['run_hours'])
                    )
                    result.append(model.dict())

                elif data_type == 'maintenance_logs':
                    model = MaintenanceLog(
                        asset_id=str(row['asset_id']),
                        failure_type=str(row['failure_type']),
                        failure_date=row['failure_date'].to_pydatetime()
                    )
                    result.append(model.dict())

            except Exception as e:
                logger.error(f"Failed to convert row to model: {str(e)}")
                continue

        return result

    def get_ingestion_stats(self) -> Dict:
        """Get statistics about the ingestion process."""
        return self.ingestion_stats.copy()
