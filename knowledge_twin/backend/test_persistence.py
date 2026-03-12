from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent


def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def wait_for_health(timeout_sec: int = 60) -> None:
    global BASE_URL
    start = time.time()
    while time.time() - start < timeout_sec:
        try:
            resp = requests.get(f"{BASE_URL}/health", timeout=2)
            if resp.status_code == 200:
                openapi = requests.get(f"{BASE_URL}/openapi.json", timeout=5)
                if openapi.status_code == 200 and "/upload_document" in str(openapi.json().get("paths", {})):
                    return
                return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError("Server did not become healthy in time.")


def start_server() -> subprocess.Popen:
    global BASE_URL
    port = get_free_port()
    BASE_URL = f"http://127.0.0.1:{port}"
    env = os.environ.copy()
    env["KT_DATA_DIR"] = str(HERE / "data")
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(port)],
        cwd=str(HERE),
        env=env,
    )
    wait_for_health()
    return proc


def stop_server(proc: subprocess.Popen) -> None:
    proc.terminate()
    try:
        proc.wait(timeout=15)
    except subprocess.TimeoutExpired:
        proc.kill()


def upload_file(path: Path) -> dict:
    with path.open("rb") as f:
        files = {"file": (path.name, f)}
        r = requests.post(f"{BASE_URL}/upload_document", files=files, timeout=60)
    r.raise_for_status()
    return r.json()


def main() -> None:
    docs = []
    with tempfile.TemporaryDirectory() as td:
        temp_dir = Path(td)
        docs.append(temp_dir / "maintenance_note_1.txt")
        docs.append(temp_dir / "maintenance_note_2.txt")
        docs.append(temp_dir / "maintenance_note_3.txt")

        docs[0].write_text("Motor seal leak happened after lubrication loss. Action: reduce load.", encoding="utf-8")
        docs[1].write_text("Pump overheating incidents were linked to overload. Action: realign shaft.", encoding="utf-8")
        docs[2].write_text("Compressor wiring degradation caused intermittent electrical fault.", encoding="utf-8")

        proc = start_server()
        try:
            print("Uploading 3 documents...")
            for p in docs:
                print(json.dumps(upload_file(p), indent=2))

            first_query = requests.post(
                f"{BASE_URL}/query",
                json={"query": "What causes seal leak?", "top_k": 3, "mode": "hybrid"},
                timeout=30,
            )
            first_query.raise_for_status()
            print("Query before restart:")
            print(json.dumps(first_query.json(), indent=2))
        finally:
            stop_server(proc)

        print("\nRestarting server to validate persistence...")
        proc2 = start_server()
        try:
            docs_resp = requests.get(f"{BASE_URL}/list_documents", timeout=15)
            docs_resp.raise_for_status()
            docs_payload = docs_resp.json()
            print("Documents after restart:")
            print(json.dumps(docs_payload, indent=2))
            assert len(docs_payload.get("documents", [])) >= 3, "Expected at least 3 persisted documents"

            second_query = requests.post(
                f"{BASE_URL}/query",
                json={"query": "What causes seal leak?", "top_k": 3, "mode": "hybrid"},
                timeout=30,
            )
            second_query.raise_for_status()
            print("Query after restart:")
            print(json.dumps(second_query.json(), indent=2))
            print("\nPersistence test PASSED.")
        finally:
            stop_server(proc2)


if __name__ == "__main__":
    main()
