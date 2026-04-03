import React from "react";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";

export default function ControlCharts() {
  return (
    <WorkspaceResultCard title="Control Charts">
        <div className="text-sm text-muted-foreground">
          SPC control charts (X-bar, R, CUSUM, EWMA) will appear here.
        </div>
    </WorkspaceResultCard>
  );
}
