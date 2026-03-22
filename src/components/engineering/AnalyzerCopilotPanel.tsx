import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  AnalyzerReport,
  AnalyzerCopilotContextResponse,
  CopilotQueryResponse,
  CopilotStatusResponse,
  ScriptRunResponse,
} from "@/types/engineering-api";
import { engineeringApi, getErrorMessage } from "@/lib/engineering-api";
import { PersistedResizableGroup } from "@/components/layout/PersistedResizableGroup";
import { ResizableHandle, ResizablePanel } from "@/components/ui/resizable";
import { WorkspaceMetricChip } from "@/components/workspace/WorkspaceMetricChip";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";
import { workspaceToolbarButtonClassName, workspaceToolbarInputClassName, workspaceToolbarPrimaryButtonClassName, workspaceToolbarSelectClassName } from "@/components/workspace/workspaceToolbarTokens";

interface AnalyzerCopilotPanelProps {
  report: AnalyzerReport;
}

interface CopilotMessage {
  role: string;
  question: string;
  summary: string;
}

const roles = [
  { value: "operator", label: "Operator" },
  { value: "technician", label: "Maintenance Technician" },
  { value: "engineer", label: "Reliability Engineer" },
];

export function AnalyzerCopilotPanel({ report }: AnalyzerCopilotPanelProps) {
  const [role, setRole] = useState("engineer");
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<CopilotQueryResponse | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<CopilotStatusResponse | null>(null);
  const [isRefreshingModel, setIsRefreshingModel] = useState(false);
  const [isSyncingContext, setIsSyncingContext] = useState(false);
  const [contextInfo, setContextInfo] = useState<AnalyzerCopilotContextResponse | null>(null);
  const [scriptDraft, setScriptDraft] = useState("");
  const [runResult, setRunResult] = useState<ScriptRunResponse | null>(null);
  const [isRunningScript, setIsRunningScript] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  const [sessionId] = useState(() => {
    const existing = localStorage.getItem("analysis_copilot_session_id");
    if (existing) return existing;
    const created = `analysis_session_${Date.now()}`;
    localStorage.setItem("analysis_copilot_session_id", created);
    return created;
  });

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const result = await engineeringApi.getAnalyzerCopilotStatus();
        setStatus(result);
      } catch (err: unknown) {
        console.error("Analyzer copilot status error:", err);
      }
    };

    void loadStatus();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktopLayout(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    setMessages([]);
    setResponse(null);
    setError(null);
    const sync = async () => {
      setIsSyncingContext(true);
      try {
        const result = await engineeringApi.getAnalyzerCopilotContext(report.report_id, sessionId);
        setContextInfo(result);
      } catch (err: unknown) {
        setError(getErrorMessage(err, "Failed to load analyzer context"));
      } finally {
        setIsSyncingContext(false);
      }
    };

    if (report?.report_id) {
      void sync();
    }
  }, [report?.report_id, sessionId]);

  const handleRefreshModel = async () => {
    setIsRefreshingModel(true);
    try {
      const result = await engineeringApi.refreshAnalyzerCopilotModel();
      setStatus((prev) => ({
        llm_enabled: prev?.llm_enabled ?? true,
        model: result.model,
      }));
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to refresh model"));
    } finally {
      setIsRefreshingModel(false);
    }
  };

  const handleSubmit = async () => {
    if (!question.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await engineeringApi.queryAnalyzerCopilot({
        report_id: report.report_id,
        question,
        role,
        session_id: sessionId,
      });
      setResponse(result);
      setMessages((prev) => [...prev, { role, question, summary: result.summary }]);
      if (result.python_script) {
        setScriptDraft(result.python_script);
        setRunResult(null);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Analyzer copilot request failed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSession = async () => {
    setError(null);
    try {
      await engineeringApi.resetAnalyzerCopilotSession(sessionId);
      setMessages([]);
      setResponse(null);
      setScriptDraft("");
      setRunResult(null);
      if (report?.report_id) {
        const result = await engineeringApi.getAnalyzerCopilotContext(report.report_id, sessionId);
        setContextInfo(result);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to reset session"));
    }
  };

  return (
    <WorkspaceResultCard
      title="Engineering Copilot"
      contentClassName="min-h-0"
      actions={status ? <WorkspaceMetricChip label="LLM" value={status.llm_enabled ? status.model ?? "enabled" : "disabled"} /> : undefined}
      className="h-full"
    >
        <PersistedResizableGroup
          storageKey="workspace.analyzer.copilot.v1"
          direction="vertical"
          defaultSizes={[22, 40, 38]}
          minSizes={[18, 20, 18]}
          enabled={isDesktopLayout}
          className="min-h-[820px]"
        >
          <ResizablePanel defaultSize={22} minSize={18}>
            <div className="h-full overflow-auto space-y-4 pr-1">
              {status && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                  <span>
                    Copilot LLM: {status.llm_enabled ? `enabled (${status.model ?? "resolving"})` : "disabled"}
                  </span>
                  {status.llm_enabled && (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className={workspaceToolbarButtonClassName} onClick={handleRefreshModel} disabled={isRefreshingModel}>
                        {isRefreshingModel ? "Refreshing..." : "Refresh Model"}
                      </Button>
                      <Button variant="outline" size="sm" className={workspaceToolbarButtonClassName} onClick={handleResetSession}>
                        New Session
                      </Button>
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <WorkspaceMetricChip label="Report" value={report.report_id} />
                <WorkspaceMetricChip label="Created" value={new Date(report.created_at).toLocaleString()} />
                <WorkspaceMetricChip label="Context" value={isSyncingContext ? "Syncing" : "Ready"} />
              </div>
              <div className="flex flex-col gap-3">
                <select value={role} onChange={(event) => setRole(event.target.value)} className={`border border-gray-300 bg-white ${workspaceToolbarSelectClassName}`}>
                  {roles.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ask about the analysis results or validation."
                  className={`flex-1 border border-gray-300 ${workspaceToolbarInputClassName}`}
                />
                <Button className={workspaceToolbarPrimaryButtonClassName} onClick={handleSubmit} disabled={isLoading || !question.trim()}>
                  {isLoading ? "Analyzing..." : "Ask"}
                </Button>
              </div>
              {error && <div className="text-sm text-red-600">{error}</div>}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={40} minSize={20}>
            <WorkspaceResultCard title="Copilot Summary" className="h-full" contentClassName="space-y-3">
              {response ? (
                <>
                  <div className="font-medium text-gray-900">Summary</div>
                  <div className="text-sm whitespace-pre-wrap break-words">{response.summary}</div>
                  {response.llm_used !== undefined && (
                    <div className="text-xs text-gray-500">Response source: {response.llm_used ? "Gemini LLM" : "Deterministic fallback"}</div>
                  )}
                  <div className="space-y-2">
                    <div className="font-medium text-gray-900">Python Script</div>
                    <textarea
                      value={scriptDraft}
                      onChange={(event) => setScriptDraft(event.target.value)}
                      className="w-full min-h-[220px] text-xs font-mono whitespace-pre-wrap bg-gray-50 border rounded p-3"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className={workspaceToolbarButtonClassName}
                      onClick={async () => {
                        if (!scriptDraft.trim()) return;
                        setIsRunningScript(true);
                        setError(null);
                        try {
                          const result = await engineeringApi.runScript({ code: scriptDraft, timeout_sec: 20 });
                          setRunResult(result);
                        } catch (err: unknown) {
                          setError(getErrorMessage(err, "Script execution failed"));
                        } finally {
                          setIsRunningScript(false);
                        }
                      }}
                      disabled={isRunningScript || !scriptDraft.trim()}
                    >
                      {isRunningScript ? "Running..." : "Run Script"}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-500">Ask a question to generate analysis guidance and optional Python code.</div>
              )}
            </WorkspaceResultCard>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={38} minSize={18}>
            <WorkspaceResultCard title="Script Output" className="h-full" contentClassName="space-y-3">
              {runResult ? (
                <>
                  <pre className="text-xs whitespace-pre-wrap bg-gray-50 border rounded p-3">{runResult.stdout}</pre>
                  {runResult.stderr && (
                    <pre className="text-xs whitespace-pre-wrap bg-red-50 border border-red-200 rounded p-3">{runResult.stderr}</pre>
                  )}
                  {runResult.images?.length ? (
                    <div className="grid md:grid-cols-2 gap-3">
                      {runResult.images.map((image) => (
                        <img key={image.filename} src={image.data_uri} alt={image.filename} className="w-full" />
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="text-sm text-gray-500">No script output yet.</div>
              )}
              {contextInfo && (
                <details className="text-xs text-gray-500">
                  <summary className="cursor-pointer">Context Snapshot</summary>
                  <pre className="mt-2 bg-gray-50 border rounded p-3 whitespace-pre-wrap">{JSON.stringify(contextInfo, null, 2)}</pre>
                </details>
              )}
              {messages.length > 0 && (
                <div className="space-y-2 text-sm text-gray-700">
                  <div className="font-medium text-gray-900">Conversation Log</div>
                  <div className="space-y-3">
                    {messages.map((item, index) => (
                      <div key={index} className="border rounded p-3 bg-gray-50">
                        <div className="text-xs text-gray-500">{item.role}</div>
                        <div className="font-medium">{item.question}</div>
                        <div className="text-sm whitespace-pre-wrap break-words">{item.summary}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </WorkspaceResultCard>
          </ResizablePanel>
        </PersistedResizableGroup>
    </WorkspaceResultCard>
  );
}
