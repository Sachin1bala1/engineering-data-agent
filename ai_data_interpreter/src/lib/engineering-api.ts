import type {
  ComparisonUploadResponse,
  ComparisonReport,
  AgentLogsResponse,
  CopilotStatusResponse,
  ComparisonCopilotContextResponse,
  ComparisonCopilotQueryRequest,
  CopilotQueryResponse,
  AnalyzerCopilotContextResponse,
  AnalyzerCopilotQueryRequest,
  ScriptRunRequest,
  ScriptRunResponse,
  DOEUploadResponse,
  DOEReport,
  DOEAgentLogsResponse,
  DOEWizardRecommendRequest,
  DOEWizardRecommendResponse,
  DOEWizardDesignRequest,
  DOEWizardDesignResponse,
  DOEWizardAnalyzeResponse,
  DOEWizardCleanResponse,
  DOEWizardChatResponse,
  AnalyzerPlanResponse,
  AnalyzerRunResponse,
  AnalyzerReport,
  AnalyzerPlanReviseRequest,
  ActionAgentRequest,
  ActionAgentResponse,
  RootCauseAgentRequest,
  RootCauseAgentResponse,
  DoeOrchestratorRequest,
  DoeOrchestratorResponse,
  KnowledgeIngestResponse,
  KnowledgeGraphResponse,
  KnowledgeRecommendationResponse,
  KnowledgeQueryResponse,
  KnowledgeChatRequest,
  KnowledgeChatResponse,
  KnowledgeMemoryConfig,
  SaveDatasetsResponse,
  SaveChatSessionResponse,
  IndustrialStreamUploadResponse,
  IndustrialLiveDriftResponse,
  IndustrialLiveDriversResponse,
  IndustrialPrescriptiveRequest,
  IndustrialPrescriptiveResponse,
  TwinSimulationRequest,
  TwinSimulationResponse,
} from "@/types/engineering-api";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload?.detail || payload?.error || JSON.stringify(payload);
    } catch {
      detail = await response.text();
    }
    throw new Error(detail || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const engineeringApi = {
  async uploadComparison(
    baselineFile: File,
    experimentFile: File,
    analysisMode: "deterministic" | "ai_assisted" = "ai_assisted"
  ): Promise<ComparisonUploadResponse> {
    const formData = new FormData();
    formData.append("baseline_file", baselineFile, baselineFile.name);
    formData.append("experiment_file", experimentFile, experimentFile.name);
    formData.append("analysis_mode", analysisMode);
    return requestJson<ComparisonUploadResponse>("/compare/upload", {
      method: "POST",
      body: formData,
    });
  },

  async getComparisonReport(reportId: string): Promise<ComparisonReport> {
    return requestJson<ComparisonReport>(`/compare/report/${reportId}`);
  },

  async getComparisonAgentLogs(reportId: string): Promise<AgentLogsResponse> {
    return requestJson<AgentLogsResponse>(`/compare/agent/logs/${reportId}`);
  },

  async getComparisonCopilotStatus(): Promise<CopilotStatusResponse> {
    return requestJson<CopilotStatusResponse>("/compare/copilot/status");
  },

  async refreshComparisonCopilotModel(): Promise<{ model: string }> {
    return requestJson<{ model: string }>("/compare/copilot/model-refresh", { method: "POST" });
  },

  async getComparisonCopilotContext(
    reportId: string,
    sessionId?: string
  ): Promise<ComparisonCopilotContextResponse> {
    return requestJson<ComparisonCopilotContextResponse>(`/compare/copilot/context/${reportId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionId ? { session_id: sessionId } : {}),
    });
  },

  async queryComparisonCopilot(payload: ComparisonCopilotQueryRequest): Promise<CopilotQueryResponse> {
    return requestJson<CopilotQueryResponse>("/compare/copilot/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  async resetComparisonCopilotSession(sessionId: string): Promise<{ status: string; session_id: string }> {
    return requestJson<{ status: string; session_id: string }>(`/compare/copilot/session/${sessionId}/reset`, {
      method: "POST",
    });
  },

  async getAnalyzerCopilotStatus(): Promise<CopilotStatusResponse> {
    return requestJson<CopilotStatusResponse>("/analysis/copilot/status");
  },

  async refreshAnalyzerCopilotModel(): Promise<{ model: string }> {
    return requestJson<{ model: string }>("/analysis/copilot/model-refresh", { method: "POST" });
  },

  async getAnalyzerCopilotContext(
    reportId: string,
    sessionId?: string
  ): Promise<AnalyzerCopilotContextResponse> {
    return requestJson<AnalyzerCopilotContextResponse>(`/analysis/copilot/context/${reportId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionId ? { session_id: sessionId } : {}),
    });
  },

  async queryAnalyzerCopilot(payload: AnalyzerCopilotQueryRequest): Promise<CopilotQueryResponse> {
    return requestJson<CopilotQueryResponse>("/analysis/copilot/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  async resetAnalyzerCopilotSession(sessionId: string): Promise<{ status: string; session_id: string }> {
    return requestJson<{ status: string; session_id: string }>(`/analysis/copilot/session/${sessionId}/reset`, {
      method: "POST",
    });
  },

  async runScript(payload: ScriptRunRequest): Promise<ScriptRunResponse> {
    return requestJson<ScriptRunResponse>("/script/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  async uploadDoeComparison(formData: FormData): Promise<DOEUploadResponse> {
    return requestJson<DOEUploadResponse>("/doe/compare/upload", {
      method: "POST",
      body: formData,
    });
  },

  async getDoeReport(reportId: string): Promise<DOEReport> {
    return requestJson<DOEReport>(`/doe/report/${reportId}`);
  },

  async getDoeAgentLogs(reportId: string): Promise<DOEAgentLogsResponse> {
    return requestJson<DOEAgentLogsResponse>(`/doe/agent/logs/${reportId}`);
  },

  async recommendDoe(payload: DOEWizardRecommendRequest): Promise<DOEWizardRecommendResponse> {
    return requestJson<DOEWizardRecommendResponse>("/doe/wizard/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  async generateDoeDesign(payload: DOEWizardDesignRequest): Promise<DOEWizardDesignResponse> {
    return requestJson<DOEWizardDesignResponse>("/doe/wizard/design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  async analyzeDoeResults(formData: FormData): Promise<DOEWizardAnalyzeResponse> {
    return requestJson<DOEWizardAnalyzeResponse>("/doe/wizard/analyze", {
      method: "POST",
      body: formData,
    });
  },

  async cleanDoeResults(formData: FormData): Promise<DOEWizardCleanResponse> {
    return requestJson<DOEWizardCleanResponse>("/doe/wizard/clean", {
      method: "POST",
      body: formData,
    });
  },

  async chatDoe(payload: Record<string, unknown>): Promise<DOEWizardChatResponse> {
    return requestJson<DOEWizardChatResponse>("/doe/wizard/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  async getAnalyzerPlan(formData: FormData): Promise<AnalyzerPlanResponse> {
    return requestJson<AnalyzerPlanResponse>("/analysis/plan", {
      method: "POST",
      body: formData,
    });
  },

  async runAnalyzer(formData: FormData): Promise<AnalyzerRunResponse> {
    return requestJson<AnalyzerRunResponse>("/analysis/run", {
      method: "POST",
      body: formData,
    });
  },

  async getAnalyzerReport(reportId: string): Promise<AnalyzerReport> {
    return requestJson<AnalyzerReport>(`/analysis/report/${reportId}`);
  },

  async reviseAnalyzerPlan(payload: AnalyzerPlanReviseRequest): Promise<{ plan: Record<string, unknown> }> {
    return requestJson<{ plan: Record<string, unknown> }>("/analysis/plan/revise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  async runActionAgent(payload: ActionAgentRequest): Promise<ActionAgentResponse> {
    return requestJson<ActionAgentResponse>("/enterprise/action-agent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  async runRootCauseAgent(payload: RootCauseAgentRequest): Promise<RootCauseAgentResponse> {
    return requestJson<RootCauseAgentResponse>("/enterprise/root-cause-agent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  async runDoeOrchestrator(payload: DoeOrchestratorRequest): Promise<DoeOrchestratorResponse> {
    return requestJson<DoeOrchestratorResponse>("/enterprise/doe-orchestrator/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  async uploadKnowledgeLogs(file: File, saveToMemory = false): Promise<KnowledgeIngestResponse> {
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("save_to_memory", String(saveToMemory));
    return requestJson<KnowledgeIngestResponse>("/knowledge/upload/logs", {
      method: "POST",
      body: formData,
    });
  },

  async uploadKnowledgeIncidents(file: File, saveToMemory = false): Promise<KnowledgeIngestResponse> {
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("save_to_memory", String(saveToMemory));
    return requestJson<KnowledgeIngestResponse>("/knowledge/upload/incidents", {
      method: "POST",
      body: formData,
    });
  },

  async uploadKnowledgeSop(
    file: File,
    sopName: string,
    assetType: string,
    saveToMemory = false
  ): Promise<KnowledgeIngestResponse> {
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("sop_name", sopName);
    formData.append("asset_type", assetType);
    formData.append("save_to_memory", String(saveToMemory));
    return requestJson<KnowledgeIngestResponse>("/knowledge/upload/sop", {
      method: "POST",
      body: formData,
    });
  },

  async getKnowledgeGraph(assetId: string): Promise<KnowledgeGraphResponse> {
    return requestJson<KnowledgeGraphResponse>(`/knowledge/graph/${encodeURIComponent(assetId)}`);
  },

  async getKnowledgeRecommendation(
    assetId: string,
    failure?: string
  ): Promise<KnowledgeRecommendationResponse> {
    const query = failure ? `?failure=${encodeURIComponent(failure)}` : "";
    return requestJson<KnowledgeRecommendationResponse>(
      `/knowledge/recommendation/${encodeURIComponent(assetId)}${query}`
    );
  },

  async queryKnowledge(
    assetId: string,
    question: string,
    failure?: string
  ): Promise<KnowledgeQueryResponse> {
    const params = new URLSearchParams({
      asset_id: assetId,
      q: question,
    });
    if (failure) params.set("failure", failure);
    return requestJson<KnowledgeQueryResponse>(`/knowledge/query?${params.toString()}`);
  },

  async chatKnowledge(payload: KnowledgeChatRequest): Promise<KnowledgeChatResponse> {
    return requestJson<KnowledgeChatResponse>("/knowledge/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  async resetKnowledgeChat(sessionId: string): Promise<{ status: string; session_id: string }> {
    return requestJson<{ status: string; session_id: string }>(
      `/knowledge/chat/${encodeURIComponent(sessionId)}/reset`,
      { method: "POST" }
    );
  },

  async getKnowledgeMemoryConfig(): Promise<KnowledgeMemoryConfig> {
    return requestJson<KnowledgeMemoryConfig>("/knowledge/memory/config");
  },

  async setKnowledgeMemoryConfig(payload: KnowledgeMemoryConfig): Promise<KnowledgeMemoryConfig> {
    return requestJson<KnowledgeMemoryConfig>("/knowledge/memory/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  async saveKnowledgeDatasets(datasetIds: string[]): Promise<SaveDatasetsResponse> {
    return requestJson<SaveDatasetsResponse>("/knowledge/memory/save-datasets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset_ids: datasetIds }),
    });
  },

  async saveKnowledgeChatSession(sessionId: string, assetId?: string): Promise<SaveChatSessionResponse> {
    return requestJson<SaveChatSessionResponse>(`/knowledge/memory/save-chat/${encodeURIComponent(sessionId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_id: assetId }),
    });
  },

  async uploadIndustrialLiveData(
    file: File,
    targetCol?: string,
    timestampCol?: string,
    streamName?: string
  ): Promise<IndustrialStreamUploadResponse> {
    const formData = new FormData();
    formData.append("file", file, file.name);
    if (targetCol) formData.append("target_col", targetCol);
    if (timestampCol) formData.append("timestamp_col", timestampCol);
    if (streamName) formData.append("stream_name", streamName);
    return requestJson<IndustrialStreamUploadResponse>("/industrial/live/upload", {
      method: "POST",
      body: formData,
    });
  },

  async getIndustrialDrift(streamId: string): Promise<IndustrialLiveDriftResponse> {
    return requestJson<IndustrialLiveDriftResponse>(`/industrial/live/drift/${encodeURIComponent(streamId)}`);
  },

  async getIndustrialDrivers(streamId: string, targetCol?: string): Promise<IndustrialLiveDriversResponse> {
    const query = targetCol ? `?target_col=${encodeURIComponent(targetCol)}` : "";
    return requestJson<IndustrialLiveDriversResponse>(
      `/industrial/live/drivers/${encodeURIComponent(streamId)}${query}`
    );
  },

  async getIndustrialStreams(): Promise<{ streams: Array<Record<string, unknown>> }> {
    return requestJson<{ streams: Array<Record<string, unknown>> }>("/industrial/live/streams");
  },

  async getPrescriptiveRecommendation(
    payload: IndustrialPrescriptiveRequest
  ): Promise<IndustrialPrescriptiveResponse> {
    return requestJson<IndustrialPrescriptiveResponse>("/industrial/prescriptive/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  async simulateTwin(payload: TwinSimulationRequest): Promise<TwinSimulationResponse> {
    return requestJson<TwinSimulationResponse>("/industrial/twin/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },
};

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
}
