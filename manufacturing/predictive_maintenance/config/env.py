"""
Environment configuration for deterministic backend behavior.
"""

import os
from datetime import date
from pathlib import Path

try:
    from dotenv import load_dotenv
except Exception:  # pragma: no cover - optional dependency
    load_dotenv = None


def load_environment() -> None:
    """Load .env from project root if python-dotenv is available."""
    if not load_dotenv:
        return

    env_path = Path(__file__).resolve().parents[2] / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    if not os.getenv("GEMINI_API_KEY") and os.getenv("GOOGLE_API_KEY"):
        os.environ["GEMINI_API_KEY"] = os.getenv("GOOGLE_API_KEY", "")


def validate_gemini_key() -> None:
    """Validate GEMINI_API_KEY is present and not a placeholder."""
    key = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("GEMINI_API_KEY is missing.")
    lowered = key.lower()
    if lowered in {"your_key", "your_key_here", "insert_key_here"} or "your_key" in lowered:
        raise RuntimeError("GEMINI_API_KEY is a placeholder. Replace it with a real key.")


def get_default_date() -> date:
    value = os.getenv("DEFAULT_TIME_ANCHOR_DATE")
    if value:
        return date.fromisoformat(value)
    return date.today()
