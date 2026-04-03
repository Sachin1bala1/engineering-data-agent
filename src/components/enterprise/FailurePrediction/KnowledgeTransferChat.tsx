import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { WorkspaceResultCard } from "@/components/workspace/WorkspaceResultCard";
import { workspaceToolbarPrimaryButtonClassName } from "@/components/workspace/workspaceToolbarTokens";

export default function KnowledgeTransferChat() {
  return (
    <WorkspaceResultCard title="Knowledge Transfer Chat" contentClassName="space-y-3">
        <Input placeholder="Ask a reliability question..." />
        <Button className={workspaceToolbarPrimaryButtonClassName}>Ask</Button>
    </WorkspaceResultCard>
  );
}
