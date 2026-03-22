import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { WorkspaceActionBar } from "@/components/workspace/WorkspaceActionBar";
import { WorkspaceMetricChip } from "@/components/workspace/WorkspaceMetricChip";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";
import { workspaceToolbarButtonClassName, workspaceToolbarPrimaryButtonClassName } from "@/components/workspace/workspaceToolbarTokens";
import { engineeringApi, getErrorMessage } from "@/lib/engineering-api";
import { clearPendingRootCauseHandoff, readPendingRootCauseHandoff, ROOT_CAUSE_HANDOFF_EVENT, type RootCauseHandoffPayload } from "@/lib/rootCauseHandoff";
import type { RootCauseAgentResponse } from "@/types/engineering-api";
import type { ControlPlanRow, FishboneCategory, FiveWhyRow, FmeaRow, ReactionPlanRow, RootCauseActionItem, RootCauseCaseDraft, RootCauseCaseRecord, RootCauseCaseStatus, RootCausePriority } from "@/types/root-cause";

const defaultDraft: RootCauseCaseDraft = {
  title: "",
  owner: "",
  team: "",
  processArea: "",
  assetOrLine: "",
  symptom: "",
  defectStatement: "",
  businessImpact: "",
  firstSeenDate: "",
  containmentAction: "",
  baselineMetric: "",
  targetMetric: "",
  gapStatement: "",
  dataSources: "",
  sampleWindow: "",
  sampleAdequacy: "",
  evidenceSummary: "",
  verifiedRootCause: "",
  correctiveAction: "",
  preventiveAction: "",
  controlMethod: "",
  monitoringMetric: "",
  reactionPlan: "",
  effectivenessCheckDate: "",
};

const defaultFiveWhys: FiveWhyRow[] = Array.from({ length: 5 }, (_, index) => ({
  why: `Why ${index + 1}`,
  answer: "",
}));

const defaultFishbone: FishboneCategory[] = [
  { name: "Manpower", notes: "" },
  { name: "Method", notes: "" },
  { name: "Machine", notes: "" },
  { name: "Material", notes: "" },
  { name: "Measurement", notes: "" },
  { name: "Environment", notes: "" },
];

const defaultFmeaRows: FmeaRow[] = [
  {
    failureMode: "",
    effect: "",
    cause: "",
    currentControls: "",
    severity: "",
    occurrence: "",
    detection: "",
    owner: "",
  },
];

const defaultControlPlanRows: ControlPlanRow[] = [
  { ctq: "", method: "", frequency: "", owner: "" },
];

const defaultReactionPlanRows: ReactionPlanRow[] = [
  { trigger: "", response: "", escalationOwner: "" },
];

const phaseFieldMap = {
  define: ["title", "owner", "processArea", "symptom", "defectStatement", "businessImpact", "firstSeenDate", "containmentAction"] satisfies Array<keyof RootCauseCaseDraft>,
  measure: ["baselineMetric", "targetMetric", "gapStatement", "dataSources", "sampleWindow", "sampleAdequacy"] satisfies Array<keyof RootCauseCaseDraft>,
  analyze: ["evidenceSummary", "verifiedRootCause"] satisfies Array<keyof RootCauseCaseDraft>,
  improve: ["correctiveAction", "preventiveAction"] satisfies Array<keyof RootCauseCaseDraft>,
  control: ["controlMethod", "monitoringMetric", "reactionPlan", "effectivenessCheckDate"] satisfies Array<keyof RootCauseCaseDraft>,
};

const RCA_CASES_STORAGE_KEY = "ai_data_interpreter:root-cause-cases";
const CASE_STATUS_OPTIONS: RootCauseCaseStatus[] = ["open", "containment", "analysis", "improvement", "control", "closed"];
const CASE_PRIORITY_OPTIONS: RootCausePriority[] = ["critical", "high", "medium", "low"];
const statusLabelMap: Record<RootCauseCaseStatus, string> = {
  open: "Open",
  containment: "Containment",
  analysis: "Analysis",
  improvement: "Improvement",
  control: "Control",
  closed: "Closed",
};
const priorityLabelMap: Record<RootCausePriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function cloneDraft(): RootCauseCaseDraft {
  return { ...defaultDraft };
}

function cloneFiveWhys(): FiveWhyRow[] {
  return defaultFiveWhys.map((row) => ({ ...row }));
}

function cloneFishbone(): FishboneCategory[] {
  return defaultFishbone.map((row) => ({ ...row }));
}

function cloneFmeaRows(): FmeaRow[] {
  return defaultFmeaRows.map((row) => ({ ...row }));
}

function cloneControlPlanRows(): ControlPlanRow[] {
  return defaultControlPlanRows.map((row) => ({ ...row }));
}

function cloneReactionPlanRows(): ReactionPlanRow[] {
  return defaultReactionPlanRows.map((row) => ({ ...row }));
}

function cloneImprovementActions(): RootCauseActionItem[] {
  return [{ action: "", owner: "", dueDate: "", expectedImpact: "" }];
}

function createBlankWorkspace() {
  return {
    draft: cloneDraft(),
    fiveWhys: cloneFiveWhys(),
    fishbone: cloneFishbone(),
    suspectedCauses: [""],
    improvementActions: cloneImprovementActions(),
    fmeaRows: cloneFmeaRows(),
    controlPlanRows: cloneControlPlanRows(),
    reactionPlanRows: cloneReactionPlanRows(),
  };
}

function createCaseRecord(name: string, workspace = createBlankWorkspace()): RootCauseCaseRecord {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    status: "open",
    priority: "medium",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...workspace,
  };
}

function serializeWorkspace(workspace: Omit<RootCauseCaseRecord, "id" | "name" | "status" | "priority" | "createdAt" | "updatedAt">) {
  return JSON.stringify(workspace);
}

function toDaysOpen(createdAt: string): number | null {
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  const diff = Date.now() - timestamp;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function isPastDue(dateText: string): boolean {
  if (!dateText) {
    return false;
  }
  const due = new Date(dateText);
  if (!Number.isFinite(due.getTime())) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

function normalizeImportedCase(raw: unknown): RootCauseCaseRecord | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const input = raw as Partial<RootCauseCaseRecord>;
  const blank = createBlankWorkspace();
  const name = String(input.name || input.draft?.title || "Imported RCA Investigation");
  const record = createCaseRecord(name, {
    draft: { ...blank.draft, ...(input.draft || {}) },
    fiveWhys: Array.isArray(input.fiveWhys) && input.fiveWhys.length ? input.fiveWhys.map((row) => ({ why: String(row.why || ""), answer: String(row.answer || "") })) : blank.fiveWhys,
    fishbone: Array.isArray(input.fishbone) && input.fishbone.length ? input.fishbone.map((row) => ({ name: String(row.name || ""), notes: String(row.notes || "") })) : blank.fishbone,
    suspectedCauses: Array.isArray(input.suspectedCauses) && input.suspectedCauses.length ? input.suspectedCauses.map((item) => String(item || "")) : blank.suspectedCauses,
    improvementActions: Array.isArray(input.improvementActions) && input.improvementActions.length
      ? input.improvementActions.map((row) => ({
          action: String(row.action || ""),
          owner: String(row.owner || ""),
          dueDate: String(row.dueDate || ""),
          expectedImpact: String(row.expectedImpact || ""),
        }))
      : blank.improvementActions,
    fmeaRows: Array.isArray(input.fmeaRows) && input.fmeaRows.length
      ? input.fmeaRows.map((row) => ({
          failureMode: String(row.failureMode || ""),
          effect: String(row.effect || ""),
          cause: String(row.cause || ""),
          currentControls: String(row.currentControls || ""),
          severity: String(row.severity || ""),
          occurrence: String(row.occurrence || ""),
          detection: String(row.detection || ""),
          owner: String(row.owner || ""),
        }))
      : blank.fmeaRows,
    controlPlanRows: Array.isArray(input.controlPlanRows) && input.controlPlanRows.length
      ? input.controlPlanRows.map((row) => ({
          ctq: String(row.ctq || ""),
          method: String(row.method || ""),
          frequency: String(row.frequency || ""),
          owner: String(row.owner || ""),
        }))
      : blank.controlPlanRows,
    reactionPlanRows: Array.isArray(input.reactionPlanRows) && input.reactionPlanRows.length
      ? input.reactionPlanRows.map((row) => ({
          trigger: String(row.trigger || ""),
          response: String(row.response || ""),
          escalationOwner: String(row.escalationOwner || ""),
        }))
      : blank.reactionPlanRows,
  });
  record.id = String(input.id || record.id);
  record.status = CASE_STATUS_OPTIONS.includes(input.status as RootCauseCaseStatus) ? (input.status as RootCauseCaseStatus) : record.status;
  record.priority = CASE_PRIORITY_OPTIONS.includes(input.priority as RootCausePriority) ? (input.priority as RootCausePriority) : record.priority;
  record.createdAt = String(input.createdAt || record.createdAt);
  record.updatedAt = String(input.updatedAt || new Date().toISOString());
  return record;
}

export function RootCauseWorkspace() {
  const [draft, setDraft] = useState<RootCauseCaseDraft>(() => cloneDraft());
  const [fiveWhys, setFiveWhys] = useState<FiveWhyRow[]>(() => cloneFiveWhys());
  const [fishbone, setFishbone] = useState<FishboneCategory[]>(() => cloneFishbone());
  const [suspectedCauses, setSuspectedCauses] = useState<string[]>([""]);
  const [improvementActions, setImprovementActions] = useState<RootCauseActionItem[]>(() => cloneImprovementActions());
  const [fmeaRows, setFmeaRows] = useState<FmeaRow[]>(() => cloneFmeaRows());
  const [controlPlanRows, setControlPlanRows] = useState<ControlPlanRow[]>(() => cloneControlPlanRows());
  const [reactionPlanRows, setReactionPlanRows] = useState<ReactionPlanRow[]>(() => cloneReactionPlanRows());
  const [agentRole, setAgentRole] = useState("engineer");
  const [agentResponse, setAgentResponse] = useState<RootCauseAgentResponse | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [caseName, setCaseName] = useState("");
  const [caseStatus, setCaseStatus] = useState<RootCauseCaseStatus>("open");
  const [casePriority, setCasePriority] = useState<RootCausePriority>("medium");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<RootCauseCaseStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<RootCausePriority | "all">("all");
  const [dateFilter, setDateFilter] = useState("");
  const [pendingHandoff, setPendingHandoff] = useState<RootCauseHandoffPayload | null>(() => readPendingRootCauseHandoff());
  const [savedCases, setSavedCases] = useState<RootCauseCaseRecord[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    try {
      const raw = window.localStorage.getItem(RCA_CASES_STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const resetWorkspace = () => {
    const blank = createBlankWorkspace();
    setDraft(blank.draft);
    setFiveWhys(blank.fiveWhys);
    setFishbone(blank.fishbone);
    setSuspectedCauses(blank.suspectedCauses);
    setImprovementActions(blank.improvementActions);
    setFmeaRows(blank.fmeaRows);
    setControlPlanRows(blank.controlPlanRows);
    setReactionPlanRows(blank.reactionPlanRows);
    setAgentResponse(null);
    setCaseStatus("open");
    setCasePriority("medium");
  };

  const loadCaseIntoWorkspace = (record: RootCauseCaseRecord) => {
    setDraft({ ...record.draft });
    setFiveWhys(record.fiveWhys.map((row) => ({ ...row })));
    setFishbone(record.fishbone.map((row) => ({ ...row })));
    setSuspectedCauses(record.suspectedCauses.length ? [...record.suspectedCauses] : [""]);
    setImprovementActions(record.improvementActions.length ? record.improvementActions.map((row) => ({ ...row })) : cloneImprovementActions());
    setFmeaRows(record.fmeaRows.length ? record.fmeaRows.map((row) => ({ ...row })) : cloneFmeaRows());
    setControlPlanRows(record.controlPlanRows.length ? record.controlPlanRows.map((row) => ({ ...row })) : cloneControlPlanRows());
    setReactionPlanRows(record.reactionPlanRows.length ? record.reactionPlanRows.map((row) => ({ ...row })) : cloneReactionPlanRows());
    setSelectedCaseId(record.id);
    setCaseName(record.name);
    setCaseStatus(record.status ?? "open");
    setCasePriority(record.priority ?? "medium");
    setAgentResponse(null);
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(RCA_CASES_STORAGE_KEY, JSON.stringify(savedCases));
  }, [savedCases]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleHandoffUpdate = (event: Event) => {
      setPendingHandoff((event as CustomEvent<RootCauseHandoffPayload | null>).detail ?? readPendingRootCauseHandoff());
    };
    window.addEventListener(ROOT_CAUSE_HANDOFF_EVENT, handleHandoffUpdate as EventListener);
    return () => {
      window.removeEventListener(ROOT_CAUSE_HANDOFF_EVENT, handleHandoffUpdate as EventListener);
    };
  }, []);

  const updateDraft = <K extends keyof RootCauseCaseDraft>(key: K, value: RootCauseCaseDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const workspaceSnapshot = useMemo(
    () => ({
      draft,
      fiveWhys,
      fishbone,
      suspectedCauses,
      improvementActions,
      fmeaRows,
      controlPlanRows,
      reactionPlanRows,
    }),
    [controlPlanRows, draft, fishbone, fiveWhys, fmeaRows, improvementActions, reactionPlanRows, suspectedCauses]
  );

  const activeCase = useMemo(
    () => savedCases.find((item) => item.id === selectedCaseId) ?? null,
    [savedCases, selectedCaseId]
  );

  const filteredCases = useMemo(() => {
    return savedCases.filter((item) => {
      const ownerMatches = ownerFilter.trim()
        ? item.draft.owner.toLowerCase().includes(ownerFilter.trim().toLowerCase())
        : true;
      const statusMatches = statusFilter === "all" ? true : item.status === statusFilter;
      const priorityMatches = priorityFilter === "all" ? true : item.priority === priorityFilter;
      const dateMatches = dateFilter ? item.updatedAt.slice(0, 10) === dateFilter : true;
      return ownerMatches && statusMatches && priorityMatches && dateMatches;
    });
  }, [dateFilter, ownerFilter, priorityFilter, savedCases, statusFilter]);

  const overdueActionCount = useMemo(
    () =>
      savedCases.reduce(
        (count, item) => count + item.improvementActions.filter((action) => action.action.trim() && isPastDue(action.dueDate)).length,
        0
      ),
    [savedCases]
  );

  const openCaseCount = useMemo(
    () => savedCases.filter((item) => item.status !== "closed").length,
    [savedCases]
  );

  const currentCaseReadiness = useMemo(() => {
    const completedFields = Object.values(phaseProgress).reduce((sum, phase) => sum + phase.completed, 0);
    const totalFields = Object.values(phaseProgress).reduce((sum, phase) => sum + phase.total, 0);
    return totalFields ? Math.round((completedFields / totalFields) * 100) : 0;
  }, [phaseProgress]);

  const isDirty = useMemo(() => {
    if (!activeCase) {
      return Boolean(
        draft.title.trim() ||
        draft.symptom.trim() ||
        draft.defectStatement.trim() ||
        draft.verifiedRootCause.trim() ||
        improvementActions.some((item) => item.action.trim())
      );
    }
    return serializeWorkspace(workspaceSnapshot) !== serializeWorkspace({
      draft: activeCase.draft,
      fiveWhys: activeCase.fiveWhys,
      fishbone: activeCase.fishbone,
      suspectedCauses: activeCase.suspectedCauses,
      improvementActions: activeCase.improvementActions,
      fmeaRows: activeCase.fmeaRows,
      controlPlanRows: activeCase.controlPlanRows,
      reactionPlanRows: activeCase.reactionPlanRows,
    });
  }, [activeCase, draft.defectStatement, draft.symptom, draft.title, draft.verifiedRootCause, improvementActions, workspaceSnapshot]);

  const createNewInvestigation = () => {
    resetWorkspace();
    setSelectedCaseId(null);
    setCaseName("");
    setError(null);
    setStatusMessage("Started a new blank RCA investigation.");
  };

  const saveCurrentCase = () => {
    const recordName = caseName.trim() || draft.title.trim() || `RCA Investigation ${savedCases.length + 1}`;
    const timestamp = new Date().toISOString();
    setSavedCases((current) => {
      if (selectedCaseId) {
        return current.map((item) =>
          item.id === selectedCaseId
            ? {
                ...item,
                name: recordName,
                status: caseStatus,
                priority: casePriority,
                updatedAt: timestamp,
                ...workspaceSnapshot,
              }
            : item
        );
      }
      const created = createCaseRecord(recordName, workspaceSnapshot);
      setSelectedCaseId(created.id);
      return [created, ...current];
    });
    setCaseName(recordName);
    setError(null);
    setStatusMessage(selectedCaseId ? `Saved changes to "${recordName}".` : `Created RCA investigation "${recordName}".`);
  };

  const saveAsNewCase = () => {
    const recordName = caseName.trim() || draft.title.trim() || `RCA Investigation ${savedCases.length + 1}`;
    const created = createCaseRecord(recordName, workspaceSnapshot);
    created.status = caseStatus;
    created.priority = casePriority;
    setSavedCases((current) => [created, ...current]);
    setSelectedCaseId(created.id);
    setCaseName(recordName);
    setError(null);
    setStatusMessage(`Saved a new RCA investigation copy as "${recordName}".`);
  };

  const loadSelectedCase = () => {
    if (!selectedCaseId) {
      setError("Choose an RCA investigation to load.");
      return;
    }
    const record = savedCases.find((item) => item.id === selectedCaseId);
    if (!record) {
      setError("The selected RCA investigation could not be found.");
      return;
    }
    loadCaseIntoWorkspace(record);
    setError(null);
    setStatusMessage(`Loaded RCA investigation "${record.name}".`);
  };

  const deleteCurrentCase = () => {
    if (!selectedCaseId) {
      setError("Select a saved RCA investigation before deleting.");
      return;
    }
    const record = savedCases.find((item) => item.id === selectedCaseId);
    setSavedCases((current) => current.filter((item) => item.id !== selectedCaseId));
    createNewInvestigation();
    setStatusMessage(record ? `Deleted RCA investigation "${record.name}".` : "Deleted RCA investigation.");
  };

  const importCaseFile = async (file: File | null) => {
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = normalizeImportedCase(parsed);
      if (!imported) {
        throw new Error("The selected file is not a valid RCA case export.");
      }
      setSavedCases((current) => {
        const withoutDuplicate = current.filter((item) => item.id !== imported.id);
        return [imported, ...withoutDuplicate];
      });
      loadCaseIntoWorkspace(imported);
      setError(null);
      setStatusMessage(`Imported RCA investigation "${imported.name}".`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to import RCA case"));
    }
  };

  const importHandoff = (handoff: RootCauseHandoffPayload, replaceCurrent = false) => {
    if (replaceCurrent && isDirty) {
      const confirmed = window.confirm("The current RCA workspace has unsaved changes. Replace it with the incoming handoff?");
      if (!confirmed) {
        return;
      }
    }

    const blank = createBlankWorkspace();
    const nextDraft: RootCauseCaseDraft = {
      ...blank.draft,
      title: handoff.draft.title,
      owner: handoff.draft.owner || "",
      processArea: handoff.draft.processArea || "",
      assetOrLine: handoff.draft.assetOrLine || "",
      symptom: handoff.draft.symptom,
      defectStatement: handoff.draft.defectStatement,
      businessImpact: handoff.draft.businessImpact || "",
      dataSources: handoff.draft.dataSources || "",
      evidenceSummary: handoff.draft.evidenceSummary || "",
      verifiedRootCause: handoff.draft.verifiedRootCause || "",
      correctiveAction: handoff.draft.correctiveAction || "",
      preventiveAction: handoff.draft.preventiveAction || "",
      controlMethod: handoff.draft.controlMethod || "",
      monitoringMetric: handoff.draft.monitoringMetric || "",
      reactionPlan: handoff.draft.reactionPlan || "",
    };
    const record = createCaseRecord(handoff.suggestedCaseName, {
      ...blank,
      draft: nextDraft,
      suspectedCauses: handoff.suspectedCauses?.length ? handoff.suspectedCauses : blank.suspectedCauses,
    });
    record.status = handoff.suggestedStatus || "analysis";
    record.priority = handoff.suggestedPriority || "medium";
    setSavedCases((current) => [record, ...current]);
    loadCaseIntoWorkspace(record);
    clearPendingRootCauseHandoff();
    setPendingHandoff(null);
    setError(null);
    setStatusMessage(`Created RCA investigation "${record.name}" from ${handoff.sourceLabel}.`);
  };

  const exportCurrentCase = () => {
    const exportName = caseName.trim() || activeCase?.name || draft.title.trim();
    if (!exportName) {
      setError("Name the RCA investigation before exporting it.");
      return;
    }
    const payload: RootCauseCaseRecord = {
      id: selectedCaseId ?? crypto.randomUUID(),
      name: exportName,
      status: caseStatus,
      priority: casePriority,
      createdAt: activeCase?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...workspaceSnapshot,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exportName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "rca-investigation"}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
    setError(null);
    setStatusMessage(`Exported RCA investigation "${exportName}".`);
  };

  useEffect(() => {
    if (!pendingHandoff) {
      return;
    }
    const workspaceEmpty = !draft.title.trim() && !draft.symptom.trim() && !draft.defectStatement.trim() && !selectedCaseId;
    if (workspaceEmpty && !isDirty) {
      importHandoff(pendingHandoff, false);
    }
  }, [draft.defectStatement, draft.symptom, draft.title, importHandoff, isDirty, pendingHandoff, selectedCaseId]);

  const phaseProgress = useMemo(() => {
    return Object.entries(phaseFieldMap).map(([phase, keys]) => {
      const completed = keys.filter((key) => String(draft[key] || "").trim()).length;
      return { phase, completed, total: keys.length };
    });
  }, [draft]);

  const completedPhases = phaseProgress.filter((phase) => phase.completed === phase.total).length;
  const requiredMissing = useMemo(() => {
    return Object.entries(phaseFieldMap).flatMap(([phase, keys]) =>
      keys
        .filter((key) => !String(draft[key] || "").trim())
        .map((key) => `${phase}: ${String(key)}`)
    );
  }, [draft]);

  const renderLabel = (label: string, required = false) => (
    <div className="text-xs uppercase tracking-wide text-muted-foreground">
      {label} {required ? <span className="text-red-600">*</span> : null}
    </div>
  );

  const runRootCauseAgent = async () => {
    if (!draft.symptom.trim()) {
      setError("Symptom is required before running the root-cause agent.");
      return;
    }
    setAgentBusy(true);
    setError(null);
    try {
      const response = await engineeringApi.runRootCauseAgent({
        symptom: draft.symptom,
        role: agentRole,
        objective: draft.title || undefined,
        notes: [draft.businessImpact, draft.evidenceSummary].filter(Boolean).join(" | ") || undefined,
      });
      setAgentResponse(response);
      if (!draft.verifiedRootCause && response.hypotheses[0]?.hypothesis) {
        updateDraft("verifiedRootCause", response.hypotheses[0].hypothesis);
      }
      if (!draft.correctiveAction && response.hypotheses[0]?.countermeasures?.length) {
        updateDraft("correctiveAction", response.hypotheses[0].countermeasures.join("; "));
      }
      setSuspectedCauses(response.hypotheses.map((item) => item.hypothesis));
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Root-cause agent failed"));
    } finally {
      setAgentBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <WorkspaceActionBar
        title="Root Cause Analysis Workspace"
        description="A professional DMAIC structure for manufacturing investigations, with explicit problem definition, evidence capture, cause development, action planning, and control."
        metrics={
          <>
            <WorkspaceMetricChip label="Cases" value={savedCases.length.toString()} />
            <WorkspaceMetricChip label="Critical / high" value={savedCases.filter((item) => item.priority === "critical" || item.priority === "high").length.toString()} />
            <WorkspaceMetricChip label="Open cases" value={openCaseCount.toString()} />
            <WorkspaceMetricChip label="Overdue actions" value={overdueActionCount.toString()} />
            <WorkspaceMetricChip label="DMAIC" value={`${completedPhases}/5 complete`} />
            <WorkspaceMetricChip label="Suspected causes" value={suspectedCauses.filter(Boolean).length.toString()} />
            <WorkspaceMetricChip label="Actions" value={improvementActions.filter((item) => item.action.trim()).length.toString()} />
          </>
        }
      />

      <WorkspaceResultCard title="Investigation Manager" contentClassName="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Investigation name</div>
              <Input placeholder="Named RCA investigation" value={caseName} onChange={(e) => setCaseName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Status</div>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={caseStatus} onChange={(e) => setCaseStatus(e.target.value as RootCauseCaseStatus)}>
                {CASE_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>{statusLabelMap[option]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Priority</div>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={casePriority} onChange={(e) => setCasePriority(e.target.value as RootCausePriority)}>
                {CASE_PRIORITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>{priorityLabelMap[option]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Saved investigations</div>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedCaseId ?? ""}
                onChange={(e) => {
                  const nextId = e.target.value || null;
                  setSelectedCaseId(nextId);
                  const nextRecord = savedCases.find((item) => item.id === nextId);
                  if (nextRecord) {
                    setCaseName(nextRecord.name);
                  }
                }}
              >
                <option value="">Select saved investigation</option>
                {savedCases.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({new Date(item.updatedAt).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button variant="outline" className={workspaceToolbarButtonClassName} onClick={createNewInvestigation}>New blank case</Button>
            <Button variant="outline" className={workspaceToolbarButtonClassName} onClick={loadSelectedCase} disabled={!selectedCaseId}>Load case</Button>
            <Button className={workspaceToolbarPrimaryButtonClassName} onClick={saveCurrentCase}>Save case</Button>
            <Button variant="outline" className={workspaceToolbarButtonClassName} onClick={saveAsNewCase}>Save as new</Button>
            <Button variant="outline" className={workspaceToolbarButtonClassName} onClick={exportCurrentCase}>Export case</Button>
            <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium">
              Import case
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={(event) => {
                  void importCaseFile(event.target.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <Button variant="outline" className={workspaceToolbarButtonClassName} onClick={deleteCurrentCase} disabled={!selectedCaseId}>Delete case</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{activeCase ? `Active case: ${activeCase.name}` : "No saved case loaded"}</Badge>
          <Badge variant={isDirty ? "secondary" : "outline"}>{isDirty ? "Unsaved changes" : "All changes saved"}</Badge>
          <Badge variant="outline">Status: {statusLabelMap[caseStatus]}</Badge>
          <Badge variant="outline">Priority: {priorityLabelMap[casePriority]}</Badge>
        </div>
        {statusMessage ? <div className="text-sm text-emerald-700">{statusMessage}</div> : null}
      </WorkspaceResultCard>

      {pendingHandoff ? (
        <WorkspaceResultCard title="Incoming RCA Handoff" contentClassName="space-y-3">
          <div className="text-sm text-muted-foreground">
            A new RCA starter was prepared from <strong>{pendingHandoff.sourceLabel}</strong>. You can create a managed investigation from that evidence now.
          </div>
          <div className="grid gap-3 md:grid-cols-2 text-sm">
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Suggested case</div>
              <div className="mt-2 font-medium">{pendingHandoff.suggestedCaseName}</div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Summary</div>
              <div className="mt-2">{pendingHandoff.draft.evidenceSummary || pendingHandoff.draft.defectStatement}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className={workspaceToolbarPrimaryButtonClassName} onClick={() => importHandoff(pendingHandoff, true)}>
              Create case from handoff
            </Button>
            <Button variant="outline" className={workspaceToolbarButtonClassName} onClick={() => {
              clearPendingRootCauseHandoff();
              setPendingHandoff(null);
            }}>
              Dismiss
            </Button>
          </div>
        </WorkspaceResultCard>
      ) : null}

      <WorkspaceResultCard title="Case Queue" contentClassName="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Owner filter</div>
            <Input placeholder="Filter by owner" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Status filter</div>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as RootCauseCaseStatus | "all")}>
              <option value="all">All statuses</option>
              {CASE_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{statusLabelMap[option]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Priority filter</div>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as RootCausePriority | "all")}>
              <option value="all">All priorities</option>
              {CASE_PRIORITY_OPTIONS.map((option) => (
                <option key={option} value={option}>{priorityLabelMap[option]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Updated date</div>
            <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3 text-sm">
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Current case readiness</div>
            <div className="mt-1 text-lg font-semibold">{currentCaseReadiness}%</div>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Open investigations</div>
            <div className="mt-1 text-lg font-semibold">{openCaseCount}</div>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Overdue action items</div>
            <div className="mt-1 text-lg font-semibold">{overdueActionCount}</div>
          </div>
        </div>
        <div className="space-y-3">
          {filteredCases.length ? (
            filteredCases.map((item) => (
              <div key={item.id} className={`rounded-md border p-4 ${item.improvementActions.some((action) => action.action.trim() && isPastDue(action.dueDate)) ? "border-red-200 bg-red-50/40" : "bg-muted/10"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Owner: {item.draft.owner || "Unassigned"} | Updated {new Date(item.updatedAt).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Area: {item.draft.processArea || "Not set"} | Line: {item.draft.assetOrLine || "Not set"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Days open: {toDaysOpen(item.createdAt) ?? 0} | Overdue actions: {item.improvementActions.filter((action) => action.action.trim() && isPastDue(action.dueDate)).length}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{statusLabelMap[item.status ?? "open"]}</Badge>
                    <Badge variant="outline">{priorityLabelMap[item.priority ?? "medium"]}</Badge>
                    {item.improvementActions.some((action) => action.action.trim() && isPastDue(action.dueDate)) ? (
                      <Badge className="bg-red-600 hover:bg-red-600">Overdue actions</Badge>
                    ) : null}
                    {item.status !== "closed" && toDaysOpen(item.createdAt) !== null && (toDaysOpen(item.createdAt) ?? 0) >= 14 ? (
                      <Badge variant="secondary">Open 14+ days</Badge>
                    ) : null}
                    <Button
                      variant="outline"
                      className={workspaceToolbarButtonClassName}
                      onClick={() => {
                        loadCaseIntoWorkspace(item);
                        setStatusMessage(`Loaded RCA investigation "${item.name}".`);
                        setError(null);
                      }}
                    >
                      Open
                    </Button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-muted-foreground">No RCA investigations match the current filters.</div>
          )}
        </div>
      </WorkspaceResultCard>

      <WorkspaceResultCard title="DMAIC Progress" contentClassName="grid gap-3 md:grid-cols-5 text-sm">
        {phaseProgress.map((phase) => (
          <div key={phase.phase} className="rounded-md border bg-muted/20 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{phase.phase}</div>
            <div className="mt-2 text-lg font-semibold">{phase.completed}/{phase.total}</div>
            <div className="text-xs text-muted-foreground">Required fields completed</div>
          </div>
        ))}
      </WorkspaceResultCard>

      <WorkspaceResultCard title="Required Fields" contentClassName="space-y-3 text-sm">
        <div className="text-muted-foreground">
          The investigation can stay lightweight, but these fields should be complete before you treat the case as professionally ready.
        </div>
        <div className="flex flex-wrap gap-2">
          {requiredMissing.length ? (
            requiredMissing.map((item) => <Badge key={item} variant="outline">{item}</Badge>)
          ) : (
            <Badge className="bg-emerald-600 hover:bg-emerald-600">All required DMAIC fields are currently filled</Badge>
          )}
        </div>
      </WorkspaceResultCard>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Define</CardTitle>
          <CardDescription>Clarify the problem statement, impact, owner, and containment before moving into evidence review.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">{renderLabel("Problem title", true)}<Input placeholder="Problem title" value={draft.title} onChange={(e) => updateDraft("title", e.target.value)} /></div>
          <div className="space-y-2">{renderLabel("Investigation owner", true)}<Input placeholder="Investigation owner" value={draft.owner} onChange={(e) => updateDraft("owner", e.target.value)} /></div>
          <div className="space-y-2">{renderLabel("Cross-functional team")}<Input placeholder="Cross-functional team" value={draft.team} onChange={(e) => updateDraft("team", e.target.value)} /></div>
          <div className="space-y-2">{renderLabel("Process area / product family", true)}<Input placeholder="Process area / product family" value={draft.processArea} onChange={(e) => updateDraft("processArea", e.target.value)} /></div>
          <div className="space-y-2">{renderLabel("Line / asset / workcell")}<Input placeholder="Line / asset / workcell" value={draft.assetOrLine} onChange={(e) => updateDraft("assetOrLine", e.target.value)} /></div>
          <div className="space-y-2">{renderLabel("First observed date", true)}<Input type="date" value={draft.firstSeenDate} onChange={(e) => updateDraft("firstSeenDate", e.target.value)} /></div>
          <div className="md:col-span-2">
            {renderLabel("Symptom observed", true)}
            <Textarea placeholder="Symptom observed in production or maintenance" value={draft.symptom} onChange={(e) => updateDraft("symptom", e.target.value)} className="min-h-[90px]" />
          </div>
          <div className="md:col-span-2">
            {renderLabel("Problem statement", true)}
            <Textarea placeholder="Defect statement or problem definition" value={draft.defectStatement} onChange={(e) => updateDraft("defectStatement", e.target.value)} className="min-h-[90px]" />
          </div>
          <div className="md:col-span-2">
            {renderLabel("Business impact", true)}
            <Textarea placeholder="Business impact: scrap, downtime, yield loss, customer risk, safety, cost" value={draft.businessImpact} onChange={(e) => updateDraft("businessImpact", e.target.value)} className="min-h-[90px]" />
          </div>
          <div className="md:col-span-2">
            {renderLabel("Containment action", true)}
            <Textarea placeholder="Containment action taken now" value={draft.containmentAction} onChange={(e) => updateDraft("containmentAction", e.target.value)} className="min-h-[90px]" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Measure</CardTitle>
          <CardDescription>Document the baseline, target, data source, and sample adequacy used to quantify the gap.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">{renderLabel("Baseline metric", true)}<Input placeholder="Baseline metric" value={draft.baselineMetric} onChange={(e) => updateDraft("baselineMetric", e.target.value)} /></div>
          <div className="space-y-2">{renderLabel("Target metric", true)}<Input placeholder="Target metric" value={draft.targetMetric} onChange={(e) => updateDraft("targetMetric", e.target.value)} /></div>
          <div className="md:col-span-2">
            {renderLabel("Gap statement", true)}
            <Textarea placeholder="Gap statement: what is off-target and by how much" value={draft.gapStatement} onChange={(e) => updateDraft("gapStatement", e.target.value)} className="min-h-[90px]" />
          </div>
          <div className="md:col-span-2">
            {renderLabel("Data sources", true)}
            <Textarea placeholder="Data sources used: process historian, QC records, maintenance logs, incidents, DOE, analyzer" value={draft.dataSources} onChange={(e) => updateDraft("dataSources", e.target.value)} className="min-h-[90px]" />
          </div>
          <div className="space-y-2">{renderLabel("Sample window")}<Input placeholder="Sample window / lot range / shift range" value={draft.sampleWindow} onChange={(e) => updateDraft("sampleWindow", e.target.value)} /></div>
          <div className="space-y-2">{renderLabel("Sample adequacy")}<Input placeholder="Sample adequacy / limitations" value={draft.sampleAdequacy} onChange={(e) => updateDraft("sampleAdequacy", e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Analyze</CardTitle>
          <CardDescription>Develop hypotheses, capture evidence, use 5 Whys and fishbone logic, then verify the root cause.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[1.4fr_0.6fr]">
            <div className="space-y-2">
              {renderLabel("Evidence summary", true)}
              <Textarea placeholder="Evidence summary: what the charts, analyzer, incidents, and maintenance history currently show" value={draft.evidenceSummary} onChange={(e) => updateDraft("evidenceSummary", e.target.value)} className="min-h-[110px]" />
            </div>
            <div className="space-y-3 rounded-md border bg-muted/20 p-4">
              <div className="text-sm font-medium">Root-Cause Agent Assist</div>
              <select className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white w-full" value={agentRole} onChange={(e) => setAgentRole(e.target.value)}>
                <option value="operator">Operator</option>
                <option value="technician">Technician</option>
                <option value="engineer">Engineer</option>
                <option value="quality_lead">Quality Lead</option>
              </select>
              <Button className={workspaceToolbarPrimaryButtonClassName} onClick={runRootCauseAgent} disabled={agentBusy}>
                {agentBusy ? "Running..." : "Run Root-Cause Agent"}
              </Button>
            </div>
          </div>

          <WorkspaceResultCard title="Suspected Causes" contentClassName="space-y-3">
            {suspectedCauses.map((cause, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={cause}
                  onChange={(e) => setSuspectedCauses((current) => current.map((item, itemIndex) => itemIndex === index ? e.target.value : item))}
                  placeholder={`Suspected cause ${index + 1}`}
                />
                <Button variant="outline" className={workspaceToolbarButtonClassName} onClick={() => setSuspectedCauses((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                  Remove
                </Button>
              </div>
            ))}
            <Button variant="outline" onClick={() => setSuspectedCauses((current) => [...current, ""])}>Add suspected cause</Button>
          </WorkspaceResultCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <WorkspaceResultCard title="5 Whys" contentClassName="space-y-3">
              {fiveWhys.map((row, index) => (
                <div key={row.why} className="grid gap-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{row.why}</div>
                  <Input
                    value={row.answer}
                    onChange={(e) => setFiveWhys((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, answer: e.target.value } : item))}
                    placeholder={`Enter answer for ${row.why.toLowerCase()}`}
                  />
                </div>
              ))}
            </WorkspaceResultCard>

            <WorkspaceResultCard title="Fishbone Categories" contentClassName="space-y-3">
              {fishbone.map((category, index) => (
                <div key={category.name} className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{category.name}</div>
                  <Textarea
                    value={category.notes}
                    onChange={(e) => setFishbone((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, notes: e.target.value } : item))}
                    className="min-h-[74px]"
                    placeholder={`Potential ${category.name.toLowerCase()} contributors`}
                  />
                </div>
              ))}
            </WorkspaceResultCard>
          </div>

          <Textarea placeholder="Verified root cause" value={draft.verifiedRootCause} onChange={(e) => updateDraft("verifiedRootCause", e.target.value)} className="min-h-[90px]" />

          <WorkspaceResultCard title="FMEA Review" contentClassName="space-y-3">
            <div className="text-sm text-muted-foreground">
              Capture the current failure mode, effect, cause, controls, and basic severity/occurrence/detection scoring.
            </div>
            <div className="space-y-3">
              {fmeaRows.map((row, index) => (
                <div key={index} className="grid gap-2 md:grid-cols-4">
                  <Input placeholder="Failure mode" value={row.failureMode} onChange={(e) => setFmeaRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, failureMode: e.target.value } : item))} />
                  <Input placeholder="Effect" value={row.effect} onChange={(e) => setFmeaRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, effect: e.target.value } : item))} />
                  <Input placeholder="Cause" value={row.cause} onChange={(e) => setFmeaRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, cause: e.target.value } : item))} />
                  <Input placeholder="Current controls" value={row.currentControls} onChange={(e) => setFmeaRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, currentControls: e.target.value } : item))} />
                  <Input placeholder="Severity (1-10)" value={row.severity} onChange={(e) => setFmeaRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, severity: e.target.value } : item))} />
                  <Input placeholder="Occurrence (1-10)" value={row.occurrence} onChange={(e) => setFmeaRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, occurrence: e.target.value } : item))} />
                  <Input placeholder="Detection (1-10)" value={row.detection} onChange={(e) => setFmeaRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, detection: e.target.value } : item))} />
                  <Input placeholder="Owner" value={row.owner} onChange={(e) => setFmeaRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, owner: e.target.value } : item))} />
                </div>
              ))}
            </div>
            <Button variant="outline" onClick={() => setFmeaRows((current) => [...current, { failureMode: "", effect: "", cause: "", currentControls: "", severity: "", occurrence: "", detection: "", owner: "" }])}>
              Add FMEA row
            </Button>
          </WorkspaceResultCard>

          {agentResponse ? (
            <WorkspaceResultCard title="Agent Findings" contentClassName="space-y-3 text-sm">
              <div>{agentResponse.summary}</div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Hypotheses: {agentResponse.hypotheses.length}</Badge>
                <Badge variant="secondary">Next tests: {agentResponse.next_tests.length}</Badge>
              </div>
              <div className="space-y-2">
                {agentResponse.hypotheses.map((hypothesis) => (
                  <div key={hypothesis.rank} className="rounded-md border bg-muted/20 p-3">
                    <div className="font-medium">#{hypothesis.rank} {hypothesis.hypothesis}</div>
                    <div className="text-xs text-muted-foreground mt-1">Confidence {Math.round(hypothesis.confidence * 100)}%</div>
                    <div className="text-xs text-muted-foreground mt-2">Evidence: {hypothesis.evidence.join(" | ")}</div>
                  </div>
                ))}
              </div>
            </WorkspaceResultCard>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Improve</CardTitle>
          <CardDescription>Translate the verified cause into corrective and preventive action, with owners and timing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {renderLabel("Corrective action", true)}
            <Textarea placeholder="Corrective action" value={draft.correctiveAction} onChange={(e) => updateDraft("correctiveAction", e.target.value)} className="min-h-[90px]" />
          </div>
          <div className="space-y-2">
            {renderLabel("Preventive action")}
            <Textarea placeholder="Preventive action" value={draft.preventiveAction} onChange={(e) => updateDraft("preventiveAction", e.target.value)} className="min-h-[90px]" />
          </div>
          <WorkspaceResultCard title="Action Register" contentClassName="space-y-3">
            {improvementActions.map((item, index) => (
              <div key={index} className="grid gap-2 md:grid-cols-4">
                <Input placeholder="Action" value={item.action} onChange={(e) => setImprovementActions((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, action: e.target.value } : row))} />
                <Input placeholder="Owner" value={item.owner} onChange={(e) => setImprovementActions((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, owner: e.target.value } : row))} />
                <Input type="date" value={item.dueDate} onChange={(e) => setImprovementActions((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, dueDate: e.target.value } : row))} />
                <Input placeholder="Expected impact" value={item.expectedImpact} onChange={(e) => setImprovementActions((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, expectedImpact: e.target.value } : row))} />
              </div>
            ))}
            <Button variant="outline" onClick={() => setImprovementActions((current) => [...current, { action: "", owner: "", dueDate: "", expectedImpact: "" }])}>
              Add action item
            </Button>
          </WorkspaceResultCard>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Control</CardTitle>
          <CardDescription>Define how the fix will be held in place, monitored, and escalated if the problem returns.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            {renderLabel("Control method", true)}
            <Textarea placeholder="Control method / standard work / procedure change" value={draft.controlMethod} onChange={(e) => updateDraft("controlMethod", e.target.value)} className="min-h-[90px]" />
          </div>
          <div className="space-y-2">
            {renderLabel("Monitoring metric", true)}
            <Textarea placeholder="Monitoring metric and frequency" value={draft.monitoringMetric} onChange={(e) => updateDraft("monitoringMetric", e.target.value)} className="min-h-[90px]" />
          </div>
          <div className="space-y-2">
            {renderLabel("Reaction plan", true)}
            <Textarea placeholder="Reaction plan if the signal returns out of control" value={draft.reactionPlan} onChange={(e) => updateDraft("reactionPlan", e.target.value)} className="min-h-[90px]" />
          </div>
          <div className="space-y-2">
            {renderLabel("Effectiveness check date", true)}
            <Input type="date" value={draft.effectivenessCheckDate} onChange={(e) => updateDraft("effectivenessCheckDate", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <WorkspaceResultCard title="Control Plan" contentClassName="space-y-3">
              {controlPlanRows.map((row, index) => (
                <div key={index} className="grid gap-2 md:grid-cols-4">
                  <Input placeholder="CTQ / monitored output" value={row.ctq} onChange={(e) => setControlPlanRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ctq: e.target.value } : item))} />
                  <Input placeholder="Method" value={row.method} onChange={(e) => setControlPlanRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, method: e.target.value } : item))} />
                  <Input placeholder="Frequency" value={row.frequency} onChange={(e) => setControlPlanRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, frequency: e.target.value } : item))} />
                  <Input placeholder="Owner" value={row.owner} onChange={(e) => setControlPlanRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, owner: e.target.value } : item))} />
                </div>
              ))}
              <Button variant="outline" onClick={() => setControlPlanRows((current) => [...current, { ctq: "", method: "", frequency: "", owner: "" }])}>
                Add control plan row
              </Button>
            </WorkspaceResultCard>
          </div>
          <div className="md:col-span-2">
            <WorkspaceResultCard title="Reaction Plan" contentClassName="space-y-3">
              {reactionPlanRows.map((row, index) => (
                <div key={index} className="grid gap-2 md:grid-cols-3">
                  <Input placeholder="Trigger condition" value={row.trigger} onChange={(e) => setReactionPlanRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, trigger: e.target.value } : item))} />
                  <Input placeholder="Response step" value={row.response} onChange={(e) => setReactionPlanRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, response: e.target.value } : item))} />
                  <Input placeholder="Escalation owner" value={row.escalationOwner} onChange={(e) => setReactionPlanRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, escalationOwner: e.target.value } : item))} />
                </div>
              ))}
              <Button variant="outline" onClick={() => setReactionPlanRows((current) => [...current, { trigger: "", response: "", escalationOwner: "" }])}>
                Add reaction plan row
              </Button>
            </WorkspaceResultCard>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
