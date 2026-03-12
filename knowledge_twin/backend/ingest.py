from __future__ import annotations

import hashlib
import logging
import shutil
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import chromadb
from chromadb.api.models.Collection import Collection
from docx import Document as DocxDocument
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
from tqdm import tqdm

import memory_store
from config import CHROMA_COLLECTION, CHROMA_PATH, DOCUMENT_PATH, EMBEDDING_MODEL, ensure_data_dirs

logger = logging.getLogger("knowledge_twin.ingest")

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}


@dataclass
class IngestResult:
    status: str
    filename: str
    document_id: int | None
    chunks_added: int
    duplicate: bool
    message: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "filename": self.filename,
            "document_id": self.document_id,
            "chunks_added": self.chunks_added,
            "duplicate": self.duplicate,
            "message": self.message,
        }


class IngestionService:
    def __init__(self) -> None:
        ensure_data_dirs()
        memory_store.init_db()
        self._client = chromadb.PersistentClient(path=str(CHROMA_PATH))
        self._collection: Collection = self._client.get_or_create_collection(
            name=CHROMA_COLLECTION,
            metadata={"hnsw:space": "cosine"},
        )
        self._model: SentenceTransformer | None = None

    @property
    def model(self) -> SentenceTransformer:
        if self._model is None:
            logger.info("Loading embedding model: %s", EMBEDDING_MODEL)
            self._model = SentenceTransformer(EMBEDDING_MODEL)
        return self._model

    @staticmethod
    def sha256_file(path: Path) -> str:
        h = hashlib.sha256()
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest()

    @staticmethod
    def _extract_text(path: Path) -> str:
        suffix = path.suffix.lower()
        if suffix == ".pdf":
            reader = PdfReader(str(path))
            pages = [page.extract_text() or "" for page in reader.pages]
            return "\n".join(pages).strip()
        if suffix == ".docx":
            doc = DocxDocument(str(path))
            return "\n".join(p.text for p in doc.paragraphs).strip()
        if suffix in {".txt", ".md"}:
            return path.read_text(encoding="utf-8", errors="ignore").strip()
        raise ValueError(f"Unsupported extension: {suffix}")

    @staticmethod
    def chunk_text(text: str, chunk_size: int = 500, overlap: int = 80) -> list[tuple[str, int, int]]:
        tokens = text.split()
        if not tokens:
            return []
        chunks: list[tuple[str, int, int]] = []
        step = max(1, chunk_size - overlap)
        for start in range(0, len(tokens), step):
            end = min(len(tokens), start + chunk_size)
            chunk = " ".join(tokens[start:end]).strip()
            if chunk:
                chunks.append((chunk, start, end))
            if end >= len(tokens):
                break
        return chunks

    def ingest_bytes(self, content: bytes, filename: str) -> IngestResult:
        suffix = Path(filename).suffix.lower()
        if suffix not in ALLOWED_EXTENSIONS:
            raise ValueError(f"Unsupported file type: {suffix}. Allowed: {sorted(ALLOWED_EXTENSIONS)}")
        with tempfile.TemporaryDirectory() as td:
            temp_path = Path(td) / filename
            temp_path.write_bytes(content)
            return self.ingest_file(temp_path, original_filename=filename, save_copy=True)

    def ingest_file(self, path: Path, original_filename: str | None = None, save_copy: bool = False) -> IngestResult:
        source = Path(path)
        if not source.exists():
            raise FileNotFoundError(str(source))
        if source.suffix.lower() not in ALLOWED_EXTENSIONS:
            raise ValueError(f"Unsupported file type: {source.suffix}")

        file_hash = self.sha256_file(source)
        existing = memory_store.get_document_by_hash(file_hash)
        if existing:
            logger.info("Skipped duplicate document: %s", source.name)
            return IngestResult(
                status="skipped",
                filename=original_filename or source.name,
                document_id=int(existing["id"]),
                chunks_added=0,
                duplicate=True,
                message="Duplicate document hash detected; ingestion skipped.",
            )

        filename = original_filename or source.name
        if save_copy:
            safe_name = f"{file_hash[:12]}_{Path(filename).name}"
            stored_path = DOCUMENT_PATH / safe_name
            shutil.copyfile(source, stored_path)
        else:
            stored_path = source

        text = self._extract_text(stored_path)
        if not text:
            raise ValueError("No extractable text found in document.")

        chunk_rows = self.chunk_text(text)
        if not chunk_rows:
            raise ValueError("Document did not produce any valid chunks.")

        upload_time = datetime.now(timezone.utc).isoformat()
        document_id = memory_store.add_document(
            filename=filename,
            stored_path=str(stored_path),
            upload_time=upload_time,
            file_hash=file_hash,
            size_bytes=stored_path.stat().st_size,
        )

        batch_size = 32
        total_added = 0
        for i in tqdm(range(0, len(chunk_rows), batch_size), desc=f"Ingest {filename}", unit="batch"):
            batch = chunk_rows[i : i + batch_size]
            texts = [row[0] for row in batch]
            embeddings = self.model.encode(texts, normalize_embeddings=True).tolist()

            for local_idx, ((chunk_text, start_tok, end_tok), emb) in enumerate(zip(batch, embeddings)):
                chunk_index = i + local_idx
                embedding_id = f"d{document_id}_c{chunk_index}_{uuid4().hex[:10]}"
                self._collection.add(
                    ids=[embedding_id],
                    documents=[chunk_text],
                    embeddings=[emb],
                    metadatas=[
                        {
                            "document_id": document_id,
                            "filename": filename,
                            "file_hash": file_hash,
                            "chunk_index": chunk_index,
                            "start_token": start_tok,
                            "end_token": end_tok,
                            "upload_time": upload_time,
                            "source_path": str(stored_path),
                        }
                    ],
                )
                memory_store.add_chunk(
                    document_id=document_id,
                    chunk_text=chunk_text,
                    embedding_id=embedding_id,
                    chunk_index=chunk_index,
                    start_token=start_tok,
                    end_token=end_tok,
                )
                total_added += 1

        logger.info("Ingested %s chunks from %s", total_added, filename)
        return IngestResult(
            status="ok",
            filename=filename,
            document_id=document_id,
            chunks_added=total_added,
            duplicate=False,
            message="Document ingested successfully.",
        )

    def ingest_documents_folder(self) -> list[dict[str, Any]]:
        ensure_data_dirs()
        results: list[dict[str, Any]] = []
        for file_path in sorted(DOCUMENT_PATH.iterdir()):
            if not file_path.is_file() or file_path.suffix.lower() not in ALLOWED_EXTENSIONS:
                continue
            try:
                result = self.ingest_file(file_path, original_filename=file_path.name, save_copy=False)
                if not result.duplicate:
                    results.append(result.to_dict())
            except Exception as exc:
                logger.warning("Auto-ingest skipped %s: %s", file_path.name, exc)
        return results
