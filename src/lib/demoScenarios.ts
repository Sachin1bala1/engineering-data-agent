export type DemoScenario = {
  id: string;
  title: string;
  businessGoal: string;
  module: "compare" | "analyzer" | "doe" | "knowledge-twin";
  datasetLabel?: string;
  datasetPath?: string;
  notes: string;
};

export const demoScenarios: DemoScenario[] = [
  {
    id: "baseline-validation",
    title: "Baseline vs Experiment Validation",
    businessGoal: "Compare a new setup against the current baseline before rollout.",
    module: "compare",
    datasetLabel: "baseline_vs_experiment_demo.csv (grouped baseline/experiment rows)",
    datasetPath: "/baseline_vs_experiment_demo.csv",
    notes: "Use this grouped CSV for KPI deltas, rollout decisions, and outlier batch review. Split by scenario = baseline / experiment.",
  },
  {
    id: "root-cause-monitoring",
    title: "Process Drift and Root-Cause Monitoring",
    businessGoal: "Investigate process performance, drift, and dominant numeric drivers.",
    module: "analyzer",
    datasetLabel: "graph_builder_demo.csv",
    datasetPath: "/graph_builder_demo.csv",
    notes: "Use this for charting, trend review, and analyzer planning.",
  },
  {
    id: "doe-optimization",
    title: "DOE Optimization",
    businessGoal: "Tune process parameters to improve yield and reduce defects.",
    module: "doe",
    datasetLabel: "coating_line_doe.csv",
    datasetPath: "/doe_examples/coating_line_doe.csv",
    notes: "Use this for factor screening, run-budget discussion, and operating-window decisions.",
  },
  {
    id: "preventive-maintenance",
    title: "Preventive Maintenance and Asset Risk",
    businessGoal: "Detect equipment deterioration early enough to avoid downtime.",
    module: "knowledge-twin",
    notes: "Use the bundled maintenance logs, incidents, and SOP pack directly inside Knowledge Twin.",
  },
];

export const knowledgeTwinDemoAssets = {
  logs: {
    label: "example_maintenance_logs.csv",
    path: "/knowledge_twin_examples/example_maintenance_logs.csv",
  },
  incidents: {
    label: "incidents.csv",
    path: "/knowledge_twin_examples/incidents.csv",
  },
  sop: {
    label: "motor_sop.txt",
    path: "/knowledge_twin_examples/motor_sop.txt",
  },
};
