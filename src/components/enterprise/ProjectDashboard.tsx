import React from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";
import { workspaceToolbarButtonClassName, workspaceToolbarPrimaryButtonClassName } from "@/components/workspace/workspaceToolbarTokens";

export default function ProjectDashboard() {
  return (
    <div className="space-y-6">
      <WorkspaceResultCard title="Project Dashboard" contentClassName="flex flex-wrap items-center gap-3">
        <Button className={workspaceToolbarPrimaryButtonClassName}>New DOE Validation Project</Button>
        <Button variant="outline" className={workspaceToolbarButtonClassName}>Open Recent Project</Button>
        <Button variant="outline" className={workspaceToolbarButtonClassName}>Data Analyzer</Button>
      </WorkspaceResultCard>
    </div>
  );
}
