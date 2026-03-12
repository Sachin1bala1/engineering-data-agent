$ErrorActionPreference = "Stop"

if (-not $env:KT_DATA_DIR) {
  $env:KT_DATA_DIR = (Join-Path (Get-Location) "data")
}

New-Item -ItemType Directory -Force -Path (Join-Path $env:KT_DATA_DIR "documents") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $env:KT_DATA_DIR "chroma_db") | Out-Null

$port = if ($env:PORT) { $env:PORT } else { "8000" }
uvicorn main:app --host 0.0.0.0 --port $port

