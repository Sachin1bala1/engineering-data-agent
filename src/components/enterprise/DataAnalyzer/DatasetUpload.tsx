import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";
import { workspaceToolbarPrimaryButtonClassName } from "@/components/workspace/workspaceToolbarTokens";

export default function DatasetUpload() {
  return (
    <WorkspaceResultCard title="Dataset Upload" contentClassName="space-y-3">
        <Input type="file" accept=".csv,.xls,.xlsx" />
        <Button className={workspaceToolbarPrimaryButtonClassName}>Auto-Engineer Analysis</Button>
    </WorkspaceResultCard>
  );
}
