from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

import memory_store
from config import AUTO_INGEST_INTERVAL_SEC, DOCUMENT_PATH, ensure_data_dirs
from ingest import IngestionService
from retriever import Retriever

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("knowledge_twin.api")

ingestor = IngestionService()
retriever = Retriever()
watcher_task: asyncio.Task | None = None


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)
    keyword_filter: str | None = None
    mode: str = Field(default="hybrid", pattern="^(semantic|hybrid)$")


async def _watch_documents_folder() -> None:
    logger.info("Auto-learning watcher started. Watching: %s", DOCUMENT_PATH)
    while True:
        try:
            new_rows = ingestor.ingest_documents_folder()
            if new_rows:
                logger.info("Auto-ingested %s new document(s).", len(new_rows))
        except Exception:
            logger.exception("Auto-ingest cycle failed")
        await asyncio.sleep(max(5, AUTO_INGEST_INTERVAL_SEC))


@asynccontextmanager
async def lifespan(_: FastAPI):
    global watcher_task
    ensure_data_dirs()
    memory_store.init_db()
    watcher_task = asyncio.create_task(_watch_documents_folder())
    try:
        yield
    finally:
        if watcher_task:
            watcher_task.cancel()
            try:
                await watcher_task
            except asyncio.CancelledError:
                pass


app = FastAPI(
    title="Knowledge Twin API",
    version="1.0.0",
    description="Persistent RAG memory store with incremental document ingestion.",
    lifespan=lifespan,
)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok"}


@app.post("/upload_document")
async def upload_document(file: UploadFile = File(...)) -> dict[str, Any]:
    filename = file.filename or "unnamed.txt"
    suffix = Path(filename).suffix.lower()
    if suffix not in {".pdf", ".docx", ".txt", ".md"}:
        raise HTTPException(status_code=400, detail="Supported formats: .pdf, .docx, .txt, .md")
    try:
        content = await file.read()
        result = ingestor.ingest_bytes(content, filename=filename)
        return result.to_dict()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Upload failed for %s", filename)
        raise HTTPException(status_code=500, detail=f"Upload failed: {exc}") from exc


@app.get("/list_documents")
def list_documents() -> dict[str, Any]:
    return {"documents": memory_store.list_documents()}


@app.post("/query")
def query_knowledge(payload: QueryRequest) -> dict[str, Any]:
    try:
        if payload.mode == "semantic":
            rows = retriever.semantic_search(payload.query, top_k=payload.top_k)
        else:
            rows = retriever.hybrid_search(
                payload.query,
                top_k=payload.top_k,
                keyword_filter=payload.keyword_filter,
            )

        context = retriever.build_context(rows)
        return {
            "query": payload.query,
            "mode": payload.mode,
            "top_k": payload.top_k,
            "results": rows,
            "context": context,
            "prompt_injection_context": (
                f"Use only this retrieved context when answering.\n\n{context}" if context else ""
            ),
        }
    except Exception as exc:
        logger.exception("Query failed")
        raise HTTPException(status_code=500, detail=f"Query failed: {exc}") from exc

