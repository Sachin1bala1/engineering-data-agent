from __future__ import annotations

import sqlite3
import threading
from pathlib import Path
from typing import Any

from config import SQLITE_PATH, ensure_data_dirs

_LOCK = threading.Lock()


def _connect() -> sqlite3.Connection:
    ensure_data_dirs()
    conn = sqlite3.connect(str(SQLITE_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _LOCK:
        with _connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT NOT NULL,
                    stored_path TEXT NOT NULL,
                    upload_time TEXT NOT NULL,
                    hash TEXT NOT NULL UNIQUE,
                    size_bytes INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS chunks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_id INTEGER NOT NULL,
                    chunk_text TEXT NOT NULL,
                    embedding_id TEXT NOT NULL UNIQUE,
                    chunk_index INTEGER NOT NULL,
                    start_token INTEGER NOT NULL,
                    end_token INTEGER NOT NULL,
                    FOREIGN KEY(document_id) REFERENCES documents(id)
                )
                """
            )
            conn.commit()


def get_document_by_hash(file_hash: str) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT id, filename, stored_path, upload_time, hash, size_bytes FROM documents WHERE hash=?",
            (file_hash,),
        ).fetchone()
        return dict(row) if row else None


def add_document(filename: str, stored_path: str, upload_time: str, file_hash: str, size_bytes: int) -> int:
    with _LOCK:
        existing = get_document_by_hash(file_hash)
        if existing:
            return int(existing["id"])
        with _connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO documents(filename, stored_path, upload_time, hash, size_bytes)
                VALUES (?, ?, ?, ?, ?)
                """,
                (filename, stored_path, upload_time, file_hash, int(size_bytes)),
            )
            conn.commit()
            return int(cur.lastrowid)


def add_chunk(
    document_id: int,
    chunk_text: str,
    embedding_id: str,
    chunk_index: int,
    start_token: int,
    end_token: int,
) -> int:
    with _LOCK:
        with _connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO chunks(document_id, chunk_text, embedding_id, chunk_index, start_token, end_token)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (document_id, chunk_text, embedding_id, int(chunk_index), int(start_token), int(end_token)),
            )
            conn.commit()
            return int(cur.lastrowid)


def list_documents() -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT d.id, d.filename, d.stored_path, d.upload_time, d.hash, d.size_bytes,
                   COUNT(c.id) AS chunk_count
            FROM documents d
            LEFT JOIN chunks c ON c.document_id = d.id
            GROUP BY d.id, d.filename, d.stored_path, d.upload_time, d.hash, d.size_bytes
            ORDER BY d.upload_time DESC
            """
        ).fetchall()
        return [dict(r) for r in rows]


def get_chunk_count(document_id: int) -> int:
    with _connect() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM chunks WHERE document_id=?",
            (document_id,),
        ).fetchone()
        return int(row["cnt"]) if row else 0

