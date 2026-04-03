import React from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";
import { workspaceToolbarButtonClassName, workspaceToolbarPrimaryButtonClassName } from "@/components/workspace/workspaceToolbarTokens";

export default function DOEProjectManager() {
  return (
    <WorkspaceResultCard title="DOE Project Manager" contentClassName="flex flex-wrap gap-2">
      <Button className={workspaceToolbarPrimaryButtonClassName}>New DOE Validation</Button>
      <Button variant="outline" className={workspaceToolbarButtonClassName}>Open DOE Project</Button>
      <Button variant="outline" className={workspaceToolbarButtonClassName}>Project History</Button>
    </WorkspaceResultCard>
  );
}
