import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ComparisonCopilotPanel } from "@/components/engineering/ComparisonCopilotPanel";
import { engineeringApi, getErrorMessage } from "@/lib/engineering-api";
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
  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [experimentFile, setExperimentFile] = useState<File | null>(null);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("ai_assisted");
  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [logs, setLogs] = useState<AgentLogsResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!baselineFile || !experimentFile) {
      setError("Both baseline and experiment files are required.");
      return;
    }
    setError(null);
    setIsRunning(true);
    try {
      const result = await engineeringApi.uploadComparison(baselineFile, experimentFile, analysisMode);
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

  const alignedSeries = report?.raw_metadata?.aligned_series as Record<
    string,
    Array<{ timestamp: string; baseline: number; experiment: number }>
  > | undefined;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Baseline vs Experiment Analysis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={(event) => setBaselineFile(event.target.files?.[0] ?? null)}
            />
            <input
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={(event) => setExperimentFile(event.target.files?.[0] ?? null)}
            />
          </div>

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
            <Button onClick={handleRun} disabled={isRunning}>
              {isRunning ? "Running..." : "Run Comparison"}
            </Button>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
        </CardContent>
      </Card>

      {report && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Executive Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>Status: {report.comparison_summary.comparison_status}</div>
              <div>Primary Deviation: {report.comparison_summary.primary_deviation_signal || "N/A"}</div>
              <div>Confidence: {(report.comparison_summary.confidence_level * 100).toFixed(0)}%</div>
              <div>Recommended Action: {report.comparison_summary.recommended_action}</div>
              <div>Rationale: {report.comparison_summary.engineering_rationale}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Signal Comparison</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Time-Series Comparison</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {alignedSeries &&
                Object.entries(alignedSeries).map(([signal, points]) => (
                  <SignalChart key={signal} signal={signal} points={points} />
                ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Engineering Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-gray-700">
              {report.signal_comparison.map((signal) => (
                <div key={signal.signal_name}>
                  <strong>{signal.signal_name}:</strong> {signal.explanation}
                </div>
              ))}
            </CardContent>
          </Card>

          <ComparisonCopilotPanel report={report} />
        </>
      )}

      {logs && (
        <Card>
          <CardHeader>
            <CardTitle>Agent Execution Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-700">
            {logs.logs.map((entry, idx) => (
              <div key={idx} className="border rounded p-2 bg-gray-50">
                <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(entry, null, 2)}</pre>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
