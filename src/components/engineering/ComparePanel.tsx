import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ComparisonCopilotPanel } from "@/components/engineering/ComparisonCopilotPanel";
import { PersistedResizableGroup } from "@/components/layout/PersistedResizableGroup";
import { ResizableHandle, ResizablePanel } from "@/components/ui/resizable";
import { WorkspaceActionBar } from "@/components/workspace/WorkspaceActionBar";
import { WorkspaceMetricChip } from "@/components/workspace/WorkspaceMetricChip";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";
import { workspaceSectionCardHeaderClassName, workspaceSectionCardTitleClassName, workspaceToolbarPrimaryButtonClassName } from "@/components/workspace/workspaceToolbarTokens";
import { engineeringApi, getErrorMessage } from "@/lib/engineering-api";
import { engineeringApiUrl } from "@/lib/api-base";
import { inspectGroupedCompareFile, inferGroupedCompareConfig, splitGroupedCompareFile, type GroupedCompareConfig } from "@/lib/compareDataset";
import { savePendingRootCauseHandoff } from "@/lib/rootCauseHandoff";
import type { ComparisonReport, AgentLogsResponse } from "@/types/engineering-api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";

type AnalysisMode = "deterministic" | "ai_assisted";
type CompareInputMode = "two-file" | "grouped-file";

type GroupedComparePreview = {
  columns: string[];
  rowCount: number;
  baselineCount: number;
  experimentCount: number;
};

const DEFAULT_GROUPED_COMPARE_CONFIG: GroupedCompareConfig = {
  groupColumn: "scenario",
  baselineValue: "baseline",
  experimentValue: "experiment",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatInputSummary(
  compareInputMode: CompareInputMode,
  baselineFile: File | null,
  experimentFile: File | null,
  groupedFile: File | null,
  groupedConfig: GroupedCompareConfig
): string {
  if (compareInputMode === "grouped-file") {
    return `${groupedFile?.name || "Grouped dataset"} using ${groupedConfig.groupColumn} = ${groupedConfig.baselineValue} / ${groupedConfig.experimentValue}`;
  }
  return [baselineFile?.name || "baseline file", experimentFile?.name || "experiment file"].join(" vs ");
}

function buildEngineeringReportDocument(args: {
  report: ComparisonReport;
  inputSummary: string;
  compareInputMode: CompareInputMode;
  analysisMode: AnalysisMode;
  topSignals: ComparisonReport["signal_comparison"];
}): string {
  const { report, inputSummary, compareInputMode, analysisMode, topSignals } = args;
  const observations = topSignals.length
    ? topSignals
        .map(
          (signal) => `
            <div class="observation">
              <div class="signal">${escapeHtml(signal.signal_name)}</div>
              <div class="meta">Severity ${escapeHtml(signal.severity)} | Delta ${signal.deviation_metrics.percent_delta?.toFixed(1) ?? "N/A"}% | Z-score ${signal.deviation_metrics.z_score_vs_baseline?.toFixed(2) ?? "N/A"}</div>
              <div class="body">${escapeHtml(signal.explanation)}</div>
            </div>
          `
        )
        .join("")
    : `<div class="body">No signal-level deviations were flagged in this comparison.</div>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Engineering Validation Report</title>
    <style>
      body { font-family: Calibri, Arial, sans-serif; color: #0f172a; margin: 32px; line-height: 1.5; }
      h1 { font-size: 24px; margin: 0 0 8px; color: #0f172a; }
      h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; margin: 24px 0 8px; }
      .subtle { color: #475569; font-size: 12px; }
      .grid { display: table; width: 100%; border-collapse: separate; border-spacing: 12px 12px; margin: 8px -12px 0; }
      .cell { display: table-cell; width: 25%; border: 1px solid #cbd5e1; padding: 12px; vertical-align: top; border-radius: 8px; }
      .finding { border: 1px solid #cbd5e1; padding: 14px; margin-top: 8px; border-radius: 8px; }
      .disposition { border: 1px solid #f59e0b; background: #fffbeb; padding: 14px; margin-top: 8px; border-radius: 8px; }
      .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
      .value { margin-top: 6px; font-weight: 600; }
      .body { margin-top: 8px; }
      .observation { border: 1px solid #cbd5e1; background: #f8fafc; padding: 12px; margin-top: 10px; border-radius: 8px; }
      .signal { font-weight: 700; }
      .meta { font-size: 12px; color: #475569; margin-top: 4px; }
      .footer { margin-top: 28px; font-size: 12px; color: #64748b; }
    </style>
  </head>
  <body>
    <h1>Engineering Validation Report</h1>
    <div class="subtle">Generated from Baseline vs Experiment Analysis</div>

    <h2>Report Header</h2>
    <div class="grid">
      <div class="cell"><div class="label">Report ID</div><div class="value">${escapeHtml(report.report_id)}</div></div>
      <div class="cell"><div class="label">Created</div><div class="value">${escapeHtml(new Date(report.created_at).toLocaleString())}</div></div>
      <div class="cell"><div class="label">Input Type</div><div class="value">${escapeHtml(compareInputMode === "grouped-file" ? "Single grouped file" : "Two-file compare")}</div></div>
      <div class="cell"><div class="label">Analysis Mode</div><div class="value">${escapeHtml(analysisMode === "ai_assisted" ? "AI-Assisted" : "Deterministic")}</div></div>
    </div>

    <h2>Scope</h2>
    <div class="finding">${escapeHtml(inputSummary)}</div>

    <h2>Finding</h2>
    <div class="finding">
      <div class="value">${escapeHtml(
        report.comparison_summary.primary_deviation_signal
          ? `Primary deviation detected in ${report.comparison_summary.primary_deviation_signal}`
          : "No dominant deviation detected between baseline and experiment"
      )}</div>
      <div class="body">${escapeHtml(report.comparison_summary.engineering_rationale)}</div>
    </div>

    <h2>Disposition</h2>
    <div class="disposition">${escapeHtml(report.comparison_summary.recommended_action)}</div>

    <h2>Summary Metrics</h2>
    <div class="grid">
      <div class="cell"><div class="label">Comparison Status</div><div class="value">${escapeHtml(report.comparison_summary.comparison_status)}</div></div>
      <div class="cell"><div class="label">Confidence</div><div class="value">${escapeHtml(`${(report.comparison_summary.confidence_level * 100).toFixed(0)}%`)}</div></div>
      <div class="cell"><div class="label">Signals Reviewed</div><div class="value">${escapeHtml(String(report.signal_comparison.length))}</div></div>
      <div class="cell"><div class="label">Primary Deviation</div><div class="value">${escapeHtml(report.comparison_summary.primary_deviation_signal || "None")}</div></div>
    </div>

    <h2>Key Observations</h2>
    ${observations}

    <div class="footer">This report is intended as an engineering validation note for baseline vs experiment review.</div>
  </body>
</html>`;
}

function SignalChart({
  signal,
  points,
}: {
  signal: string;
  points: Array<{ timestamp: string; baseline: number; experiment: number }>;
}) {
  if (!points.length) return null;
  const baselineValues = points.map((p) => p.baseline).filter((v) => typeof v === "number");
  const mean = baselineValues.reduce((sum, v) => sum + v, 0) / (baselineValues.length || 1);
  const std = Math.sqrt(
    baselineValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / Math.max(1, baselineValues.length - 1)
  );
  const bandMin = mean - std;
  const bandMax = mean + std;
  const bandMin2 = mean - 2 * std;
  const bandMax2 = mean + 2 * std;
  const experimentValues = points.map((p) => p.experiment).filter((v) => typeof v === "number");
  const allValues = [...baselineValues, ...experimentValues];
  const dataMin = allValues.length ? Math.min(...allValues) : bandMin2;
  const dataMax = allValues.length ? Math.max(...allValues) : bandMax2;

  return (
    <div className="h-64">
      <div className="text-sm font-medium text-gray-700 mb-2">{signal}</div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <XAxis dataKey="timestamp" />
          <YAxis />
          <Tooltip />
          <ReferenceArea y1={bandMin2} y2={bandMin} fill="#FDE68A" fillOpacity={0.35} />
          <ReferenceArea y1={bandMin} y2={bandMax} fill="#BBF7D0" fillOpacity={0.3} />
          <ReferenceArea y1={bandMax} y2={bandMax2} fill="#FDE68A" fillOpacity={0.35} />
          {dataMin < bandMin2 && <ReferenceArea y1={dataMin} y2={bandMin2} fill="#FCA5A5" fillOpacity={0.25} />}
          {dataMax > bandMax2 && <ReferenceArea y1={bandMax2} y2={dataMax} fill="#FCA5A5" fillOpacity={0.25} />}
          <Line type="monotone" dataKey="baseline" stroke="#1E40AF" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="experiment" stroke="#DC2626" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ComparePanel() {
  const navigate = useNavigate();
  const [isDesktopLayout, setIsDesktopLayout] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [experimentFile, setExperimentFile] = useState<File | null>(null);
  const [groupedFile, setGroupedFile] = useState<File | null>(null);
  const [compareInputMode, setCompareInputMode] = useState<CompareInputMode>("grouped-file");
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("ai_assisted");
  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [logs, setLogs] = useState<AgentLogsResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [groupedConfig, setGroupedConfig] = useState<GroupedCompareConfig>(DEFAULT_GROUPED_COMPARE_CONFIG);
  const [groupedPreview, setGroupedPreview] = useState<GroupedComparePreview | null>(null);

  const resetComparisonResults = () => {
    setReport(null);
    setLogs(null);
    setShowDetails(false);
  };

  const loadGroupedDemo = async () => {
    setError(null);
    resetComparisonResults();
    try {
      const response = await fetch("/baseline_vs_experiment_demo.csv");
      if (!response.ok) {
        throw new Error(`Failed to fetch bundled compare demo (${response.status}).`);
      }
      const blob = await response.blob();
      const file = new File([blob], "baseline_vs_experiment_demo.csv", { type: blob.type || "text/csv" });
      setGroupedFile(file);
      setCompareInputMode("grouped-file");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load the bundled grouped compare demo"));
    }
  };

  useEffect(() => {
    if (!groupedFile) {
      setGroupedPreview(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { columns, records } = await inspectGroupedCompareFile(groupedFile);
        const inferred = inferGroupedCompareConfig(columns, records) || DEFAULT_GROUPED_COMPARE_CONFIG;
        const baselineCount = records.filter((row) => String(row[inferred.groupColumn] ?? "").trim().toLowerCase() === inferred.baselineValue.toLowerCase()).length;
        const experimentCount = records.filter((row) => String(row[inferred.groupColumn] ?? "").trim().toLowerCase() === inferred.experimentValue.toLowerCase()).length;
        if (cancelled) return;
        setGroupedConfig(inferred);
        setGroupedPreview({
          columns,
          rowCount: records.length,
          baselineCount,
          experimentCount,
        });
      } catch (err: unknown) {
        if (cancelled) return;
        setGroupedPreview(null);
        setError(getErrorMessage(err, "Failed to inspect grouped compare file"));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [groupedFile]);

  const handleRun = async () => {
    setError(null);
    setIsRunning(true);
    setError(null);
    try {
      let baselineInput = baselineFile;
      let experimentInput = experimentFile;

      if (compareInputMode === "grouped-file") {
        if (!groupedFile) {
          throw new Error("Load a grouped compare dataset or switch back to two-file mode.");
        }
        const split = await splitGroupedCompareFile(groupedFile, groupedConfig);
        baselineInput = split.baselineFile;
        experimentInput = split.experimentFile;
      } else if (!baselineInput || !experimentInput) {
        throw new Error("Both baseline and experiment files are required.");
      }

      const result = await engineeringApi.uploadComparison(baselineInput, experimentInput, analysisMode);
      if (!result.report_id) {
        throw new Error(result.message);
      }
      const reportData = await engineeringApi.getComparisonReport(result.report_id);
      setReport(reportData);
      const logData = await engineeringApi.getComparisonAgentLogs(result.report_id);
      setLogs(logData);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Comparison failed"));
    } finally {
      setIsRunning(false);
    }
  };

  const sendToRootCause = () => {
    if (!report) {
      setError("Run a comparison before opening RCA.");
      return;
    }
    const sourceLabel =
      compareInputMode === "grouped-file"
        ? groupedFile?.name || "grouped compare dataset"
        : [baselineFile?.name, experimentFile?.name].filter(Boolean).join(" vs ");
    const processContext =
      compareInputMode === "grouped-file"
        ? `${groupedConfig.groupColumn} = ${groupedConfig.baselineValue} / ${groupedConfig.experimentValue}`
        : baselineFile?.name || "";
    const lineContext =
      compareInputMode === "grouped-file"
        ? groupedFile?.name || ""
        : experimentFile?.name || "";
    savePendingRootCauseHandoff({
      source: "compare",
      sourceLabel: "Baseline vs Experiment",
      generatedAt: new Date().toISOString(),
      suggestedCaseName: `${report.comparison_summary.primary_deviation_signal || "process-drift"} RCA`,
      suggestedStatus: "analysis",
      suggestedPriority: report.comparison_summary.confidence_level >= 0.8 ? "high" : "medium",
      draft: {
        title: `Investigate deviation in ${report.comparison_summary.primary_deviation_signal || "changed process"}`,
        processArea: processContext,
        assetOrLine: lineContext,
        symptom: report.comparison_summary.recommended_action,
        defectStatement: report.comparison_summary.engineering_rationale,
        businessImpact: `Comparison status: ${report.comparison_summary.comparison_status}`,
        dataSources: sourceLabel,
        evidenceSummary: [
          `Primary deviation: ${report.comparison_summary.primary_deviation_signal || "N/A"}`,
          `Confidence: ${(report.comparison_summary.confidence_level * 100).toFixed(0)}%`,
          report.comparison_summary.engineering_rationale,
          ...report.signal_comparison.slice(0, 3).map((signal) => `${signal.signal_name}: ${signal.explanation}`),
        ].join(" | "),
        verifiedRootCause: report.comparison_summary.primary_deviation_signal || "",
        correctiveAction: report.comparison_summary.recommended_action,
        monitoringMetric: report.comparison_summary.primary_deviation_signal || "",
      },
      suspectedCauses: report.signal_comparison.slice(0, 4).map((signal) => signal.signal_name),
    });
    navigate("/analytics?tab=rootcause");
  };

  const alignedSeries = report?.raw_metadata?.aligned_series as Record<
    string,
    Array<{ timestamp: string; baseline: number; experiment: number }>
  > | undefined;
  const backendReportUrl = report ? engineeringApiUrl(`/compare/report/${report.report_id}`) : "";
  const reportInputSummary = formatInputSummary(compareInputMode, baselineFile, experimentFile, groupedFile, groupedConfig);
  const topSignals = report?.signal_comparison.slice(0, 5) || [];

  const exportEngineeringReport = (format: "word" | "pdf") => {
    if (!report) {
      setError("Run a comparison before exporting the report.");
      return;
    }
    const html = buildEngineeringReportDocument({
      report,
      inputSummary: reportInputSummary,
      compareInputMode,
      analysisMode,
      topSignals,
    });
    const safeName = `engineering-validation-${report.report_id}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    if (format === "word") {
      const blob = new Blob([html], { type: "application/msword" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeName}.doc`;
      link.click();
      window.URL.revokeObjectURL(url);
      return;
    }
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
    if (!printWindow) {
      setError("Popup blocked. Allow popups to export PDF.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktopLayout(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="space-y-6">
      <WorkspaceActionBar
        title="Baseline vs Experiment Analysis"
        description="Find what changed between a stable baseline and a new experiment, then decide what engineering team should inspect first."
        metrics={
          <>
            <WorkspaceMetricChip label="Baseline" value={baselineFile?.name || "Not loaded"} />
            <WorkspaceMetricChip label="Experiment" value={experimentFile?.name || "Not loaded"} />
            <WorkspaceMetricChip label="Mode" value={analysisMode === "ai_assisted" ? "AI-Assisted" : "Deterministic"} />
          </>
        }
        secondary={
          <div className="space-y-4">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Use this workspace when a process, line, or recipe changed and you need the clearest deviation, confidence level, and recommended next action.
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Button
                variant={compareInputMode === "grouped-file" ? "default" : "outline"}
                className={compareInputMode === "grouped-file" ? workspaceToolbarPrimaryButtonClassName : undefined}
                onClick={() => {
                  setCompareInputMode("grouped-file");
                  resetComparisonResults();
                }}
              >
                Single grouped file
              </Button>
              <Button
                variant={compareInputMode === "two-file" ? "default" : "outline"}
                className={compareInputMode === "two-file" ? workspaceToolbarPrimaryButtonClassName : undefined}
                onClick={() => {
                  setCompareInputMode("two-file");
                  resetComparisonResults();
                }}
              >
                Two separate files
              </Button>
            </div>

            {compareInputMode === "grouped-file" ? (
              <div className="space-y-3 rounded-xl border bg-background p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Grouped compare dataset</div>
                    <div className="text-xs text-muted-foreground">One CSV can hold both baseline and experiment rows if it includes a grouping column.</div>
                  </div>
                  <Button variant="outline" className={workspaceToolbarButtonClassName} onClick={() => void loadGroupedDemo()}>
                    Load bundled grouped demo
                  </Button>
                </div>
                <input
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  onChange={(event) => {
                    setGroupedFile(event.target.files?.[0] ?? null);
                    resetComparisonResults();
                  }}
                />
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Group column</div>
                    <input
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      value={groupedConfig.groupColumn}
                      onChange={(event) => setGroupedConfig((current) => ({ ...current, groupColumn: event.target.value }))}
                      placeholder="scenario"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Baseline label</div>
                    <input
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      value={groupedConfig.baselineValue}
                      onChange={(event) => setGroupedConfig((current) => ({ ...current, baselineValue: event.target.value }))}
                      placeholder="baseline"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Experiment label</div>
                    <input
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      value={groupedConfig.experimentValue}
                      onChange={(event) => setGroupedConfig((current) => ({ ...current, experimentValue: event.target.value }))}
                      placeholder="experiment"
                    />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Example: the bundled compare demo uses `scenario = baseline / experiment`. The backend still receives two files after the split.
                </div>
                {groupedPreview ? (
                  <div className="grid gap-3 md:grid-cols-3 text-sm">
                    <div className="rounded-md border bg-muted/20 p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Columns</div>
                      <div className="mt-1 font-semibold">{groupedPreview.columns.length}</div>
                    </div>
                    <div className="rounded-md border bg-muted/20 p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Baseline rows</div>
                      <div className="mt-1 font-semibold">{groupedPreview.baselineCount}</div>
                    </div>
                    <div className="rounded-md border bg-muted/20 p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Experiment rows</div>
                      <div className="mt-1 font-semibold">{groupedPreview.experimentCount}</div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  onChange={(event) => {
                    setBaselineFile(event.target.files?.[0] ?? null);
                    resetComparisonResults();
                  }}
                />
                <input
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  onChange={(event) => {
                    setExperimentFile(event.target.files?.[0] ?? null);
                    resetComparisonResults();
                  }}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="analysisMode"
                  checked={analysisMode === "deterministic"}
                  onChange={() => setAnalysisMode("deterministic")}
                />
                Deterministic Only
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="analysisMode"
                  checked={analysisMode === "ai_assisted"}
                  onChange={() => setAnalysisMode("ai_assisted")}
                />
                AI-Assisted Planning
              </label>
              <Button className={workspaceToolbarPrimaryButtonClassName} onClick={handleRun} disabled={isRunning}>
                {isRunning ? "Running..." : "Run Comparison"}
              </Button>
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <div className="flex justify-end">
              <Button variant="outline" onClick={sendToRootCause} disabled={!report}>
                Open in RCA
              </Button>
            </div>
          </div>
        }
      />

      <WorkspaceResultCard title="Demo Steps" contentClassName="grid gap-3 md:grid-cols-4 text-sm">
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">1. Load compare data</div>
          <div className="mt-2">
            {compareInputMode === "grouped-file"
              ? "Use one grouped file with a scenario-style column for baseline and experiment rows."
              : "Choose the known-good baseline dataset for the current process."}
          </div>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">2. Confirm compare groups</div>
          <div className="mt-2">
            {compareInputMode === "grouped-file"
              ? "Check the grouping column and the baseline/experiment labels before running."
              : "Add the candidate recipe, setup, or changed run you want to validate."}
          </div>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">3. Run comparison</div>
          <div className="mt-2">Keep AI-assisted mode on if you want a clearer recommendation narrative.</div>
        </div>
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-xs uppercase tracking-wide text-emerald-700">4. Read the rollout call</div>
          <div className="mt-2">Use primary deviation, confidence, and recommended action as the plant decision summary.</div>
        </div>
      </WorkspaceResultCard>

      {report && (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          <div className="rounded-xl border border-emerald-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Primary Deviation</div>
            <div className="mt-2 text-lg font-semibold text-gray-900">
              {report.comparison_summary.primary_deviation_signal || "No dominant deviation"}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Confidence</div>
            <div className="mt-2 text-lg font-semibold text-gray-900">
              {(report.comparison_summary.confidence_level * 100).toFixed(0)}%
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Status</div>
            <div className="mt-2 text-lg font-semibold text-gray-900">
              {report.comparison_summary.comparison_status}
            </div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-xs uppercase tracking-wide text-amber-700">Recommended Action</div>
            <div className="mt-2 text-sm font-medium leading-6 text-amber-900">
              {report.comparison_summary.recommended_action}
            </div>
          </div>
        </div>
      )}

      {report ? (
        <WorkspaceResultCard title="Engineering Validation Report" contentClassName="space-y-4 text-sm text-slate-700">
          <div className="rounded-md border bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Report Header</div>
            <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Report ID</div>
                <div className="mt-1 font-medium text-slate-900">{report.report_id}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Created</div>
                <div className="mt-1 font-medium text-slate-900">{new Date(report.created_at).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Input Type</div>
                <div className="mt-1 font-medium text-slate-900">{compareInputMode === "grouped-file" ? "Single grouped file" : "Two-file compare"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Analysis Mode</div>
                <div className="mt-1 font-medium text-slate-900">{analysisMode === "ai_assisted" ? "AI-Assisted" : "Deterministic"}</div>
              </div>
            </div>
          </div>

          <div className="rounded-md border bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Scope</div>
            <div className="mt-2 leading-6 text-slate-900">{reportInputSummary}</div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-md border bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Finding</div>
              <div className="mt-2 text-base font-semibold text-slate-900">
                {report.comparison_summary.primary_deviation_signal
                  ? `Primary deviation detected in ${report.comparison_summary.primary_deviation_signal}`
                  : "No dominant deviation detected between baseline and experiment"}
              </div>
              <div className="mt-3 text-sm leading-6 text-slate-700">{report.comparison_summary.engineering_rationale}</div>
            </div>
            <div className="rounded-md border bg-amber-50 p-4">
              <div className="text-xs uppercase tracking-wide text-amber-700">Disposition</div>
              <div className="mt-2 text-base font-semibold text-amber-900">{report.comparison_summary.recommended_action}</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-md border bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Comparison Status</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{report.comparison_summary.comparison_status}</div>
            </div>
            <div className="rounded-md border bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Confidence</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{(report.comparison_summary.confidence_level * 100).toFixed(0)}%</div>
            </div>
            <div className="rounded-md border bg-white p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Signals Reviewed</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{report.signal_comparison.length}</div>
            </div>
          </div>

          <div className="rounded-md border bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Key Observations</div>
            <div className="mt-3 space-y-3">
              {topSignals.length ? (
                topSignals.map((signal) => (
                  <div key={signal.signal_name} className="rounded-md border bg-slate-50 p-3">
                    <div className="font-medium text-slate-900">{signal.signal_name}</div>
                    <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                      Severity {signal.severity} | Delta {signal.deviation_metrics.percent_delta?.toFixed(1) ?? "N/A"}% | Z-score {signal.deviation_metrics.z_score_vs_baseline?.toFixed(2) ?? "N/A"}
                    </div>
                    <div className="mt-2 leading-6 text-slate-700">{signal.explanation}</div>
                  </div>
                ))
              ) : (
                <div className="text-slate-700">No signal-level deviations were flagged in this comparison.</div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={backendReportUrl} target="_blank" rel="noreferrer">View Backend Report</a>
            </Button>
            <Button variant="outline" onClick={() => exportEngineeringReport("word")}>
              Export Word Report
            </Button>
            <Button variant="outline" onClick={() => exportEngineeringReport("pdf")}>
              Export PDF Report
            </Button>
            <Button variant="outline" onClick={sendToRootCause}>
              Create RCA case from comparison
            </Button>
          </div>
        </WorkspaceResultCard>
      ) : null}

      {report && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3">
          <div className="text-sm text-gray-600">
            Executive summary stays visible first. Technical signal tables, time series, copilot, and logs are optional details.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={backendReportUrl} target="_blank" rel="noreferrer">View Backend Report</a>
            </Button>
            <Button variant="outline" onClick={() => exportEngineeringReport("word")}>
              Export Word Report
            </Button>
            <Button variant="outline" onClick={() => exportEngineeringReport("pdf")}>
              Export PDF Report
            </Button>
            <Button variant="outline" onClick={() => setShowDetails((current) => !current)}>
              {showDetails ? "Hide Details" : "Show Details"}
            </Button>
            <Button variant="outline" onClick={sendToRootCause}>
              Create RCA case from comparison
            </Button>
          </div>
        </div>
      )}

      {report && (
        <PersistedResizableGroup
          storageKey="workspace.compare.main.v1"
          direction="horizontal"
          defaultSizes={[68, 32]}
          minSizes={[35, 18]}
          enabled={isDesktopLayout}
          className="min-h-[900px]"
        >
          <ResizablePanel defaultSize={68} minSize={35}>
            <div className="min-h-0 min-w-0 pr-0 lg:pr-4">
              <PersistedResizableGroup
                storageKey="workspace.compare.results.v1"
                direction="vertical"
                defaultSizes={showDetails ? [22, 33, 45] : [100, 0, 0]}
                minSizes={showDetails ? [18, 18, 22] : [100, 0, 0]}
                enabled={isDesktopLayout}
                className="min-h-[900px]"
              >
                <ResizablePanel defaultSize={22} minSize={18}>
                  <div className="h-full overflow-auto pb-3">
                    <WorkspaceResultCard title="Executive Summary" contentClassName="space-y-4 text-sm">
                        <div>Status: {report.comparison_summary.comparison_status}</div>
                        <div>Primary Deviation: {report.comparison_summary.primary_deviation_signal || "N/A"}</div>
                        <div>Confidence: {(report.comparison_summary.confidence_level * 100).toFixed(0)}%</div>
                        <div>Recommended Action: {report.comparison_summary.recommended_action}</div>
                        <div>Rationale: {report.comparison_summary.engineering_rationale}</div>
                        <div className="space-y-2 text-gray-700">
                          {report.signal_comparison.map((signal) => (
                            <div key={signal.signal_name}>
                              <strong>{signal.signal_name}:</strong> {signal.explanation}
                            </div>
                          ))}
                        </div>
                    </WorkspaceResultCard>
                  </div>
                </ResizablePanel>
                {showDetails ? (
                  <>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize={33} minSize={18}>
                      <div className="h-full overflow-auto py-3">
                        <WorkspaceResultCard title="Signal Comparison" contentClassName="overflow-auto">
                            <table className="min-w-full text-sm">
                              <thead className="text-left text-gray-500">
                                <tr>
                                  <th className="p-2">Signal</th>
                                  <th className="p-2">Baseline Mean +/- Std</th>
                                  <th className="p-2">Experiment Mean +/- Std</th>
                                  <th className="p-2">% Change</th>
                                  <th className="p-2">Z-Score</th>
                                  <th className="p-2">Severity</th>
                                  <th className="p-2">Persistence</th>
                                </tr>
                              </thead>
                              <tbody>
                                {report.signal_comparison.map((signal) => (
                                  <tr key={signal.signal_name} className="border-t">
                                    <td className="p-2 font-medium">{signal.signal_name}</td>
                                    <td className="p-2">
                                      {signal.baseline_stats.mean.toFixed(2)} +/- {signal.baseline_stats.std.toFixed(2)}
                                    </td>
                                    <td className="p-2">
                                      {signal.experiment_stats.mean.toFixed(2)} +/- {signal.experiment_stats.std.toFixed(2)}
                                    </td>
                                    <td className="p-2">{signal.deviation_metrics.percent_delta?.toFixed(1) ?? "N/A"}%</td>
                                    <td className="p-2">{signal.deviation_metrics.z_score_vs_baseline?.toFixed(2) ?? "N/A"}</td>
                                    <td className="p-2">{signal.severity}</td>
                                    <td className="p-2">
                                      {signal.deviation_metrics.persistence_above_baseline?.toFixed(1) ?? "N/A"}%
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                        </WorkspaceResultCard>
                      </div>
                    </ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize={45} minSize={22}>
                      <div className="h-full overflow-auto pt-3">
                        <WorkspaceResultCard title="Time-Series Comparison" contentClassName="space-y-6 overflow-auto">
                            {alignedSeries &&
                              Object.entries(alignedSeries).map(([signal, points]) => (
                                <SignalChart key={signal} signal={signal} points={points} />
                              ))}
                        </WorkspaceResultCard>
                      </div>
                    </ResizablePanel>
                  </>
                ) : null}
              </PersistedResizableGroup>
            </div>
          </ResizablePanel>
          {showDetails ? (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={32} minSize={18}>
                <div className="min-h-0 min-w-0 pl-0 lg:pl-4">
                  <ComparisonCopilotPanel report={report} />
                </div>
              </ResizablePanel>
            </>
          ) : null}
        </PersistedResizableGroup>
      )}

      {logs && showDetails && (
        <WorkspaceResultCard title="Agent Execution Timeline" contentClassName="space-y-2 text-sm text-gray-700">
            {logs.logs.map((entry, idx) => (
              <div key={idx} className="border rounded p-2 bg-gray-50">
                <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(entry, null, 2)}</pre>
              </div>
            ))}
        </WorkspaceResultCard>
      )}
    </div>
  );
}
