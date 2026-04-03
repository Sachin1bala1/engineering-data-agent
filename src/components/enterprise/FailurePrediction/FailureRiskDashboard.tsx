import React from "react";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";

export default function FailureRiskDashboard() {
  return (
    <WorkspaceResultCard title="Failure Risk Dashboard">
        <div className="text-sm text-muted-foreground">
          Failure probability, remaining useful life, and risk heatmaps will appear here.
        </div>
    </WorkspaceResultCard>
  );
}
