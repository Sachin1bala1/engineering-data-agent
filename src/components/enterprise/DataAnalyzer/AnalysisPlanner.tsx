import React from "react";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";

export default function AnalysisPlanner() {
  return (
    <WorkspaceResultCard title="Analysis Planner">
        <div className="text-sm text-muted-foreground">
          Planner agent output and statistical analysis plan will appear here.
        </div>
    </WorkspaceResultCard>
  );
}
