export interface CopilotStatusResponse {
  llm_enabled: boolean;
  model: string | null;
}

export interface CopilotEvidence {
  source: string;
  detail: string;
}

export interface CopilotQueryResponse {
  summary: string;
  evidence_used: CopilotEvidence[];
  suggested_next_checks: string[];
  confidence_disclaimer: string;
  decision_support: string;
  hypotheses?: Array<Record<string, unknown>>;
  llm_used?: boolean;
  python_script?: string;
}

export interface ComparisonCopilotContextResponse {
  session_id: string;
  context: Record<string, unknown>;
  generated_at: string;
}

export interface ComparisonCopilotQueryRequest {
  report_id: string;
  question: string;
  role: string;
  session_id?: string;
}

export interface AnalyzerCopilotContextResponse {
  report_id: string;
  generated_at: string;
}

export interface AnalyzerCopilotQueryRequest {
  report_id: string;
  question: string;
  role: string;
  session_id?: string;
}

export interface ScriptRunRequest {
  code: string;
  timeout_sec?: number;
  session_id?: string;
}

export interface ScriptRunImage {
  filename: string;
  data_uri: string;
}

export interface ScriptRunResponse {
  stdout: string;
  stderr: string;
  images: ScriptRunImage[];
}

export interface ComparisonUploadResponse {
  report_id?: string | null;
  message: string;
}

export interface ComparisonReport {
  report_id: string;
  created_at: string;
  comparison_summary: {
    comparison_status: string;
    primary_deviation_signal?: string | null;
    confidence_level: number;
    recommended_action: string;
    engineering_rationale: string;
  };
  signal_comparison: Array<{
    signal_name: string;
    baseline_stats: { mean: number; std: number };
    experiment_stats: { mean: number; std: number };
    deviation_metrics: {
      percent_delta?: number | null;
      z_score_vs_baseline?: number | null;
      persistence_above_baseline?: number | null;
    };
    severity: string;
    explanation: string;
  }>;
  raw_metadata?: {
    aligned_series?: Record<string, Array<{ timestamp: string; baseline: number; experiment: number }>>;
  };
}

export interface AgentLogsResponse {
  logs: Array<Record<string, unknown>>;
}

export interface AnalyzerPlanResponse {
  message: string;
  plan: Record<string, unknown>;
  profile: {
    preview_rows: Array<Record<string, unknown>>;
    signals: Record<string, Record<string, unknown>>;
    warnings: string[];
  };
}

export interface AnalyzerRunResponse {
  report_id?: string | null;
  message: string;
}

export interface AnalyzerReport {
  report_id: string;
  created_at: string;
  profile: Record<string, unknown>;
  plan: Record<string, unknown>;
  results: Record<string, unknown>;
  validation: Record<string, unknown>;
  confidence: Record<string, unknown>;
  explanation: Record<string, unknown>;
  assumptions: string[];
  warnings: string[];
  plot_scripts?: Array<{ title: string; code: string }>;
}

export interface DOEUploadResponse {
  report_id?: string | null;
  message: string;
  warnings?: string[];
  errors?: string[];
}

export interface DOEReport {
  report_id: string;
  created_at: string;
  context: Record<string, unknown>;
  plan: Record<string, unknown>;
  comparison_table: Array<Record<string, unknown>>;
  engineering_interpretation: Record<string, unknown>;
  stability_risk: Record<string, unknown>;
  validation: Record<string, unknown>;
  confidence: Record<string, unknown>;
  recommendations: string[];
  plot_scripts?: Array<{ title: string; code: string }>;
  plots?: Array<{ title: string; data_uri: string }>;
}

export interface DOEAgentLogsResponse {
  logs: Array<Record<string, unknown>>;
}

export interface DOEWizardFactor {
  name: string;
  low?: number;
  high?: number;
  levels?: string[];
}

export interface DOEWizardRecommendRequest {
  goal: string;
  factors: number;
  budget?: string;
  skill_level?: string;
  interactions?: string;
  nonlinearity?: string;
}

export interface DOEWizardRecommendResponse {
  method: string;
  reason: string;
  plain_english?: string;
}

export interface DOEWizardDesignRequest {
  method: string;
  factors: DOEWizardFactor[];
  center_points?: number;
  replicates?: number;
}

export interface DOEWizardDesignResponse {
  matrix: Array<Record<string, unknown>>;
  columns: string[];
  meta: Record<string, unknown>;
}

export interface DOEWizardAnalyzeResponse {
  analysis: Record<string, unknown>;
  rows: number;
  response_column: string;
}

export interface DOEWizardCleanResponse {
  filename: string;
  cleaned_rows: number;
  dropped_rows: number;
  file_base64: string;
}

export interface DOEWizardChatResponse {
  answer: string;
}
