import React, { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import type {
  AnalyzerReport,
  AnalyzerCopilotContextResponse,
  CopilotQueryResponse,
  CopilotStatusResponse,
  ScriptRunResponse,
} from '../types/api';
import { apiClient, getErrorMessage } from '../lib/api';

interface AnalyzerCopilotPanelProps {
  report: AnalyzerReport;
}

interface CopilotMessage {
  role: string;
  question: string;
  summary: string;
}

const roles = [
  { value: 'operator', label: 'Operator' },
  { value: 'technician', label: 'Maintenance Technician' },
  { value: 'engineer', label: 'Reliability Engineer' },
];

export function AnalyzerCopilotPanel({ report }: AnalyzerCopilotPanelProps) {
  const [role, setRole] = useState('engineer');
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState<CopilotQueryResponse | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<CopilotStatusResponse | null>(null);
  const [isRefreshingModel, setIsRefreshingModel] = useState(false);
  const [isSyncingContext, setIsSyncingContext] = useState(false);
  const [contextInfo, setContextInfo] = useState<AnalyzerCopilotContextResponse | null>(null);
  const [scriptDraft, setScriptDraft] = useState('');
  const [runResult, setRunResult] = useState<ScriptRunResponse | null>(null);
  const [isRunningScript, setIsRunningScript] = useState(false);
  const [sessionId] = useState(() => {
    const existing = localStorage.getItem('analyzer_copilot_session_id');
    if (existing) return existing;
    const created = `analyzer_session_${Date.now()}`;
    localStorage.setItem('analyzer_copilot_session_id', created);
    return created;
  });

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const result = await apiClient.getAnalyzerCopilotStatus();
        setStatus(result);
      } catch (err: unknown) {
        console.error('Analyzer copilot status error:', err);
      }
    };

    loadStatus();
  }, []);

  useEffect(() => {
    setMessages([]);
    setResponse(null);
    setError(null);
    const sync = async () => {
      setIsSyncingContext(true);
      try {
        const result = await apiClient.getAnalyzerCopilotContext(report.report_id, sessionId);
        setContextInfo(result);
      } catch (err: unknown) {
        setError(getErrorMessage(err, 'Failed to load analyzer context'));
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
      const result = await apiClient.refreshAnalyzerCopilotModel();
      setStatus((prev) => ({
        llm_enabled: prev?.llm_enabled ?? true,
        model: result.model,
      }));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to refresh model'));
    } finally {
      setIsRefreshingModel(false);
    }
  };

  const handleSubmit = async () => {
    if (!question.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await apiClient.queryAnalyzerCopilot({
        report_id: report.report_id,
        question,
        role,
        session_id: sessionId,
      });
      setResponse(result);
      setMessages((prev) => [
        ...prev,
        {
          role,
          question,
          summary: result.summary,
        },
      ]);
      if (result.python_script) {
        setScriptDraft(result.python_script);
        setRunResult(null);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Analyzer copilot request failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSession = async () => {
    setError(null);
    try {
      await apiClient.resetAnalyzerCopilotSession(sessionId);
      setMessages([]);
      setResponse(null);
      setScriptDraft('');
      setRunResult(null);
      if (report?.report_id) {
        const result = await apiClient.getAnalyzerCopilotContext(report.report_id, sessionId);
        setContextInfo(result);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to reset session'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Engineering Copilot (Analyzer)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span>
              Copilot LLM: {status.llm_enabled ? `enabled (${status.model ?? 'resolving'})` : 'disabled'}
            </span>
            {status.llm_enabled && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleRefreshModel} disabled={isRefreshingModel}>
                  {isRefreshingModel ? 'Refreshing...' : 'Refresh Model'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleResetSession}>
                  New Session
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="text-xs text-gray-500 flex flex-wrap items-center gap-2">
          <span>Report: {report.report_id}</span>
          <span>Created: {new Date(report.created_at).toLocaleString()}</span>
          <span>Signals: {Object.keys(report.profile.signals).length}</span>
          <span>{isSyncingContext ? 'Syncing data snapshot...' : 'Data snapshot ready'}</span>
        </div>

        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
          >
            {roles.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask about the analyzer results: e.g., Which signal looks unstable?"
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <Button onClick={handleSubmit} disabled={isLoading || !question.trim()}>
            {isLoading ? 'Analyzing...' : 'Ask'}
          </Button>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        {response && (
          <div className="space-y-3 text-sm text-gray-700">
            <div className="font-medium text-gray-900">Summary</div>
            <div>{response.summary}</div>

            {response.llm_used !== undefined && (
              <div className="text-xs text-gray-500">
                Response source: {response.llm_used ? 'Gemini LLM' : 'Deterministic fallback'}
              </div>
            )}

            {response.python_script && (
              <div className="space-y-2">
                <div className="font-medium text-gray-900">Python Script</div>
                <textarea
                  value={scriptDraft}
                  onChange={(event) => setScriptDraft(event.target.value)}
                  className="w-full min-h-[220px] text-xs font-mono whitespace-pre-wrap bg-gray-50 border rounded p-3"
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!scriptDraft.trim()) return;
                      setIsRunningScript(true);
                      setError(null);
                      try {
                        const result = await apiClient.runScript({ code: scriptDraft, timeout_sec: 20 });
                        setRunResult(result);
                      } catch (err: unknown) {
                        setError(getErrorMessage(err, 'Script execution failed'));
                      } finally {
                        setIsRunningScript(false);
                      }
                    }}
                    disabled={isRunningScript || !scriptDraft.trim()}
                  >
                    {isRunningScript ? 'Running...' : 'Run Script'}
                  </Button>
                  <span className="text-xs text-gray-500">Runs in backend script runner.</span>
                </div>
              </div>
            )}

            {runResult && (
              <div className="space-y-2 text-xs text-gray-700">
                <div className="font-medium text-gray-900 text-sm">Run Output</div>
                {runResult.stdout && (
                  <pre className="whitespace-pre-wrap bg-gray-50 border rounded p-3">{runResult.stdout}</pre>
                )}
                {runResult.stderr && (
                  <pre className="whitespace-pre-wrap bg-red-50 border border-red-200 rounded p-3">
                    {runResult.stderr}
                  </pre>
                )}
                {runResult.images.length > 0 && (
                  <div className="space-y-2">
                    {runResult.images.map((image) => (
                      <div key={image.filename} className="space-y-1">
                        <div className="text-[11px] text-gray-500">{image.filename}</div>
                        <img src={image.data_uri} alt={image.filename} className="border rounded" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="font-medium text-gray-900">Evidence Used</div>
            <ul className="list-disc ml-5 space-y-1">
              {response.evidence_used.map((item, idx) => (
                <li key={idx}>{item.source}: {item.detail}</li>
              ))}
            </ul>

            <div className="font-medium text-gray-900">Suggested Next Checks</div>
            <ul className="list-disc ml-5 space-y-1">
              {response.suggested_next_checks.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>

            <div className="text-xs text-gray-500">{response.confidence_disclaimer}</div>
          </div>
        )}

        {messages.length > 0 && (
          <div className="border-t pt-4">
            <div className="text-sm font-medium text-gray-900 mb-2">Conversation Memory</div>
            <div className="space-y-2 text-xs text-gray-600">
              {messages.map((msg, idx) => (
                <div key={`${msg.role}-${idx}`}>
                  <div className="font-semibold">{msg.role}: {msg.question}</div>
                  <div>{msg.summary}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {contextInfo && (
          <div className="text-[11px] text-gray-500">
            Context synced at {new Date(contextInfo.generated_at).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
