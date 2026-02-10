import axios from 'axios';
import type {
  RiskSummaryResponse,
  UploadResponse,
  BatchUploadResponse,
  HealthResponse,
  AssetDetails,
  ApiError,
  CopilotContextResponse,
  CopilotStatusResponse,
  CopilotQueryRequest,
  CopilotQueryResponse,
  ComparisonCopilotContextResponse,
  ComparisonCopilotQueryRequest,
  AnalyzerCopilotContextResponse,
  AnalyzerCopilotQueryRequest,
  ScriptRunRequest,
  ScriptRunResponse,
  DOEUploadResponse,
  DOEReport,
  DOEAgentLogsResponse,
  AnalyzerPlanResponse,
  AnalyzerRunResponse,
  AnalyzerReport,
  ComparisonUploadResponse,
  ComparisonReport,
  AgentStatusResponse,
  AgentLogsResponse
} from '../types/api';

const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for logging
api.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.status, error.response?.data);
    return Promise.reject(error);
  }
);

export const apiClient = {
  // Health check
  async getHealth(): Promise<HealthResponse> {
    const response = await api.get<HealthResponse>('/health');
    return response.data;
  },

  // Upload sensor and maintenance data
  async uploadData(sensorFile: File, maintenanceFile?: File): Promise<UploadResponse> {
    const formData = new FormData();

    formData.append('sensor_data', sensorFile, sensorFile.name);

    if (maintenanceFile) {
      formData.append('maintenance_logs', maintenanceFile, maintenanceFile.name);
    }

    const response = await api.post<UploadResponse>('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },

  // Get risk summary for all assets
  async getRiskSummary(): Promise<RiskSummaryResponse> {
    const response = await api.get<RiskSummaryResponse>('/risk_summary');
    return response.data;
  },

  // Get detailed information for specific asset
  async getAssetDetails(assetId: string): Promise<AssetDetails> {
    const response = await api.get<AssetDetails>(`/asset/${assetId}`);
    return response.data;
  },

  async uploadBatch(sensorFiles: File[]): Promise<BatchUploadResponse> {
    const formData = new FormData();

    sensorFiles.forEach((file) => {
      formData.append('sensor_files', file, file.name);
    });

    const response = await api.post<BatchUploadResponse>('/upload/batch', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },

  async getCopilotContext(assetId: string): Promise<CopilotContextResponse> {
    const response = await api.post<CopilotContextResponse>(`/copilot/context/${assetId}`);
    return response.data;
  },

  async getCopilotStatus(): Promise<CopilotStatusResponse> {
    const response = await api.get<CopilotStatusResponse>('/copilot/status');
    return response.data;
  },

  async refreshCopilotModel(): Promise<{ model: string }> {
    const response = await api.post<{ model: string }>('/copilot/model-refresh');
    return response.data;
  },

  async queryCopilot(payload: CopilotQueryRequest): Promise<CopilotQueryResponse> {
    const response = await api.post<CopilotQueryResponse>('/copilot/query', payload);
    return response.data;
  },

  async resetCopilotSession(sessionId: string): Promise<{ status: string; session_id: string }> {
    const response = await api.post<{ status: string; session_id: string }>(`/copilot/session/${sessionId}/reset`);
    return response.data;
  },

  async getComparisonCopilotStatus(): Promise<CopilotStatusResponse> {
    const response = await api.get<CopilotStatusResponse>('/compare/copilot/status');
    return response.data;
  },

  async refreshComparisonCopilotModel(): Promise<{ model: string }> {
    const response = await api.post<{ model: string }>('/compare/copilot/model-refresh');
    return response.data;
  },

  async getComparisonCopilotContext(
    reportId: string,
    sessionId?: string
  ): Promise<ComparisonCopilotContextResponse> {
    const response = await api.post<ComparisonCopilotContextResponse>(
      `/compare/copilot/context/${reportId}`,
      { session_id: sessionId }
    );
    return response.data;
  },

  async queryComparisonCopilot(payload: ComparisonCopilotQueryRequest): Promise<CopilotQueryResponse> {
    const response = await api.post<CopilotQueryResponse>('/compare/copilot/query', payload);
    return response.data;
  },

  async resetComparisonCopilotSession(sessionId: string): Promise<{ status: string; session_id: string }> {
    const response = await api.post<{ status: string; session_id: string }>(
      `/compare/copilot/session/${sessionId}/reset`
    );
    return response.data;
  },

  async getAnalyzerCopilotStatus(): Promise<CopilotStatusResponse> {
    const response = await api.get<CopilotStatusResponse>('/analysis/copilot/status');
    return response.data;
  },

  async refreshAnalyzerCopilotModel(): Promise<{ model: string }> {
    const response = await api.post<{ model: string }>('/analysis/copilot/model-refresh');
    return response.data;
  },

  async getAnalyzerCopilotContext(
    reportId: string,
    sessionId?: string
  ): Promise<AnalyzerCopilotContextResponse> {
    const response = await api.post<AnalyzerCopilotContextResponse>(
      `/analysis/copilot/context/${reportId}`,
      { session_id: sessionId }
    );
    return response.data;
  },

  async queryAnalyzerCopilot(payload: AnalyzerCopilotQueryRequest): Promise<CopilotQueryResponse> {
    const response = await api.post<CopilotQueryResponse>('/analysis/copilot/query', payload);
    return response.data;
  },

  async resetAnalyzerCopilotSession(sessionId: string): Promise<{ status: string; session_id: string }> {
    const response = await api.post<{ status: string; session_id: string }>(
      `/analysis/copilot/session/${sessionId}/reset`
    );
    return response.data;
  },

  async runScript(payload: ScriptRunRequest): Promise<ScriptRunResponse> {
    const response = await api.post<ScriptRunResponse>('/script/run', payload);
    return response.data;
  },

  async uploadDoeComparison(formData: FormData): Promise<DOEUploadResponse> {
    const response = await api.post<DOEUploadResponse>('/doe/compare/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
    return response.data;
  },

  async getDoeReport(reportId: string): Promise<DOEReport> {
    const response = await api.get<DOEReport>(`/doe/report/${reportId}`, { timeout: 120000 });
    return response.data;
  },

  async getDoeAgentLogs(reportId: string): Promise<DOEAgentLogsResponse> {
    const response = await api.get<DOEAgentLogsResponse>(`/doe/agent/logs/${reportId}`);
    return response.data;
  },

  async getAnalyzerPlan(formData: FormData): Promise<AnalyzerPlanResponse> {
    const response = await api.post<AnalyzerPlanResponse>('/analysis/plan', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
    return response.data;
  },

  async runAnalyzer(formData: FormData): Promise<AnalyzerRunResponse> {
    const response = await api.post<AnalyzerRunResponse>('/analysis/run', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
    return response.data;
  },

  async getAnalyzerReport(reportId: string): Promise<AnalyzerReport> {
    const response = await api.get<AnalyzerReport>(`/analysis/report/${reportId}`, { timeout: 120000 });
    return response.data;
  },

  async uploadComparison(
    baselineFile: File,
    experimentFile: File,
    assetId?: string,
    analysisMode: 'deterministic' | 'ai_assisted' = 'ai_assisted'
  ): Promise<ComparisonUploadResponse> {
    const formData = new FormData();
    formData.append('baseline_file', baselineFile, baselineFile.name);
    formData.append('experiment_file', experimentFile, experimentFile.name);
    if (assetId) {
      formData.append('asset_id', assetId);
    }
    formData.append('analysis_mode', analysisMode);
    const response = await api.post<ComparisonUploadResponse>('/compare/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async getComparisonReport(reportId: string): Promise<ComparisonReport> {
    const response = await api.get<ComparisonReport>(`/compare/report/${reportId}`);
    return response.data;
  },

  async runComparisonAgent(
    baselineFile: File,
    experimentFile: File,
    assetId?: string,
    analysisMode: 'deterministic' | 'ai_assisted' = 'ai_assisted'
  ): Promise<ComparisonUploadResponse> {
    return this.uploadComparison(baselineFile, experimentFile, assetId, analysisMode);
  },

  async getComparisonAgentStatus(jobId: string): Promise<AgentStatusResponse> {
    const response = await api.get<AgentStatusResponse>(`/compare/agent/status/${jobId}`);
    return response.data;
  },

  async getComparisonAgentLogs(jobId: string): Promise<AgentLogsResponse> {
    const response = await api.get<AgentLogsResponse>(`/compare/agent/logs/${jobId}`);
    return response.data;
  },
};

// Error handling utility
export function isApiError(error: unknown): error is ApiError {
  return typeof error === 'object' && error !== null && 'detail' in error;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiError | undefined;
    return data?.detail || error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
}

// Risk level color mapping
export type RiskColor = 'green' | 'yellow' | 'red';

export function getRiskColor(riskScore: number): RiskColor {
  if (riskScore <= 30) return 'green';
  if (riskScore <= 70) return 'yellow';
  return 'red';
}

// Risk level text mapping
export function getRiskLevel(riskScore: number): string {
  if (riskScore <= 30) return 'Low';
  if (riskScore <= 70) return 'Medium';
  return 'High';
}
