"""
Structured logger helper.
"""

import logging
from pathlib import Path


def get_file_logger(name: str, log_path: Path) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    log_path.parent.mkdir(parents=True, exist_ok=True)
    handler = logging.FileHandler(log_path, encoding="utf-8")
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger
