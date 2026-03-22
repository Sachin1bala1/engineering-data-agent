import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceActionBar } from "@/components/workspace/WorkspaceActionBar";
import { WorkspaceControlRow } from "@/components/workspace/WorkspaceControlRow";
import { WorkspaceMetricChip } from "@/components/workspace/WorkspaceMetricChip";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";
import {
  workspaceToolbarButtonClassName,
  workspaceToolbarInputClassName,
  workspaceToolbarPrimaryButtonClassName,
} from "@/components/workspace/workspaceToolbarTokens";
import { engineeringApi, getErrorMessage } from "@/lib/engineering-api";
import { savePendingRootCauseHandoff } from "@/lib/rootCauseHandoff";
import { cn } from "@/lib/utils";
import type {
  KnowledgeGraphResponse,
  KnowledgeQueryResponse,
  KnowledgeRecommendationResponse,
} from "@/types/engineering-api";
import { ArrowRight, BookOpenCheck, Gauge, RefreshCw, TriangleAlert, Wrench } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

const formatNumber = (value?: number | null) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value <= 1 ? value * 100 : Math.min(100, value));
};

const stringifyValue = (value: unknown): string => {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => stringifyValue(item)).join(", ");
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const renderRecordPreview = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return <div className="text-sm text-muted-foreground">{stringifyValue(value)}</div>;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) {
    return <div className="text-sm text-muted-foreground">No structured data returned.</div>;
  }

  return (
    <dl className="grid grid-cols-1 gap-2 text-sm">
      {entries.slice(0, 8).map(([key, item]) => (
        <div key={key} className="rounded-md border bg-background/80 px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{key}</dt>
          <dd className="mt-1 text-foreground">{stringifyValue(item)}</dd>
        </div>
      ))}
    </dl>
  );
};

const getRiskTone = (label?: string | null) => {
  const normalized = String(label || "").toLowerCase();
  if (normalized.includes("critical") || normalized.includes("high")) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (normalized.includes("medium") || normalized.includes("moderate")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (normalized.includes("low") || normalized.includes("normal")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-border bg-muted/40 text-foreground";
};

export function PreventiveMaintenancePanel() {
  const navigate = useNavigate();
  const [assetId, setAssetId] = useState("MOTOR-1");
  const [failureMode, setFailureMode] = useState("bearing wear");
  const [question, setQuestion] = useState("What preventive action should be scheduled next?");
  const [graph, setGraph] = useState<KnowledgeGraphResponse | null>(null);
  const [recommendation, setRecommendation] = useState<KnowledgeRecommendationResponse | null>(null);
  const [queryResponse, setQueryResponse] = useState<KnowledgeQueryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const riskScore = useMemo(
    () => formatNumber(recommendation?.risk?.risk_score ?? queryResponse?.confidence ?? null),
    [queryResponse?.confidence, recommendation?.risk?.risk_score]
  );

  const evidence = useMemo(
    () => (queryResponse?.evidence?.length ? queryResponse.evidence : recommendation?.evidence || []),
    [queryResponse?.evidence, recommendation?.evidence]
  );

  const matchedSops = useMemo(() => recommendation?.sop_mapping?.matched_sops?.slice(0, 3) || [], [
    recommendation?.sop_mapping?.matched_sops,
  ]);

  const incidentPreview = useMemo(() => (graph?.incidents || []).slice(0, 4), [graph?.incidents]);

  const loadAssessment = async () => {
    if (!assetId.trim()) {
      setError("Asset ID is required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [graphResponse, recommendationResponse] = await Promise.all([
        engineeringApi.getKnowledgeGraph(assetId.trim()),
        engineeringApi.getKnowledgeRecommendation(assetId.trim(), failureMode.trim() || undefined),
      ]);
      setGraph(graphResponse);
      setRecommendation(recommendationResponse);
      toast({ title: "Preventive maintenance loaded", description: `Assessment refreshed for ${assetId.trim()}.` });
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load preventive maintenance context."));
    } finally {
      setLoading(false);
    }
  };

  const runQuestion = async () => {
    if (!assetId.trim() || !question.trim()) {
      setError("Asset ID and question are required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await engineeringApi.queryKnowledge(assetId.trim(), question.trim(), failureMode.trim() || undefined);
      setQueryResponse(response);
      toast({ title: "Follow-up query complete", description: "Deterministic maintenance answer refreshed." });
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to run follow-up query."));
    } finally {
      setLoading(false);
    }
  };

  const confidenceScore = formatNumber(queryResponse?.confidence ?? recommendation?.confidence ?? null);
  const evidenceCount = evidence.length;
  const riskLabel = recommendation?.risk?.risk_level || "Not loaded";
  const urgency = riskScore !== null && riskScore >= 80 ? "Immediate" : riskScore !== null && riskScore >= 55 ? "Plan this shift" : riskScore !== null ? "Monitor routinely" : "Not assessed";
  const failureWindow = riskScore !== null && riskScore >= 80 ? "0-7 days" : riskScore !== null && riskScore >= 55 ? "1-4 weeks" : riskScore !== null ? "30+ days" : "Unknown";
  const downtimeRisk = riskScore !== null && riskScore >= 80 ? "High" : riskScore !== null && riskScore >= 55 ? "Moderate" : riskScore !== null ? "Low" : "Unknown";
  const inspectionInterval = riskScore !== null && riskScore >= 80 ? "Inspect now" : riskScore !== null && riskScore >= 55 ? "Inspect this week" : riskScore !== null ? "Inspect this month" : "Set after assessment";
  const evidenceStrength = confidenceScore !== null && confidenceScore >= 80 ? "Strong" : confidenceScore !== null && confidenceScore >= 55 ? "Moderate" : confidenceScore !== null ? "Limited" : "Unknown";
  const nextStep = recommendation?.risk?.drivers?.length
    ? `Inspect ${recommendation.risk.drivers[0]} and verify the matched SOP before scheduling work.`
    : recommendation?.ai_summary || "Load an assessment to see the next operational step.";

  const sendToRootCause = () => {
    if (!recommendation && !queryResponse) {
      setError("Load a maintenance assessment before opening RCA.");
      return;
    }
    const derivedCauses = recommendation?.risk?.drivers?.length
      ? recommendation.risk.drivers
      : (queryResponse?.evidence || []).slice(0, 4).map((item) => stringifyValue(item));
    savePendingRootCauseHandoff({
      source: "maintenance",
      sourceLabel: "Preventive Maintenance",
      generatedAt: new Date().toISOString(),
      suggestedCaseName: `${assetId} ${failureMode || "maintenance"} RCA`,
      suggestedStatus: "containment",
      suggestedPriority: riskScore !== null && riskScore >= 80 ? "critical" : riskScore !== null && riskScore >= 55 ? "high" : "medium",
      draft: {
        title: `Investigate ${assetId} ${failureMode || "maintenance issue"}`,
        processArea: "Preventive Maintenance",
        assetOrLine: assetId,
        symptom: failureMode || question,
        defectStatement: question,
        businessImpact: `Downtime risk: ${downtimeRisk}. Urgency: ${urgency}. Failure window: ${failureWindow}.`,
        dataSources: `Knowledge Twin graph, incidents, SOP mapping${queryResponse ? ", deterministic query" : ""}`,
        evidenceSummary: [
          recommendation?.ai_summary,
          queryResponse?.ai_summary,
          recommendation?.risk?.drivers?.length ? `Drivers: ${recommendation.risk.drivers.join(", ")}` : "",
          matchedSops.length ? `Matched SOPs: ${matchedSops.map((item) => item.sop_name).join(", ")}` : "",
        ].filter(Boolean).join(" | "),
        verifiedRootCause: recommendation?.risk?.drivers?.[0] || "",
        correctiveAction: nextStep,
        preventiveAction: inspectionInterval,
        controlMethod: matchedSops[0]?.sop_name || "Maintenance standard work update",
        monitoringMetric: `Risk score ${riskScore !== null ? `${riskScore}%` : "N/A"}`,
        reactionPlan: nextStep,
      },
      suspectedCauses: derivedCauses,
    });
    navigate("/analytics?tab=rootcause");
  };

  return (
    <div className="space-y-5">
      <WorkspaceActionBar
        title="Preventive Maintenance Workspace"
        description="Asset triage, risk context, and maintenance guidance grounded in the host app's knowledge APIs."
        metrics={
          <>
            <WorkspaceMetricChip label="Asset" value={assetId || "Unset"} />
            <WorkspaceMetricChip label="Failure" value={failureMode || "None"} />
            <WorkspaceMetricChip label="Risk" value={riskLabel} />
            <WorkspaceMetricChip label="Evidence" value={evidenceCount.toLocaleString()} />
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="text-xs uppercase tracking-wide text-red-700">Urgency</div>
          <div className="mt-2 text-lg font-semibold text-red-900">{urgency}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Failure Window</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">{failureWindow}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Downtime Risk</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">{downtimeRisk}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Inspection Interval</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">{inspectionInterval}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Evidence Strength</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">{evidenceStrength}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Confidence</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">{confidenceScore !== null ? `${confidenceScore}%` : "N/A"}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 md:col-span-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Next Step</div>
          <div className="mt-2 text-sm font-medium leading-6 text-slate-900">{nextStep}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <WorkspaceResultCard
          title="Maintenance Controls"
          actions={<Wrench className="h-4 w-4 text-primary" />}
          contentClassName="space-y-4"
        >
          <WorkspaceControlRow
            title="Asset context"
            description="Use the same maintenance primitives as Knowledge Twin, surfaced inside Analytics."
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Asset ID</div>
                <Input
                  value={assetId}
                  onChange={(event) => setAssetId(event.target.value)}
                  className={workspaceToolbarInputClassName}
                  placeholder="e.g. MOTOR-1"
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Failure mode</div>
                <Input
                  value={failureMode}
                  onChange={(event) => setFailureMode(event.target.value)}
                  className={workspaceToolbarInputClassName}
                  placeholder="e.g. bearing wear"
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Follow-up question</div>
              <Textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                className="min-h-[110px] text-sm"
                placeholder="Ask for maintenance steps, diagnostics, or historical evidence."
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button className={workspaceToolbarPrimaryButtonClassName} onClick={loadAssessment} disabled={loading}>
                {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Gauge className="mr-2 h-4 w-4" />}
                {loading ? "Loading..." : "Load Assessment"}
              </Button>
              <Button variant="outline" className={workspaceToolbarButtonClassName} onClick={runQuestion} disabled={loading}>
                <BookOpenCheck className="mr-2 h-4 w-4" />
                Ask Maintenance Copilot
              </Button>
              <Button variant="outline" className={workspaceToolbarButtonClassName} onClick={() => navigate("/knowledge-twin")}>
                <ArrowRight className="mr-2 h-4 w-4" />
                Open Knowledge Twin
              </Button>
              <Button variant="outline" className={workspaceToolbarButtonClassName} onClick={sendToRootCause}>
                Create RCA case
              </Button>
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
          </WorkspaceControlRow>

          <Card className="border-dashed bg-muted/10">
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Maintenance posture</div>
                  <div className="text-xs text-muted-foreground">
                    {graph ? `${graph.incidents.length} incidents linked to this asset` : "No asset history loaded yet."}
                  </div>
                </div>
                <Badge className={cn("border px-3 py-1", getRiskTone(riskLabel))}>{riskLabel}</Badge>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Risk score</span>
                  <span>{riskScore !== null ? `${riskScore}%` : "N/A"}</span>
                </div>
                <Progress value={riskScore ?? 0} className="h-2" />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Confidence</span>
                <span>{confidenceScore !== null ? `${confidenceScore}%` : "N/A"}</span>
              </div>
              <div className="rounded-md border bg-background p-3 text-sm leading-6 text-foreground">
                {recommendation?.ai_summary || "Load an assessment to see the preventive-maintenance summary."}
              </div>
              {recommendation?.risk?.drivers?.length ? (
                <div className="flex flex-wrap gap-2">
                  {recommendation.risk.drivers.map((driver) => (
                    <Badge key={driver} variant="secondary" className="rounded-md">
                      {driver}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </WorkspaceResultCard>

        <div className="space-y-4">
          <WorkspaceResultCard title="Evidence and SOP Mapping" contentClassName="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Graph nodes</div>
                <div className="mt-1 text-lg font-semibold">{graph?.nodes.length ?? 0}</div>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Incidents</div>
                <div className="mt-1 text-lg font-semibold">{graph?.incidents.length ?? 0}</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Matched SOPs</div>
              <div className="flex flex-wrap gap-2">
                {matchedSops.length ? (
                  matchedSops.map((item) => (
                    <Badge key={item.sop_name} variant="secondary" className="rounded-md">
                      {item.sop_name}
                    </Badge>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">No SOP matches loaded.</div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recommendation payload</div>
              {renderRecordPreview(recommendation?.recommendation)}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Failure explanation</div>
              {renderRecordPreview(recommendation?.failure_explanation)}
            </div>

            {incidentPreview.length ? (
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent incident records</div>
                <div className="overflow-hidden rounded-md border">
                  <table className="min-w-full text-xs">
                    <thead className="bg-muted/30 text-left text-muted-foreground">
                      <tr>
                        <th className="p-2">Timestamp</th>
                        <th className="p-2">Failure</th>
                        <th className="p-2">Root Cause</th>
                        <th className="p-2">Resolved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incidentPreview.map((incident, index) => (
                        <tr key={index} className="border-t">
                          <td className="p-2">{stringifyValue(incident.timestamp || incident.failure_date || incident.date)}</td>
                          <td className="p-2">{stringifyValue(incident.failure_mode || incident.failure_type || incident.failure)}</td>
                          <td className="p-2">{stringifyValue(incident.root_cause || incident.cause || incident.detail)}</td>
                          <td className="p-2">{String(Boolean(incident.resolved))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </WorkspaceResultCard>

          <WorkspaceResultCard title="Maintenance Copilot" actions={<TriangleAlert className="h-4 w-4 text-primary" />} contentClassName="space-y-4">
            <div className="rounded-md border bg-muted/10 p-3 text-sm text-muted-foreground">
              Ask a follow-up question to ground the maintenance decision in the current asset context.
            </div>
            {queryResponse ? (
              <div className="space-y-3">
                <div className="rounded-md border bg-background p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Deterministic answer</div>
                  <div className="mt-2 text-sm">{queryResponse.ai_summary}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Confidence: {(Math.round((queryResponse.confidence || 0) * 100))}%</Badge>
                  <Badge variant="secondary">Evidence: {queryResponse.evidence.length}</Badge>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Structured answer</div>
                  {renderRecordPreview(queryResponse.deterministic_answer)}
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Evidence trace</div>
                  <div className="space-y-2">
                    {queryResponse.evidence.slice(0, 6).map((item, index) => (
                      <div key={index} className="rounded-md border bg-background px-3 py-2 text-sm">
                        {stringifyValue((item as Record<string, unknown>).source || (item as Record<string, unknown>).detail || item)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Run the copilot after loading an assessment to capture the deterministic follow-up response here.
              </div>
            )}
          </WorkspaceResultCard>
        </div>
      </div>
    </div>
  );
}
