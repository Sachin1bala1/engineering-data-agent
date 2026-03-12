"""Python script runner for visualization outputs."""

from __future__ import annotations

import base64
import json
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
            "import json\n"
            "try:\n"
            "    import matplotlib\n"
            "    matplotlib.use('Agg')\n"
            "    import matplotlib.pyplot as plt\n"
            "except Exception:\n"
            "    plt = None\n"
            "\n"
            "def _to_py(v):\n"
            "    try:\n"
            "        if hasattr(v, 'item'):\n"
            "            v = v.item()\n"
            "    except Exception:\n"
            "        pass\n"
            "    if isinstance(v, (int, float, str, bool)) or v is None:\n"
            "        return v\n"
            "    try:\n"
            "        return float(v)\n"
            "    except Exception:\n"
            "        return str(v)\n"
            "\n"
            "def _safe_list(values):\n"
            "    out = []\n"
            "    for x in values:\n"
            "        out.append(_to_py(x))\n"
            "    return out\n"
            "\n"
            "def _extract_chart_spec():\n"
            "    if plt is None or not plt.get_fignums():\n"
            "        return None\n"
            "    fig = plt.gcf()\n"
            "    if not getattr(fig, 'axes', None):\n"
            "        return None\n"
            "    spec = {'kind': 'matplotlib', 'panels': []}\n"
            "    for ax in fig.axes:\n"
            "        panel = {\n"
            "            'title': ax.get_title() or '',\n"
            "            'x_label': ax.get_xlabel() or '',\n"
            "            'y_label': ax.get_ylabel() or '',\n"
            "            'traces': []\n"
            "        }\n"
            "        for line in ax.get_lines():\n"
            "            x = line.get_xdata()\n"
            "            y = line.get_ydata()\n"
            "            panel['traces'].append({\n"
            "                'type': 'line',\n"
            "                'name': (line.get_label() if line.get_label() and line.get_label() != '_nolegend_' else 'Series'),\n"
            "                'x': _safe_list(x.tolist() if hasattr(x, 'tolist') else list(x)),\n"
            "                'y': _safe_list(y.tolist() if hasattr(y, 'tolist') else list(y)),\n"
            "            })\n"
            "        for coll in ax.collections:\n"
            "            try:\n"
            "                offsets = coll.get_offsets()\n"
            "            except Exception:\n"
            "                offsets = None\n"
            "            if offsets is not None and len(offsets):\n"
            "                panel['traces'].append({\n"
            "                    'type': 'scatter',\n"
            "                    'name': 'Points',\n"
            "                    'x': _safe_list([p[0] for p in offsets]),\n"
            "                    'y': _safe_list([p[1] for p in offsets]),\n"
            "                })\n"
            "        if panel['traces']:\n"
            "            spec['panels'].append(panel)\n"
            "    if not spec['panels']:\n"
            "        return None\n"
            "    first = spec['panels'][0]\n"
            "    spec['title'] = first.get('title', '')\n"
            "    spec['x_label'] = first.get('x_label', '')\n"
            "    spec['y_label'] = first.get('y_label', '')\n"
            "    spec['traces'] = first.get('traces', [])\n"
            "    return spec\n"
            "\n"
        )
        postlude = (
            "\n"
            "try:\n"
            "    _spec = _extract_chart_spec()\n"
            "    if _spec is not None:\n"
            "        with open('__chart_spec__.json', 'w', encoding='utf-8') as _f:\n"
            "            json.dump(_spec, _f, default=str)\n"
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

        chart_spec = None
        chart_spec_path = workdir / "__chart_spec__.json"
        if chart_spec_path.exists():
            try:
                chart_spec = json.loads(chart_spec_path.read_text(encoding="utf-8"))
            except Exception:
                chart_spec = None

        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "images": images,
            "chartSpec": chart_spec,
        }
