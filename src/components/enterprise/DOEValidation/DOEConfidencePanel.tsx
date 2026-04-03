import React from "react";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";

export default function DOEConfidencePanel() {
  return (
    <WorkspaceResultCard title="DOE Confidence Panel">
        <div className="text-sm text-muted-foreground">
          Confidence score, statistical power, model trust index, and uncertainty interval displayed here.
        </div>
    </WorkspaceResultCard>
  );
}
