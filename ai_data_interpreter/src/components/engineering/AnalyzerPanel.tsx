import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnalyzerCopilotPanel } from "@/components/engineering/AnalyzerCopilotPanel";
import { engineeringApi, getErrorMessage } from "@/lib/engineering-api";
import type { AnalyzerPlanResponse, AnalyzerReport, AnalyzerRunResponse } from "@/types/engineering-api";

type TabKey = "upload" | "results";

export function AnalyzerPanel() {
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [columnMapping, setColumnMapping] = useState("{}");
  const [defaultDate, setDefaultDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [planResponse, setPlanResponse] = useState<AnalyzerPlanResponse | null>(null);
  const [planDraft, setPlanDraft] = useState("");
  const [report, setReport] = useState<AnalyzerReport | null>(null);
  const [runResponse, setRunResponse] = useState<AnalyzerRunResponse | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("upload");
  const [planApproved, setPlanApproved] = useState(false);
  const [planChatInput, setPlanChatInput] = useState("");
  const [planChat, setPlanChat] = useState<Array<{ role: "user" | "ai"; content: string }>>([]);
  const [isRevisingPlan, setIsRevisingPlan] = useState(false);

  const signalRows = useMemo(() => {
    if (!planResponse) return [];
    return Object.entries(planResponse.profile.signals).map(([name, profile]) => ({
      name,
      ...profile,
    }));
  }, [planResponse]);

  const handleGeneratePlan = async () => {
    if (!datasetFile) {
      setError("Dataset file is required.");
      return;
    }
    setError(null);
    setIsPlanning(true);
    try {
      const formData = new FormData();
      formData.append("dataset_file", datasetFile, datasetFile.name);
      if (columnMapping.trim()) {
        formData.append("column_mapping", columnMapping);
      }
      if (defaultDate.trim()) {
        formData.append("default_date", defaultDate);
      }
      if (startDate.trim()) {
        formData.append("start_date", startDate);
      }
      const response = await engineeringApi.getAnalyzerPlan(formData);
      setPlanResponse(response);
      setPlanDraft(JSON.stringify(response.plan, null, 2));
      setPlanApproved(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Plan generation failed"));
    } finally {
      setIsPlanning(false);
    }
  };

  const handleRun = async () => {
    if (!datasetFile || !planDraft.trim()) {
      setError("Dataset file and approved plan are required.");
      return;
    }
    if (!planApproved) {
      setError("Approve the plan before running.");
      return;
    }
    setError(null);
    setIsRunning(true);
    try {
      const formData = new FormData();
      formData.append("dataset_file", datasetFile, datasetFile.name);
      formData.append("plan_json", planDraft);
      if (columnMapping.trim()) {
        formData.append("column_mapping", columnMapping);
      }
      if (defaultDate.trim()) {
        formData.append("default_date", defaultDate);
      }
      if (startDate.trim()) {
        formData.append("start_date", startDate);
      }
      const response = await engineeringApi.runAnalyzer(formData);
      setRunResponse(response);
      if (response.report_id) {
        const reportData = await engineeringApi.getAnalyzerReport(response.report_id);
        setReport(reportData);
        setActiveTab("results");
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Execution failed"));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Button
          variant={activeTab === "upload" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("upload")}
        >
          Dataset Upload
        </Button>
        <Button
          variant={activeTab === "results" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("results")}
          disabled={!report}
        >
          Results Panel
        </Button>
      </div>

      {activeTab === "upload" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Dataset Upload</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                type="file"
                accept=".csv,.xls,.xlsx"
                onChange={(event) => setDatasetFile(event.target.files?.[0] ?? null)}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-xs text-gray-500">Column mapping (JSON)</div>
                  <textarea
                    value={columnMapping}
                    onChange={(event) => setColumnMapping(event.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-xs font-mono min-h-[120px]"
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-gray-500">Time normalization</div>
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
                  <div className="text-xs text-gray-500">Use for time-only or relative timestamps.</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={handleGeneratePlan} disabled={isPlanning}>
                  {isPlanning ? "Profiling..." : "Generate Analysis Plan"}
                </Button>
              </div>

              {error && <div className="text-sm text-red-600">{error}</div>}
              {runResponse?.message && <div className="text-xs text-gray-500">{runResponse.message}</div>}
            </CardContent>
          </Card>

          {planResponse && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Dataset Preview</CardTitle>
                </CardHeader>
                <CardContent className="overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead className="text-left text-gray-500">
                      <tr>
                        {Object.keys(planResponse.profile.preview_rows[0] || {}).map((key) => (
                          <th key={key} className="p-2">
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {planResponse.profile.preview_rows.map((row, idx) => (
                        <tr key={idx} className="border-t">
                          {Object.values(row).map((value, colIdx) => (
                            <td key={colIdx} className="p-2">
                              {String(value)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Column Typing</CardTitle>
                </CardHeader>
                <CardContent className="overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead className="text-left text-gray-500">
                      <tr>
                        <th className="p-2">Signal</th>
                        <th className="p-2">Type</th>
                        <th className="p-2">Rows</th>
                        <th className="p-2">Missing %</th>
                        <th className="p-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {signalRows.map((signal) => (
                        <tr key={signal.name} className="border-t">
                          <td className="p-2 font-medium">{signal.name}</td>
                          <td className="p-2">{String((signal as any).type ?? "")}</td>
                          <td className="p-2">{String((signal as any).rows ?? "")}</td>
                          <td className="p-2">{String((signal as any).missing_percent ?? "")}</td>
                          <td className="p-2 text-gray-500">{String((signal as any).notes ?? "")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Analysis Plan Draft</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <textarea
                    value={planDraft}
                    onChange={(event) => {
                      setPlanDraft(event.target.value);
                      setPlanApproved(false);
                    }}
                    className="w-full min-h-[240px] text-xs font-mono whitespace-pre-wrap border rounded p-3"
                  />
                  <div className="flex items-center gap-3">
                    <label className="text-sm flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={planApproved}
                        onChange={(event) => setPlanApproved(event.target.checked)}
                      />
                      Approve plan
                    </label>
                    <Button onClick={handleRun} disabled={isRunning || !planApproved}>
                      {isRunning ? "Running..." : "Run Analysis"}
                    </Button>
                  </div>
                  <div className="border rounded p-3 space-y-3">
                    <div className="text-sm font-medium">Refine Plan with AI</div>
                    <div className="text-xs text-gray-500">
                      Ask for changes like: "Use only valid tests for this dataset", "Prioritize time-series checks", or "Drop tests needing categories".
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={planChatInput}
                        onChange={(event) => setPlanChatInput(event.target.value)}
                        className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
                        placeholder="Tell AI how to revise the plan..."
                      />
                      <Button
                        variant="outline"
                        onClick={async () => {
                          if (!planResponse || !planChatInput.trim()) return;
                          const instruction = planChatInput.trim();
                          setPlanChat((prev) => [...prev, { role: "user", content: instruction }]);
                          setPlanChatInput("");
                          setIsRevisingPlan(true);
                          setError(null);
                          try {
                            const revised = await engineeringApi.reviseAnalyzerPlan({
                              profile: planResponse.profile as Record<string, unknown>,
                              current_plan: JSON.parse(planDraft || "{}"),
                              instruction,
                              history: planChat.map((m) => ({ role: m.role, content: m.content })),
                            });
                            setPlanDraft(JSON.stringify(revised.plan, null, 2));
                            setPlanApproved(false);
                            setPlanChat((prev) => [
                              ...prev,
                              { role: "ai", content: "Plan updated. Review the draft and approve when ready." },
                            ]);
                          } catch (err: unknown) {
                            const msg = getErrorMessage(err, "Plan revision failed");
                            setError(msg);
                            setPlanChat((prev) => [...prev, { role: "ai", content: `Revision failed: ${msg}` }]);
                          } finally {
                            setIsRevisingPlan(false);
                          }
                        }}
                        disabled={isRevisingPlan || !planChatInput.trim()}
                      >
                        {isRevisingPlan ? "Revising..." : "Revise"}
                      </Button>
                    </div>
                    {planChat.length > 0 ? (
                      <div className="space-y-2 max-h-52 overflow-auto">
                        {planChat.map((message, idx) => (
                          <div key={idx} className={`text-sm rounded p-2 ${message.role === "user" ? "bg-gray-100" : "bg-blue-50"}`}>
                            <div className="text-xs text-gray-500 mb-1">{message.role === "user" ? "You" : "AI"}</div>
                            <div>{message.content}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {activeTab === "results" && report && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Analysis Report</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-700">
              <div>
                <strong>Report ID:</strong> {report.report_id}
              </div>
              <div>
                <strong>Created:</strong> {new Date(report.created_at).toLocaleString()}
              </div>
              <div>
                <strong>Warnings:</strong> {report.warnings?.length ? report.warnings.join(", ") : "None"}
              </div>
              <div>
                <strong>Assumptions:</strong> {report.assumptions?.length ? report.assumptions.join(", ") : "None"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Statistical Measurements</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto">
              <table className="min-w-full text-xs">
                <thead className="text-left text-gray-500">
                  <tr>
                    <th className="p-2">Signal</th>
                    <th className="p-2">Mean</th>
                    <th className="p-2">Std</th>
                    <th className="p-2">Median</th>
                    <th className="p-2">Min</th>
                    <th className="p-2">Max</th>
                    <th className="p-2">Test Metrics</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.results?.statistics || {}).map(([signalName, stat]) => (
                    <tr key={signalName} className="border-t">
                      <td className="p-2 font-medium">{signalName}</td>
                      <td className="p-2">{stat.mean ?? "N/A"}</td>
                      <td className="p-2">{stat.std ?? "N/A"}</td>
                      <td className="p-2">{stat.median ?? "N/A"}</td>
                      <td className="p-2">{stat.min ?? "N/A"}</td>
                      <td className="p-2">{stat.max ?? "N/A"}</td>
                      <td className="p-2 text-[11px]">
                        {stat.p_values ? Object.entries(stat.p_values).map(([k, v]) => `${k}: ${v}`).join(" | ") : "N/A"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Generated Charts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(report.results?.plots || []).length ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {(report.results?.plots || []).map((plot, idx) => (
                    <div key={`${plot.title}-${idx}`} className="space-y-2">
                      <div className="text-xs text-gray-500">{plot.title}</div>
                      <img src={plot.data_uri} alt={plot.title} className="w-full border rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No chart artifacts were generated for this run.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI Explanation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-gray-700">
              <div><strong>Summary:</strong> {report.explanation?.summary || "N/A"}</div>
              <div><strong>Conclusions:</strong> {(report.explanation?.conclusions || []).join(" | ") || "N/A"}</div>
              <div><strong>Limitations:</strong> {(report.explanation?.limitations || []).join(" | ") || "N/A"}</div>
              <div><strong>Tests Used:</strong> {(report.explanation?.tests_used || []).join(", ") || "N/A"}</div>
              <div><strong>Signals Used:</strong> {(report.explanation?.signals_used || []).join(", ") || "N/A"}</div>
            </CardContent>
          </Card>

          <AnalyzerCopilotPanel report={report} />
        </div>
      )}
    </div>
  );
}
