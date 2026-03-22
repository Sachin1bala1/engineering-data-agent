import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WorkspaceSidebarSectionProps {
  title: string;
  description?: string;
  storageKey?: string;
  defaultExpanded?: boolean;
  className?: string;
  contentClassName?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

export const WorkspaceSidebarSection: React.FC<WorkspaceSidebarSectionProps> = ({
  title,
  description,
  storageKey,
  defaultExpanded = true,
  className,
  contentClassName,
  headerActions,
  children,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === null) {
        setExpanded(defaultExpanded);
        return;
      }
      setExpanded(raw === "true");
    } catch {
      setExpanded(defaultExpanded);
    }
  }, [defaultExpanded, storageKey]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, String(expanded));
  }, [expanded, storageKey]);

  return (
    <section className={cn("flex h-full min-h-0 flex-col rounded-lg border bg-card", className)}>
      <div className="sticky top-0 z-10 border-b bg-card/95 p-3 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{title}</div>
            {description ? <div className="mt-0.5 text-xs text-muted-foreground">{description}</div> : null}
          </div>
          <div className="flex items-center gap-1">
            {headerActions}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="scientific-sidebar-focus h-8 px-2 text-[11px]"
              onClick={() => setExpanded((value) => !value)}
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded ? "" : "-rotate-90")} />
            </Button>
          </div>
        </div>
      </div>
      {expanded ? (
        <div className={cn("min-h-0 flex-1 overflow-auto p-3", contentClassName)}>
          {children}
        </div>
      ) : null}
    </section>
  );
};
