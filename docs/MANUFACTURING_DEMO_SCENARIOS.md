# Manufacturing Demo Scenarios

This note packages the highest-value manufacturing-style demo data already present in the repo and defines the next scenario assets to standardize.

## Existing assets already in the repo

- `manufacturing/manufacturing_sensor_test_data.csv`
  - 8,000 rows
  - 7 columns
  - Best for time-series maintenance, drift, and root-cause demos
- `manufacturing/predictive_maintenance/example_sensor_data.csv`
  - Small sensor sample
  - Best for quick smoke tests and lightweight charting
- `manufacturing/predictive_maintenance/example_maintenance_logs.csv`
  - Small maintenance history sample
  - Best for incident timelines and corrective-action demos
- `manufacturing/predictive_maintenance/knowledge_twin/examples/incidents.csv`
  - Incident-to-action sample
  - Best for knowledge-twin reasoning and SOP linkage
- `manufacturing/predictive_maintenance/knowledge_twin/examples/motor_sop.txt`
  - Maintenance SOP text
  - Best for AI-assisted troubleshooting and procedure lookup
- `ai_data_interpreter/public/graph_builder_demo.csv`
  - Lightweight chart demo
  - Best for graph builder smoke tests
- `ai_data_interpreter/public/doe_examples/battery_example.csv`
  - Lightweight DOE demo
  - Best for existing DOE flow validation

## Scenario 1: Preventive Maintenance and Asset Risk

- Business problem: detect equipment deterioration early enough to avoid downtime.
- Likely user persona: reliability engineer, maintenance manager, plant supervisor.
- Recommended app entry point: Knowledge Twin -> Preventive Maintenance.
- Required schema:
  - Sensor stream: `timestamp`, `asset_id`, `asset_type`, `temperature`, `vibration`, `run_hours`, `alarm_count`, optional `site`, `line`, `shift`
  - Maintenance log: `asset_id`, `timestamp`, `failure_type`, `root_cause`, `corrective_action`, `resolved`, `downtime_minutes`, `notes`
- Expected outputs:
  - risk score trend
  - asset ranking by failure risk
  - top drivers and evidence summary
  - recommended corrective action and SOP lookup

## Scenario 2: Process Drift and Root Cause Monitoring

- Business problem: identify process drift, sensor anomalies, and shift-to-shift variation.
- Likely user persona: process engineer, operations analyst, continuous improvement lead.
- Recommended app entry point: Analytics page and graph builder views.
- Required schema:
  - `timestamp`, `asset_id`, `asset_type`, `site`, `line`, `shift`
  - process metrics: `temperature`, `vibration`, `pressure`, `throughput`, `scrap_rate`, `alarm_count`
  - optional controls: `setpoint`, `actual_value`, `operator_note`
- Expected outputs:
  - trend chart
  - anomaly or drift flags
  - driver comparison by line/shift/site
  - root-cause narrative with confidence

## Scenario 3: DOE Optimization

- Business problem: tune process parameters to improve yield and reduce defects.
- Likely user persona: quality engineer, manufacturing scientist, process development engineer.
- Recommended app entry point: DOE module.
- Required schema:
  - factors: `run_id`, `coating_speed`, `solvent_ratio`, `oven_temp`, `dry_time`, `humidity`, optional `mix_speed`, `line_speed`
  - responses: `coating_thickness_um`, `defect_rate_pct`, `throughput_units_hr`, `energy_kwh_per_1000`, `pass_fail`
- Expected outputs:
  - main effects and interaction effects
  - recommended operating window
  - response chart and run comparison
  - pass/fail validation of the chosen recipe

## Scenario 4: Baseline vs Experiment Validation

- Business problem: compare a new setup against the current baseline before rollout.
- Likely user persona: production engineer, CI lead, manufacturing program manager.
- Recommended app entry point: Compare page.
- Required schema:
  - `batch_id`, `scenario`, `line`, `shift`, `throughput_units_hr`, `yield_pct`, `defect_rate_pct`, `cycle_time_sec`, `energy_kwh_per_hr`, `scrap_cost_usd`, `operator_notes`
- Expected outputs:
  - delta chart between baseline and experiment
  - KPI win/loss summary
  - outlier batches and exception list
  - rollout recommendation

## Highest-value package order

1. `manufacturing/manufacturing_sensor_test_data.csv`
2. `manufacturing/predictive_maintenance/example_maintenance_logs.csv`
3. `manufacturing/predictive_maintenance/knowledge_twin/examples/incidents.csv`
4. `manufacturing/predictive_maintenance/knowledge_twin/examples/motor_sop.txt`
5. `ai_data_interpreter/public/doe_examples/coating_line_doe.csv`
6. `ai_data_interpreter/public/baseline_vs_experiment_demo.csv`
7. `ai_data_interpreter/public/graph_builder_demo.csv`

## Recommended next lightweight assets

- `ai_data_interpreter/public/doe_examples/coating_line_doe.csv`
  - 12 to 16 rows
  - synthetic coating-line DOE data
- `ai_data_interpreter/public/baseline_vs_experiment_demo.csv`
  - 10 to 12 rows
  - synthetic baseline-versus-change-control comparison data

These two files are enough to make the demo story feel manufacturing-native without adding a large data dump.
