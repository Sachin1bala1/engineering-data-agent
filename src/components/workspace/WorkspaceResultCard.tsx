import React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { workspaceSectionCardHeaderClassName, workspaceSectionCardTitleClassName } from "@/components/workspace/workspaceToolbarTokens";

interface WorkspaceResultCardProps {
  title: string;
  actions?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

export const WorkspaceResultCard: React.FC<WorkspaceResultCardProps> = ({
  title,
  actions,
  className,
  contentClassName,
  children,
}) => {
  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className={workspaceSectionCardHeaderClassName}>
        <CardTitle className={workspaceSectionCardTitleClassName}>{title}</CardTitle>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className={cn(contentClassName)}>{children}</CardContent>
    </Card>
  );
};
