import React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ColumnFilterState, ColumnMetadata, SortRule, WorkbenchRow } from "@/stores/dataWorkbenchStore";
import { DistributionPanel } from "@/components/features/analytics/table/DistributionPanel";
import { PivotPanel } from "@/components/features/analytics/table/PivotPanel";

interface BottomAnalyticsPanelProps {
  activeTab: "summary" | "distribution" | "query" | "pivot";
  onTabChange: (value: "summary" | "distribution" | "query" | "pivot") => void;
  activeColumn?: ColumnMetadata;
  displayedRows: WorkbenchRow[];
  analysisRows: WorkbenchRow[];
  selectedRowIds: number[];
  rowStates: Record<number, { excluded?: boolean; hidden?: boolean }>;
  filters: Record<string, ColumnFilterState>;
  sortRules: SortRule[];
  rows: WorkbenchRow[];
  columns: ColumnMetadata[];
  pivotScopeKey: string;
  onClearFilters: () => void;
  onClearSorts: () => void;
  onExportPivot?: (payload: { label: string; rows: WorkbenchRow[]; columns: string[] }) => void;
  onOpenPivotInGraphBuilder?: (payload: { label: string; rows: WorkbenchRow[]; columns: string[]; xColumn: string; yColumn?: string }) => void;
  onOpenPivotAsChartTab?: (payload: { label: string; rows: WorkbenchRow[]; columns: string[]; xColumn: string; yColumn?: string; chartType: "scatter" | "bar" }) => void;
}

export const BottomAnalyticsPanel: React.FC<BottomAnalyticsPanelProps> = ({
  activeTab,
  onTabChange,
  activeColumn,
  displayedRows,
  analysisRows,
  selectedRowIds,
  rowStates,
  filters,
  sortRules,
  rows,
  columns,
  pivotScopeKey,
  onClearFilters,
  onClearSorts,
  onExportPivot,
  onOpenPivotInGraphBuilder,
  onOpenPivotAsChartTab,
}) => {
  const excludedCount = Object.values(rowStates).filter((state) => state?.excluded).length;
  const hiddenCount = Object.values(rowStates).filter((state) => state?.hidden).length;

  return (
    <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as any)} className="h-full">
      <TabsList className="grid w-full grid-cols-4 lg:w-[420px]">
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="distribution">Distribution</TabsTrigger>
        <TabsTrigger value="query">Query Builder</TabsTrigger>
        <TabsTrigger value="pivot">Pivot</TabsTrigger>
      </TabsList>
      <TabsContent value="summary" className="pt-3 h-[calc(100%-44px)] overflow-auto">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="rounded border p-3"><div className="text-xs text-muted-foreground">Dataset Rows</div><div className="text-xl font-semibold">{rows.length}</div></div>
          <div className="rounded border p-3"><div className="text-xs text-muted-foreground">Visible Rows</div><div className="text-xl font-semibold">{displayedRows.length}</div></div>
          <div className="rounded border p-3"><div className="text-xs text-muted-foreground">Analysis Rows</div><div className="text-xl font-semibold">{analysisRows.length}</div></div>
          <div className="rounded border p-3"><div className="text-xs text-muted-foreground">Selected Rows</div><div className="text-xl font-semibold">{selectedRowIds.length}</div></div>
          <div className="rounded border p-3"><div className="text-xs text-muted-foreground">Excluded Rows</div><div className="text-xl font-semibold">{excludedCount}</div></div>
          <div className="rounded border p-3"><div className="text-xs text-muted-foreground">Hidden Rows</div><div className="text-xl font-semibold">{hiddenCount}</div></div>
        </div>
      </TabsContent>
      <TabsContent value="distribution" className="pt-3 h-[calc(100%-44px)] overflow-auto">
        <DistributionPanel column={activeColumn} rows={analysisRows} />
      </TabsContent>
      <TabsContent value="query" className="pt-3 h-[calc(100%-44px)] overflow-auto">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onClearFilters}>Clear Filters</Button>
            <Button size="sm" variant="outline" onClick={onClearSorts}>Clear Sorts</Button>
          </div>
          <div>
            <div className="text-sm font-semibold">Active Filters</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(filters).length ? Object.entries(filters).map(([columnKey, filter]) => (
                <Badge key={columnKey} variant="secondary">{columnKey}: {filter.type}</Badge>
              )) : <div className="text-xs text-muted-foreground">No active filters.</div>}
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold">Sort Rules</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {sortRules.length ? sortRules.map((rule) => (
                <Badge key={`${rule.columnKey}-${rule.priority}`} variant="outline">{rule.priority + 1}. {rule.columnKey} {rule.direction}</Badge>
              )) : <div className="text-xs text-muted-foreground">No sort rules.</div>}
            </div>
          </div>
        </div>
      </TabsContent>
      <TabsContent value="pivot" className="pt-3 h-[calc(100%-44px)] overflow-auto">
        <PivotPanel
          rows={analysisRows}
          columns={columns}
          scopeKey={pivotScopeKey}
          onExportToTab={onExportPivot}
          onOpenGraphBuilder={onOpenPivotInGraphBuilder}
          onOpenChartTab={onOpenPivotAsChartTab}
        />
      </TabsContent>
    </Tabs>
  );
};
