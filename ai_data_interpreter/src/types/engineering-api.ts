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
  plan: Record<string, unknown>;
  profile: {
    preview_rows: Array<Record<string, unknown>>;
    signals: Record<string, Record<string, unknown>>;
    time_assumptions?: string[];
    quality_score?: number;
  };
}

export interface AnalyzerRunResponse {
  success?: boolean;
  report_id?: string | null;
  message: string;
  errors?: string[];
}

export interface AnalyzerReport {
  report_id: string;
  created_at: string;
  profile: {
    quality_score?: number;
    signals?: Record<string, Record<string, unknown>>;
    preview_rows?: Array<Record<string, unknown>>;
  };
  plan: Record<string, unknown>;
  results: {
    statistics?: Record<
      string,
      {
        mean?: number;
        std?: number;
        median?: number;
        min?: number;
        max?: number;
        p_values?: Record<string, number>;
        notes?: string[];
      }
    >;
    plots?: Array<{ title: string; data_uri: string }>;
  };
  validation: {
    valid?: boolean;
    warnings?: string[];
    confidence_penalty?: number;
  };
  confidence: {
    score?: number;
    components?: Record<string, number>;
  };
  explanation: {
    summary?: string;
    conclusions?: string[];
    limitations?: string[];
    tests_used?: string[];
    signals_used?: string[];
  };
  assumptions: string[];
  warnings: string[];
  plot_scripts?: Array<{ title: string; code: string }>;
}

export interface AnalyzerPlanReviseRequest {
  profile: Record<string, unknown>;
  current_plan: Record<string, unknown>;
  instruction: string;
  history?: Array<{ role: string; content: string }>;
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
  run_budget?: number;
  continuous?: boolean;
  noise?: string;
}

export interface DOEWizardRecommendResponse {
  method: string;
  reason: string;
  plain_english?: string;
  decision_trace?: Record<string, unknown>;
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

export interface EnterpriseAgentContextRequest {
  comparison_report_id?: string;
  analyzer_report_id?: string;
  doe_report_id?: string;
  objective?: string;
  notes?: string;
}

export interface ActionAgentRequest extends EnterpriseAgentContextRequest {
  horizon_days?: number;
  constraints?: string[];
}

export interface ActionAgentResponse {
  summary: string;
  actions: Array<{
    action_id: string;
    title: string;
    owner_role: string;
    due_days: number;
    priority: string;
    expected_impact: string;
    kpis: string[];
    rationale: string;
  }>;
  monitoring_plan: string[];
  python_script?: string | null;
  llm_used?: boolean;
}

export interface RootCauseAgentRequest extends EnterpriseAgentContextRequest {
  symptom: string;
  role?: string;
}

export interface RootCauseAgentResponse {
  summary: string;
  causal_graph: {
    nodes: Array<{ id: string; label: string; type?: string }>;
    edges: Array<{ source: string; target: string; weight?: number }>;
  };
  hypotheses: Array<{
    rank: number;
    hypothesis: string;
    confidence: number;
    evidence: string[];
    countermeasures: string[];
  }>;
  next_tests: string[];
  python_script?: string | null;
  llm_used?: boolean;
}

export interface DoeOrchestratorRequest extends EnterpriseAgentContextRequest {
  max_additional_runs?: number;
  confidence_target?: number;
  safety_constraints?: string[];
}

export interface DoeOrchestratorResponse {
  summary: string;
  go_no_go: string;
  recommended_next_runs: Array<{
    run_order: number;
    settings: Record<string, string>;
    expected_learning: string;
    risk_level: string;
  }>;
  stop_criteria: string[];
  safety_checks: string[];
  python_script?: string | null;
  llm_used?: boolean;
}

export interface KnowledgeIngestResponse {
  status: string;
  rows_read?: number;
  rows_ingested?: number;
  sop_name?: string;
  asset_type?: string;
  steps_ingested?: number;
  saved_to_memory?: boolean;
  dataset_id?: string;
  asset_ids?: string[];
}

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  type: string;
  timestamp?: string;
  resolved?: boolean;
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  weight?: number;
}

export interface KnowledgeGraphResponse {
  asset_id: string;
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  incidents: Array<Record<string, unknown>>;
  generated_at: string;
}

export interface KnowledgeRecommendationResponse {
  asset_id: string;
  recommendation: Record<string, unknown>;
  failure_explanation: Record<string, unknown>;
  risk: { risk_score?: number; risk_level?: string; drivers?: string[] };
  sop_mapping: { matched_sops?: Array<{ sop_name: string; steps: Array<Record<string, unknown>> }> };
  ai_summary: string;
  evidence: Array<Record<string, unknown>>;
  confidence: number;
}

export interface KnowledgeQueryResponse {
  asset_id: string;
  question: string;
  deterministic_answer: Record<string, unknown>;
  ai_summary: string;
  evidence: Array<Record<string, unknown>>;
  confidence: number;
}

export interface KnowledgeChatRequest {
  asset_id: string;
  question: string;
  failure?: string;
  session_id?: string;
  save_to_memory?: boolean;
}

export interface KnowledgeChatResponse {
  session_id: string;
  answer: string;
  deterministic_answer: Record<string, unknown>;
  evidence: Array<Record<string, unknown>>;
  confidence: number;
  history: Array<{ role: string; content: string }>;
}

export interface SaveDatasetsResponse {
  saved_dataset_ids: string[];
  missing_dataset_ids: string[];
}

export interface SaveChatSessionResponse {
  session_id: string;
  saved_messages: number;
  status: string;
}

export interface KnowledgeMemoryConfig {
  persistence_enabled: boolean;
  use_asset_history: boolean;
}

export interface IndustrialStreamUploadResponse {
  stream_id: string;
  stream_name: string;
  rows: number;
  columns: string[];
  target_col: string;
  preview: Array<Record<string, unknown>>;
  drivers: Array<{ variable: string; importance: number; corr: number; best_lag: number }>;
  drift: {
    drift_score: number;
    columns: Array<Record<string, unknown>>;
    top_drift_columns: string[];
  };
}

export interface IndustrialLiveDriftResponse {
  stream_id: string;
  drift: {
    drift_score: number;
    columns: Array<Record<string, unknown>>;
    top_drift_columns: string[];
  };
}

export interface IndustrialLiveDriversResponse {
  stream_id: string;
  target_col: string;
  drivers: Array<{ variable: string; importance: number; corr: number; best_lag: number }>;
}

export interface IndustrialPrescriptiveRequest {
  stream_id: string;
  target_col: string;
  objective: "maximize" | "minimize";
  controllable_vars?: string[];
  constraints?: Record<string, Record<string, number>>;
}

export interface IndustrialPrescriptiveResponse {
  stream_id: string;
  target_col: string;
  objective: string;
  recommendations: Array<Record<string, unknown>>;
  predicted_total_target_delta: number;
  confidence: number;
  model: Record<string, unknown>;
  guardrail_note: string;
}

export interface TwinNode {
  id: string;
  label?: string;
  node_type?: string;
  setpoint?: number;
  gain?: number;
  bias?: number;
  min_value?: number;
  max_value?: number;
}

export interface TwinEdge {
  source: string;
  target: string;
  weight: number;
}

export interface TwinScenario {
  name: string;
  changes: Record<string, Record<string, number>>;
}

export interface TwinSimulationRequest {
  nodes: TwinNode[];
  edges: TwinEdge[];
  scenarios: TwinScenario[];
}

export interface TwinSimulationResponse {
  baseline: Record<string, unknown>;
  scenarios: Array<Record<string, unknown>>;
  nodes: TwinNode[];
  edges: TwinEdge[];
}
