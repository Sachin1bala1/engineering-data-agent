from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("KT_DATA_DIR", str(BASE_DIR / "data"))).resolve()

DOCUMENT_PATH = DATA_DIR / "documents"
CHROMA_PATH = DATA_DIR / "chroma_db"
SQLITE_PATH = DATA_DIR / "metadata.db"

EMBEDDING_MODEL = os.getenv("KT_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
CHROMA_COLLECTION = os.getenv("KT_CHROMA_COLLECTION", "knowledge_twin_chunks")
AUTO_INGEST_INTERVAL_SEC = int(os.getenv("KT_AUTO_INGEST_INTERVAL_SEC", "20"))


def ensure_data_dirs() -> None:
    DOCUMENT_PATH.mkdir(parents=True, exist_ok=True)
    CHROMA_PATH.mkdir(parents=True, exist_ok=True)
    SQLITE_PATH.parent.mkdir(parents=True, exist_ok=True)

