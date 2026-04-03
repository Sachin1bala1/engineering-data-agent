import React from "react";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";

export default function DOEAnalysisView() {
  return (
    <WorkspaceResultCard title="DOE Analysis View">
        <div className="text-sm text-muted-foreground">
          Main effects, interaction plots, ANOVA, regression diagnostics, and optimization outputs appear here.
        </div>
    </WorkspaceResultCard>
  );
}
