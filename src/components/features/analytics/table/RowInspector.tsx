import React from "react";
import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { RowState, WorkbenchRow } from "@/stores/dataWorkbenchStore";

type RowInspectorSections = {
  state: boolean;
  actions: boolean;
  metadata: boolean;
  values: boolean;
};

interface RowInspectorProps {
  row?: WorkbenchRow;
  rowState?: RowState;
  onStateChange: (patch: Partial<RowState>) => void;
  sections: RowInspectorSections;
  onToggleSection: (key: keyof RowInspectorSections) => void;
  onSetAllSections: (expanded: boolean) => void;
}

export const RowInspector: React.FC<RowInspectorProps> = ({
  row,
  rowState,
  onStateChange,
  sections,
  onToggleSection,
  onSetAllSections,
}) => {
  const allExpanded = Object.values(sections).every(Boolean);

  if (!row) {
    return <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">Select a row to inspect row states and values.</div>;
  }

  const detailRows = Object.entries(row).filter(([key]) => key !== "__row_index__");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-10 space-y-3 bg-muted/10 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Row Inspector</div>
            <div className="text-xs text-muted-foreground">Row {Number(row.__row_index__) + 1}</div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="scientific-sidebar-focus h-8 px-2 text-[11px]"
            onClick={() => onSetAllSections(!allExpanded)}
          >
            {allExpanded ? "Collapse All" : "Expand All"}
          </Button>
        </div>
        <div className="space-y-2 rounded-md border bg-background/80 p-3 backdrop-blur-sm">
          <button type="button" className="scientific-sidebar-focus flex w-full items-center justify-between rounded-sm px-1 py-0.5 text-left" onClick={() => onToggleSection("state")}>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Row State</span>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${sections.state ? "" : "-rotate-90"}`} />
          </button>
          {sections.state && (
            <div className="flex flex-wrap gap-2">
              <Badge className="rounded-full px-2.5 py-1 text-[11px]" variant={rowState?.selected ? "default" : "secondary"}>Selected</Badge>
              <Badge className="rounded-full px-2.5 py-1 text-[11px]" variant={rowState?.excluded ? "destructive" : "secondary"}>Excluded</Badge>
              <Badge className="rounded-full px-2.5 py-1 text-[11px]" variant={rowState?.hidden ? "outline" : "secondary"}>Hidden</Badge>
              <Badge className="rounded-full px-2.5 py-1 text-[11px]" variant={rowState?.labeled ? "default" : "secondary"}>Labeled</Badge>
            </div>
          )}
        </div>
        <div className="space-y-2 rounded-md border bg-background/80 p-3 backdrop-blur-sm">
          <button type="button" className="scientific-sidebar-focus flex w-full items-center justify-between rounded-sm px-1 py-0.5 text-left" onClick={() => onToggleSection("actions")}>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Actions</span>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${sections.actions ? "" : "-rotate-90"}`} />
          </button>
          {sections.actions && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="scientific-sidebar-focus h-9 min-w-[132px] flex-1 justify-start whitespace-normal px-3 text-left leading-tight"
                variant={rowState?.selected ? "default" : "outline"}
                onClick={() => onStateChange({ selected: !rowState?.selected })}
              >
                Select Row
              </Button>
              <Button
                size="sm"
                className="scientific-sidebar-focus h-9 min-w-[132px] flex-1 justify-start whitespace-normal px-3 text-left leading-tight"
                variant={rowState?.excluded ? "destructive" : "outline"}
                onClick={() => onStateChange({ excluded: !rowState?.excluded })}
              >
                Exclude Row
              </Button>
              <Button
                size="sm"
                className="scientific-sidebar-focus h-9 min-w-[132px] flex-1 justify-start whitespace-normal px-3 text-left leading-tight"
                variant={rowState?.hidden ? "secondary" : "outline"}
                onClick={() => onStateChange({ hidden: !rowState?.hidden })}
              >
                Hide Row
              </Button>
              <Button
                size="sm"
                className="scientific-sidebar-focus h-9 min-w-[132px] flex-1 justify-start whitespace-normal px-3 text-left leading-tight"
                variant={rowState?.labeled ? "default" : "outline"}
                onClick={() => onStateChange({ labeled: !rowState?.labeled })}
              >
                Label Row
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="space-y-3 pr-1">
          <Separator />
          <div className="space-y-2 rounded-md border bg-muted/10 p-3 text-xs">
            <button type="button" className="scientific-sidebar-focus flex w-full items-center justify-between rounded-sm px-1 py-0.5 text-left" onClick={() => onToggleSection("metadata")}>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Metadata</span>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${sections.metadata ? "" : "-rotate-90"}`} />
            </button>
            {sections.metadata && (
              <>
                <div className="grid grid-cols-[minmax(0,92px)_1fr] gap-2">
                  <div className="text-muted-foreground">Row ID</div>
                  <div className="break-words text-foreground">{String(row.__row_index__)}</div>
                </div>
                <div className="grid grid-cols-[minmax(0,92px)_1fr] gap-2">
                  <div className="text-muted-foreground">Row Number</div>
                  <div className="break-words text-foreground">{Number(row.__row_index__) + 1}</div>
                </div>
                <div className="grid grid-cols-[minmax(0,92px)_1fr] gap-2">
                  <div className="text-muted-foreground">Creation Source</div>
                  <div className="break-words text-foreground">Table dataset</div>
                </div>
              </>
            )}
          </div>
          <div className="space-y-2 rounded-md border bg-muted/5 p-3 text-xs">
            <button type="button" className="scientific-sidebar-focus flex w-full items-center justify-between rounded-sm px-1 py-0.5 text-left" onClick={() => onToggleSection("values")}>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Row Values</span>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${sections.values ? "" : "-rotate-90"}`} />
            </button>
            {sections.values && (
              <div className="space-y-2">
                {detailRows.map(([key, value]) => (
                  <div key={key} className="grid grid-cols-[minmax(0,92px)_1fr] gap-2">
                    <div className="truncate text-muted-foreground">{key}</div>
                    <div className="break-all text-foreground">{String(value ?? "")}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
