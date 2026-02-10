"""
Shift definitions for time anchoring.
"""

from datetime import time

SHIFT_STARTS = {
    "day": time(6, 0, 0),
    "swing": time(14, 0, 0),
    "night": time(22, 0, 0)
}

DEFAULT_SHIFT = "day"
