// API Types for Predictive Maintenance System

export interface RiskAssessment {
  asset_id: string;
  asset_type: string;
  risk_score: number;
  risk_level: string;
  failure_mode: string | null;
  recommended_action: string;
  risk_factors: {
    severity: number;
    persistence: number;
    rate_of_change: number;
    historical_failure_rate: number;
  };
  confidence_level: number;
  assessment_timestamp: string;
  next_inspection_days: number | null;
  urgency_bucket?: string | null;
  inspection_interval_days?: number | null;
  primary_failure_mode?: string | null;
  secondary_failure_modes?: string[];
  failure_mode_assessments?: FailureModeAssessment[];
}

export interface RiskSummaryResponse {
  total_assets: number;
  high_risk_assets: number;
  critical_assets: number;
  assessments: RiskAssessment[];
  generated_at: string;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  records_processed: number;
  assets_updated: string[];
  errors: string[];
  warnings?: string[];
  ingestion_report_id?: string | null;
  transformation_report?: Record<string, unknown> | null;
}

export interface FileAnalysisSummary {
  file_name: string;
  success: boolean;
  message: string;
  records_processed: number;
  assets_updated: string[];
  errors: string[];
  warnings?: string[];
  ingestion_report_id?: string | null;
  risk_assessments: RiskAssessment[];
}

export interface BatchUploadResponse {
  success: boolean;
  message: string;
  files_processed: number;
  total_records_processed: number;
  assets_updated: string[];
  file_results: FileAnalysisSummary[];
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  assets_monitored: number;
  total_sensor_readings: number;
  total_maintenance_records: number;
}

export interface AssetDetails {
  asset_id: string;
  asset_type: string;
  risk_assessment: RiskAssessment;
  sensor_readings_count: number;
  maintenance_records_count: number;
  sensor_history: SensorHistoryPoint[];
  baseline_bands: Record<string, BaselineBand>;
  failure_mode_timeline: FailureModeTimelineEvent[];
  baseline_metrics: Array<{
    parameter: string;
    mean: number;
    std: number;
  }>;
  failure_mode_breakdown: FailureModeAssessment[];
  triggered_rules: Array<{
    rule_name: string;
    severity_score: number;
    confidence: number;
    description: string;
  }>;
  last_updated: string;
}

export interface FailureModeIndicator {
  name: string;
  value: number | null;
  status: string;
  evidence?: string | null;
  window_hours?: number | null;
}

export interface FailureModeAssessment {
  failure_mode_id: string;
  stage: string;
  risk_score: number;
  confidence: number;
  skill_level_required: string;
  recommended_action: string;
  explanation: string;
  indicators: FailureModeIndicator[];
}

export interface FailureModeTimelineEvent {
  failure_mode_id: string;
  stage: string;
  timestamp: string;
  description: string;
}

export interface SensorHistoryPoint {
  timestamp: string;
  temperature: number | null;
  vibration: number | null;
  alarm_frequency: number | null;
  run_hours: number | null;
}

export interface BaselineBand {
  mean: number;
  std: number;
}

export interface CopilotContextResponse {
  context: Record<string, unknown>;
  generated_at: string;
}

export interface CopilotStatusResponse {
  llm_enabled: boolean;
  model: string | null;
}

export interface CopilotQueryRequest {
  asset_id: string;
  question: string;
  role: string;
  session_id?: string;
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

export interface ScriptRunRequest {
  code: string;
  timeout_sec?: number;
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

export interface DOEContext {
  process_name: string;
  engineer: string;
  baseline_description?: string | null;
  experiment_description?: string | null;
  doe_factors: Record<string, unknown>;
  alignment_method: string;
  time_assumptions: string[];
}

export interface DOEAnalysisPlan {
  alignment_method: string;
  windowing?: string | null;
  transformations: string[];
  tests: string[];
  excluded_parameters: string[];
  assumptions: string[];
  rationale: string;
}

export interface DOEComparisonRow {
  parameter: string;
  baseline_mean: number;
  experiment_mean: number;
  delta_percent: number | null;
  variance_change: number | null;
  test_used: string | null;
  p_value: number | null;
  baseline_std: number;
  experiment_std: number;
  baseline_n: number;
  experiment_n: number;
}

export interface DOEStabilityRisk {
  drift_detected: boolean;
  noise_amplification: boolean;
  transient_behavior: boolean;
  control_limit_proximity: string;
  details: string[];
}

export interface DOEEngineeringInterpretation {
  summary: string;
  material_changes: string[];
  implications: string[];
  recommended_actions: string[];
}

export interface DOEConfidenceComponents {
  data_completeness: number;
  sample_adequacy: number;
  noise_ratio: number;
  significance_robustness: number;
  assumption_risk: number;
}

export interface DOEConfidenceWeights {
  data_completeness: number;
  sample_adequacy: number;
  noise_ratio: number;
  significance_robustness: number;
  assumption_risk: number;
}

export interface DOEConfidenceScore {
  score: number;
  components: DOEConfidenceComponents;
  weights: DOEConfidenceWeights;
}

export interface DOEReport {
  report_id: string;
  created_at: string;
  context: DOEContext;
  analysis_plan: DOEAnalysisPlan;
  comparison_table: DOEComparisonRow[];
  stability_risk: DOEStabilityRisk;
  engineering_interpretation: DOEEngineeringInterpretation;
  confidence: DOEConfidenceScore;
  verdict: string;
  plot_scripts: Array<{ title: string; code: string }>;
  warnings: string[];
  errors: string[];
  raw_metadata?: Record<string, unknown>;
}

export interface DOEUploadResponse {
  success: boolean;
  report_id?: string | null;
  message: string;
  warnings: string[];
  errors: string[];
}

export interface DOEAgentLogsResponse {
  report_id: string;
  logs: Array<Record<string, unknown>>;
}

export interface AnalyzerSignalProfile {
  type: string;
  rows: number;
  missing_pct: number;
  distribution: string;
  stationarity?: string | null;
  units?: string | null;
}

export interface AnalyzerDatasetProfile {
  dataset_type: string;
  quality_score: number;
  signals: Record<string, AnalyzerSignalProfile>;
  preview_rows: Array<Record<string, unknown>>;
  time_assumptions: string[];
}

export interface AnalyzerPlannerTest {
  test: string;
  applies_to: string;
  reason: string;
}

export interface AnalyzerPlan {
  analysis_goal: string;
  recommended_tests: AnalyzerPlannerTest[];
  recommended_plots: string[];
  assumptions: string[];
}

export interface AnalyzerPlanResponse {
  profile: AnalyzerDatasetProfile;
  plan: AnalyzerPlan;
}

export interface AnalyzerExecutionStatistic {
  mean?: number | null;
  std?: number | null;
  median?: number | null;
  min?: number | null;
  max?: number | null;
  p_values: Record<string, number | null>;
  notes: string[];
}

export interface AnalyzerPlotArtifact {
  title: string;
  data_uri: string;
}

export interface AnalyzerExecutionResults {
  statistics: Record<string, AnalyzerExecutionStatistic>;
  plots: AnalyzerPlotArtifact[];
}

export interface AnalyzerValidation {
  valid: boolean;
  warnings: string[];
  confidence_penalty: number;
}

export interface AnalyzerConfidence {
  score: number;
  components: Record<string, number>;
}

export interface AnalyzerExplanation {
  summary: string;
  conclusions: string[];
  limitations: string[];
  tests_used: string[];
  signals_used: string[];
}

export interface AnalyzerReport {
  report_id: string;
  created_at: string;
  profile: AnalyzerDatasetProfile;
  plan: AnalyzerPlan;
  results: AnalyzerExecutionResults;
  validation: AnalyzerValidation;
  confidence: AnalyzerConfidence;
  explanation: AnalyzerExplanation;
  assumptions: string[];
  warnings: string[];
  errors: string[];
}

export interface AnalyzerRunResponse {
  success: boolean;
  report_id?: string | null;
  message: string;
  errors: string[];
}

export interface ApiError {
  detail: string;
}

export interface ComparisonSummary {
  asset_id: string;
  comparison_status: string;
  primary_deviation_signal: string | null;
  confidence_level: number;
  recommended_action: string;
  engineering_rationale: string;
}

export interface ComparisonSignalStats {
  mean: number;
  std: number;
  count: number;
  min?: number | null;
  max?: number | null;
}

export interface ComparisonDeviationMetrics {
  absolute_delta: number;
  percent_delta: number | null;
  z_score_vs_baseline: number | null;
  trend_difference: number | null;
  persistence_above_baseline: number | null;
}

export interface ComparisonSignal {
  signal_name: string;
  baseline_stats: ComparisonSignalStats;
  experiment_stats: ComparisonSignalStats;
  deviation_metrics: ComparisonDeviationMetrics;
  severity: string;
  persistence?: number | null;
  explanation: string;
}

export interface ComparisonAlignmentMetadata {
  alignment_method: string;
  baseline_points: number;
  experiment_points: number;
  aligned_points: number;
  data_loss_percent: number;
  warnings: string[];
}

export interface ComparisonReport {
  report_id: string;
  created_at: string;
  comparison_summary: ComparisonSummary;
  signal_comparison: ComparisonSignal[];
  alignment_metadata: ComparisonAlignmentMetadata;
  raw_metadata?: Record<string, unknown>;
}

export interface ComparisonUploadResponse {
  success: boolean;
  report_id?: string | null;
  message: string;
  errors: string[];
  warnings: string[];
}

export interface AgentStatusResponse {
  job_id: string;
  status: string;
  warnings: string[];
  errors: string[];
}

export interface AgentLogsResponse {
  job_id: string;
  logs: Array<Record<string, unknown>>;
}
