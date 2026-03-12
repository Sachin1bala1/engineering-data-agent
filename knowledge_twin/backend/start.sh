#!/usr/bin/env bash
set -euo pipefail

export KT_DATA_DIR="${KT_DATA_DIR:-$(pwd)/data}"
mkdir -p "$KT_DATA_DIR/documents" "$KT_DATA_DIR/chroma_db"

uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"

