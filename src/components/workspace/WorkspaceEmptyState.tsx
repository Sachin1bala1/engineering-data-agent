import React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { workspaceToolbarPrimaryButtonClassName } from "@/components/workspace/workspaceToolbarTokens";

interface WorkspaceEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const WorkspaceEmptyState: React.FC<WorkspaceEmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}) => {
  return (
    <div className={cn("flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-muted/10 px-6 py-8 text-center", className)}>
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      <div className="space-y-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="max-w-xl text-sm text-muted-foreground">{description}</div>
      </div>
      {actionLabel && onAction ? (
        <Button className={workspaceToolbarPrimaryButtonClassName} onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
};
