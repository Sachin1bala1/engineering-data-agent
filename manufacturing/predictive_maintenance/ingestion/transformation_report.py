"""
Transformation report structures for ingestion auditability.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Any
import uuid


@dataclass
class TransformationReport:
    report_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    original_columns: List[str] = field(default_factory=list)
    inferred_mappings: Dict[str, Any] = field(default_factory=dict)
    timestamp_method: str = ""
    assumptions: List[str] = field(default_factory=list)
    confidence_score: float = 0.0
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "report_id": self.report_id,
            "created_at": self.created_at,
            "original_columns": self.original_columns,
            "inferred_mappings": self.inferred_mappings,
            "timestamp_method": self.timestamp_method,
            "assumptions": self.assumptions,
            "confidence_score": self.confidence_score,
            "warnings": self.warnings,
            "errors": self.errors
        }
