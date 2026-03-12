"""Database utilities for Engineering Knowledge Twin."""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Any, Iterable

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

_DEFAULT_SQLITE = Path(__file__).resolve().parent / "knowledge_twin.db"

KNOWLEDGE_DB_URL = (
    os.getenv("KNOWLEDGE_DB_URL")
    or os.getenv("DATABASE_URL")
    or f"sqlite:///{_DEFAULT_SQLITE.as_posix()}"
)

engine: Engine = create_engine(KNOWLEDGE_DB_URL, future=True, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
_SCHEMA_READY = False
_SCHEMA_LOCK = threading.Lock()


def is_postgres() -> bool:
    return engine.dialect.name == "postgresql"


def bootstrap_schema() -> None:
    schema_path = Path(__file__).resolve().parent / "graph" / "schema.sql"
    if not schema_path.exists():
        raise FileNotFoundError(f"Knowledge schema not found: {schema_path}")
    raw_sql = schema_path.read_text(encoding="utf-8")

    statements = [s.strip() for s in raw_sql.split(";") if s.strip()]
    with engine.begin() as conn:
        for statement in statements:
            if not is_postgres() and "create extension" in statement.lower():
                continue
            if not is_postgres() and "vector(1536)" in statement.lower():
                statement = statement.replace("VECTOR(1536)", "TEXT")
            if not is_postgres() and " jsonb" in statement.lower():
                statement = statement.replace(" JSONB", " TEXT")
            if not is_postgres() and "SERIAL PRIMARY KEY" in statement:
                statement = statement.replace("SERIAL PRIMARY KEY", "INTEGER PRIMARY KEY AUTOINCREMENT")
            if not is_postgres() and "DEFAULT NOW()" in statement:
                statement = statement.replace("DEFAULT NOW()", "DEFAULT CURRENT_TIMESTAMP")
            conn.execute(text(statement))
    _apply_migrations()


def _apply_migrations() -> None:
    with engine.begin() as conn:
        if is_postgres():
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS knowledge_settings (
                      key TEXT PRIMARY KEY,
                      value TEXT,
                      updated_at TIMESTAMP DEFAULT NOW()
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS knowledge_chat_memory (
                      id SERIAL PRIMARY KEY,
                      session_id TEXT,
                      asset_id TEXT,
                      role TEXT,
                      content TEXT,
                      metadata JSONB,
                      created_at TIMESTAMP DEFAULT NOW()
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS knowledge_saved_datasets (
                      dataset_id TEXT PRIMARY KEY,
                      source TEXT,
                      filename TEXT,
                      asset_ids JSONB,
                      created_at TIMESTAMP DEFAULT NOW()
                    )
                    """
                )
            )
            conn.execute(text("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS downtime_minutes FLOAT"))
            conn.execute(text("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS source_dataset_id TEXT"))
            return
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS knowledge_settings (
                  key TEXT PRIMARY KEY,
                  value TEXT,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS knowledge_chat_memory (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  session_id TEXT,
                  asset_id TEXT,
                  role TEXT,
                  content TEXT,
                  metadata TEXT,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS knowledge_saved_datasets (
                  dataset_id TEXT PRIMARY KEY,
                  source TEXT,
                  filename TEXT,
                  asset_ids TEXT,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        columns = conn.execute(text("PRAGMA table_info(incidents)")).fetchall()
        names = {str(row[1]) for row in columns}
        if "downtime_minutes" not in names:
            conn.execute(text("ALTER TABLE incidents ADD COLUMN downtime_minutes FLOAT"))
        if "source_dataset_id" not in names:
            conn.execute(text("ALTER TABLE incidents ADD COLUMN source_dataset_id TEXT"))


def ensure_schema_once() -> None:
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    with _SCHEMA_LOCK:
        if _SCHEMA_READY:
            return
        bootstrap_schema()
        _SCHEMA_READY = True


def to_embedding_literal(vector: Iterable[float]) -> str:
    return "[" + ",".join(f"{float(v):.8f}" for v in vector) + "]"


def embedding_for_text(content: str, dims: int = 1536) -> list[float]:
    # Deterministic local embedding so vector search works without paid services.
    values = [0.0] * dims
    if not content:
        return values
    encoded = content.encode("utf-8", errors="ignore")
    for idx, byte in enumerate(encoded):
        bucket = idx % dims
        values[bucket] += ((byte / 255.0) * ((idx % 7) + 1))
    norm = sum(v * v for v in values) ** 0.5
    if norm > 0:
        values = [v / norm for v in values]
    return values


def read_rows(sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    with engine.begin() as conn:
        result = conn.execute(text(sql), params or {})
        return [dict(row._mapping) for row in result]


def execute(sql: str, params: dict[str, Any] | None = None) -> None:
    with engine.begin() as conn:
        conn.execute(text(sql), params or {})
