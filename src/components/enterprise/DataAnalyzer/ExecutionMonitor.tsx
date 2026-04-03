import React from "react";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";

export default function ExecutionMonitor() {
  return (
    <WorkspaceResultCard title="Execution Monitor">
        <div className="text-sm text-muted-foreground">
          Execution agent status, scripts, and runtime logs will appear here.
        </div>
    </WorkspaceResultCard>
  );
}
