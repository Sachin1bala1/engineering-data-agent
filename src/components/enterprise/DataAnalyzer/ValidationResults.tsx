import React from "react";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";

export default function ValidationResults() {
  return (
    <WorkspaceResultCard title="Validation Results">
        <div className="text-sm text-muted-foreground">
          Validator agent outputs, statistical assumption checks, and confidence scores will appear here.
        </div>
    </WorkspaceResultCard>
  );
}
