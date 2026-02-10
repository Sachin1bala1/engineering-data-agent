# Predictive Maintenance System

A production-grade predictive maintenance backend using deterministic engineering logic, not AI/ML, to assess industrial asset health and recommend maintenance actions.

## Overview

This system uses established industrial standards and engineering principles to:
- Monitor electric motors and pumps
- Detect potential failures through sensor data analysis
- Provide risk scores (0-100) based on severity, persistence, and rate of change
- Generate actionable maintenance recommendations

**No machine learning required** - all logic is deterministic and based on engineering best practices.

## Engineering Decision System (DOE-Ready)

This system now supports DOE-grade baseline vs experiment validation with a strict
separation between AI reasoning and numerical computation:

- **AI may** select methods, explain outcomes, and propose next experiments.
- **AI may not** generate any numerical outputs.
- **Every number shown to users is computed by Python execution.**

### Multi-Agent Architecture

1. **Analysis Planner (LLM)**: chooses alignment, tests, windowing, transformations.
2. **Execution Agent (Python)**: computes statistics and p-values.
3. **Validation Agent (LLM)**: verifies test validity and sample adequacy.
4. **Engineering Explanation Agent (LLM)**: translates results into engineering guidance.
5. **Error Recovery Agent (LLM)**: proposes fixes for ingestion or statistical failures.

## Engineering Data Analyzer (Single Dataset)

Upload one CSV/XLS/XLSX file and run a fully auditable analysis pipeline:
- Deterministic dataset profiling (types, missing %, distribution, stationarity).
- LLM planner proposes tests/plots (JSON only).
- Python execution runs statistics and generates plots.
- Validation agent checks statistical validity.
- Deterministic confidence scoring.
- Engineering explanation agent summarizes results.

## Canonical Data Contract

All ingested data is converted into the canonical internal schema before processing:

- `timestamp` (ISO 8601, UTC)
- `asset_id`
- `asset_type`
- `temperature` (optional)
- `vibration` (optional)
- `run_hours` (optional)
- `alarm_count` (optional)
- `raw_signal_metadata` (JSON, raw columns preserved for traceability)

## Architecture

```
predictive_maintenance/
  main.py                 # FastAPI application with endpoints
  requirements.txt        # Python dependencies
  models/
    __init__.py
    data_models.py        # Pydantic models for API
  copilot/
    __init__.py
    copilot.py            # Engineering copilot with guardrails
  ingestion/
    __init__.py
    ingestion.py          # CSV processing & validation
  baseline/
    __init__.py
    baseline.py           # Rolling statistics computation
  rules/
    __init__.py
    engine.py             # Failure Mode Intelligence Engine
    definitions.py        # Failure mode knowledge schema
    utils.py              # Deterministic utilities
    motor/
    pump/
  risk_scoring/
    __init__.py
    risk_scoring.py       # Risk score calculation (0-100)
  reports/
    __init__.py
    reports.py            # JSON report generation
```

## Quick Start

1. **Install dependencies:**
```bash
pip install -r requirements.txt
```

2. **Run the API server:**
```bash
python main.py
# or
uvicorn main:app --reload
```

3. **Access the API:**
- Interactive docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

## API Endpoints

### POST /upload
Upload CSV files containing sensor data and maintenance logs.

**Request:**
- `sensor_data`: CSV file with sensor readings (required)
- `maintenance_logs`: CSV file with maintenance history (optional)
- `asset_id`: Optional asset identifier if missing in file
- `asset_type`: Optional asset type (`electric_motor` or `pump`)
- `default_date`: Optional ISO date for time-only datasets
- `start_date`: Optional ISO date for relative time datasets

**Sensor Data CSV Format:**
```csv
timestamp,asset_id,temperature,vibration,run_hours,alarm_count
2024-01-01T08:00:00Z,MOTOR-001,75.2,2.1,1250.5,0.1
2024-01-01T09:00:00Z,MOTOR-001,76.8,2.3,1251.5,0.2
2024-01-01T08:00:00Z,PUMP-001,45.2,1.8,980.2,0.0
```
`alarm_count` is optional; if omitted it defaults to 0.0.

**Maintenance Logs CSV Format:**
```csv
asset_id,failure_type,failure_date
MOTOR-001,bearing_wear,2024-01-15T14:30:00Z
PUMP-001,seal_failure,2024-01-20T09:15:00Z
```

**Example Response:**
```json
{
  "success": true,
  "message": "Processed 150 sensor readings and 5 maintenance records",
  "records_processed": 155,
  "assets_updated": ["MOTOR-001", "PUMP-001"],
  "errors": [],
  "warnings": ["Vibration inferred from acceleration RMS proxy."],
  "ingestion_report_id": "4fa2b1e6-3d8e-4e29-9d10-4d2e7a4a9d2c"
}
```

### GET /risk_summary
Get risk assessment summary for all monitored assets.

### POST /upload/batch
Upload multiple sensor files (CSV or Excel) and get per-file deterministic analysis results.

**Request:**
- `sensor_files`: One or more sensor data files (CSV/XLS/XLSX)
- `asset_id`: Optional asset identifier (applies to all files if provided)
- `asset_type`: Optional asset type (`electric_motor` or `pump`)
- `default_date`: Optional ISO date for time-only datasets
- `start_date`: Optional ISO date for relative time datasets

**Example Response (abridged):**
```json
{
  "success": true,
  "message": "Processed 2 files",
  "files_processed": 2,
  "total_records_processed": 300,
  "assets_updated": ["MOTOR-001", "PUMP-001"],
  "file_results": [
    {
      "file_name": "motor.xlsx",
      "success": true,
      "records_processed": 150,
      "assets_updated": ["MOTOR-001"],
      "ingestion_report_id": "..."
    }
  ]
}
```

**Example Response:**
```json
{
  "total_assets": 2,
  "high_risk_assets": 1,
  "critical_assets": 0,
  "assessments": [
    {
      "asset_id": "MOTOR-001",
      "asset_type": "electric_motor",
      "risk_score": 85.5,
      "risk_level": "HIGH",
      "failure_mode": "bearing_wear",
      "recommended_action": "Schedule maintenance within 1-2 weeks. Inspect bearings for wear, check lubrication, consider vibration analysis.",
      "risk_factors": {
        "severity": 0.8,
        "persistence": 0.7,
        "rate_of_change": 0.6,
        "historical_failure_rate": 0.2
      },
      "confidence_level": 0.85,
      "assessment_timestamp": "2024-01-24T10:30:00Z",
      "next_inspection_days": 3
    },
    {
      "asset_id": "PUMP-001",
      "asset_type": "pump",
      "risk_score": 25.2,
      "risk_level": "LOW",
      "failure_mode": null,
      "recommended_action": "Continue normal monitoring. No immediate action required.",
      "risk_factors": {
        "severity": 0.0,
        "persistence": 0.1,
        "rate_of_change": 0.2,
        "historical_failure_rate": 0.0
      },
      "confidence_level": 0.9,
      "assessment_timestamp": "2024-01-24T10:30:00Z",
      "next_inspection_days": 30
    }
  ],
  "generated_at": "2024-01-24T10:30:00Z"
}
```

### GET /asset/{asset_id}
Get detailed assessment for a specific asset.

**Example Response:**
```json
{
  "asset_id": "MOTOR-001",
  "asset_type": "electric_motor",
  "risk_assessment": {
    "asset_id": "MOTOR-001",
    "asset_type": "electric_motor",
    "risk_score": 85.5,
    "risk_level": "HIGH",
    "failure_mode": "bearing_wear",
    "recommended_action": "Schedule maintenance within 1-2 weeks. Inspect bearings for wear, check lubrication, consider vibration analysis.",
    "risk_factors": {
      "severity": 0.8,
      "persistence": 0.7,
      "rate_of_change": 0.6,
      "historical_failure_rate": 0.2
    },
    "confidence_level": 0.85,
    "assessment_timestamp": "2024-01-24T10:30:00Z",
    "next_inspection_days": 3
  },
  "sensor_readings_count": 150,
  "maintenance_records_count": 2,
  "baseline_metrics": [
    {
      "parameter": "temperature",
      "mean": 72.5,
      "std": 8.2,
      "window_size": 100
    },
    {
      "parameter": "vibration",
      "mean": 2.1,
      "std": 0.5,
      "window_size": 100
    }
  ],
  "triggered_rules": [
    {
      "rule_name": "motor_bearing_wear",
      "severity_score": 0.8,
      "confidence": 0.85,
      "description": "Detect bearing wear through vibration and temperature patterns"
    }
  ],
  "last_updated": "2024-01-24T10:00:00Z"
}
```

**Additional fields returned in /asset/{asset_id}:**
- `failure_mode_breakdown`: per-mode stage, confidence, indicators, and action ownership
- `failure_mode_timeline`: staged timeline events for early/mid/late progression
- `sensor_history`: time-series data for trend charts
- `baseline_bands`: mean/std bands for visualization

### GET /failure_modes/catalog
Returns failure mode catalog with indicators, staged detection tables, and engineering rationale.

### POST /copilot/context/{asset_id}
Returns structured context for AI copilot prompts (read-only, deterministic data only).

### POST /copilot/query
Returns a structured copilot explanation based on system data.

**Request:**
```json
{
  "asset_id": "MOTOR-001",
  "question": "Why is this asset high risk?",
  "role": "engineer"
}
```

**Response:**
```json
{
  "summary": "Primary failure mode is motor_bearing_degradation at mid stage...",
  "evidence_used": [
    {"source": "failure_mode_breakdown", "detail": "motor_bearing_degradation stage mid"}
  ],
  "suggested_next_checks": ["Inspect bearings and verify lubrication condition."],
  "confidence_disclaimer": "Deterministic summary based on current sensor data and rule outputs.",
  "decision_support": "Decision Support Only"
}
```

### GET /ingestion/report/{report_id}
Returns the transformation report for an ingestion event.

### POST /time/normalize
Normalize a raw time value using the deterministic time engine.

### POST /agent/time/recommendation
Return a deterministic recommendation for resolving time ingestion issues.

### POST /agent/time/policy
Apply the execution policy gate for an AI recommendation.

### POST /agent/confirm_fix
Record operator confirmation for a fix.

### GET /agent/context/{asset_id}
Return historical reasoning context for operator-facing assistance.

## Copilot Configuration

Set environment variables to enable Gemini-based responses:

```bash
set GEMINI_API_KEY=your_key_here
set GEMINI_MODEL=gemini-1.5-flash
```

If the key is not set, the copilot returns a deterministic fallback summary.

**Permanent setup (recommended):**
1. Copy `.env.example` to `.env` in the project root.
2. Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL`.
3. Restart the backend.

Copilot interactions are logged to `predictive_maintenance/logs/copilot.log` for auditability.
Comparison copilot interactions are logged to `predictive_maintenance/logs/compare_copilot.log`.

## Baseline vs Experiment Comparison

### POST /compare/upload
Upload baseline and experiment files (CSV/XLS/XLSX) to run deterministic comparison.

**Request:**
- `baseline_file`: Baseline dataset
- `experiment_file`: Experiment dataset
- `asset_id`: Optional asset identifier
- `analysis_mode`: `ai_assisted` or `deterministic`

**Example Response (abridged):**
```json
{
  "success": true,
  "report_id": "c2fca0a4-7f2e-4a71-bd6a-acde3c0f1f9b",
  "message": "Comparison completed.",
  "warnings": []
}
```

### GET /compare/report/{report_id}
Return full comparison report with summary, signal comparisons, and alignment metadata.

### GET /compare/health
Comparison subsystem health.

### POST /compare/agent/run
Run comparison pipeline with agent logging.

### GET /compare/agent/status/{job_id}
Return agent pipeline status.

### GET /compare/agent/logs/{job_id}
Return agent execution logs.

### POST /compare/copilot/context/{report_id}
Return structured context for the comparison copilot and bind it to a session.

### POST /compare/copilot/query
Ask the comparison copilot questions about the baseline vs experiment report.

**Request:**
```json
{
  "report_id": "c2fca0a4-7f2e-4a71-bd6a-acde3c0f1f9b",
  "question": "Which signal drives the largest deviation?",
  "role": "engineer",
  "session_id": "compare_session_1700000000000"
}
```

Plot-oriented questions return an additional `python_script` field that can be executed
by a script runner to generate the requested chart (for example, a box plot).

### GET /compare/copilot/status
Return Gemini availability and the resolved model for comparison copilot calls.

### POST /compare/copilot/model-refresh
Refresh the comparison copilot model selection.

### POST /compare/copilot/session/{session_id}/reset
Clear comparison copilot memory and cached context for a session.

### POST /script/run
Execute a Python script on the backend and return stdout/stderr and any generated PNG images.

Set `SCRIPT_RUNNER_PYTHON` to override the Python executable used for scripts
(defaults to `.venv` if available, otherwise the backend interpreter).

## DOE Validation (Baseline vs Experiment)

### POST /doe/compare/upload
Upload baseline and experiment files (CSV/XLS/XLSX) with process metadata for DOE validation.

**Request (multipart):**
- `baseline_file`, `experiment_file`
- `process_name`, `engineer`
- `baseline_description`, `experiment_description` (optional)
- `doe_factors` (optional JSON string)
- `column_mapping` (optional JSON mapping of canonical -> raw column names)
- `default_date`, `start_date` (optional ISO dates for time normalization)

### GET /doe/report/{report_id}
Return the full DOE validation report (comparison table, stability, confidence, verdict).

### GET /doe/agent/logs/{report_id}
Return agent logs for planner/execution/validation/explanation steps.

DOE reports may include `plot_scripts` for correlation or trend plots. These scripts
are generated from computed data and can be executed via `/script/run`.

### POST /analysis/plan
Upload a single dataset and return dataset profile + AI suggested analysis plan (JSON).

### POST /analysis/run
Execute the approved analysis plan on the dataset and return an analysis report id.

### GET /analysis/report/{report_id}
Return the full Engineering Data Analyzer report.

### POST /analysis/copilot/context/{report_id}
Return structured context for the analyzer copilot and bind it to a session.

### POST /analysis/copilot/query
Ask the analyzer copilot questions about the current analysis report.

### GET /analysis/copilot/status
Return Gemini availability and the resolved model for analyzer copilot calls.

### POST /analysis/copilot/model-refresh
Refresh the analyzer copilot model selection.

### POST /analysis/copilot/session/{session_id}/reset
Clear analyzer copilot memory and cached context for a session.

## Upgrades Applied

- Failure Mode Intelligence Layer with formal knowledge schema and staged indicators.
- Modular failure mode rules for motors and pumps (bearing, misalignment, lubrication, overheating, electrical/hydraulic).
- Multi-indicator correlation using trend, persistence, and baseline deviation.
- Per-failure-mode scoring with aggregation to asset-level risk, urgency buckets, and inspection intervals.
- Failure mode catalog endpoint for auditable engineering rationale.
- Visualization-ready payloads: sensor history, baseline bands, and failure mode timelines.
- Copilot endpoints with guardrails, evidence citations, and interaction logging.
- Dependency updates for Python 3.12 compatibility and copilot support (numpy 1.26.4, python-multipart, httpx).

## Visualization Data Outputs

The API provides frontend-ready data for time-series and decision support:
- `sensor_history`: time-series points (temperature, vibration, alarm_frequency, run_hours)
- `baseline_bands`: mean/std bands per parameter
- `failure_mode_timeline`: early/mid/late progression events
- `failure_mode_breakdown`: indicator-level evidence and explanations

## Engineering Logic

### Risk Scoring Factors (0-100 scale)

1. **Severity** (40% weight): Impact if failure occurs
   - Bearing wear: 80/100
   - Overheating: 90/100
   - Vibration issues: 70/100

2. **Persistence** (25% weight): How long issues persist
   - Based on continuous elevated readings
   - Multiple rule triggers increase persistence

3. **Rate of Change** (20% weight): Speed of deterioration
   - Rapid parameter increases indicate urgency
   - Trend analysis over recent readings

4. **Historical Factor** (10% weight): Past failure frequency
   - Assets with frequent maintenance score higher

5. **Operational Factor** (5% weight): Current operating context
   - Run hours and current stress levels

### Risk Level Thresholds
- **LOW**: 0-29
- **MEDIUM**: 30-69
- **HIGH**: 70-89
- **CRITICAL**: 90-100

### Maintenance Rules

**Electric Motors (Failure Modes):**
- Bearing degradation
- Shaft misalignment
- Lubrication breakdown
- Thermal overload / overheating
- Electrical faults (insulation, imbalance)

**Pumps (Failure Modes):**
- Bearing degradation
- Misalignment
- Lubrication failure
- Overheating
- Hydraulic instability (impeller wear / cavitation proxy)

Each failure mode uses deterministic multi-indicator correlation (trend, persistence, baseline deviation) rather than static thresholds alone.

## Data Validation

### Sensor Data Limits
- **Temperature**: -50°C to 200°C
- **Vibration**: 0 to 50 mm/s
- **Run Hours**: 0 to 100,000 hours
- **Alarm Count**: 0 to 200 counts/hr
### Missing Data Handling
- Forward-fill missing values (appropriate for continuous monitoring)
- Use engineering defaults for initial values
- Flag statistical outliers for review

## Agentic Ingestion Pipeline

The ingestion layer inspects and adapts non-canonical files, infers timestamps,
maps raw signals to canonical fields, injects asset context, and emits a
transformation report for auditability. Uploads only fail when time cannot be
constructed or signals are unusable.

## Time Intelligence Engine

Deterministic time handling with classification, anchoring, normalization, and audit logs:
- Time classes: FULL_DATETIME, TIME_ONLY, DATE_ONLY, RELATIVE, EXCEL_SERIAL, TEXTUAL, UNKNOWN
- Anchoring hierarchy: row-level date → file metadata → shift definition → user default → AI suggestion (never auto-applied)
- Audit log: `predictive_maintenance/logs/time.log`

## Production Deployment

1. **Environment Variables:**
```bash
export PREDICTIVE_MAINTENANCE_ENV=production
```

2. **Run with Gunicorn:**
```bash
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

3. **Database Integration:**
   - Replace in-memory storage with PostgreSQL/MongoDB
   - Add connection pooling and migrations
   - Implement data retention policies

4. **Monitoring:**
   - Add Prometheus metrics
   - Implement structured logging
   - Set up health checks and alerts

## Testing

```bash
# Run tests
pytest

# Run with coverage
pytest --cov=. --cov-report=html
```

## License

This predictive maintenance system is designed for industrial use and follows engineering best practices for reliable asset monitoring.
