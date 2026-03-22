import React from "react";

import { cn } from "@/lib/utils";

interface WorkspaceMetricChipProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

export const WorkspaceMetricChip: React.FC<WorkspaceMetricChipProps> = ({ label, value, className }) => {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-[11px] font-medium text-muted-foreground",
        className
      )}
    >
      <span className="uppercase tracking-wide">{label}</span>
      <span className="text-foreground">{value}</span>
    </span>
  );
};
