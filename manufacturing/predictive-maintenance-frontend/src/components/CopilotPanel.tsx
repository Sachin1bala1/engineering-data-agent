import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import type { CopilotQueryResponse, CopilotStatusResponse } from '../types/api';
import { apiClient, getErrorMessage } from '../lib/api';

interface CopilotPanelProps {
  assetId: string;
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

export function CopilotPanel({ assetId }: CopilotPanelProps) {
  const [role, setRole] = useState('operator');
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState<CopilotQueryResponse | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<CopilotStatusResponse | null>(null);
  const [isRefreshingModel, setIsRefreshingModel] = useState(false);
  const [sessionId] = useState(() => {
    const existing = localStorage.getItem('copilot_session_id');
    if (existing) return existing;
    const created = `session_${Date.now()}`;
    localStorage.setItem('copilot_session_id', created);
    return created;
  });

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const result = await apiClient.getCopilotStatus();
        setStatus(result);
      } catch (err: unknown) {
        console.error('Copilot status error:', err);
      }
    };

    loadStatus();
  }, []);

  const handleRefreshModel = async () => {
    setIsRefreshingModel(true);
    try {
      const result = await apiClient.refreshCopilotModel();
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
      const result = await apiClient.queryCopilot({
        asset_id: assetId,
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
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Copilot request failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSession = async () => {
    setError(null);
    try {
      await apiClient.resetCopilotSession(sessionId);
      setMessages([]);
      setResponse(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to reset session'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Engineering Copilot (Decision Support)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              Copilot LLM: {status.llm_enabled ? `enabled (${status.model ?? 'resolving'})` : 'disabled (fallback mode)'}
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
            placeholder="Ask about this asset: e.g., Why is it high risk?"
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
                <pre className="text-xs whitespace-pre-wrap bg-gray-50 border rounded p-3">
                  {response.python_script}
                </pre>
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
      </CardContent>
    </Card>
  );
}
