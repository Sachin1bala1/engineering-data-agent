# Knowledge Twin (Persistent RAG Memory)

Production-ready Knowledge Twin system with:
- FastAPI backend
- Local embeddings (`sentence-transformers/all-MiniLM-L6-v2`)
- ChromaDB persistent vector store
- SQLite metadata store
- File-based document storage
- Incremental ingestion + duplicate detection
- Auto-learning folder watcher

## Folder Structure

```text
knowledge_twin/
├─ backend/
│  ├─ main.py
│  ├─ ingest.py
│  ├─ retriever.py
│  ├─ memory_store.py
│  ├─ config.py
│  ├─ requirements.txt
│  ├─ Dockerfile
│  ├─ start.sh
│  ├─ start.ps1
│  ├─ test_persistence.py
│  └─ data/
│     ├─ documents/
│     ├─ chroma_db/
│     └─ metadata.db
└─ frontend/
```

## Backend Setup (Local)

```bash
cd knowledge_twin/backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

PowerShell shortcut:

```powershell
cd knowledge_twin\backend
.\start.ps1
```

Bash shortcut:

```bash
cd knowledge_twin/backend
chmod +x start.sh
./start.sh
```

## Docker

```bash
cd knowledge_twin/backend
docker build -t knowledge-twin .
docker run -p 8000:8000 -v $(pwd)/data:/app/data knowledge-twin
```

Persistent data is stored in `/app/data` (mapped volume).

## API Endpoints

### `POST /upload_document`
Upload a single document (`.pdf`, `.docx`, `.txt`, `.md`).

### `GET /list_documents`
List all ingested documents and chunk counts from SQLite metadata.

### `POST /query`
Request body:

```json
{
  "query": "What caused seal leak?",
  "top_k": 5,
  "mode": "hybrid",
  "keyword_filter": "seal"
}
```

Returns:
- top retrieved chunks
- source metadata
- ready-to-inject context string for downstream LLM prompt

## Auto-Learning

On startup, a background watcher scans `backend/data/documents` every `KT_AUTO_INGEST_INTERVAL_SEC` seconds (default `20`):
- New docs are auto-ingested
- Duplicate files are skipped by SHA256 hash
- Chroma + SQLite are updated incrementally

## Persistence Validation Test

Run:

```bash
cd knowledge_twin/backend
python test_persistence.py
```

The script:
1. Uploads 3 test documents
2. Queries before restart
3. Restarts backend
4. Confirms document list persists
5. Queries again to validate retrieval persistence

## Configuration

Environment variables:
- `KT_DATA_DIR` (default: `backend/data`)
- `KT_EMBEDDING_MODEL` (default: `sentence-transformers/all-MiniLM-L6-v2`)
- `KT_CHROMA_COLLECTION` (default: `knowledge_twin_chunks`)
- `KT_AUTO_INGEST_INTERVAL_SEC` (default: `20`)

