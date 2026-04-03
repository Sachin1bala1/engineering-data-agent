import React from "react";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";

export default function TrendMonitoring() {
  return (
    <WorkspaceResultCard title="Trend Monitoring">
        <div className="text-sm text-muted-foreground">
          Real-time KPI trends and alarms will appear here.
        </div>
    </WorkspaceResultCard>
  );
}
