import React, { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Play, Radar, Square, TimerReset } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { WorkspaceActionBar } from "@/components/workspace/WorkspaceActionBar";
import { WorkspaceMetricChip } from "@/components/workspace/WorkspaceMetricChip";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";
import { WorkspaceEmptyState } from "@/components/workspace/WorkspaceEmptyState";
import { workspaceToolbarButtonClassName, workspaceToolbarPrimaryButtonClassName } from "@/components/workspace/workspaceToolbarTokens";
import { engineeringApi, getErrorMessage } from "@/lib/engineering-api";
import type {
  LiveMonitoringScenario,
  LiveMonitoringSignalState,
  LiveMonitoringStateResponse,
} from "@/types/engineering-api";

const SIGNAL_COLORS: Record<string, string> = {
  a: "#16a34a",
  b: "#2563eb",
  c: "#dc2626",
  d: "#a855f7",
  e: "#0f766e",
};

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "-";
  return value.toFixed(digits);
}

function SignalCard({ signal, state }: { signal: string; state?: LiveMonitoringSignalState }) {
  return (
    <WorkspaceResultCard
      title={`Signal ${signal.toUpperCase()}`}
      className="h-full"
      contentClassName="space-y-2 pt-2"
      actions={
        state?.drift_active ? (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Drift</Badge>
        ) : state?.latest_is_outlier ? (
          <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">Outlier</Badge>
        ) : (
          <Badge variant="secondary">Stable</Badge>
        )
      }
    >
      <div className="text-2xl font-semibold text-foreground">{formatNumber(state?.latest_value)}</div>
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div>
          <div className="font-medium text-foreground">Mean shift</div>
          <div>{formatNumber(state?.mean_shift_z)} σ</div>
        </div>
        <div>
          <div className="font-medium text-foreground">Point z</div>
          <div>{formatNumber(state?.latest_point_z)} σ</div>
        </div>
        <div>
          <div className="font-medium text-foreground">Persistence</div>
          <div>{formatNumber(state?.persistence, 0)}</div>
        </div>
        <div>
          <div className="font-medium text-foreground">Outliers</div>
          <div>{state?.recent_outlier_count ?? 0}</div>
        </div>
      </div>
    </WorkspaceResultCard>
  );
}

export function LiveMonitoringWorkspace() {
  const [scenarios, setScenarios] = useState<LiveMonitoringScenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState("upstream_b_to_a");
  const [streamId, setStreamId] = useState<string | null>(null);
  const [state, setState] = useState<LiveMonitoringStateResponse | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [streamName, setStreamName] = useState("Line 1 simulated process");
  const [sampleInterval, setSampleInterval] = useState(1);
  const [maxPoints, setMaxPoints] = useState(720);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const scenarioPayload = await engineeringApi.getLiveMonitoringScenarios();
        if (!mounted) return;
        setScenarios(scenarioPayload.scenarios);
      } catch (err: unknown) {
        if (mounted) setError(getErrorMessage(err, "Failed to load live monitoring setup."));
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!streamId) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await engineeringApi.getLiveMonitoringState(streamId);
        if (cancelled) return;
        setState(next);
        setError(null);
        if (!selectedIncidentId && next.incidents[0]?.incident_id) {
          setSelectedIncidentId(next.incidents[0].incident_id);
        }
      } catch (err: unknown) {
        const message = getErrorMessage(err, "Failed to refresh live process state.");
        if (message.includes("404")) {
          if (!cancelled) {
            setStreamId(null);
            setState(null);
            setSelectedIncidentId(null);
            setError(null);
          }
          return;
        }
        if (!cancelled) setError(message);
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [streamId, selectedIncidentId]);

  const scenario = useMemo(
    () => scenarios.find((row) => row.scenario_id === selectedScenario) ?? null,
    [scenarios, selectedScenario]
  );
  const chartRows = state?.history ?? [];
  const selectedIncident =
    state?.incidents.find((row) => row.incident_id === selectedIncidentId) ?? state?.incidents[0] ?? null;
  const rootCause =
    state?.root_cause && (!selectedIncident || state.root_cause.incident_id === selectedIncident.incident_id)
      ? state.root_cause
      : null;
  const signalStateMap = useMemo(
    () => new Map((state?.signal_states ?? []).map((row) => [row.parameter, row])),
    [state?.signal_states]
  );
  const outlierSignals = (state?.signal_states ?? []).filter((row) => row.latest_is_outlier);
  const driftingSignals = (state?.signal_states ?? []).filter((row) => row.drift_active);
  const rawRows = useMemo(() => chartRows.slice(-20).reverse(), [chartRows]);

  const handleStart = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const started = await engineeringApi.startLiveMonitoringSimulation({
        stream_name: streamName,
        scenario_id: selectedScenario,
        target_parameter: "a",
        parameters: ["a", "b", "c", "d", "e"],
        tick_seconds: sampleInterval,
        max_points: maxPoints,
      });
      setStreamId(started.stream_id);
      setSelectedIncidentId(null);
      setState(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to start simulation."));
    } finally {
      setIsBusy(false);
    }
  };

  const handleStop = async () => {
    if (!streamId) return;
    setIsBusy(true);
    try {
      await engineeringApi.stopLiveMonitoringSimulation(streamId);
      setStreamId(null);
      setState(null);
      setSelectedIncidentId(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to stop simulation."));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <WorkspaceActionBar
        title="Live Drift AI"
        description="Simulate continuous manufacturing signals, detect live process drift, surface point outliers, and rank likely upstream causes before connecting PLC or OPC UA data."
        metrics={
          <>
            <WorkspaceMetricChip label="Signals" value={state?.parameters.length ?? 5} />
            <WorkspaceMetricChip label="Open incidents" value={state?.incidents.length ?? 0} />
            <WorkspaceMetricChip label="Drifting" value={driftingSignals.length} />
            <WorkspaceMetricChip label="Outliers" value={outlierSignals.length} />
          </>
        }
      />

      {error ? (
        <WorkspaceResultCard title="Monitoring Error" className="border-red-200 bg-red-50">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        </WorkspaceResultCard>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <WorkspaceResultCard
            title="Simulation Control"
            actions={<Radar className="h-4 w-4 text-primary" />}
            contentClassName="space-y-3"
          >
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Stream Name</label>
              <Input value={streamName} onChange={(e) => setStreamName(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Scenario</label>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={selectedScenario}
                onChange={(e) => setSelectedScenario(e.target.value)}
              >
                {scenarios.map((row) => (
                  <option key={row.scenario_id} value={row.scenario_id}>
                    {row.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Tick sec</label>
                <Input
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={sampleInterval}
                  onChange={(e) => setSampleInterval(Number(e.target.value))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">History points</label>
                <Input
                  type="number"
                  min="120"
                  value={maxPoints}
                  onChange={(e) => setMaxPoints(Number(e.target.value))}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            {scenario ? (
              <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
                <div className="font-semibold text-foreground">{scenario.label}</div>
                <div className="mt-1">{scenario.description}</div>
                <div className="mt-2">Expected upstream driver: {scenario.expected_driver}</div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleStart}
                disabled={isBusy || !!streamId}
                className={workspaceToolbarPrimaryButtonClassName}
              >
                <Play className="mr-2 h-4 w-4" />
                Start Simulation
              </Button>
              <Button
                variant="outline"
                onClick={handleStop}
                disabled={isBusy || !streamId}
                className={workspaceToolbarButtonClassName}
              >
                <Square className="mr-2 h-4 w-4" />
                Stop
              </Button>
            </div>
          </WorkspaceResultCard>

          <WorkspaceResultCard title="Drift Snapshot" actions={<Activity className="h-4 w-4 text-primary" />} contentClassName="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="font-medium text-foreground">Active drift</div>
                <div className="mt-1 text-muted-foreground">
                  {driftingSignals.length ? driftingSignals.map((row) => row.parameter).join(", ") : "None"}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="font-medium text-foreground">Point outliers</div>
                <div className="mt-1 text-muted-foreground">
                  {outlierSignals.length ? outlierSignals.map((row) => row.parameter).join(", ") : "None"}
                </div>
              </div>
            </div>
            {selectedIncident ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="font-semibold">Selected incident: {selectedIncident.parameter}</div>
                <div className="mt-1">
                  Severity {selectedIncident.current_severity} at tick {selectedIncident.first_seen_tick}, latest shift{" "}
                  {formatNumber(selectedIncident.latest_mean_shift_z)} σ.
                </div>
              </div>
            ) : (
              <WorkspaceEmptyState
                title="No open incidents"
                description="Start a scenario and wait for a sustained drift event."
                className="min-h-[120px] py-6"
              />
            )}
          </WorkspaceResultCard>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            {(["a", "b", "c", "d", "e"] as const).map((signal) => (
              <SignalCard key={signal} signal={signal} state={signalStateMap.get(signal)} />
            ))}
          </div>

          <WorkspaceResultCard title="Live Signal Trends" contentClassName="space-y-3">
            {chartRows.length ? (
              <div className="h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="tick" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    {(["a", "b", "c", "d", "e"] as const).map((signal) => (
                      <Line
                        key={signal}
                        type="monotone"
                        dataKey={signal}
                        dot={false}
                        strokeWidth={2}
                        stroke={SIGNAL_COLORS[signal]}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <WorkspaceEmptyState
                icon={<TimerReset className="h-8 w-8" />}
                title="No live trend yet"
                description="Start the simulation to populate the live trend chart and generated raw rows."
                className="min-h-[220px]"
              />
            )}
          </WorkspaceResultCard>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <WorkspaceResultCard title="Incidents" contentClassName="space-y-2">
              {state?.incidents.length ? (
                state.incidents.map((incident) => {
                  const selected = incident.incident_id === (selectedIncident?.incident_id ?? "");
                  return (
                    <button
                      key={incident.incident_id}
                      type="button"
                      onClick={() => setSelectedIncidentId(incident.incident_id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        selected ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/20"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-foreground">{incident.parameter}</div>
                        <Badge variant={selected ? "default" : "secondary"}>{incident.current_severity}</Badge>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        First seen tick {incident.first_seen_tick} · shift {formatNumber(incident.latest_mean_shift_z)} σ · value{" "}
                        {formatNumber(incident.latest_value)}
                      </div>
                    </button>
                  );
                })
              ) : (
                <WorkspaceEmptyState
                  title="No incidents detected"
                  description="Incidents will appear when a parameter shows persistent drift."
                  className="min-h-[160px] py-6"
                />
              )}
            </WorkspaceResultCard>

            <WorkspaceResultCard title="Root-Cause Ranking" contentClassName="space-y-3">
              {rootCause?.candidates.length ? (
                <>
                  <div className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
                    <div className="font-semibold text-foreground">{rootCause.summary}</div>
                    <div className="mt-1">Confidence: {rootCause.confidence}</div>
                  </div>
                  {rootCause.candidates.map((candidate) => (
                    <div key={candidate.parameter} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-foreground">{candidate.parameter}</div>
                        <Badge variant="secondary">{Math.round(candidate.score * 100)} / 100</Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div>Lag {candidate.best_lag}</div>
                        <div>Corr {formatNumber(candidate.lagged_correlation)}</div>
                        <div>Lead {formatNumber(candidate.lead_score)}</div>
                        <div>Overlap {formatNumber(candidate.persistence_overlap)}</div>
                      </div>
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {candidate.evidence.map((item, index) => (
                          <li key={`${candidate.parameter}-${index}`}>• {item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </>
              ) : (
                <WorkspaceEmptyState
                  title="No ranked causes yet"
                  description="Once the target drifts, upstream candidates will be ranked here."
                  className="min-h-[160px] py-6"
                />
              )}
            </WorkspaceResultCard>
          </div>

          <WorkspaceResultCard title="Generated Raw Data" contentClassName="space-y-3">
            {rawRows.length ? (
              <div className="overflow-x-auto rounded-xl border">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Tick</th>
                      <th className="px-3 py-2">Timestamp</th>
                      {(["a", "b", "c", "d", "e"] as const).map((signal) => (
                        <th key={signal} className="px-3 py-2">
                          {signal.toUpperCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawRows.map((row) => {
                      const outliers = new Set((row.outlier_parameters as string[] | undefined) ?? []);
                      return (
                        <tr key={`${row.tick}-${row.timestamp}`} className="border-t">
                          <td className="px-3 py-2 text-xs text-muted-foreground">{row.tick}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{row.timestamp}</td>
                          {(["a", "b", "c", "d", "e"] as const).map((signal) => (
                            <td
                              key={`${row.tick}-${signal}`}
                              className={`px-3 py-2 ${outliers.has(signal) ? "bg-rose-50 font-medium text-rose-700" : ""}`}
                            >
                              {formatNumber(Number(row[signal] ?? 0))}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <WorkspaceEmptyState
                title="No generated rows yet"
                description="The latest simulated timestamp and signal values will appear here once the stream is running."
                className="min-h-[160px] py-6"
              />
            )}
          </WorkspaceResultCard>

          <WorkspaceResultCard title="Methodology / Integration Help" contentClassName="space-y-3">
            <details className="rounded-xl border bg-muted/20 p-3" open>
              <summary className="cursor-pointer text-sm font-medium text-foreground">How to connect OPC / PLC data</summary>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                <p>
                  Keep the simulator contract and replace only the ingestion layer. The target internal shape should stay:
                  {" "}
                  <code className="rounded bg-background px-1 py-0.5">{'{ asset_id, timestamp, mode, signals }'}</code>
                </p>
                <ul className="space-y-1">
                  <li>1. Build an OPC UA or PLC polling adapter.</li>
                  <li>2. Read tag value, source timestamp, and quality bit for each monitored parameter.</li>
                  <li>3. Map plant tags into stable parameter names used by the live monitor.</li>
                  <li>4. Feed those samples into the same live-monitoring endpoints used by the simulator.</li>
                  <li>5. Preserve bad-quality and stale-tag states so communication issues remain diagnosable.</li>
                </ul>
              </div>
            </details>

            <details className="rounded-xl border bg-muted/20 p-3">
              <summary className="cursor-pointer text-sm font-medium text-foreground">How to connect SQL / historian data</summary>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                <p>
                  Use SQL or historian data for replay, baseline generation, and incident backfill. Normalize source rows into timestamped signal events before analysis.
                </p>
                <ul className="space-y-1">
                  <li>1. Read ordered rows by asset and timestamp from SQL Server, PostgreSQL, MySQL, or a historian API.</li>
                  <li>2. Normalize columns into `timestamp`, `mode`, and per-signal values.</li>
                  <li>3. Keep raw source tables immutable.</li>
                  <li>4. Store alerts, acknowledgements, and handoff notes in separate event tables.</li>
                  <li>5. Train baselines by operating mode, recipe, line, and batch when historical context is available.</li>
                </ul>
              </div>
            </details>
          </WorkspaceResultCard>
        </div>
      </div>
    </div>
  );
}
