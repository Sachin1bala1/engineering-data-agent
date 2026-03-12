"""SOP parser for PDF/text documents."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from ..db import embedding_for_text
from ..graph.graph_store import add_embedding, insert_sop_step


def _extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise RuntimeError("pypdf is required for SOP PDF ingestion. Install pypdf==4.3.1") from exc
        reader = PdfReader(str(path))
        chunks = []
        for page in reader.pages:
            chunks.append(page.extract_text() or "")
        return "\n".join(chunks)
    if suffix in {".txt", ".md", ".markdown"}:
        return path.read_text(encoding="utf-8", errors="ignore")
    raise ValueError("Unsupported SOP format. Upload .pdf, .txt, or .md file.")


def ingest_sop(file_path: str | Path, sop_name: str, asset_type: str) -> dict[str, Any]:
    path = Path(file_path)
    raw_text = _extract_text(path)

    lines = [ln.strip() for ln in raw_text.splitlines() if ln and ln.strip()]
    lines = [ln for ln in lines if len(ln) >= 6]

    step_number = 1
    inserted = 0
    for line in lines:
        line = re.sub(r"^\d+[\.)\-: ]+", "", line).strip()
        if not line:
            continue
        insert_sop_step(sop_name=sop_name, step_number=step_number, instruction=line, asset_type=asset_type)
        content = f"sop={sop_name}; step={step_number}; asset_type={asset_type}; instruction={line}"
        add_embedding("sop", content, embedding_for_text(content))
        step_number += 1
        inserted += 1

    return {"sop_name": sop_name, "asset_type": asset_type, "steps_ingested": inserted}
