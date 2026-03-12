# Engineering Data Agent

A unified manufacturing analytics platform that combines AI-assisted data analysis, DOE (Design of Experiments) workflows, baseline vs experiment comparison, and engineering reporting. The system merges an AI data interpreter frontend with a robust FastAPI backend (predictive maintenance + DOE + analytics), enabling end‑to‑end experimental design, analysis, and reporting.

---

## What This Platform Does

**Core capabilities**
- **AI Data Analytics**: Upload CSV/XLSX, ask questions, run AI‑assisted analysis, execute safe Python snippets in a backend runner, generate PPTX reports.
- **Baseline vs Experiment (Compare)**: Upload baseline + experiment datasets, align signals, compute deltas, and get AI reasoning with plotting code.
- **Analyzer**: Structured analysis plan → execute → validate → confidence scoring → explanation.
- **DOE Wizard (Design & Analysis)**:
  - Design DOE matrix (full/fractional/Taguchi/Plackett–Burman/CCD/Box–Behnken/sequential/Bayesian)
  - Download DOE matrix as Excel/CSV template (includes Response column)
  - Upload results and run DOE analysis
  - Regression diagnostics, correlation heatmaps, ANOVA, main effects, optimization recommendations
  - AI‑style concise engineering summaries and plot explanations

---

## Architecture Overview

```
[Frontend: ai_data_interpreter (React/Vite)]
  ├── DOE Wizard UI (design + analyze)
  ├── Compare + Analyzer + AI Chat
  └── Engineering dashboards
          |
          v
[Backend: manufacturing/predictive_maintenance (FastAPI)]
  ├── /analysis/*     (AI analytics engine)
  ├── /compare/*      (baseline vs experiment)
  ├── /doe/wizard/*   (DOE design/analyze + tutor)
  ├── /script/run     (Python execution agent)
  ├── /api/upload     (file uploads)
  ├── /api/analyze    (basic analysis)
  └── /api/generate-pptx (report export)

[AI Layer]
  ├── Gemini LLM (copilot + DOE tutor)
  └── Guardrails + fallback summaries

[Local Storage]
  ├── DOE design state (browser localStorage)
  └── Uploaded datasets (in temp storage)
```

---

## Repository Layout

```
engineering-data-agent/
├── ai_data_interpreter/                # React/Vite frontend
│   ├── src/components/engineering/      # DOE, Compare, Analyzer UI
│   ├── src/components/features/         # AI chat, slide editor
│   ├── src/lib/engineering-api.ts       # API client for backend
│   └── public/doe_examples/             # Example datasets
├── manufacturing/
│   ├── predictive_maintenance/          # FastAPI backend
│   │   ├── main.py                      # API entrypoint
│   │   ├── doe_wizard.py                # DOE design + analysis engine
│   │   ├── analysis_engine/             # Analysis pipeline
│   │   ├── comparison/                  # Baseline vs experiment
│   │   └── agents/                      # Python execution agent
│   └── predictive-maintenance-frontend/ # legacy frontend (unused)
└── README.md                            # This file
```

---

## Frontend (React/Vite)

### Key Screens
- **AI Chat / Analytics**: Ask questions about uploaded data, run AI analysis, execute Python code blocks.
- **Compare**: Baseline vs experiment analysis with AI‑assisted planning, plotting, and report generation.
- **Analyzer**: Structured analysis engine with plan → execute → validate pipeline.
- **DOE Wizard**:
  - **Design mode (Steps 1–4)**: Choose goal, define factors, pick DOE method, generate DOE matrix
  - **Analysis mode (Steps 5–6)**: Upload results, map columns, run DOE analysis
  - State persists across reloads (localStorage)

### API Client
`ai_data_interpreter/src/lib/engineering-api.ts`
- Handles all requests to the FastAPI backend.

### DOE Wizard Highlights
- Download DOE matrix in Excel/CSV
- Correlation heatmap (numeric factors + response)
- Regression plots (predicted vs actual)
- Regression diagnostics:
  - Residuals vs fitted
  - Normal Q‑Q plot
  - Leverage / Cook’s distance
  - Residuals histogram
- AI summary and plot explanations

### DOE Production Updates
- **Step 1 decision inputs are now explicit and interactive (dropdowns)**:
  - Goal
  - Budget
  - Skill level
  - Run budget (max runs)
  - Interaction expected (yes/no)
  - Continuous factors (yes/no)
  - Nonlinearity expected (yes/no)
  - Noise level (low/high)
- **Run-constrained recommendation is deterministic-first**:
  - Backend method selection follows run-budget and decision-tree rules.
  - AI can refine wording/explanation, but does not override selected method.
- **DOE Tutor reliability improved**:
  - Stronger malformed/partial JSON parsing.
  - Continuation pass when responses appear truncated.
  - Higher Gemini output token budget for long technical answers.
- **DOE method generation robustness improved**:
  - Fallback generation paths are used when optional pyDOE2 symbols are unavailable.
  - This avoids hard failures for methods like Fractional, Taguchi, Plackett-Burman, CCD/RSM, and Box-Behnken.
- **Frontend error handling improved**:
  - Recommendation request errors are now surfaced in UI instead of failing silently.

### Latest Production Updates (AI Copilot + Data Preview)
- **Slide panel UX split into 2 segments**:
  - `Slide AI Copilot` is a dedicated panel for analysis/questions/code-generation.
  - `Slide Builder` (title + findings) is a separate collapsible panel (open only when needed).
- **Slide AI Copilot is now AI-first (Gemini first)**:
  - Primary path always attempts `/api/analyze` for professional AI response/code generation.
  - If AI is unavailable, UI explicitly reports AI outage and falls back to deterministic logic where possible.
- **Deterministic fallback behavior is explicit and controlled**:
  - Non-edit Q&A fallback: `/api/grounded-insight`.
  - Data-edit fallback: deterministic formula application only when rule can be safely parsed.
- **Data-edit prompts can auto-execute and persist**:
  - Prompts like “add/update column” can trigger AI-generated Python.
  - Code is auto-run via Python runner and can persist changes back to session dataset.
  - Data Preview refreshes automatically after successful persisted edits.
- **Spreadsheet-like Data Preview upgrades**:
  - Row marking (`__marked__` context), inline cell edits, save edits, save marks.
  - Formula bar with target/new column support.
  - Column selection helpers for analysis workflows.
- **Anti-hallucination / accuracy safeguards**:
  - Deterministic parser for binary conditional label rules (e.g., `if downtime_hr > 10 then 1 else 0`).
  - Column-alignment validation for AI-generated edit code.
  - One retry with stricter prompt if generated code misses requested columns.
  - If still ambiguous, copilot asks clarification instead of applying changes.
- **Preview stability fix (critical)**:
  - Persisted helper columns (`__marked__`, `__row_index__`) are stripped before saving and before preview insertion.
  - Prevents `cannot insert __marked__, already exists` server errors.

---

## Backend (FastAPI)

### Main API
`manufacturing/predictive_maintenance/main.py`
- Aggregates all endpoints into a single backend
- Handles CORS, file uploads, and AI/Gemini calls
- Provides Python script runner
- Session data controls:
  - `GET /api/session/{session_id}/data` (paged full preview)
  - `POST /api/session/{session_id}/marks`
  - `POST /api/session/{session_id}/edits`
  - `POST /api/session/{session_id}/formula`
  - `POST /api/grounded-insight` (deterministic fallback summary)

### DOE Wizard
`manufacturing/predictive_maintenance/doe_wizard.py`
- DOE design generation (pyDOE2)
- DOE analysis
- Regression + ANOVA + optimization
- Diagnostics + correlation data

### Compare Pipeline
`manufacturing/predictive_maintenance/comparison/`
- Baseline vs experiment alignment
- Statistical comparisons
- Copilot (Gemini) reasoning

### Analyzer Engine
`manufacturing/predictive_maintenance/analysis_engine/`
- Dataset profiling
- Plan generation
- Execution + validation
- Confidence scoring + explanation

---

## AI + Gemini Integration

- Gemini is used for:
  - Compare copilot
  - DOE tutor
  - Summary generation
  - Slide AI Copilot (AI-first path)
- Rate‑limit handling:
  - Backoff + fallback summaries
  - Cached responses

Set your API keys in `manufacturing/.env`:
```
GEMINI_API_KEY=your_key_here
```

Operational note:
- After backend/frontend code updates, restart both services to load the latest logic and UI behavior.

---

## How to Run

### Backend (FastAPI)
```
cd manufacturing
python -m uvicorn predictive_maintenance.main:app --reload --port 8000
```

### Frontend (React/Vite)
```
cd ai_data_interpreter
npm install
npm run dev
```

Frontend expects the API at:
```
VITE_API_BASE=http://localhost:8000
```

---

## DOE Analysis Outputs

- **Main Effects** (impact size)
- **ANOVA table** with p‑values
- **Regression coefficients** and equation
- **Correlation heatmap** (numeric factors + response)
- **Predicted vs Actual plot**
- **Diagnostics**: residuals vs fitted, Q‑Q plot, leverage/Cook’s distance, residuals histogram
- **AI engineering summary** + plot explanations

---

## Notes on Statistical Validity

- Small datasets may not support interaction models.
- The system auto‑disables interactions if sample size is too small.
- DOE design run count depends on factors and levels (full factorial = 2^k for 2‑level designs).

Knowledge Twin note:
- If persistence auto-learning watcher is enabled, duplicate files are periodically re-checked and logged as "Skipped duplicate document".
- This is expected behavior and indicates deduplication by file hash, not an ingestion error.

---

## Next Steps / Extensions

- Persistent DOE project storage (database)
- Multi‑project management
- Export full DOE reports (PDF)
- Advanced regression diagnostics (Cook’s D threshold markers, leverage tables)

---

## License

Proprietary (internal use). Update if you plan to open‑source.
