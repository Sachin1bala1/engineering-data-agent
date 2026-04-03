import React from "react";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";

export default function CapabilityAnalysis() {
  return (
    <WorkspaceResultCard title="Capability Analysis">
        <div className="text-sm text-muted-foreground">
          Process capability (Cp, Cpk, Pp, Ppk) outputs will appear here.
        </div>
    </WorkspaceResultCard>
  );
}
