import React, { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { WorkspaceActionBar } from "@/components/workspace/WorkspaceActionBar";
import { WorkspaceMetricChip } from "@/components/workspace/WorkspaceMetricChip";
import { WorkspaceFormFieldRow } from "@/components/workspace/WorkspaceFormFieldRow";
import { workspaceToolbarButtonClassName, workspaceToolbarInputClassName, workspaceToolbarPrimaryButtonClassName } from "@/components/workspace/workspaceToolbarTokens";
import { engineeringApi, getErrorMessage } from "@/lib/engineering-api";
import type {
  ActionAgentResponse,
  RootCauseAgentResponse,
  DoeOrchestratorResponse,
  ScriptRunResponse,
} from "@/types/engineering-api";

function splitList(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function EnterpriseAgentsPanel() {
  const [comparisonReportId, setComparisonReportId] = useState("");
  const [analyzerReportId, setAnalyzerReportId] = useState("");
  const [doeReportId, setDoeReportId] = useState("");
  const [objective, setObjective] = useState("");
  const [notes, setNotes] = useState("");

  const basePayload = useMemo(
    () => ({
      comparison_report_id: comparisonReportId.trim() || undefined,
      analyzer_report_id: analyzerReportId.trim() || undefined,
      doe_report_id: doeReportId.trim() || undefined,
      objective: objective.trim() || undefined,
      notes: notes.trim() || undefined,
    }),
    [comparisonReportId, analyzerReportId, doeReportId, objective, notes]
  );

  const [actionConstraints, setActionConstraints] = useState("");
  const [actionHorizonDays, setActionHorizonDays] = useState("14");
  const [actionResponse, setActionResponse] = useState<ActionAgentResponse | null>(null);
  const [actionScript, setActionScript] = useState("");
  const [actionRun, setActionRun] = useState<ScriptRunResponse | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionRunningScript, setActionRunningScript] = useState(false);

  const [symptom, setSymptom] = useState("");
  const [role, setRole] = useState("engineer");
  const [rootResponse, setRootResponse] = useState<RootCauseAgentResponse | null>(null);
  const [rootScript, setRootScript] = useState("");
  const [rootRun, setRootRun] = useState<ScriptRunResponse | null>(null);
  const [rootBusy, setRootBusy] = useState(false);
  const [rootRunningScript, setRootRunningScript] = useState(false);

  const [maxRuns, setMaxRuns] = useState("6");
  const [confidenceTarget, setConfidenceTarget] = useState("0.85");
  const [safetyConstraints, setSafetyConstraints] = useState("");
  const [orchestratorResponse, setOrchestratorResponse] = useState<DoeOrchestratorResponse | null>(null);
  const [orchestratorScript, setOrchestratorScript] = useState("");
  const [orchestratorRun, setOrchestratorRun] = useState<ScriptRunResponse | null>(null);
  const [orchestratorBusy, setOrchestratorBusy] = useState(false);
  const [orchestratorRunningScript, setOrchestratorRunningScript] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const runScript = async (
    code: string,
    setBusy: (v: boolean) => void,
    setResult: (r: ScriptRunResponse | null) => void
  ) => {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await engineeringApi.runScript({ code, timeout_sec: 25 });
      setResult(result);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Script execution failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-4">
        <WorkspaceActionBar
          title="Enterprise AI Agents"
          description="Closed-loop Action Agent, Root-Cause Agent, and Autonomous DOE Orchestrator."
          metrics={
            <>
              <WorkspaceMetricChip label="Comparison Report" value={comparisonReportId || "Not set"} />
              <WorkspaceMetricChip label="Analyzer Report" value={analyzerReportId || "Not set"} />
              <WorkspaceMetricChip label="DOE Report" value={doeReportId || "Not set"} />
            </>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            placeholder="Comparison report id"
            value={comparisonReportId}
            onChange={(e) => setComparisonReportId(e.target.value)}
            className={workspaceToolbarInputClassName}
          />
          <Input
            placeholder="Analyzer report id"
            value={analyzerReportId}
            onChange={(e) => setAnalyzerReportId(e.target.value)}
            className={workspaceToolbarInputClassName}
          />
          <Input
            placeholder="DOE report id"
            value={doeReportId}
            onChange={(e) => setDoeReportId(e.target.value)}
            className={workspaceToolbarInputClassName}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input className={workspaceToolbarInputClassName} placeholder="Objective (optional)" value={objective} onChange={(e) => setObjective(e.target.value)} />
          <Input className={workspaceToolbarInputClassName} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}

        <Tabs defaultValue="action" className="space-y-4">
          <TabsList className="grid w-full grid-cols-1 md:grid-cols-3">
            <TabsTrigger value="action">Action Agent</TabsTrigger>
            <TabsTrigger value="root">Root-Cause Agent</TabsTrigger>
            <TabsTrigger value="orchestrator">DOE Orchestrator</TabsTrigger>
          </TabsList>

          <TabsContent value="action" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <WorkspaceFormFieldRow label="Horizon days">
                <Input
                  placeholder="Horizon days (e.g. 14)"
                  value={actionHorizonDays}
                  onChange={(e) => setActionHorizonDays(e.target.value)}
                />
              </WorkspaceFormFieldRow>
              <WorkspaceFormFieldRow className="md:col-span-2" label="Constraints" description="Comma or newline separated">
                <Textarea
                  placeholder="Constraints (comma or newline separated)"
                  value={actionConstraints}
                  onChange={(e) => setActionConstraints(e.target.value)}
                  className="md:col-span-2 min-h-[76px]"
                />
              </WorkspaceFormFieldRow>
            </div>
            <Button
              className={workspaceToolbarPrimaryButtonClassName}
              onClick={async () => {
                setActionBusy(true);
                setError(null);
                try {
                  const result = await engineeringApi.runActionAgent({
                    ...basePayload,
                    horizon_days: Number(actionHorizonDays || 14),
                    constraints: splitList(actionConstraints),
                  });
                  setActionResponse(result);
                  setActionScript(result.python_script || "");
                  setActionRun(null);
                } catch (err: unknown) {
                  setError(getErrorMessage(err, "Action agent failed"));
                } finally {
                  setActionBusy(false);
                }
              }}
              disabled={actionBusy}
            >
              {actionBusy ? "Running..." : "Run Action Agent"}
            </Button>

            {actionResponse && (
              <div className="space-y-3">
                <div className="text-sm">{actionResponse.summary}</div>
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="secondary">
                    Source: {actionResponse.llm_used ? "Gemini AI" : "Deterministic Fallback"}
                  </Badge>
                </div>
                <div className="overflow-auto border rounded">
                  <table className="min-w-full text-xs">
                    <thead className="bg-muted text-left">
                      <tr>
                        <th className="p-2">Action</th>
                        <th className="p-2">Owner</th>
                        <th className="p-2">Due</th>
                        <th className="p-2">Priority</th>
                        <th className="p-2">Expected Impact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actionResponse.actions.map((action) => (
                        <tr key={action.action_id} className="border-t">
                          <td className="p-2">{action.title}</td>
                          <td className="p-2">{action.owner_role}</td>
                          <td className="p-2">{action.due_days}d</td>
                          <td className="p-2">{action.priority}</td>
                          <td className="p-2">{action.expected_impact}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-muted-foreground">
                  Monitoring: {actionResponse.monitoring_plan.join(" | ")}
                </div>
                {actionScript && (
                  <div className="space-y-2">
                    <Textarea value={actionScript} onChange={(e) => setActionScript(e.target.value)} className="min-h-[180px] font-mono text-xs" />
                    <Button
                      variant="outline"
                      className={workspaceToolbarButtonClassName}
                      onClick={() => runScript(actionScript, setActionRunningScript, setActionRun)}
                      disabled={actionRunningScript}
                    >
                      {actionRunningScript ? "Running Script..." : "Run Action Script"}
                    </Button>
                    {actionRun && (
                      <div className="space-y-2">
                        <pre className="text-xs whitespace-pre-wrap bg-gray-50 border rounded p-3">{actionRun.stdout}</pre>
                        {actionRun.images?.length ? (
                          <div className="grid md:grid-cols-2 gap-2">
                            {actionRun.images.map((img) => <img key={img.filename} src={img.data_uri} alt={img.filename} className="w-full" />)}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="root" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <WorkspaceFormFieldRow label="Symptom">
                <Input placeholder="Symptom (required)" value={symptom} onChange={(e) => setSymptom(e.target.value)} />
              </WorkspaceFormFieldRow>
              <WorkspaceFormFieldRow label="Role">
                <select
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="operator">Operator</option>
                  <option value="technician">Technician</option>
                  <option value="engineer">Engineer</option>
                </select>
              </WorkspaceFormFieldRow>
            </div>
            <Button
              className={workspaceToolbarPrimaryButtonClassName}
              onClick={async () => {
                setRootBusy(true);
                setError(null);
                try {
                  const result = await engineeringApi.runRootCauseAgent({
                    ...basePayload,
                    symptom: symptom.trim(),
                    role,
                  });
                  setRootResponse(result);
                  setRootScript(result.python_script || "");
                  setRootRun(null);
                } catch (err: unknown) {
                  setError(getErrorMessage(err, "Root-cause agent failed"));
                } finally {
                  setRootBusy(false);
                }
              }}
              disabled={rootBusy || !symptom.trim()}
            >
              {rootBusy ? "Running..." : "Run Root-Cause Agent"}
            </Button>

            {rootResponse && (
              <div className="space-y-3">
                <div className="text-sm">{rootResponse.summary}</div>
                <Badge variant="secondary">Source: {rootResponse.llm_used ? "Gemini AI" : "Deterministic Fallback"}</Badge>
                <div className="space-y-2">
                  {rootResponse.hypotheses.map((hyp) => (
                    <Card key={hyp.rank}>
                      <CardContent className="pt-4 space-y-1 text-sm">
                        <div><strong>#{hyp.rank}</strong> {hyp.hypothesis} ({Math.round(hyp.confidence * 100)}%)</div>
                        <div className="text-xs text-muted-foreground">Evidence: {hyp.evidence.join(" | ")}</div>
                        <div className="text-xs">Countermeasures: {hyp.countermeasures.join(" | ")}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">Next tests: {rootResponse.next_tests.join(" | ")}</div>
                {rootScript && (
                  <div className="space-y-2">
                    <Textarea value={rootScript} onChange={(e) => setRootScript(e.target.value)} className="min-h-[180px] font-mono text-xs" />
                    <Button
                      variant="outline"
                      className={workspaceToolbarButtonClassName}
                      onClick={() => runScript(rootScript, setRootRunningScript, setRootRun)}
                      disabled={rootRunningScript}
                    >
                      {rootRunningScript ? "Running Script..." : "Run Root-Cause Script"}
                    </Button>
                    {rootRun && (
                      <div className="space-y-2">
                        <pre className="text-xs whitespace-pre-wrap bg-gray-50 border rounded p-3">{rootRun.stdout}</pre>
                        {rootRun.images?.length ? (
                          <div className="grid md:grid-cols-2 gap-2">
                            {rootRun.images.map((img) => <img key={img.filename} src={img.data_uri} alt={img.filename} className="w-full" />)}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="orchestrator" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <WorkspaceFormFieldRow label="Max additional runs">
                <Input placeholder="Max additional runs" value={maxRuns} onChange={(e) => setMaxRuns(e.target.value)} />
              </WorkspaceFormFieldRow>
              <WorkspaceFormFieldRow label="Confidence target">
                <Input placeholder="Confidence target (0-1)" value={confidenceTarget} onChange={(e) => setConfidenceTarget(e.target.value)} />
              </WorkspaceFormFieldRow>
              <WorkspaceFormFieldRow label="Safety constraints" description="Comma or newline separated">
                <Textarea
                  placeholder="Safety constraints (comma/newline)"
                  value={safetyConstraints}
                  onChange={(e) => setSafetyConstraints(e.target.value)}
                  className="min-h-[76px]"
                />
              </WorkspaceFormFieldRow>
            </div>
            <Button
              className={workspaceToolbarPrimaryButtonClassName}
              onClick={async () => {
                setOrchestratorBusy(true);
                setError(null);
                try {
                  const result = await engineeringApi.runDoeOrchestrator({
                    ...basePayload,
                    max_additional_runs: Number(maxRuns || 6),
                    confidence_target: Number(confidenceTarget || 0.85),
                    safety_constraints: splitList(safetyConstraints),
                  });
                  setOrchestratorResponse(result);
                  setOrchestratorScript(result.python_script || "");
                  setOrchestratorRun(null);
                } catch (err: unknown) {
                  setError(getErrorMessage(err, "DOE orchestrator failed"));
                } finally {
                  setOrchestratorBusy(false);
                }
              }}
              disabled={orchestratorBusy}
            >
              {orchestratorBusy ? "Running..." : "Run DOE Orchestrator"}
            </Button>

            {orchestratorResponse && (
              <div className="space-y-3">
                <div className="text-sm">{orchestratorResponse.summary}</div>
                <Badge variant="secondary">Decision: {orchestratorResponse.go_no_go.toUpperCase()}</Badge>
                <Badge variant="secondary" className="ml-2">
                  Source: {orchestratorResponse.llm_used ? "Gemini AI" : "Deterministic Fallback"}
                </Badge>
                <div className="overflow-auto border rounded">
                  <table className="min-w-full text-xs">
                    <thead className="bg-muted text-left">
                      <tr>
                        <th className="p-2">Run</th>
                        <th className="p-2">Settings</th>
                        <th className="p-2">Expected Learning</th>
                        <th className="p-2">Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orchestratorResponse.recommended_next_runs.map((row) => (
                        <tr key={row.run_order} className="border-t">
                          <td className="p-2">{row.run_order}</td>
                          <td className="p-2 font-mono text-[11px]">{JSON.stringify(row.settings)}</td>
                          <td className="p-2">{row.expected_learning}</td>
                          <td className="p-2">{row.risk_level}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-muted-foreground">Stop criteria: {orchestratorResponse.stop_criteria.join(" | ")}</div>
                <div className="text-xs text-muted-foreground">Safety checks: {orchestratorResponse.safety_checks.join(" | ")}</div>
                {orchestratorScript && (
                  <div className="space-y-2">
                    <Textarea value={orchestratorScript} onChange={(e) => setOrchestratorScript(e.target.value)} className="min-h-[180px] font-mono text-xs" />
                    <Button
                      variant="outline"
                      className={workspaceToolbarButtonClassName}
                      onClick={() => runScript(orchestratorScript, setOrchestratorRunningScript, setOrchestratorRun)}
                      disabled={orchestratorRunningScript}
                    >
                      {orchestratorRunningScript ? "Running Script..." : "Run DOE Script"}
                    </Button>
                    {orchestratorRun && (
                      <div className="space-y-2">
                        <pre className="text-xs whitespace-pre-wrap bg-gray-50 border rounded p-3">{orchestratorRun.stdout}</pre>
                        {orchestratorRun.images?.length ? (
                          <div className="grid md:grid-cols-2 gap-2">
                            {orchestratorRun.images.map((img) => <img key={img.filename} src={img.data_uri} alt={img.filename} className="w-full" />)}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
