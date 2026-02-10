"""
Agentic ingestion pipeline for schema adaptation and auditability.
"""

from datetime import date
from typing import Optional, Tuple, Dict, Any, List
from pathlib import Path

import pandas as pd

from .schema_inspector import inspect_schema
from .timestamp_inference import infer_timestamps, TimestampInferenceError
from ..time_intelligence.time_normalizer import normalize_time
from ..time_intelligence.time_audit import TimeAuditService
from ..utils.logger import get_file_logger
from pathlib import Path
from .signal_mapper import map_signals
from .transformation_report import TransformationReport


class IngestionAgent:
    """Transforms raw datasets into canonical schema with traceability."""

    def ingest_file(self, file_path: str, asset_id: str,
                    asset_type: str,
                    default_date: Optional[date] = None,
                    start_date: Optional[date] = None) -> Tuple[pd.DataFrame, TransformationReport]:
        report = TransformationReport()
        path = Path(file_path)
        time_audit = TimeAuditService(Path("predictive_maintenance") / "logs" / "time.log")
        agent_logger = get_file_logger("ingestion_agent", Path("predictive_maintenance") / "logs" / "ingestion.log")

        if path.suffix.lower() in [".xls", ".xlsx"]:
            df = pd.read_excel(path)
            report.assumptions.append("Excel file detected; first sheet used.")
        else:
            df = pd.read_csv(path)

        report.original_columns = list(df.columns)
        inspection = inspect_schema(list(df.columns))

        report.inferred_mappings["time_columns"] = inspection.time_columns
        report.inferred_mappings["signal_columns"] = inspection.signal_columns

        if inspection.missing_required:
            report.errors.append("Missing timestamp or time components.")
            report.confidence_score = 0.0
            return pd.DataFrame(), report

        try:
            if "timestamp" in inspection.time_columns:
                timestamps, method, warnings = infer_timestamps(
                    df, inspection.time_columns, default_date=default_date, start_date=start_date
                )
                report.timestamp_method = method
                report.warnings.extend(warnings)
            else:
                timestamps = []
                method = "time_intelligence_pipeline"
                for idx, row in df.iterrows():
                    raw_time = None
                    row_date = None
                    if "date" in inspection.time_columns:
                        row_date = pd.to_datetime(row[inspection.time_columns["date"]], errors="coerce").date()
                    if {"hour", "minute", "second"} <= set(inspection.time_columns.keys()):
                        micro = row.get(inspection.time_columns.get("microsecond", ""), 0)
                        raw_time = f"{int(row[inspection.time_columns['hour']]):02d}:{int(row[inspection.time_columns['minute']]):02d}:{int(row[inspection.time_columns['second']]):02d}.{int(micro):06d}"
                    if raw_time is None:
                        raise TimestampInferenceError("Time components missing for normalization.")

                    normalized_record, normalized_dt = normalize_time(
                        raw_time,
                        row_date=row_date,
                        file_metadata=None,
                        default_date=default_date,
                        start_date=start_date,
                        shift_name=None
                    )
                    time_audit.log_event(normalized_record.__dict__)
                    if not normalized_dt:
                        raise TimestampInferenceError("Unable to normalize time value.")
                    timestamps.append(normalized_dt)
                timestamps = pd.to_datetime(pd.Series(timestamps), utc=True)
                report.timestamp_method = method
        except TimestampInferenceError as exc:
            report.errors.append(str(exc))
            report.confidence_score = 0.0
            return pd.DataFrame(), report

        signals_df, signal_mappings, signal_warnings = map_signals(df, inspection.signal_columns)
        report.inferred_mappings["signal_mappings"] = signal_mappings
        report.warnings.extend(signal_warnings)

        metadata_records = df.to_dict(orient="records")

        canonical = pd.DataFrame({
            "timestamp": timestamps,
            "asset_id": asset_id,
            "asset_type": asset_type,
            "temperature": signals_df.get("temperature"),
            "vibration": signals_df.get("vibration"),
            "run_hours": signals_df.get("run_hours"),
            "alarm_count": signals_df.get("alarm_count"),
            "raw_signal_metadata": metadata_records
        })

        canonical = canonical.sort_values("timestamp").reset_index(drop=True)
        if not canonical["timestamp"].is_monotonic_increasing:
            report.warnings.append("Timestamps were reordered to enforce monotonic sequence.")

        # Confidence scoring
        confidence = 1.0
        if "timestamp" not in inspection.time_columns:
            confidence -= 0.2
        if "vibration" not in signal_mappings and "temperature" not in signal_mappings:
            confidence -= 0.4
        if report.warnings:
            confidence -= min(0.2, 0.05 * len(report.warnings))
        report.confidence_score = max(0.1, confidence)

        if not canonical["temperature"].notna().any() and not canonical["vibration"].notna().any():
            report.errors.append("No usable signal data found.")
            report.confidence_score = 0.0
            return pd.DataFrame(), report

        agent_logger.info(report.to_dict())

        return canonical, report
