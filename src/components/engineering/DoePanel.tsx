import React, { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { WorkspaceActionBar } from "@/components/workspace/WorkspaceActionBar";
import { WorkspaceMetricChip } from "@/components/workspace/WorkspaceMetricChip";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";
import { WorkspaceFormFieldRow } from "@/components/workspace/WorkspaceFormFieldRow";
import { WorkspaceControlRow } from "@/components/workspace/WorkspaceControlRow";
import { workspaceToolbarButtonClassName, workspaceToolbarPrimaryButtonClassName } from "@/components/workspace/workspaceToolbarTokens";
import { engineeringApi, getErrorMessage } from "@/lib/engineering-api";
import type { DOEReport, DOEUploadResponse, ScriptRunResponse } from "@/types/engineering-api";

type TabKey = "upload" | "analysis" | "report";

export function DoePanel() {
  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [experimentFile, setExperimentFile] = useState<File | null>(null);
  const [processName, setProcessName] = useState("");
  const [engineer, setEngineer] = useState("");
  const [baselineDescription, setBaselineDescription] = useState("");
  const [experimentDescription, setExperimentDescription] = useState("");
  const [doeFactors, setDoeFactors] = useState("{}");
  const [columnMapping, setColumnMapping] = useState("{}");
  const [defaultDate, setDefaultDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [report, setReport] = useState<DOEReport | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("upload");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<DOEUploadResponse | null>(null);
  const [showDeltaChart, setShowDeltaChart] = useState(false);
  const [activeScript, setActiveScript] = useState<string>("");
  const [runResult, setRunResult] = useState<ScriptRunResponse | null>(null);
  const [isRunningScript, setIsRunningScript] = useState(false);

  const comparisonRows = useMemo(() => report?.comparison_table ?? [], [report]);

  const handleSubmit = async () => {
    if (!baselineFile || !experimentFile || !processName.trim() || !engineer.trim()) {
      setError("Baseline, experiment, process name, and engineer are required.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("baseline_file", baselineFile, baselineFile.name);
      formData.append("experiment_file", experimentFile, experimentFile.name);
      formData.append("process_name", processName);
      formData.append("engineer", engineer);
      if (baselineDescription.trim()) {
        formData.append("baseline_description", baselineDescription);
      }
      if (experimentDescription.trim()) {
        formData.append("experiment_description", experimentDescription);
      }
      if (doeFactors.trim()) {
        formData.append("doe_factors", doeFactors);
      }
      if (columnMapping.trim()) {
        formData.append("column_mapping", columnMapping);
      }
      if (defaultDate.trim()) {
        formData.append("default_date", defaultDate);
      }
      if (startDate.trim()) {
        formData.append("start_date", startDate);
      }
      const upload = await engineeringApi.uploadDoeComparison(formData);
      setResponse(upload);
      if (upload.report_id) {
        const reportData = await engineeringApi.getDoeReport(upload.report_id);
        setReport(reportData);
        setActiveTab("analysis");
        if (reportData.plot_scripts?.length) {
          setActiveScript(reportData.plot_scripts[0].code);
        }
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "DOE comparison failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <WorkspaceActionBar
        title="DOE Validation Workspace"
        description="Upload baseline and experiment runs, compare process behavior, and review the validation report."
        metrics={
          <>
            <WorkspaceMetricChip label="Baseline" value={baselineFile?.name || "Not loaded"} />
            <WorkspaceMetricChip label="Experiment" value={experimentFile?.name || "Not loaded"} />
            <WorkspaceMetricChip label="Process" value={processName || "Not set"} />
            <WorkspaceMetricChip label="Engineer" value={engineer || "Not set"} />
          </>
        }
        actions={
          <>
            {(["upload", "analysis", "report"] as TabKey[]).map((tab) => (
              <Button
                key={tab}
                variant={activeTab === tab ? "default" : "outline"}
                size="sm"
                className={activeTab === tab ? workspaceToolbarPrimaryButtonClassName : workspaceToolbarButtonClassName}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "upload" && "Upload & Mapping"}
                {tab === "analysis" && "Analysis Dashboard"}
                {tab === "report" && "DOE Validation Report"}
              </Button>
            ))}
          </>
        }
      />

      {activeTab === "upload" && (
        <WorkspaceResultCard title="Upload & Mapping" contentClassName="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <WorkspaceFormFieldRow label="Baseline Excel/CSV">
                <input type="file" accept=".csv,.xls,.xlsx" onChange={(event) => setBaselineFile(event.target.files?.[0] ?? null)} />
              </WorkspaceFormFieldRow>
              <WorkspaceFormFieldRow label="Experiment Excel/CSV">
                <input type="file" accept=".csv,.xls,.xlsx" onChange={(event) => setExperimentFile(event.target.files?.[0] ?? null)} />
              </WorkspaceFormFieldRow>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <WorkspaceFormFieldRow label="Process name">
                <input
                  type="text"
                  placeholder="Process name"
                  value={processName}
                  onChange={(event) => setProcessName(event.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </WorkspaceFormFieldRow>
              <WorkspaceFormFieldRow label="Engineer">
                <input
                  type="text"
                  placeholder="Engineer"
                  value={engineer}
                  onChange={(event) => setEngineer(event.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </WorkspaceFormFieldRow>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <WorkspaceFormFieldRow label="Baseline description">
                <textarea
                  placeholder="Baseline description"
                  value={baselineDescription}
                  onChange={(event) => setBaselineDescription(event.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm min-h-[90px]"
                />
              </WorkspaceFormFieldRow>
              <WorkspaceFormFieldRow label="Experiment description">
                <textarea
                  placeholder="Experiment description"
                  value={experimentDescription}
                  onChange={(event) => setExperimentDescription(event.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm min-h-[90px]"
                />
              </WorkspaceFormFieldRow>
            </div>

            <WorkspaceFormFieldRow label="DOE factors (JSON)">
              <textarea
                value={doeFactors}
                onChange={(event) => setDoeFactors(event.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-xs font-mono min-h-[120px]"
              />
            </WorkspaceFormFieldRow>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <WorkspaceFormFieldRow label="Column mapping (JSON)">
                <textarea
                  value={columnMapping}
                  onChange={(event) => setColumnMapping(event.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-xs font-mono min-h-[120px]"
                />
              </WorkspaceFormFieldRow>
              <WorkspaceFormFieldRow label="Time normalization" description="Use for time-only or relative timestamps.">
                <input
                  type="date"
                  value={defaultDate}
                  onChange={(event) => setDefaultDate(event.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full"
                  placeholder="Default date"
                />
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full"
                  placeholder="Start date"
                />
              </WorkspaceFormFieldRow>
            </div>

            <WorkspaceControlRow title="Execution">
              <div className="flex items-center gap-3">
                <Button className={workspaceToolbarPrimaryButtonClassName} onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? "Running..." : "Run DOE Comparison"}
                </Button>
                {response?.message && <div className="text-xs text-gray-500">{response.message}</div>}
              </div>
            </WorkspaceControlRow>

            {error && <div className="text-sm text-red-600">{error}</div>}
            {response?.errors?.length ? (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                Errors: {response.errors.join("; ")}
              </div>
            ) : null}
            {response?.warnings?.length ? (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                Warnings: {response.warnings.join("; ")}
              </div>
            ) : null}
            {report?.context?.time_assumptions ? (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                Time assumptions: {(report.context as any).time_assumptions?.join(", ")}
              </div>
            ) : null}
        </WorkspaceResultCard>
      )}

      {activeTab === "analysis" && report && (
        <div className="space-y-6">
          <WorkspaceResultCard title="Comparison Table" contentClassName="overflow-auto">
              <table className="min-w-full text-xs">
                <thead className="text-left text-gray-500">
                  <tr>
                    <th className="p-2">Parameter</th>
                    <th className="p-2">Baseline Mean</th>
                    <th className="p-2">Experiment Mean</th>
                    <th className="p-2">Delta %</th>
                    <th className="p-2">Variance Change</th>
                    <th className="p-2">Test</th>
                    <th className="p-2">p-value</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2 font-medium">{String((row as any).parameter)}</td>
                      <td className="p-2">{String((row as any).baseline_mean ?? "")}</td>
                      <td className="p-2">{String((row as any).experiment_mean ?? "")}</td>
                      <td className="p-2">{String((row as any).delta_percent ?? "")}</td>
                      <td className="p-2">{String((row as any).variance_change ?? "")}</td>
                      <td className="p-2">{String((row as any).test_used ?? "")}</td>
                      <td className="p-2">{String((row as any).p_value ?? "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </WorkspaceResultCard>

          <WorkspaceResultCard title="Delta % Chart">
              <Button variant="outline" size="sm" className={workspaceToolbarButtonClassName} onClick={() => setShowDeltaChart((prev) => !prev)}>
                {showDeltaChart ? "Hide Chart" : "Show Chart"}
              </Button>
              {showDeltaChart && (
                <div className="h-80 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonRows}>
                      <XAxis dataKey="parameter" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="delta_percent" fill="#2563EB" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
          </WorkspaceResultCard>

          {report.plot_scripts?.length ? (
            <WorkspaceResultCard title="Plot Scripts" contentClassName="space-y-4">
                <select
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  value={activeScript}
                  onChange={(event) => setActiveScript(event.target.value)}
                >
                  {report.plot_scripts.map((script) => (
                    <option key={script.title} value={script.code}>
                      {script.title}
                    </option>
                  ))}
                </select>
                <textarea
                  value={activeScript}
                  onChange={(event) => setActiveScript(event.target.value)}
                  className="w-full min-h-[220px] text-xs font-mono whitespace-pre-wrap border rounded p-3"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className={workspaceToolbarButtonClassName}
                  onClick={async () => {
                    if (!activeScript.trim()) return;
                    setIsRunningScript(true);
                    setError(null);
                    try {
                      const result = await engineeringApi.runScript({ code: activeScript, timeout_sec: 30 });
                      setRunResult(result);
                    } catch (err: unknown) {
                      setError(getErrorMessage(err, "Script execution failed"));
                    } finally {
                      setIsRunningScript(false);
                    }
                  }}
                  disabled={isRunningScript}
                >
                  {isRunningScript ? "Running..." : "Run Script"}
                </Button>

                {runResult && (
                  <div className="space-y-2">
                    <pre className="text-xs whitespace-pre-wrap bg-gray-50 border rounded p-3">{runResult.stdout}</pre>
                    {runResult.stderr && (
                      <pre className="text-xs whitespace-pre-wrap bg-red-50 border border-red-200 rounded p-3">
                        {runResult.stderr}
                      </pre>
                    )}
                    {runResult.images?.length ? (
                      <div className="grid md:grid-cols-2 gap-3">
                        {runResult.images.map((image) => (
                          <img key={image.filename} src={image.data_uri} alt={image.filename} className="w-full" />
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
            </WorkspaceResultCard>
          ) : null}
        </div>
      )}

      {activeTab === "report" && report && (
        <WorkspaceResultCard title="DOE Validation Report" contentClassName="space-y-4 text-sm text-gray-700">
            <div>
              <strong>Report ID:</strong> {report.report_id}
            </div>
            <div>
              <strong>Created:</strong> {new Date(report.created_at).toLocaleString()}
            </div>
            <div>
              <strong>Recommendations:</strong> {report.recommendations?.length ? report.recommendations.join(", ") : "None"}
            </div>
        </WorkspaceResultCard>
      )}
    </div>
  );
}
