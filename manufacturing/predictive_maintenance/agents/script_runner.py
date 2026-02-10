"""Python script runner for visualization outputs."""

from __future__ import annotations

import base64
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import List, Dict


def _resolve_python_executable() -> str:
    override = os.getenv("SCRIPT_RUNNER_PYTHON")
    if override:
        return override

    repo_root = Path(__file__).resolve().parents[2]
    venv_python = repo_root / ".venv" / "Scripts" / "python.exe"
    if venv_python.exists():
        return str(venv_python)

    return sys.executable or "python"


def run_python_script(code: str, timeout_sec: int = 20) -> Dict[str, object]:
    """Execute a Python script and capture stdout/stderr + generated images."""
    with tempfile.TemporaryDirectory() as temp_dir:
        workdir = Path(temp_dir)
        script_path = workdir / "script.py"
        wrapper = (
            "import warnings\n"
            "warnings.filterwarnings('ignore', message='.*FigureCanvasAgg is non-interactive.*')\n"
            "try:\n"
            "    import matplotlib\n"
            "    matplotlib.use('Agg')\n"
            "    import matplotlib.pyplot as plt\n"
            "except Exception:\n"
            "    plt = None\n"
            "\n"
        )
        postlude = (
            "\n"
            "try:\n"
            "    if plt is not None and plt.get_fignums():\n"
            "        plt.savefig('plot.png', dpi=200, bbox_inches='tight')\n"
            "        plt.close('all')\n"
            "except Exception:\n"
            "    pass\n"
        )
        script_path.write_text(f"{wrapper}{code}\n{postlude}", encoding="utf-8")

        env = os.environ.copy()
        env["MPLBACKEND"] = "Agg"

        result = subprocess.run(
            [_resolve_python_executable(), str(script_path)],
            cwd=str(workdir),
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
        )

        images: List[Dict[str, str]] = []
        for image_path in workdir.glob("*.png"):
            data = image_path.read_bytes()
            data_uri = f"data:image/png;base64,{base64.b64encode(data).decode('ascii')}"
            images.append({"filename": image_path.name, "data_uri": data_uri})

        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "images": images,
        }
