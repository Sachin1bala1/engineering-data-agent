import React from "react";
import { BarChart3, ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { ColumnMetadata } from "@/stores/dataWorkbenchStore";
import { buildDownstreamDependencyMap, buildFormulaDiagnostics } from "@/components/features/analytics/table/derivedDiagnostics";

type ColumnInspectorSections = {
  actions: boolean;
  metadata: boolean;
  dependencies: boolean;
  stats: boolean;
};

interface ColumnInspectorProps {
  column?: ColumnMetadata;
  allColumns?: ColumnMetadata[];
  derivedDependencyMap?: Record<string, string[]>;
  formulaHistory?: string[];
  onOpenDistribution?: () => void;
  onDeleteDerived?: () => void;
  onSelectColumn?: (columnKey: string) => void;
  sections: ColumnInspectorSections;
  onToggleSection: (key: keyof ColumnInspectorSections) => void;
  onSetAllSections: (expanded: boolean) => void;
}

export const ColumnInspector: React.FC<ColumnInspectorProps> = ({
  column,
  allColumns = [],
  derivedDependencyMap = {},
  formulaHistory = [],
  onOpenDistribution,
  onDeleteDerived,
  onSelectColumn,
  sections,
  onToggleSection,
  onSetAllSections,
}) => {
  const allExpanded = Object.values(sections).every(Boolean);

  if (!column) {
    return <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">Select a column to inspect metadata and summary statistics.</div>;
  }

  const downstreamMap = buildDownstreamDependencyMap(derivedDependencyMap);
  const dependencies = derivedDependencyMap[column.key] || [];
  const dependents = downstreamMap[column.key] || [];
  const formulaDiagnostics =
    column.formula && column.derived
      ? buildFormulaDiagnostics({
          formula: column.formula,
          targetColumn: column.key,
          columns: allColumns,
          derivedDependencyMap,
        })
      : null;
  const impactColumns = Array.from(new Set([column.key, ...dependencies, ...dependents]));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-10 space-y-3 bg-muted/10 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Column Inspector</div>
            <div className="truncate text-xs text-muted-foreground">{column.displayName}</div>
          </div>
          <Button variant="ghost" size="sm" className="scientific-sidebar-focus h-8 px-2 text-[11px]" onClick={() => onSetAllSections(!allExpanded)}>
            {allExpanded ? "Collapse All" : "Expand All"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 rounded-md border bg-background/80 p-3 backdrop-blur-sm">
          <Badge className="rounded-full px-2.5 py-1 text-[11px]" variant="secondary">{column.modelingType}</Badge>
          {column.units && <Badge className="rounded-full px-2.5 py-1 text-[11px]" variant="outline">{column.units}</Badge>}
          {column.group && <Badge className="rounded-full px-2.5 py-1 text-[11px]" variant="outline">{column.group}</Badge>}
          {column.derived && <Badge className="rounded-full px-2.5 py-1 text-[11px]" variant="default">Derived</Badge>}
        </div>
        <div className="space-y-2 rounded-md border bg-background/80 p-3 backdrop-blur-sm">
          <button type="button" className="scientific-sidebar-focus flex w-full items-center justify-between rounded-sm px-1 py-0.5 text-left" onClick={() => onToggleSection("actions")}>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Actions</span>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${sections.actions ? "" : "-rotate-90"}`} />
          </button>
          {sections.actions && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="scientific-sidebar-focus h-9 min-w-[132px] flex-1 justify-start px-3" onClick={onOpenDistribution}>
                <BarChart3 className="mr-2 h-4 w-4" />
                Distribution
              </Button>
              {column.derived && (
                <Button variant="outline" size="sm" className="scientific-sidebar-focus h-9 min-w-[132px] flex-1 justify-start px-3" onClick={onDeleteDerived}>
                  Delete Derived
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="space-y-3 pr-1">
          <div className="space-y-2 rounded-md border bg-muted/10 p-3 text-xs">
            <button type="button" className="scientific-sidebar-focus flex w-full items-center justify-between rounded-sm px-1 py-0.5 text-left" onClick={() => onToggleSection("metadata")}>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Metadata</span>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${sections.metadata ? "" : "-rotate-90"}`} />
            </button>
            {sections.metadata && (
              <>
                <div className="grid grid-cols-[minmax(0,92px)_1fr] gap-2"><span className="text-muted-foreground">Source name</span><span className="break-all">{column.name}</span></div>
                <div className="grid grid-cols-[minmax(0,92px)_1fr] gap-2"><span className="text-muted-foreground">Display name</span><span className="break-all">{column.displayName}</span></div>
                <div className="grid grid-cols-[minmax(0,92px)_1fr] gap-2"><span className="text-muted-foreground">Format</span><span className="break-all">{column.format || "-"}</span></div>
                <div className="grid grid-cols-[minmax(0,92px)_1fr] gap-2"><span className="text-muted-foreground">Formula</span><span className="break-all">{column.formula || "-"}</span></div>
                <div className="grid grid-cols-[minmax(0,92px)_1fr] gap-2"><span className="text-muted-foreground">Description</span><span className="break-all">{column.description || "-"}</span></div>
              </>
            )}
          </div>
          {(column.derived || dependencies.length > 0 || dependents.length > 0) && (
            <>
              <Separator />
              <div className="space-y-2 rounded-md border bg-muted/10 p-3">
                <button type="button" className="scientific-sidebar-focus flex w-full items-center justify-between rounded-sm px-1 py-0.5 text-left" onClick={() => onToggleSection("dependencies")}>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Dependency Graph</span>
                  <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${sections.dependencies ? "" : "-rotate-90"}`} />
                </button>
                {sections.dependencies && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {impactColumns.map((key) => {
                        const role =
                          key === column.key ? "selected" : dependencies.includes(key) ? "upstream" : dependents.includes(key) ? "downstream" : "related";
                        const label = allColumns.find((item) => item.key === key)?.displayName || key;
                        const className =
                          role === "selected"
                            ? "border-primary bg-primary/10 text-primary"
                            : role === "upstream"
                            ? "border-amber-300 bg-amber-50 text-amber-800"
                            : "border-emerald-300 bg-emerald-50 text-emerald-800";
                        return (
                          <button
                            key={key}
                            type="button"
                            className={`scientific-sidebar-focus inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors hover:opacity-85 ${className}`}
                            onClick={() => onSelectColumn?.(key)}
                          >
                            {role === "selected" ? "Selected" : role === "upstream" ? "Upstream" : "Downstream"}: {label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="grid grid-cols-[minmax(0,92px)_1fr] gap-2">
                        <span className="text-muted-foreground">Depends on</span>
                        <span className="break-all">{dependencies.length ? dependencies.join(", ") : "Source column"}</span>
                      </div>
                      <div className="grid grid-cols-[minmax(0,92px)_1fr] gap-2">
                        <span className="text-muted-foreground">Used by</span>
                        <span className="break-all">{dependents.length ? dependents.join(", ") : "-"}</span>
                      </div>
                      {formulaDiagnostics && (
                        <>
                          <div className="grid grid-cols-[minmax(0,92px)_1fr] gap-2">
                            <span className="text-muted-foreground">Formula status</span>
                            <span className={formulaDiagnostics.isValid ? "text-emerald-700" : "text-destructive"}>
                              {formulaDiagnostics.isValid ? "Valid" : "Needs attention"}
                            </span>
                          </div>
                          {formulaDiagnostics.unknownDependencies.length > 0 && (
                            <div className="rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-destructive">
                              Unknown references: {formulaDiagnostics.unknownDependencies.join(", ")}
                            </div>
                          )}
                          {formulaDiagnostics.cyclePath && (
                            <div className="rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-destructive">
                              Cycle path: {formulaDiagnostics.cyclePath.join(" -> ")}
                            </div>
                          )}
                        </>
                      )}
                      {formulaHistory.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Formula History</div>
                          <div className="max-h-28 overflow-auto rounded border bg-background p-2">
                            {formulaHistory.map((entry, index) => (
                              <div key={`${entry}-${index}`} className="truncate border-b py-1 font-mono text-[11px] last:border-b-0">
                                {entry}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
          <Separator />
          <div className="rounded-md border bg-muted/5 p-3">
            <button type="button" className="scientific-sidebar-focus flex w-full items-center justify-between rounded-sm px-1 py-0.5 text-left" onClick={() => onToggleSection("stats")}>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Summary Stats</span>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${sections.stats ? "" : "-rotate-90"}`} />
            </button>
            {sections.stats && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded border p-2"><div className="text-muted-foreground">Count</div><div className="font-medium">{column.stats?.count ?? 0}</div></div>
                <div className="rounded border p-2"><div className="text-muted-foreground">Missing</div><div className="font-medium">{column.stats?.missingCount ?? 0}</div></div>
                <div className="rounded border p-2"><div className="text-muted-foreground">Unique</div><div className="font-medium">{column.stats?.uniqueCount ?? 0}</div></div>
                <div className="rounded border p-2"><div className="text-muted-foreground">Mean</div><div className="font-medium">{column.stats?.mean?.toFixed?.(4) ?? "-"}</div></div>
                <div className="rounded border p-2"><div className="text-muted-foreground">Median</div><div className="font-medium">{column.stats?.median?.toFixed?.(4) ?? "-"}</div></div>
                <div className="rounded border p-2"><div className="text-muted-foreground">Std Dev</div><div className="font-medium">{column.stats?.stdDev?.toFixed?.(4) ?? "-"}</div></div>
                <div className="rounded border p-2"><div className="text-muted-foreground">Min</div><div className="font-medium">{column.stats?.min?.toFixed?.(4) ?? "-"}</div></div>
                <div className="rounded border p-2"><div className="text-muted-foreground">Max</div><div className="font-medium">{column.stats?.max?.toFixed?.(4) ?? "-"}</div></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
