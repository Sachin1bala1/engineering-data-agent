import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AnalyzerCopilotPanel } from "@/components/engineering/AnalyzerCopilotPanel";
import { engineeringApi, getErrorMessage } from "@/lib/engineering-api";
import type { AnalyzerPlanResponse, AnalyzerReport, AnalyzerRunResponse } from "@/types/engineering-api";
import { PersistedResizableGroup } from "@/components/layout/PersistedResizableGroup";
import { ResizableHandle, ResizablePanel } from "@/components/ui/resizable";
import { WorkspaceActionBar } from "@/components/workspace/WorkspaceActionBar";
import { WorkspaceMetricChip } from "@/components/workspace/WorkspaceMetricChip";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";
import { WorkspaceFormFieldRow } from "@/components/workspace/WorkspaceFormFieldRow";
import { WorkspaceControlRow } from "@/components/workspace/WorkspaceControlRow";
import { workspaceToolbarButtonClassName, workspaceToolbarPrimaryButtonClassName } from "@/components/workspace/workspaceToolbarTokens";
import { savePendingRootCauseHandoff } from "@/lib/rootCauseHandoff";

type TabKey = "upload" | "results";

export function AnalyzerPanel() {
  const navigate = useNavigate();
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [analysisObjective, setAnalysisObjective] = useState("Identify the strongest root-cause signals and recommended next checks.");
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
  const [showPlanInternals, setShowPlanInternals] = useState(false);
  const [showResultInternals, setShowResultInternals] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 1024px)").matches;
  });

  const signalRows = useMemo(() => {
    if (!planResponse) return [];
    return Object.entries(planResponse.profile.signals).map(([name, profile]) => ({
      name,
      ...profile,
    }));
  }, [planResponse]);

  const sendToRootCause = () => {
    if (!report) {
      setError("Run the analyzer before sending findings to RCA.");
      return;
    }
    savePendingRootCauseHandoff({
      source: "analyzer",
      sourceLabel: "Analyzer",
      generatedAt: new Date().toISOString(),
      suggestedCaseName: `${datasetFile?.name || "analysis"} RCA`,
      suggestedStatus: "analysis",
      suggestedPriority: "high",
      draft: {
        title: analysisObjective,
        processArea: datasetFile?.name || "",
        symptom: report.explanation?.summary || analysisObjective,
        defectStatement: analysisObjective,
        businessImpact: (report.explanation?.conclusions || []).slice(0, 2).join(" | "),
        dataSources: [
          datasetFile?.name,
          report.explanation?.tests_used?.length ? `Tests: ${report.explanation.tests_used.join(", ")}` : "",
          report.explanation?.signals_used?.length ? `Signals: ${report.explanation.signals_used.join(", ")}` : "",
        ].filter(Boolean).join(" | "),
        evidenceSummary: [
          report.explanation?.summary,
          ...(report.explanation?.conclusions || []).slice(0, 3),
          ...(report.warnings || []).slice(0, 2).map((warning) => `Warning: ${warning}`),
        ].filter(Boolean).join(" | "),
        verifiedRootCause: (report.explanation?.conclusions || [])[0] || "",
        correctiveAction: (report.explanation?.limitations || []).length
          ? "Validate the strongest findings against the listed limitations before implementation."
          : "Review the strongest statistical drivers and confirm on the process.",
        monitoringMetric: report.explanation?.signals_used?.[0] || "",
      },
      suspectedCauses: report.explanation?.conclusions || [],
    });
    navigate("/analytics?tab=rootcause");
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktopLayout(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

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
      if (columnMapping.trim()) formData.append("column_mapping", columnMapping);
      if (defaultDate.trim()) formData.append("default_date", defaultDate);
      if (startDate.trim()) formData.append("start_date", startDate);
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
      if (columnMapping.trim()) formData.append("column_mapping", columnMapping);
      if (defaultDate.trim()) formData.append("default_date", defaultDate);
      if (startDate.trim()) formData.append("start_date", startDate);
      const response = await engineeringApi.runAnalyzer(formData);
      if (response.report_id) {
        const reportData = await engineeringApi.getAnalyzerReport(response.report_id);
        setReport(reportData);
        setRunResponse(response);
        setActiveTab("results");
      }
    } catch (err: unknown) {
      setRunResponse(null);
      setError(getErrorMessage(err, "Execution failed"));
    } finally {
      setIsRunning(false);
    }
  };

  const renderUploadFormCard = () => (
    <WorkspaceResultCard title="Dataset Upload" className="h-full" contentClassName="space-y-4">
      <WorkspaceFormFieldRow label="Objective" description="State the engineering question in plain language.">
        <textarea
          value={analysisObjective}
          onChange={(event) => setAnalysisObjective(event.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm min-h-[88px]"
        />
      </WorkspaceFormFieldRow>

      <WorkspaceFormFieldRow label="Dataset file">
        <input
          type="file"
          accept=".csv,.xls,.xlsx"
          onChange={(event) => setDatasetFile(event.target.files?.[0] ?? null)}
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

      <WorkspaceControlRow title="Plan generation">
        <div className="flex items-center gap-3">
          <Button className={workspaceToolbarPrimaryButtonClassName} onClick={handleGeneratePlan} disabled={isPlanning}>
            {isPlanning ? "Profiling..." : "Generate Analysis Plan"}
          </Button>
        </div>
      </WorkspaceControlRow>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {runResponse?.message && <div className="text-xs text-gray-500">{runResponse.message}</div>}
    </WorkspaceResultCard>
  );

  const renderUploadWorkspace = () => {
    if (!planResponse) return renderUploadFormCard();

    return (
      <PersistedResizableGroup
        storageKey="workspace.analyzer.upload.v1"
        direction="horizontal"
        defaultSizes={[45, 55]}
        minSizes={[28, 28]}
        enabled={isDesktopLayout}
        className="min-h-[980px]"
      >
        <ResizablePanel defaultSize={45} minSize={28}>
          <div className="min-h-0 min-w-0 pr-0 lg:pr-4">
            <PersistedResizableGroup
              storageKey="workspace.analyzer.upload.left.v1"
              direction="vertical"
              defaultSizes={showPlanInternals ? [24, 36, 40] : [100, 0, 0]}
              minSizes={showPlanInternals ? [18, 20, 20] : [100, 0, 0]}
              enabled={isDesktopLayout}
              className="min-h-[980px]"
            >
              <ResizablePanel defaultSize={24} minSize={18}>
                <div className="h-full overflow-auto pb-3">{renderUploadFormCard()}</div>
              </ResizablePanel>
              {showPlanInternals ? (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={36} minSize={20}>
                    <div className="h-full overflow-auto py-3">
                      <WorkspaceResultCard title="Dataset Preview" contentClassName="overflow-auto">
                          <table className="min-w-full text-xs">
                            <thead className="text-left text-gray-500">
                              <tr>
                                {Object.keys(planResponse.profile.preview_rows[0] || {}).map((key) => (
                                  <th key={key} className="p-2">{key}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {planResponse.profile.preview_rows.map((row, idx) => (
                                <tr key={idx} className="border-t">
                                  {Object.values(row).map((value, colIdx) => (
                                    <td key={colIdx} className="p-2">{String(value)}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                      </WorkspaceResultCard>
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={40} minSize={20}>
                    <div className="h-full overflow-auto pt-3">
                      <WorkspaceResultCard title="Column Typing" contentClassName="overflow-auto">
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
                      </WorkspaceResultCard>
                    </div>
                  </ResizablePanel>
                </>
              ) : null}
            </PersistedResizableGroup>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={55} minSize={28}>
          <div className="min-h-0 min-w-0 pl-0 lg:pl-4">
            <PersistedResizableGroup
              storageKey="workspace.analyzer.upload.right.v1"
              direction="vertical"
              defaultSizes={showPlanInternals ? [65, 35] : [100, 0]}
              minSizes={showPlanInternals ? [24, 18] : [100, 0]}
              enabled={isDesktopLayout}
              className="min-h-[980px]"
            >
              <ResizablePanel defaultSize={65} minSize={24}>
                <div className="h-full overflow-auto pb-3">
                  <WorkspaceResultCard title="Analysis Plan Draft" contentClassName="space-y-3">
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
                        <Button className={workspaceToolbarPrimaryButtonClassName} onClick={handleRun} disabled={isRunning || !planApproved}>
                          {isRunning ? "Running..." : "Run Analysis"}
                        </Button>
                      </div>
                  </WorkspaceResultCard>
                </div>
              </ResizablePanel>
              {showPlanInternals ? (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={35} minSize={18}>
                    <div className="h-full overflow-auto pt-3">
                      <WorkspaceResultCard title="Refine Plan with AI" contentClassName="space-y-3">
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
                      ) : (
                        <div className="text-sm text-gray-500">No revision chat yet.</div>
                      )}
                      </WorkspaceResultCard>
                    </div>
                  </ResizablePanel>
                </>
              ) : null}
            </PersistedResizableGroup>
          </div>
        </ResizablePanel>
      </PersistedResizableGroup>
    );
  };

  const renderResultsWorkspace = () => {
    if (!report) return null;
    return (
      <PersistedResizableGroup
        storageKey="workspace.analyzer.results.v1"
        direction="horizontal"
        defaultSizes={[68, 32]}
        minSizes={[35, 18]}
        enabled={isDesktopLayout}
        className="min-h-[1000px]"
      >
        <ResizablePanel defaultSize={68} minSize={35}>
          <div className="min-h-0 min-w-0 pr-0 lg:pr-4">
            <PersistedResizableGroup
              storageKey="workspace.analyzer.results.left.v1"
              direction="vertical"
              defaultSizes={showResultInternals ? [16, 28, 30, 26] : [100, 0, 0, 0]}
              minSizes={showResultInternals ? [14, 18, 18, 18] : [100, 0, 0, 0]}
              enabled={isDesktopLayout}
              className="min-h-[1000px]"
            >
              <ResizablePanel defaultSize={16} minSize={14}>
                <div className="h-full overflow-auto pb-3">
                  <WorkspaceResultCard title="Analysis Report" contentClassName="space-y-3 text-sm text-gray-700">
                      <div><strong>Report ID:</strong> {report.report_id}</div>
                      <div><strong>Created:</strong> {new Date(report.created_at).toLocaleString()}</div>
                      <div><strong>Warnings:</strong> {report.warnings?.length ? report.warnings.join(", ") : "None"}</div>
                      <div><strong>Assumptions:</strong> {report.assumptions?.length ? report.assumptions.join(", ") : "None"}</div>
                  </WorkspaceResultCard>
                </div>
              </ResizablePanel>
              {showResultInternals ? (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={28} minSize={18}>
                    <div className="h-full overflow-auto py-3">
                      <WorkspaceResultCard title="Statistical Measurements" contentClassName="overflow-auto">
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
                      </WorkspaceResultCard>
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={30} minSize={18}>
                    <div className="h-full overflow-auto pt-3 pb-3">
                      <WorkspaceResultCard title="Generated Charts" contentClassName="space-y-4">
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
                      </WorkspaceResultCard>
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={26} minSize={18}>
                    <div className="h-full overflow-auto pt-3">
                      <WorkspaceResultCard title="AI Explanation" contentClassName="space-y-2 text-sm text-gray-700">
                      <div><strong>Summary:</strong> {report.explanation?.summary || "N/A"}</div>
                      <div><strong>Conclusions:</strong> {(report.explanation?.conclusions || []).join(" | ") || "N/A"}</div>
                      <div><strong>Limitations:</strong> {(report.explanation?.limitations || []).join(" | ") || "N/A"}</div>
                      <div><strong>Tests Used:</strong> {(report.explanation?.tests_used || []).join(", ") || "N/A"}</div>
                      <div><strong>Signals Used:</strong> {(report.explanation?.signals_used || []).join(", ") || "N/A"}</div>
                      </WorkspaceResultCard>
                    </div>
                  </ResizablePanel>
                </>
              ) : null}
            </PersistedResizableGroup>
          </div>
        </ResizablePanel>
        {showResultInternals ? (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={32} minSize={18}>
              <div className="min-h-0 min-w-0 pl-0 lg:pl-4">
                <AnalyzerCopilotPanel report={report} />
              </div>
            </ResizablePanel>
          </>
        ) : null}
      </PersistedResizableGroup>
    );
  };

  return (
    <div className="space-y-6">
      <WorkspaceActionBar
        title="Analyzer Workspace"
        description="Prepare a root-cause analysis plan, review it in plain language, and then run the deeper statistics only when you are ready."
        metrics={
          <>
            <WorkspaceMetricChip label="Dataset" value={datasetFile?.name || "Not loaded"} />
            <WorkspaceMetricChip label="Plan" value={planResponse ? "Generated" : "Not generated"} />
            <WorkspaceMetricChip label="Results" value={report ? "Available" : "Not run"} />
          </>
        }
        actions={
          <>
            <Button
              variant={activeTab === "upload" ? "default" : "outline"}
              size="sm"
              className={activeTab === "upload" ? workspaceToolbarPrimaryButtonClassName : workspaceToolbarButtonClassName}
              onClick={() => setActiveTab("upload")}
            >
              Dataset Upload
            </Button>
            <Button
              variant={activeTab === "results" ? "default" : "outline"}
              size="sm"
              className={activeTab === "results" ? workspaceToolbarPrimaryButtonClassName : workspaceToolbarButtonClassName}
              onClick={() => setActiveTab("results")}
              disabled={!report}
            >
              Results Panel
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={workspaceToolbarButtonClassName}
              onClick={() => {
                if (activeTab === "upload") setShowPlanInternals((current) => !current);
                if (activeTab === "results") setShowResultInternals((current) => !current);
              }}
              disabled={activeTab === "upload" ? !planResponse : !report}
            >
              {activeTab === "upload"
                ? showPlanInternals ? "Hide Technical Preview" : "Show Technical Preview"
                : showResultInternals ? "Hide Statistical Detail" : "Show Statistical Detail"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={workspaceToolbarButtonClassName}
              onClick={sendToRootCause}
              disabled={!report}
            >
              Open in RCA
            </Button>
          </>
        }
      />

      <WorkspaceResultCard title="Demo Steps" contentClassName="grid gap-3 md:grid-cols-4 text-sm">
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">1. State the issue</div>
          <div className="mt-2">Write the engineering question in the objective box before generating the plan.</div>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">2. Generate the plan</div>
          <div className="mt-2">Let the profiler inspect signal types, missingness, and candidate tests.</div>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">3. Approve and run</div>
          <div className="mt-2">Only approve after the plan matches the real manufacturing question.</div>
        </div>
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-xs uppercase tracking-wide text-emerald-700">4. Use results for RCA</div>
          <div className="mt-2">Treat the summary and top charts as the root-cause handoff before opening technical detail.</div>
        </div>
      </WorkspaceResultCard>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Objective</div>
          <div className="mt-2 text-sm font-medium leading-6 text-gray-900">{analysisObjective}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">Next Step</div>
          <div className="mt-2 text-sm font-medium leading-6 text-gray-900">
            {planResponse ? (planApproved ? "Run the approved plan." : "Review and approve the draft plan.") : "Load a dataset and generate a plan."}
          </div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-xs uppercase tracking-wide text-emerald-700">Readout</div>
          <div className="mt-2 text-sm font-medium leading-6 text-emerald-900">
            {report ? (report.explanation?.summary || "Results are ready for review.") : "The first screen stays focused on planning rather than raw statistics."}
          </div>
        </div>
      </div>

      {planResponse && activeTab === "upload" && (
        <WorkspaceResultCard title="Plan Summary" contentClassName="space-y-3 text-sm text-gray-700">
          <div>
            The current plan is built to answer: <strong>{analysisObjective}</strong>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Preview rows</div>
              <div className="mt-1 text-lg font-semibold">{planResponse.profile.preview_rows.length}</div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Signals profiled</div>
              <div className="mt-1 text-lg font-semibold">{signalRows.length}</div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Plan status</div>
              <div className="mt-1 text-lg font-semibold">{planApproved ? "Approved" : "Needs review"}</div>
            </div>
          </div>
        </WorkspaceResultCard>
      )}

      {activeTab === "upload" && renderUploadWorkspace()}
      {activeTab === "results" && report && (
        <div className="space-y-4">
          <WorkspaceResultCard title="Results Summary" contentClassName="grid gap-3 md:grid-cols-3 text-sm text-gray-700">
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Summary</div>
              <div className="mt-2">{report.explanation?.summary || "No summary available."}</div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Conclusions</div>
              <div className="mt-2">{(report.explanation?.conclusions || []).slice(0, 2).join(" | ") || "No conclusions yet."}</div>
            </div>
            <div className="rounded-md border bg-emerald-50 border-emerald-200 p-3">
              <div className="text-xs uppercase tracking-wide text-emerald-700">Recommended next action</div>
              <div className="mt-2">{(report.explanation?.limitations || []).length ? "Validate the strongest findings against the noted limitations." : "Review the top charts and move to implementation checks."}</div>
            </div>
          </WorkspaceResultCard>
          <div className="flex justify-end">
            <Button variant="outline" className={workspaceToolbarButtonClassName} onClick={sendToRootCause}>
              Create RCA case from analyzer findings
            </Button>
          </div>
          {renderResultsWorkspace()}
        </div>
      )}
    </div>
  );
}
