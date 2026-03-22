import type { RootCauseCaseStatus, RootCausePriority } from "@/types/root-cause";

export type RootCauseHandoffSource = "analyzer" | "compare" | "maintenance";

export interface RootCauseHandoffPayload {
  source: RootCauseHandoffSource;
  sourceLabel: string;
  generatedAt: string;
  suggestedCaseName: string;
  suggestedStatus?: RootCauseCaseStatus;
  suggestedPriority?: RootCausePriority;
  draft: {
    title: string;
    owner?: string;
    processArea?: string;
    assetOrLine?: string;
    symptom: string;
    defectStatement: string;
    businessImpact?: string;
    dataSources?: string;
    evidenceSummary?: string;
    verifiedRootCause?: string;
    correctiveAction?: string;
    preventiveAction?: string;
    controlMethod?: string;
    monitoringMetric?: string;
    reactionPlan?: string;
  };
  suspectedCauses?: string[];
}

export const ROOT_CAUSE_HANDOFF_STORAGE_KEY = "ai_data_interpreter:root-cause-handoff";
export const ROOT_CAUSE_HANDOFF_EVENT = "root-cause-handoff-updated";

export function savePendingRootCauseHandoff(payload: RootCauseHandoffPayload) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ROOT_CAUSE_HANDOFF_STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent(ROOT_CAUSE_HANDOFF_EVENT, { detail: payload }));
}

export function readPendingRootCauseHandoff(): RootCauseHandoffPayload | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(ROOT_CAUSE_HANDOFF_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as RootCauseHandoffPayload;
  } catch {
    return null;
  }
}

export function clearPendingRootCauseHandoff() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(ROOT_CAUSE_HANDOFF_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(ROOT_CAUSE_HANDOFF_EVENT, { detail: null }));
}
