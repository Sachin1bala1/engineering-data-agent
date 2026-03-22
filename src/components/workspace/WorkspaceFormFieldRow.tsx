import React from "react";

import { cn } from "@/lib/utils";

interface WorkspaceFormFieldRowProps {
  label?: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}

export const WorkspaceFormFieldRow: React.FC<WorkspaceFormFieldRowProps> = ({
  label,
  description,
  className,
  children,
}) => {
  return (
    <div className={cn("space-y-2", className)}>
      {label ? <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div> : null}
      {children}
      {description ? <div className="text-xs text-muted-foreground">{description}</div> : null}
    </div>
  );
};
