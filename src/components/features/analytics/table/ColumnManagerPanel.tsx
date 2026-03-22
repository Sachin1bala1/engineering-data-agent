import React, { useMemo } from "react";
import { BarChart3, Eye, EyeOff, Info, Search, Workflow } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ColumnMetadata } from "@/stores/dataWorkbenchStore";

interface ColumnManagerPanelProps {
  columns: ColumnMetadata[];
  searchQuery: string;
  visibleColumns: string[];
  groups: string[];
  activeColumnKey?: string;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  onSearchChange: (value: string) => void;
  onSelectColumn: (columnKey: string) => void;
  onToggleVisibility: (columnKey: string) => void;
  onSetGroup: (columnKey: string, groupName?: string) => void;
  onOpenDistribution?: (columnKey: string) => void;
  onOpenInfo?: (columnKey: string) => void;
  onAddToGraph?: (columnKey: string) => void;
}

const MiniDistribution: React.FC<{ values: number[] }> = ({ values }) => {
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-6 items-end gap-[2px]">
      {values.map((value, index) => (
        <div key={index} className="w-2 rounded-t-sm bg-primary/50" style={{ height: `${Math.max(15, (value / max) * 100)}%` }} />
      ))}
    </div>
  );
};

export const ColumnManagerPanel: React.FC<ColumnManagerPanelProps> = ({
  columns,
  searchQuery,
  visibleColumns,
  groups,
  activeColumnKey,
  searchInputRef,
  onSearchChange,
  onSelectColumn,
  onToggleVisibility,
  onSetGroup,
  onOpenDistribution,
  onOpenInfo,
  onAddToGraph,
}) => {
  const filteredColumns = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    if (!normalized) return columns;
    return columns.filter((column) => {
      return [column.displayName, column.name, column.group || "", column.modelingType]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [columns, searchQuery]);

  const groupedColumns = useMemo(() => {
    const map = new Map<string, ColumnMetadata[]>();
    for (const column of filteredColumns) {
      const group = column.group || "Ungrouped";
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(column);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredColumns]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-10 space-y-3 bg-muted/10 pb-3">
        <div>
          <div className="text-sm font-semibold">Column Manager</div>
          <div className="text-xs text-muted-foreground">Metadata, visibility, and quick distribution preview.</div>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            className="h-9 pl-8 text-xs"
            placeholder="Search variables"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 rounded-md border bg-background">
        <div className="space-y-3 p-2">
          {groupedColumns.map(([group, items]) => (
            <div key={group} className="space-y-1.5">
              <div className="sticky top-0 z-10 rounded-sm bg-muted/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground backdrop-blur">
                {group} <span className="ml-1 font-normal tracking-normal">({items.length})</span>
              </div>
              {items.map((column) => {
                const visible = visibleColumns.includes(column.key);
                const stats = column.stats;
                const miniValues = column.modelingType === "continuous"
                  ? [stats?.min ?? 0, stats?.mean ?? 0, stats?.median ?? 0, stats?.max ?? 0].map((value) => Math.abs(Number(value) || 0))
                  : (stats?.topCategories || []).slice(0, 4).map((item) => item.count);
                return (
                  <div
                    key={column.key}
                    role="button"
                    tabIndex={0}
                    draggable
                    className={`scientific-sidebar-focus w-full rounded-md border px-2 py-2 text-left transition ${activeColumnKey === column.key ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:bg-muted/40"}`}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", column.key);
                      event.dataTransfer.setData("application/x-data-column", column.key);
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => onSelectColumn(column.key)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectColumn(column.key);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-semibold">{column.displayName}</div>
                        <div className="truncate text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                          {column.modelingType} {column.units ? `| ${column.units}` : ""} {column.derived ? "| derived" : ""}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="scientific-sidebar-focus h-6 w-6 shrink-0"
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleVisibility(column.key);
                        }}
                      >
                        {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <div className="text-[10px] text-muted-foreground">
                        miss {((stats?.missingPct || 0) * 100).toFixed(1)}% | uniq {stats?.uniqueCount || 0}
                      </div>
                      <Badge variant={visible ? "secondary" : "outline"} className="h-5 rounded-sm px-1.5 text-[9px] uppercase tracking-wide">
                        {visible ? "Shown" : "Hidden"}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <MiniDistribution values={miniValues.length ? miniValues : [1, 1, 1, 1]} />
                      <Select value={column.group || "__none__"} onValueChange={(value) => onSetGroup(column.key, value === "__none__" ? undefined : value)}>
                        <SelectTrigger className="h-7 w-[124px] rounded-sm text-[10px]" onClick={(event) => event.stopPropagation()}>
                          <SelectValue placeholder="Group" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No group</SelectItem>
                          {groups.map((groupName) => (
                            <SelectItem key={groupName} value={groupName}>{groupName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="scientific-sidebar-focus h-6 w-6 rounded-sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenDistribution?.(column.key);
                        }}
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="scientific-sidebar-focus h-6 w-6 rounded-sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenInfo?.(column.key);
                        }}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="scientific-sidebar-focus h-6 w-6 rounded-sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          onAddToGraph?.(column.key);
                        }}
                      >
                        <Workflow className="h-3.5 w-3.5" />
                      </Button>
                      <div className="ml-auto text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                        {column.derived ? "Derived" : "Source"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
