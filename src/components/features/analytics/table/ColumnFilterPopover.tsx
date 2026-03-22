import React, { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ColumnFilterState, ColumnMetadata, WorkbenchRow } from "@/stores/dataWorkbenchStore";

interface ColumnFilterPopoverProps {
  column: ColumnMetadata;
  rows: WorkbenchRow[];
  filter?: ColumnFilterState;
  onChange: (filter: ColumnFilterState) => void;
  onClear: () => void;
  children: React.ReactNode;
}

export const ColumnFilterPopover: React.FC<ColumnFilterPopoverProps> = ({ column, rows, filter, onChange, onClear, children }) => {
  const categoryValues = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => row[column.key])
          .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
          .map((value) => String(value))
      )
    )
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 60);
  }, [column.key, rows]);

  return (
    <Popover>
      <PopoverTrigger asChild>{children as any}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Filter {column.displayName}</div>
            <div className="text-xs text-muted-foreground">{column.modelingType} column</div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClear}>Clear</Button>
        </div>

        {column.modelingType === "continuous" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Min</Label>
              <Input
                className="h-8 text-xs"
                value={String((filter as any)?.type === "range" ? (filter as any)?.min ?? "" : "")}
                onChange={(event) => onChange({
                  type: "range",
                  min: event.target.value === "" ? undefined : Number(event.target.value),
                  max: (filter as any)?.type === "range" ? (filter as any)?.max : undefined,
                })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Max</Label>
              <Input
                className="h-8 text-xs"
                value={String((filter as any)?.type === "range" ? (filter as any)?.max ?? "" : "")}
                onChange={(event) => onChange({
                  type: "range",
                  min: (filter as any)?.type === "range" ? (filter as any)?.min : undefined,
                  max: event.target.value === "" ? undefined : Number(event.target.value),
                })}
              />
            </div>
          </div>
        )}

        {(column.modelingType === "nominal" || column.modelingType === "ordinal" || column.modelingType === "text") && (
          <div className="space-y-2">
            <Input
              className="h-8 text-xs"
              placeholder="Contains text"
              value={(filter as any)?.type === "text" ? (filter as any)?.value || "" : ""}
              onChange={(event) => onChange({ type: "text", operator: "contains", value: event.target.value })}
            />
            <ScrollArea className="h-28 rounded border p-2">
              <div className="flex flex-wrap gap-1">
                {categoryValues.map((value) => {
                  const selected = (filter as any)?.type === "category" ? (((filter as any)?.values || []) as string[]) : [];
                  const active = selected.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`rounded-full border px-2 py-1 text-[11px] ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted/50"}`}
                      onClick={() => {
                        const nextValues = active ? selected.filter((item) => item !== value) : [...selected, value];
                        onChange({ type: "category", values: nextValues });
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

        {column.modelingType === "datetime" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">From</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={String((filter as any)?.type === "datetime" ? (filter as any)?.from ?? "" : "")}
                onChange={(event) => onChange({
                  type: "datetime",
                  from: event.target.value || undefined,
                  to: (filter as any)?.type === "datetime" ? (filter as any)?.to : undefined,
                })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">To</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={String((filter as any)?.type === "datetime" ? (filter as any)?.to ?? "" : "")}
                onChange={(event) => onChange({
                  type: "datetime",
                  from: (filter as any)?.type === "datetime" ? (filter as any)?.from : undefined,
                  to: event.target.value || undefined,
                })}
              />
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
