import React, { useEffect, useMemo, useState } from "react";
import type { IHeaderParams } from "ag-grid-community";
import { ArrowDown, ArrowUp, BarChart3, Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ColumnFilterPopover } from "@/components/features/analytics/table/ColumnFilterPopover";
import { ColumnMenu } from "@/components/features/analytics/table/ColumnMenu";
import { useDataWorkbenchStore, type ColumnModelingType } from "@/stores/dataWorkbenchStore";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface ScientificColumnHeaderParams extends IHeaderParams {
  rows?: any[];
  metadataOverride?: any;
  filterOverride?: any;
  sortRuleOverride?: { columnKey: string; direction: "asc" | "desc"; priority: number };
  onOpenFilter?: (columnKey: string) => void;
  onOpenDistribution?: (columnKey: string) => void;
  onOpenInspector?: (columnKey: string) => void;
  onRenameColumn?: (columnKey: string, nextName?: string) => void;
  onOpenMetadata?: (columnKey: string) => void;
  onHideColumn?: (columnKey: string) => void;
  onCreateFormula?: (columnKey: string) => void;
  onRecode?: (columnKey: string) => void;
  onDeleteDerived?: (columnKey: string) => void;
  onAddToGraph?: (columnKey: string) => void;
  onSetUnits?: (columnKey: string) => void;
  onPinLeft?: (columnKey: string) => void;
  onPinRight?: (columnKey: string) => void;
  onUnpin?: (columnKey: string) => void;
  onSetType?: (columnKey: string, type: ColumnModelingType) => void;
  onSetFilterValue?: (columnKey: string, filter: any) => void;
  onClearFilterValue?: (columnKey: string) => void;
  onSelectColumnRange?: (columnKey: string) => void;
  onStartColumnSweep?: (columnKey: string) => void;
  onSweepColumnHover?: (columnKey: string) => void;
  onQuickChart?: (columnKey: string, mode: "histogram" | "box" | "scatter" | "trend") => void;
}

export const ScientificColumnHeader: React.FC<ScientificColumnHeaderParams> = (props) => {
  const columnKey = props.column.getColId();
  const metadata = useDataWorkbenchStore((state) => state.columnMetadata[columnKey]);
  const filters = useDataWorkbenchStore((state) => state.columnFilters);
  const setColumnType = useDataWorkbenchStore((state) => state.setColumnType);
  const setColumnFilter = useDataWorkbenchStore((state) => state.setColumnFilter);
  const clearColumnFilter = useDataWorkbenchStore((state) => state.clearColumnFilter);
  const sortRules = useDataWorkbenchStore((state) => state.sortRules);
  const effectiveMetadata = props.metadataOverride || metadata;
  const effectiveFilter = props.filterOverride ?? filters[columnKey];
  const hasFilter = Boolean(effectiveFilter);
  const sortRule = props.sortRuleOverride || sortRules.find((rule) => rule.columnKey === columnKey);
  const modelingType = effectiveMetadata?.modelingType || "nominal";
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(effectiveMetadata?.displayName || props.displayName || columnKey);

  useEffect(() => {
    if (isEditingName) return;
    setDraftName(effectiveMetadata?.displayName || props.displayName || columnKey);
  }, [effectiveMetadata?.displayName, props.displayName, columnKey, isEditingName]);

  const commitRename = () => {
    const next = draftName.trim();
    setIsEditingName(false);
    if (!next) {
      setDraftName(effectiveMetadata?.displayName || props.displayName || columnKey);
      return;
    }
    if (next !== (effectiveMetadata?.displayName || props.displayName || columnKey)) {
      props.onRenameColumn?.(columnKey, next);
    }
  };
  const miniPreview = useMemo(() => {
    if (modelingType === "continuous") {
      const values = [
        Math.abs(Number(effectiveMetadata?.stats?.min ?? 0)),
        Math.abs(Number(effectiveMetadata?.stats?.mean ?? 0)),
        Math.abs(Number(effectiveMetadata?.stats?.median ?? 0)),
        Math.abs(Number(effectiveMetadata?.stats?.max ?? 0)),
      ];
      const max = Math.max(...values, 1);
      return (
        <div className="flex h-3 items-end gap-[2px]">
          {values.map((value, index) => (
            <span key={index} className="w-2 rounded-t-[2px] bg-primary/60" style={{ height: `${Math.max(20, (value / max) * 100)}%` }} />
          ))}
        </div>
      );
    }
    const counts = (effectiveMetadata?.stats?.topCategories || []).slice(0, 4).map((item) => item.count);
    const max = Math.max(...counts, 1);
    return (
      <div className="flex h-3 items-end gap-[2px]">
        {counts.map((value, index) => (
          <span key={index} className="w-2 rounded-t-[2px] bg-primary/60" style={{ height: `${Math.max(20, (value / max) * 100)}%` }} />
        ))}
      </div>
    );
  }, [effectiveMetadata, modelingType]);

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className="scientific-grid__header flex h-full min-w-0 items-center gap-1 px-1 py-1 text-[11px]"
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          if (event.target instanceof HTMLElement && event.target.closest(".scientific-grid__header-actions")) return;
          props.onStartColumnSweep?.(columnKey);
        }}
        onMouseOver={(event) => {
          if ((event.buttons & 1) !== 1) return;
          if (event.target instanceof HTMLElement && event.target.closest(".scientific-grid__header-actions")) return;
          props.onSweepColumnHover?.(columnKey);
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1 py-0.5 text-left hover:bg-background/70"
              onClick={(event) => {
                event.stopPropagation();
                props.onSelectColumnRange?.(columnKey);
                props.onOpenInspector?.(columnKey);
              }}
            >
              <span className="min-w-0 flex-1 overflow-hidden">
                <span className="flex items-center gap-1">
                  {isEditingName ? (
                    <input
                      autoFocus
                      value={draftName}
                      className="min-w-0 flex-1 rounded-sm border border-primary/30 bg-background px-1 py-0 text-[12px] font-semibold leading-tight text-foreground outline-none"
                      onChange={(event) => setDraftName(event.target.value)}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onBlur={commitRename}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRename();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setIsEditingName(false);
                          setDraftName(effectiveMetadata?.displayName || props.displayName || columnKey);
                        }
                      }}
                    />
                  ) : (
                    <span
                      className="truncate cursor-text text-[13px] font-semibold leading-tight text-foreground underline-offset-2 hover:underline"
                      onDoubleClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setIsEditingName(true);
                      }}
                      title="Double-click to rename column"
                    >
                      {effectiveMetadata?.displayName || props.displayName}
                    </span>
                  )}
                  {sortRule?.direction === "asc" && <ArrowUp className="h-3 w-3 shrink-0 text-primary" />}
                  {sortRule?.direction === "desc" && <ArrowDown className="h-3 w-3 shrink-0 text-primary" />}
                </span>
                <span className="block truncate text-[10px] leading-tight text-muted-foreground">
                  {modelingType}
                  {effectiveMetadata?.units ? ` | ${effectiveMetadata.units}` : ""}
                  {hasFilter ? " | filtered" : ""}
                </span>
                <span className="mt-1 block max-w-[72px] overflow-hidden">
                  {miniPreview}
                </span>
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="w-[240px] space-y-2 p-3">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold">{effectiveMetadata?.displayName || props.displayName}</div>
              <div className="text-[11px] text-muted-foreground">
                {modelingType} {effectiveMetadata?.units ? `| ${effectiveMetadata.units}` : ""} {effectiveMetadata?.derived ? "| derived" : ""}
              </div>
            </div>
            {miniPreview}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <span className="text-muted-foreground">Missing</span>
              <span>{effectiveMetadata?.stats?.missingCount ?? 0}</span>
              <span className="text-muted-foreground">Unique</span>
              <span>{effectiveMetadata?.stats?.uniqueCount ?? 0}</span>
              <span className="text-muted-foreground">Mean</span>
              <span>{effectiveMetadata?.stats?.mean?.toFixed?.(3) ?? "-"}</span>
              <span className="text-muted-foreground">Median</span>
              <span>{effectiveMetadata?.stats?.median?.toFixed?.(3) ?? "-"}</span>
              <span className="text-muted-foreground">Min</span>
              <span>{effectiveMetadata?.stats?.min?.toFixed?.(3) ?? "-"}</span>
              <span className="text-muted-foreground">Max</span>
              <span>{effectiveMetadata?.stats?.max?.toFixed?.(3) ?? "-"}</span>
            </div>
          </TooltipContent>
        </Tooltip>
        <div className="scientific-grid__header-actions flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 rounded-sm border border-transparent"
                onClick={(event) => event.stopPropagation()}
              >
                <BarChart3 className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => props.onQuickChart?.(columnKey, "histogram")}>Histogram</DropdownMenuItem>
              <DropdownMenuItem onClick={() => props.onQuickChart?.(columnKey, "box")}>Box Plot</DropdownMenuItem>
              <DropdownMenuItem onClick={() => props.onQuickChart?.(columnKey, "scatter")}>Scatter</DropdownMenuItem>
              <DropdownMenuItem onClick={() => props.onQuickChart?.(columnKey, "trend")}>Trend</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {effectiveMetadata ? (
            <ColumnFilterPopover
              column={effectiveMetadata}
              rows={props.rows || []}
              filter={effectiveFilter}
              onChange={(filter) => {
                if (props.onSetFilterValue) props.onSetFilterValue(columnKey, filter);
                else setColumnFilter(columnKey, filter);
                props.onOpenFilter?.(columnKey);
              }}
              onClear={() => {
                if (props.onClearFilterValue) props.onClearFilterValue(columnKey);
                else clearColumnFilter(columnKey);
              }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={hasFilter ? "default" : "ghost"}
                    size="icon"
                    className="h-7 w-7 shrink-0 rounded-sm border border-transparent data-[state=open]:border-border"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Filter className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-[11px]">Typed filter (Ctrl+Shift+F)</TooltipContent>
              </Tooltip>
            </ColumnFilterPopover>
          ) : (
            <Button
              variant={hasFilter ? "default" : "ghost"}
              size="icon"
              className="h-7 w-7 shrink-0 rounded-sm"
              onClick={(event) => {
                event.stopPropagation();
                props.onOpenFilter?.(columnKey);
              }}
            >
              <Filter className="h-3.5 w-3.5" />
            </Button>
          )}
          <ColumnMenu
            columnKey={columnKey}
            modelingType={modelingType}
            compact
            onSortAsc={() => props.setSort?.("asc", false)}
            onSortDesc={() => props.setSort?.("desc", false)}
            onClearSort={() => props.setSort?.(null as any, false)}
            onFilter={() => props.onOpenFilter?.(columnKey)}
            onInfo={() => props.onOpenInspector?.(columnKey)}
            onDistribution={() => props.onOpenDistribution?.(columnKey)}
            onSummary={() => props.onOpenDistribution?.(columnKey)}
            onMetadata={() => props.onOpenMetadata?.(columnKey)}
            onRename={() => setIsEditingName(true)}
            onCreateFormula={() => props.onCreateFormula?.(columnKey)}
            onRecode={() => props.onRecode?.(columnKey)}
            onHide={() => props.onHideColumn?.(columnKey)}
            onDeleteDerived={() => props.onDeleteDerived?.(columnKey)}
            onAddToGraph={() => props.onAddToGraph?.(columnKey)}
            onQuickChart={(mode) => props.onQuickChart?.(columnKey, mode)}
            onSetUnits={() => props.onSetUnits?.(columnKey)}
            onPinLeft={() => props.onPinLeft?.(columnKey)}
            onPinRight={() => props.onPinRight?.(columnKey)}
            onUnpin={() => props.onUnpin?.(columnKey)}
            onSetType={(type) => (props.onSetType ? props.onSetType(columnKey, type) : setColumnType(columnKey, type))}
            isDerived={Boolean(effectiveMetadata?.derived)}
          />
        </div>
      </div>
    </TooltipProvider>
  );
};
