import React, { isValidElement } from "react";

import { usePersistedPanelLayout } from "@/hooks/usePersistedPanelLayout";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";

type PersistedResizableGroupProps = {
  storageKey: string;
  direction: "horizontal" | "vertical";
  defaultSizes: number[];
  minSizes?: number[];
  className?: string;
  enabled?: boolean;
  version?: string;
  children: React.ReactNode;
};

export function PersistedResizableGroup({
  storageKey,
  direction,
  defaultSizes,
  minSizes,
  className,
  enabled = true,
  version,
  children,
}: PersistedResizableGroupProps) {
  const { sizes, setSizes } = usePersistedPanelLayout({
    storageKey,
    defaultSizes,
    minSizes,
    version,
  });

  const panelIndexRef = { current: -1 };

  const mappedChildren = React.Children.map(children, (child) => {
    if (!isValidElement(child)) return child;

    if (child.type === ResizablePanel) {
      panelIndexRef.current += 1;
      const index = panelIndexRef.current;
      const nextProps: Record<string, unknown> = {
        defaultSize: sizes[index] ?? defaultSizes[index],
      };
      if (minSizes?.[index] !== undefined) {
        nextProps.minSize = minSizes[index];
      }
      return React.cloneElement(child, nextProps);
    }

    if (!enabled && child.type === ResizableHandle) {
      return null;
    }

    return child;
  });

  if (!enabled) {
    return (
      <div
        className={cn(
          direction === "horizontal"
            ? "flex min-w-0 flex-col gap-3 lg:flex-row"
            : "flex min-h-0 flex-col gap-3",
          className
        )}
      >
        {React.Children.map(mappedChildren, (child) => {
          if (!isValidElement(child)) return child;
          if (child.type !== ResizablePanel) return child;
          return <div className="min-h-0 min-w-0">{child.props.children}</div>;
        })}
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      direction={direction}
      className={className}
      onLayout={(nextSizes) => setSizes(nextSizes)}
    >
      {mappedChildren}
    </ResizablePanelGroup>
  );
}
