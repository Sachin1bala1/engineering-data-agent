export type DmaicPhase = "define" | "measure" | "analyze" | "improve" | "control";
export type RootCauseCaseStatus = "open" | "containment" | "analysis" | "improvement" | "control" | "closed";
export type RootCausePriority = "critical" | "high" | "medium" | "low";

export interface FiveWhyRow {
  why: string;
  answer: string;
}

export interface FishboneCategory {
  name: string;
  notes: string;
}

export interface RootCauseActionItem {
  action: string;
  owner: string;
  dueDate: string;
  expectedImpact: string;
}

export interface FmeaRow {
  failureMode: string;
  effect: string;
  cause: string;
  currentControls: string;
  severity: string;
  occurrence: string;
  detection: string;
  owner: string;
}

export interface ControlPlanRow {
  ctq: string;
  method: string;
  frequency: string;
  owner: string;
}

export interface ReactionPlanRow {
  trigger: string;
  response: string;
  escalationOwner: string;
}

export interface RootCauseCaseDraft {
  title: string;
  owner: string;
  team: string;
  processArea: string;
  assetOrLine: string;
  symptom: string;
  defectStatement: string;
  businessImpact: string;
  firstSeenDate: string;
  containmentAction: string;
  baselineMetric: string;
  targetMetric: string;
  gapStatement: string;
  dataSources: string;
  sampleWindow: string;
  sampleAdequacy: string;
  evidenceSummary: string;
  verifiedRootCause: string;
  correctiveAction: string;
  preventiveAction: string;
  controlMethod: string;
  monitoringMetric: string;
  reactionPlan: string;
  effectivenessCheckDate: string;
}

export interface RootCauseCaseRecord {
  id: string;
  name: string;
  status: RootCauseCaseStatus;
  priority: RootCausePriority;
  createdAt: string;
  updatedAt: string;
  draft: RootCauseCaseDraft;
  fiveWhys: FiveWhyRow[];
  fishbone: FishboneCategory[];
  suspectedCauses: string[];
  improvementActions: RootCauseActionItem[];
  fmeaRows: FmeaRow[];
  controlPlanRows: ControlPlanRow[];
  reactionPlanRows: ReactionPlanRow[];
}
