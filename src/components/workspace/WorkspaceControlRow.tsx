import React from "react";

import { cn } from "@/lib/utils";

interface WorkspaceControlRowProps {
  title?: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}

export const WorkspaceControlRow: React.FC<WorkspaceControlRowProps> = ({
  title,
  description,
  className,
  children,
}) => {
  return (
    <div className={cn("rounded-md border bg-muted/5 p-3", className)}>
      {title || description ? (
        <div className="mb-3 space-y-1">
          {title ? <div className="text-sm font-medium">{title}</div> : null}
          {description ? <div className="text-xs text-muted-foreground">{description}</div> : null}
        </div>
      ) : null}
      <div className="space-y-3">{children}</div>
    </div>
  );
};
