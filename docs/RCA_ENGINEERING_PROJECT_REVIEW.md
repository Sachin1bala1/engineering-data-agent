# RCA Engineering Project Review

## Project Title

Line A Electric Motor Bearing-Wear Investigation and Control Plan

## Business Context

This project uses the current AI Data Interpreter and engineering backend to investigate a realistic reliability problem: repeated bearing-wear and vibration-related events on a production motor supporting a manufacturing line.

The business case is credible for the current product because it exercises:

- the Analyzer workspace for evidence-based statistical review
- the Knowledge Twin and Preventive Maintenance workflow for incident history, SOP context, and recommended actions
- the Root Cause Analysis workspace for DMAIC structure, 5 Whys, fishbone, FMEA, action planning, and control planning

The target business outcome is to reduce unplanned downtime and repeat maintenance events by verifying the dominant cause of the motor condition and putting a sustainable control plan in place.

## Repo-Grounded Evidence and Dataset Inputs

Use these files as the primary inputs for the project:

- `C:\Users\sachi\OneDrive\Desktop\software\manufacturing\manufacturing_sensor_test_data.csv`
  - Time-series sensor evidence
  - Fields: `timestamp`, `asset_id`, `asset_type`, `temperature`, `vibration`, `run_hours`, `alarm_count`
- `C:\Users\sachi\OneDrive\Desktop\software\manufacturing\predictive_maintenance\example_maintenance_logs.csv`
  - Maintenance event history
  - Fields: `asset_id`, `failure_type`, `failure_date`
- `C:\Users\sachi\OneDrive\Desktop\software\manufacturing\predictive_maintenance\knowledge_twin\examples\incidents.csv`
  - Historical incident and action evidence
  - Fields: `asset_id`, `timestamp`, `failure_mode`, `root_cause`, `action`, `notes`, `resolved`, `asset_type`, `location`
- `C:\Users\sachi\OneDrive\Desktop\software\manufacturing\predictive_maintenance\knowledge_twin\examples\motor_sop.txt`
  - SOP/procedure context for corrective and preventive actions

Important practical note:

- The sample datasets currently use slightly different asset IDs, for example `MOTOR-001` in the sensor and maintenance files versus `MOTOR-1` in the incident file.
- That is a realistic data-integration issue and should be treated as a current workflow limitation. An engineer could still complete the case, but the app does not yet normalize that asset identity automatically.

## The Engineering Project Filled Out in DMAIC Form

### Define

#### Problem Title

Recurring bearing-wear and vibration escalation on Line A drive motor

#### Investigation Owner

Reliability Engineer, Line A

#### Cross-Functional Team

- Reliability engineer
- Maintenance technician
- Production supervisor
- Quality engineer

#### Process Area / Product Family

Line A rotating equipment reliability for primary drive assets

#### Line / Asset / Workcell

Line A, primary electric motor

#### First Observed Date

2024-01-10

#### Symptom Observed

The Line A motor shows repeated high vibration behavior with associated bearing-wear history and elevated temperature excursions. Maintenance events have recurred within a short time window instead of stabilizing after prior intervention.

#### Problem Statement

The Line A electric motor has repeated vibration and bearing-related events that indicate the prior fixes did not permanently remove the underlying cause. The team needs to determine whether the dominant driver is lubrication breakdown, alignment condition, or another mechanical contributor, then implement a corrective and preventive plan that prevents repeat downtime.

#### Business Impact

- Unplanned downtime risk on a production-critical asset
- Repeat maintenance labor and parts usage
- Increased risk of line interruption and output loss
- Potential escalation to quality defects if the asset drifts before failure

#### Containment Action

- Increase inspection frequency to every shift
- Review vibration and temperature trend before each production run
- Keep a spare bearing kit available
- Limit operation if vibration exceeds agreed threshold

### Measure

#### Baseline Metric

- Vibration trend for the motor shows recurring elevated values relative to normal pump behavior and repeated failure events in January
- Maintenance history shows more than one motor-related event within the observed period
- Alarm count is part of the available signal context and should be monitored as a secondary symptom

#### Target Metric

- No repeat motor failure event within the next 30 days
- Stable vibration trend within defined operating band
- No emergency maintenance event for the investigated failure mode

#### Gap Statement

The asset is not behaving like a controlled system. Instead of a single isolated event followed by stable operation, the motor shows repeat bearing/vibration signals and multiple maintenance interventions in a short time window. The current condition is unacceptable for a production-critical asset.

#### Data Sources

- Sensor trend dataset from `manufacturing_sensor_test_data.csv`
- Maintenance event history from `example_maintenance_logs.csv`
- Historical incidents and corrective actions from `incidents.csv`
- Maintenance procedure guidance from `motor_sop.txt`
- RCA handoff fields generated from Analyzer and Preventive Maintenance panels

#### Sample Window

2024-01-01 through 2024-01-15 for the initial engineering review, then extend if more sensor data is available

#### Sample Adequacy

- Adequate for a first engineering investigation and workflow demo
- Sufficient to demonstrate repeated events and compare asset behavior
- Not yet ideal for full control-limit validation or formal capability/statistical control work

### Analyze

#### Evidence Summary

Use the app to compile this evidence summary:

- The analyzer can profile the motor sensor signals and produce a plan using correlation, regression, time-series, and distribution-style checks.
- The maintenance history shows motor-related failures including `bearing_wear`, `vibration_issue`, and `overheating`.
- The knowledge-twin incidents show historically observed causes such as `poor_lubrication` and `alignment_issue`, with actions such as lubrication and shaft realignment.
- The combined evidence suggests the current issue is not random noise; it is likely a repeatable mechanical failure mechanism with known historical drivers.

#### Initial Suspected Causes

- Poor lubrication practice or interval
- Shaft or coupling alignment issue
- Bearing installation or component-life issue
- Operating condition creating abnormal load

#### 5 Whys Example

1. Why is the motor at risk of failure?
   - Because vibration is repeatedly elevated and bearing-related failures recur.
2. Why are bearing-related failures recurring?
   - Because the prior corrective work did not eliminate the dominant mechanical cause.
3. Why did prior corrective work not eliminate the cause?
   - Because the work may have treated the symptom, such as lubrication, without fully verifying alignment and operating condition.
4. Why was the dominant cause not fully verified?
   - Because the evidence was split across sensor trends, maintenance logs, and incident history rather than one structured investigation flow.
5. Why was the evidence split?
   - Because the current workflow requires manual assembly and asset-ID reconciliation across modules.

#### Fishbone Content

- Manpower: lubrication execution consistency, maintenance verification discipline
- Method: incomplete verification after repair, weak escalation criteria
- Machine: alignment condition, bearing wear, shaft condition
- Material: lubricant quality, bearing part condition
- Measurement: limited unified thresholds, fragmented evidence sources
- Environment: duty cycle, heat load, operating stress

#### Example FMEA Row

- Failure mode: bearing wear
- Effect: vibration escalation, heat rise, possible unplanned downtime
- Cause: inadequate lubrication and/or shaft alignment drift
- Current controls: routine inspection, maintenance logs, technician response
- Severity: 8
- Occurrence: 6
- Detection: 5
- Owner: Reliability Engineer

#### Verified Root Cause for This Example

Most likely root cause: inadequate mechanical condition control, with lubrication and alignment both acting as the primary verified contributors until follow-up inspection narrows the dominant physical mechanism.

This wording matches the current app state better than claiming a single fully proven cause, because the product can support strong evidence-building today but still relies on the engineer to complete physical verification.

### Improve

#### Corrective Action

- Inspect and correct shaft/coupling alignment
- Replace or inspect bearing assembly if damage is confirmed
- Re-establish lubrication condition per standard
- Verify vibration reduction immediately after intervention

#### Preventive Action

- Standardize lubrication interval and signoff
- Add post-maintenance alignment verification checklist
- Update maintenance standard work for this motor class
- Use risk-based review if vibration or temperature trend begins rising again

#### Action Register

1. Inspect alignment and bearing condition
   - Owner: Maintenance technician
   - Due: next planned outage
   - Expected impact: remove mechanical source of vibration
2. Review lubrication standard and compliance
   - Owner: Reliability engineer
   - Due: 3 days
   - Expected impact: reduce recurrence risk
3. Update motor PM checklist with alignment verification
   - Owner: Maintenance supervisor
   - Due: 1 week
   - Expected impact: prevent repeat escapes

### Control

#### Control Method

Use a revised preventive-maintenance standard for Line A motors that requires lubrication confirmation, alignment verification after intervention, and trend review of vibration and temperature before returning the asset to normal operating status.

#### Monitoring Metric

- Vibration trend
- Temperature trend
- Alarm count
- Repeat failure events per 30 days

#### Reaction Plan

If vibration exceeds the defined threshold or if a repeat bearing symptom appears, stop normal release to routine operation, trigger maintenance review the same shift, inspect lubrication and alignment condition, and escalate to the reliability engineer before continued operation.

#### Effectiveness Check Date

30 days after implementation

#### Example Control Plan Rows

1. CTQ: vibration
   - Method: trend review from sensor data
   - Frequency: every shift
   - Owner: production or maintenance shift lead
2. CTQ: repeat bearing event
   - Method: maintenance log review
   - Frequency: weekly
   - Owner: reliability engineer
3. CTQ: lubrication compliance
   - Method: PM audit
   - Frequency: weekly
   - Owner: maintenance supervisor

#### Example Reaction Plan Rows

1. Trigger: vibration exceeds threshold
   - Response: inspect motor before continued operation
   - Escalation owner: reliability engineer
2. Trigger: repeat bearing event within 30 days
   - Response: reopen RCA and verify physical cause
   - Escalation owner: maintenance manager

## How the Current App Would Be Used Step by Step

1. Open `Analytics` and go to the enterprise launcher.
2. Start with the analyzer-oriented scenario for process drift or root-cause monitoring.
3. In `Analyzer`, upload `manufacturing_sensor_test_data.csv`.
4. Set the objective to something like: `Identify whether vibration and temperature trends indicate a likely root cause for recurring Line A motor bearing issues.`
5. Generate the analysis plan and approve it.
6. Run the analysis and review the summary, statistics, warnings, and result narrative.
7. Use the analyzer handoff to create an RCA starter in `Root Cause Analysis Workspace`.
8. Open `Knowledge Twin` and load the bundled maintenance demo or upload:
   - `example_maintenance_logs.csv`
   - `incidents.csv`
   - `motor_sop.txt`
9. In `Preventive Maintenance`, query the asset for historical drivers and recommended next actions.
10. Send the maintenance findings into the RCA workspace through the RCA handoff.
11. In `Root Cause Analysis Workspace`, complete:
    - Define fields
    - Measure fields
    - Analyze section with suspected causes, 5 Whys, fishbone, FMEA
    - Improve action register
    - Control plan and reaction plan
12. Save the investigation, export it if needed, and treat it as the working RCA record.

## Strengths of the Current App for Engineers

### 1. The RCA workspace now has a real DMAIC spine

The current `RootCauseWorkspace.tsx` is not just a notes form. It already supports:

- Define, Measure, Analyze, Improve, Control sections
- required-field progress tracking
- saved case management
- 5 Whys
- fishbone categories
- FMEA rows
- action register
- control plan rows
- reaction plan rows

That is a credible first foundation for structured manufacturing investigations.

### 2. The analyzer-to-RCA and maintenance-to-RCA handoff is valuable

The handoff model in `rootCauseHandoff.ts` and the send-to-RCA actions in `AnalyzerPanel.tsx` and `PreventiveMaintenancePanel.tsx` are strong. They reduce blank-page work and give engineers a faster start on real cases.

### 3. The product is strongest when engineering evidence and operational action are connected

The best current pattern is:

- Analyzer for signal evidence
- Knowledge Twin / Preventive Maintenance for history and guidance
- RCA workspace for formal case structure

That is the right architecture direction for a manufacturing problem-solving system.

### 4. The current language is becoming more credible

The latest RCA and maintenance updates use terms engineers recognize:

- containment
- evidence
- suspected causes
- corrective action
- control plan
- reaction plan

That helps adoption with manufacturing and quality teams.

## Gaps, Blockers, and Missing UX

### 1. Asset identity is still fragmented across datasets

The example project exposes a real gap:

- `MOTOR-001` in the sensor data and maintenance logs
- `MOTOR-1` in knowledge-twin incidents

The app does not yet normalize this. Engineers must mentally reconcile the records, which is a real blocker for a polished RCA workflow.

### 2. The RCA workspace is structured, but still mostly manual

The page has good sections, but many values still have to be typed by hand:

- baseline metric
- target metric
- gap statement
- FMEA scoring
- control plan rows
- reaction plan rows

There is not yet enough automatic population from Analyzer, Compare, Knowledge Twin, or DOE outputs.

### 3. Root-cause agent support is still narrow

The root-cause agent currently runs from:

- symptom
- role
- optional objective
- optional notes

That is useful, but it is not yet grounded in the full RCA case record, uploaded evidence set, fishbone content, or FMEA context.

### 4. The Measure phase is not strongly connected to the app's data-table workflows

The product has a strong data table and analytics workbench, but the RCA page does not yet pull in:

- saved charts
- selected rows
- marked anomalies
- linked KPI snapshots
- compare deltas

That makes the Measure section weaker than the underlying platform actually is.

### 5. Control is documented, but not operationalized

The Control section can store:

- control method
- monitoring metric
- control plan rows
- reaction plan rows

But it does not yet connect to:

- live thresholds
- SPC charts
- recurring review schedule
- effectiveness reminders
- reopen criteria automation

### 6. FMEA support is useful but incomplete

Current FMEA support is enough for first-pass case structure, but it lacks:

- numeric validation
- RPN calculation
- action prioritization
- revision tracking
- link to control-plan updates

### 7. There is no explicit physical-verification checkpoint

For real engineering use, the RCA page should distinguish:

- suspected cause
- evidence-backed likely cause
- physically verified root cause

Today that distinction can be written manually, but the workflow does not enforce it.

## Specific Recommendations for the Next RCA Improvements

### Highest priority

1. Add structured evidence import into RCA
   - Pull analyzer summary, signals used, warnings, and top conclusions directly into Measure and Analyze.
   - Pull maintenance recommendation, incident summary, SOP match, and risk drivers directly into Analyze and Improve.

2. Add asset and line normalization
   - Support aliases like `MOTOR-001` and `MOTOR-1`.
   - Do this before expanding the knowledge-driven RCA story further.

3. Add a stronger root-cause status model
   - `suspected`
   - `supported by evidence`
   - `physically verified`

4. Add numeric FMEA support
   - validate severity, occurrence, detection
   - calculate RPN
   - highlight highest-risk rows

### Next priority

5. Add compare/analyzer chart attachments into RCA
   - allow the engineer to pin a chart or key table as evidence

6. Add Measure templates
   - baseline KPI
   - target KPI
   - gap statement
   - sample window
   - sample adequacy guidance

7. Add control execution features
   - reopen trigger
   - effectiveness due reminder
   - threshold reference
   - owner accountability display

### Later but important

8. Add CAPA and 8D-compatible extensions
   - current containment, corrective action, and control concepts already support this direction

9. Add case-library search and reuse
   - similar asset
   - similar failure mode
   - historically effective action

10. Add stronger quality-statistics support
   - SPC
   - capability
   - out-of-control handling
   - measurement system checks where relevant

## Overall Assessment

The current app is now capable of supporting a real first-pass manufacturing RCA workflow, especially for engineering teams that already know how to investigate problems and need a structured workspace rather than a fully automated quality system.

Its strongest current use case is:

- gather signal evidence in Analyzer
- gather historical/action evidence in Knowledge Twin
- formalize the case in the DMAIC RCA workspace

Its biggest limitation is that the evidence path is still only partially integrated. The structure is now credible; the next step is to reduce manual transcription and make the RCA case behave more like a connected engineering record.
