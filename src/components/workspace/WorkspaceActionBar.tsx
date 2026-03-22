import React from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface WorkspaceActionBarProps {
  title: string;
  description?: string;
  metrics?: React.ReactNode;
  actions?: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
}

export const WorkspaceActionBar: React.FC<WorkspaceActionBarProps> = ({
  title,
  description,
  metrics,
  actions,
  secondary,
  className,
}) => {
  return (
    <Card className={cn(className)}>
      <CardContent className="space-y-3 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold">{title}</div>
            {description ? <div className="mt-0.5 text-sm text-muted-foreground">{description}</div> : null}
            {metrics ? <div className="mt-1 flex flex-wrap items-center gap-2">{metrics}</div> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {secondary ? <div>{secondary}</div> : null}
      </CardContent>
    </Card>
  );
};
