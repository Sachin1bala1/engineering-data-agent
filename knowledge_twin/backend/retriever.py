from __future__ import annotations

from typing import Any

import chromadb
from sentence_transformers import SentenceTransformer

from config import CHROMA_COLLECTION, CHROMA_PATH, EMBEDDING_MODEL


class Retriever:
    def __init__(self) -> None:
        self._client = chromadb.PersistentClient(path=str(CHROMA_PATH))
        self._collection = self._client.get_or_create_collection(
            name=CHROMA_COLLECTION,
            metadata={"hnsw:space": "cosine"},
        )
        self._model: SentenceTransformer | None = None

    @property
    def model(self) -> SentenceTransformer:
        if self._model is None:
            self._model = SentenceTransformer(EMBEDDING_MODEL)
        return self._model

    def semantic_search(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        if not query.strip():
            return []
        vector = self.model.encode([query], normalize_embeddings=True).tolist()[0]
        res = self._collection.query(
            query_embeddings=[vector],
            n_results=max(1, top_k),
            include=["documents", "metadatas", "distances"],
        )
        docs = (res.get("documents") or [[]])[0]
        metas = (res.get("metadatas") or [[]])[0]
        distances = (res.get("distances") or [[]])[0]
        out: list[dict[str, Any]] = []
        for doc, meta, dist in zip(docs, metas, distances):
            score = 1.0 - float(dist) if dist is not None else 0.0
            out.append(
                {
                    "chunk_text": doc,
                    "score": round(score, 6),
                    "metadata": meta or {},
                }
            )
        return out

    def hybrid_search(self, query: str, top_k: int = 5, keyword_filter: str | None = None) -> list[dict[str, Any]]:
        base = self.semantic_search(query=query, top_k=max(3, top_k * 3))
        if not keyword_filter:
            return base[:top_k]

        needle = keyword_filter.lower().strip()
        filtered = [
            row
            for row in base
            if needle in str(row.get("chunk_text") or "").lower()
            or needle in str((row.get("metadata") or {}).get("filename") or "").lower()
        ]

        if len(filtered) < top_k:
            used = {id(item) for item in filtered}
            for row in base:
                if id(row) in used:
                    continue
                filtered.append(row)
                if len(filtered) >= top_k:
                    break
        return filtered[:top_k]

    @staticmethod
    def build_context(rows: list[dict[str, Any]], max_chars: int = 5000) -> str:
        if not rows:
            return ""
        parts: list[str] = []
        used = 0
        for idx, row in enumerate(rows, start=1):
            meta = row.get("metadata") or {}
            filename = meta.get("filename", "unknown")
            chunk_index = meta.get("chunk_index", "-")
            text = str(row.get("chunk_text") or "").strip()
            block = f"[Source {idx} | file={filename} | chunk={chunk_index}]\n{text}\n"
            if used + len(block) > max_chars:
                break
            parts.append(block)
            used += len(block)
        return "\n".join(parts).strip()

