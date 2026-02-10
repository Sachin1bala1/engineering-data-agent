"""
Time audit logging for normalization decisions.
"""

from pathlib import Path
from typing import Dict, Any

from ..utils.logger import get_file_logger


class TimeAuditService:
    def __init__(self, log_path: Path):
        self.logger = get_file_logger("time_audit", log_path)

    def log_event(self, record: Dict[str, Any]) -> None:
        self.logger.info(record)
