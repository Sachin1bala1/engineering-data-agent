# AI Data Interpreter Architecture

This app is the main frontend workspace for the engineering platform, but it does not talk to a single backend.

## Backend boundaries

- Workspace API:
  - Owned by [`src/server/server.cjs`](C:/Users/sachi/OneDrive/Desktop/software/ai_data_interpreter/src/server/server.cjs)
  - Default local origin: `http://127.0.0.1:5100`
  - Handles file upload, session paging, inline data edits, formula application, AI chat for the core data table workflow, Python execution, PPTX generation, and contact form submission
  - Frontend helper: [`src/lib/api-base.ts`](C:/Users/sachi/OneDrive/Desktop/software/ai_data_interpreter/src/lib/api-base.ts) via `workspaceApiUrl()` / `apiUrl()`

- Engineering API:
  - Owned by [`manufacturing/predictive_maintenance/main.py`](C:/Users/sachi/OneDrive/Desktop/software/manufacturing/predictive_maintenance/main.py)
  - Default local origin: `http://127.0.0.1:8000`
  - Handles compare, analyzer, DOE, knowledge, industrial, enterprise-agent, and preventive-maintenance style engineering workflows
  - Frontend helper: [`src/lib/api-base.ts`](C:/Users/sachi/OneDrive/Desktop/software/ai_data_interpreter/src/lib/api-base.ts) via `engineeringApiUrl()`
  - Client wrapper: [`src/lib/engineering-api.ts`](C:/Users/sachi/OneDrive/Desktop/software/ai_data_interpreter/src/lib/engineering-api.ts)

## Dev routing

During local Vite development on port `8080`:

- `/api` and `/script` proxy to the workspace API on `5100`
- `/engineering/*` proxies to the engineering backend on `8000`

See [`vite.config.ts`](C:/Users/sachi/OneDrive/Desktop/software/ai_data_interpreter/vite.config.ts).

## Page ownership

- [`src/pages/ExcelUpload.tsx`](C:/Users/sachi/OneDrive/Desktop/software/ai_data_interpreter/src/pages/ExcelUpload.tsx)
  - Uses the workspace API only
- [`src/pages/Analytics.tsx`](C:/Users/sachi/OneDrive/Desktop/software/ai_data_interpreter/src/pages/Analytics.tsx)
  - Workspace API for session/data-table/slide/copilot upload flows
  - Engineering panels embedded inside the page use the engineering API
- [`src/pages/KnowledgeTwin.tsx`](C:/Users/sachi/OneDrive/Desktop/software/ai_data_interpreter/src/pages/KnowledgeTwin.tsx)
  - Uses the engineering API only
- [`src/pages/uploadandanalyze.tsx`](C:/Users/sachi/OneDrive/Desktop/software/ai_data_interpreter/src/pages/uploadandanalyze.tsx)
  - Legacy/simple page, workspace API only

## Environment variables

- `VITE_WORKSPACE_API_BASE`
  - Optional explicit origin for the local workspace API
- `VITE_ENGINEERING_API_BASE`
  - Optional explicit origin for the engineering backend
- `VITE_API_BASE`
  - Backward-compatible fallback for the workspace API

Recommended local setup:

```env
VITE_WORKSPACE_API_BASE=http://localhost:5100
VITE_ENGINEERING_API_BASE=http://localhost:8000
```

## Guardrail

Do not point engineering features at the workspace API and do not point the core session/table workflow at the engineering backend. They have different contracts and responsibilities.
