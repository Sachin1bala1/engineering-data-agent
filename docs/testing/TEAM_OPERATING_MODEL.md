# Multi-Agent Testing Operating Model

Branch: `testing/ai-analytics-multi-agent`

## Objective

Integrate the manufacturing live-monitoring intelligence into the engineering data agent without regressing existing analytics workflows.

## Integration Scope

- Stable live-monitoring transport and state handling
- Shared incident-view patterns
- AI explanation surfaces grounded in backend evidence
- RCA handoff alignment with the existing RCA workspace

## Team Roles

- Manager Agent
  - Tracks cross-repo dependencies and decision log
- Integration Engineer
  - Owns API transport, proxy/CORS consistency, and live state handling
- Analytics Frontend Engineer
  - Owns Live Drift AI UX inside Analytics
- RCA Workflow Engineer
  - Owns handoff into the root cause workspace
- Bug Finder / Tester
  - Owns stale-stream, route, and runtime regression testing

## Test Gates

- Live Drift AI loads without manual recovery
- Stale stream IDs clear safely
- Cross-origin transport does not break browser startup
- RCA handoff continues to work
- Graph builder and analytics pages remain stable

## Meeting Agenda

- Current branch status
- Cross-repo contract changes
- New defects and owner assignment
- Promote / hold decision for next test wave
