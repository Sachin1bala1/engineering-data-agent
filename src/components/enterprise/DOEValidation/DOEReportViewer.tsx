import React from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";
import { workspaceToolbarButtonClassName } from "@/components/workspace/workspaceToolbarTokens";

export default function DOEReportViewer() {
  return (
    <WorkspaceResultCard title="DOE Validation Report" contentClassName="space-y-3">
        <div className="text-sm text-muted-foreground">
          Structured engineering report rendered here (JSON + PDF + PPTX exports).
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className={workspaceToolbarButtonClassName}>Export PDF</Button>
          <Button variant="outline" className={workspaceToolbarButtonClassName}>Export PPTX</Button>
        </div>
    </WorkspaceResultCard>
  );
}
