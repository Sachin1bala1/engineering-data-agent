import React, { useMemo } from "react";
import { FilterX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ColumnFilterState, ColumnMetadata, WorkbenchRow } from "@/stores/dataWorkbenchStore";

interface FilterPanelProps {
  activeColumnKey?: string;
  columnMetadata: Record<string, ColumnMetadata>;
  rows: WorkbenchRow[];
  filters: Record<string, ColumnFilterState>;
  selectTriggerRef?: React.RefObject<HTMLButtonElement | null>;
  onSelectColumn: (columnKey: string) => void;
  onSetFilter: (columnKey: string, filter: ColumnFilterState) => void;
  onClearColumnFilter: (columnKey: string) => void;
  onClearAll: () => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  activeColumnKey,
  columnMetadata,
  rows,
  filters,
  selectTriggerRef,
  onSelectColumn,
  onSetFilter,
  onClearColumnFilter,
  onClearAll,
}) => {
  const activeColumn = activeColumnKey ? columnMetadata[activeColumnKey] : undefined;
  const categoryValues = useMemo(() => {
    if (!activeColumnKey) return [];
    return Array.from(
      new Set(
        rows
          .map((row) => row[activeColumnKey])
          .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
          .map((value) => String(value))
      )
    )
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 100);
  }, [activeColumnKey, rows]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-10 space-y-3 bg-muted/10 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Filters</div>
            <div className="text-xs text-muted-foreground">Typed filters for active columns.</div>
          </div>
          <Button variant="ghost" size="sm" className="scientific-sidebar-focus" onClick={onClearAll}>Clear All</Button>
        </div>
        <Select value={activeColumnKey || "__none__"} onValueChange={(value) => value !== "__none__" && onSelectColumn(value)}>
          <SelectTrigger ref={selectTriggerRef} className="h-9 text-xs"><SelectValue placeholder="Select column" /></SelectTrigger>
          <SelectContent>
            {Object.values(columnMetadata).map((column) => (
              <SelectItem key={column.key} value={column.key}>{column.displayName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ScrollArea className="min-h-0 flex-1 rounded-md border bg-background">
        <div className="space-y-3 p-3">
          {activeColumn ? (
            <div className="rounded-md border bg-background p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{activeColumn.displayName}</div>
                  <div className="text-[11px] text-muted-foreground">{activeColumn.modelingType} column</div>
                </div>
                {filters[activeColumn.key] && (
                  <Button variant="ghost" size="icon" className="scientific-sidebar-focus h-7 w-7" onClick={() => onClearColumnFilter(activeColumn.key)}>
                    <FilterX className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {activeColumn.modelingType === "continuous" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Min</Label>
                    <Input
                      className="h-8 text-xs"
                      value={String((filters[activeColumn.key] as any)?.min ?? "")}
                      onChange={(event) => onSetFilter(activeColumn.key, {
                        type: "range",
                        min: event.target.value === "" ? undefined : Number(event.target.value),
                        max: (filters[activeColumn.key] as any)?.max,
                      })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Max</Label>
                    <Input
                      className="h-8 text-xs"
                      value={String((filters[activeColumn.key] as any)?.max ?? "")}
                      onChange={(event) => onSetFilter(activeColumn.key, {
                        type: "range",
                        min: (filters[activeColumn.key] as any)?.min,
                        max: event.target.value === "" ? undefined : Number(event.target.value),
                      })}
                    />
                  </div>
                </div>
              )}

              {(activeColumn.modelingType === "nominal" || activeColumn.modelingType === "ordinal" || activeColumn.modelingType === "text") && (
                <div className="space-y-2">
                  <Label className="text-[11px]">Category / Text Filter</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="Contains text"
                    value={(filters[activeColumn.key] as any)?.type === "text" ? (filters[activeColumn.key] as any)?.value || "" : ""}
                    onChange={(event) => onSetFilter(activeColumn.key, {
                      type: "text",
                      operator: "contains",
                      value: event.target.value,
                    })}
                  />
                  <ScrollArea className="h-24 rounded border p-2">
                    <div className="flex flex-wrap gap-1">
                      {categoryValues.map((value) => {
                        const selectedValues = (filters[activeColumn.key] as any)?.type === "category" ? (filters[activeColumn.key] as any).values || [] : [];
                        const active = selectedValues.includes(value);
                        return (
                          <button
                            key={value}
                            type="button"
                            className={`scientific-sidebar-focus rounded-full border px-2 py-1 text-[11px] ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted/50"}`}
                            onClick={() => {
                              const nextValues = active ? selectedValues.filter((item: string) => item !== value) : [...selectedValues, value];
                              onSetFilter(activeColumn.key, { type: "category", values: nextValues });
                            }}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {activeColumn.modelingType === "datetime" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">From</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={String((filters[activeColumn.key] as any)?.from ?? "")}
                      onChange={(event) => onSetFilter(activeColumn.key, {
                        type: "datetime",
                        from: event.target.value || undefined,
                        to: (filters[activeColumn.key] as any)?.to,
                      })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">To</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={String((filters[activeColumn.key] as any)?.to ?? "")}
                      onChange={(event) => onSetFilter(activeColumn.key, {
                        type: "datetime",
                        from: (filters[activeColumn.key] as any)?.from,
                        to: event.target.value || undefined,
                      })}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Select a column to edit its filter.</div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Active Filters</div>
            {Object.entries(filters).length ? (
              <div className="flex flex-wrap gap-1">
                {Object.entries(filters).map(([columnKey, filter]) => (
                  <button
                    key={columnKey}
                    type="button"
                    className="scientific-sidebar-focus inline-flex items-center gap-1 rounded-sm border bg-muted/60 px-2 py-1 text-[10px] font-medium transition-colors hover:bg-muted"
                    onClick={() => onSelectColumn(columnKey)}
                  >
                    <span>{columnMetadata[columnKey]?.displayName || columnKey}</span>
                    <Badge variant="secondary" className="h-4 rounded-sm px-1 text-[9px] uppercase tracking-wide">{filter.type}</Badge>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-sm border border-dashed px-2 py-3 text-xs text-muted-foreground">No active filters.</div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};
