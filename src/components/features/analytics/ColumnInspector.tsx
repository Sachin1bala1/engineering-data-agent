import React from "react";
import { BarChart3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { ColumnMetadata } from "@/stores/dataWorkbenchStore";
import { buildDownstreamDependencyMap, buildFormulaDiagnostics } from "@/components/features/analytics/table/derivedDiagnostics";

interface ColumnInspectorProps {
  column?: ColumnMetadata;
  allColumns?: ColumnMetadata[];
  derivedDependencyMap?: Record<string, string[]>;
  formulaHistory?: string[];
  onOpenDistribution?: () => void;
  onDeleteDerived?: () => void;
  onSelectColumn?: (columnKey: string) => void;
}

export const ColumnInspector: React.FC<ColumnInspectorProps> = ({ column, allColumns = [], derivedDependencyMap = {}, formulaHistory = [], onOpenDistribution, onDeleteDerived, onSelectColumn }) => {
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
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Column Inspector</div>
          <div className="text-xs text-muted-foreground">{column.displayName}</div>
        </div>
        <Button variant="outline" size="sm" onClick={onOpenDistribution}>
          <BarChart3 className="mr-2 h-4 w-4" />
          Distribution
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{column.modelingType}</Badge>
        {column.units && <Badge variant="outline">{column.units}</Badge>}
        {column.group && <Badge variant="outline">{column.group}</Badge>}
        {column.derived && <Badge variant="default">Derived</Badge>}
      </div>
      {column.derived && (
        <div>
          <Button variant="outline" size="sm" onClick={onDeleteDerived}>Delete Derived Column</Button>
        </div>
      )}
      <div className="space-y-2 text-xs">
        <div className="grid grid-cols-[110px_1fr] gap-2"><span className="text-muted-foreground">Source name</span><span>{column.name}</span></div>
        <div className="grid grid-cols-[110px_1fr] gap-2"><span className="text-muted-foreground">Display name</span><span>{column.displayName}</span></div>
        <div className="grid grid-cols-[110px_1fr] gap-2"><span className="text-muted-foreground">Format</span><span>{column.format || "-"}</span></div>
        <div className="grid grid-cols-[110px_1fr] gap-2"><span className="text-muted-foreground">Formula</span><span className="break-all">{column.formula || "-"}</span></div>
        <div className="grid grid-cols-[110px_1fr] gap-2"><span className="text-muted-foreground">Description</span><span>{column.description || "-"}</span></div>
      </div>
      {(column.derived || dependencies.length > 0 || dependents.length > 0) && (
        <>
          <Separator />
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dependency Graph</div>
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
                    className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors hover:opacity-85 ${className}`}
                    onClick={() => onSelectColumn?.(key)}
                  >
                    {role === "selected" ? "Selected" : role === "upstream" ? "Upstream" : "Downstream"}: {label}
                  </button>
                );
              })}
            </div>
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <span className="text-muted-foreground">Depends on</span>
                <span>{dependencies.length ? dependencies.join(", ") : "Source column"}</span>
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <span className="text-muted-foreground">Used by</span>
                <span>{dependents.length ? dependents.join(", ") : "-"}</span>
              </div>
              {formulaDiagnostics && (
                <>
                  <div className="grid grid-cols-[110px_1fr] gap-2">
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
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Formula History</div>
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
          </div>
        </>
      )}
      <Separator />
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Summary Stats</div>
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
      </div>
    </div>
  );
};
