import React, { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ColumnMetadata, WorkbenchRow } from "@/stores/dataWorkbenchStore";

interface TableAIHelperProps {
  activeColumn?: ColumnMetadata;
  rows: WorkbenchRow[];
  onOpenDistribution?: (columnKey: string) => void;
}

export const TableAIHelper: React.FC<TableAIHelperProps> = ({ activeColumn, rows, onOpenDistribution }) => {
  const [prompt, setPrompt] = useState("");

  const response = useMemo(() => {
    if (!activeColumn) return "Select a column to get deterministic table guidance.";
    const missingPct = ((activeColumn.stats?.missingPct || 0) * 100).toFixed(1);
    const base = [
      `${activeColumn.displayName} is modeled as ${activeColumn.modelingType}.`,
      `Missing values: ${activeColumn.stats?.missingCount ?? 0} (${missingPct}%).`,
      `Unique values: ${activeColumn.stats?.uniqueCount ?? 0}.`,
    ];
    if (activeColumn.modelingType === "continuous") {
      base.push(`Mean ${activeColumn.stats?.mean?.toFixed?.(3) ?? "-"}, median ${activeColumn.stats?.median?.toFixed?.(3) ?? "-"}, std ${activeColumn.stats?.stdDev?.toFixed?.(3) ?? "-"}.`);
      if ((activeColumn.stats?.missingPct || 0) > 0.1) base.push("Recommendation: review missing-value handling before downstream analysis.");
      else base.push("Recommendation: inspect distribution and outliers, then consider Graph Builder with this column on Y.");
    } else {
      base.push("Recommendation: inspect top categories, consider recoding sparse levels, and compare counts with a bar or box view.");
    }
    if (prompt.trim()) base.push(`Prompt context: ${prompt.trim()}`);
    return base.join(" ");
  }, [activeColumn, prompt]);

  return (
    <div className="space-y-2 rounded-md border bg-muted/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Table Helper</div>
          <div className="text-[11px] text-muted-foreground">Deterministic in-table guidance for the active column.</div>
        </div>
        {activeColumn && (
          <Button size="sm" variant="outline" onClick={() => onOpenDistribution?.(activeColumn.key)}>
            Distribution
          </Button>
        )}
      </div>
      <Input value={prompt} onChange={(event) => setPrompt(event.target.value)} className="h-8 text-xs" placeholder="Ask a table-local question, e.g. why is this skewed?" />
      <div className="rounded-sm border bg-background px-3 py-2 text-xs leading-5">{response}</div>
      {activeColumn && (
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setPrompt(`Explain ${activeColumn.displayName}`)}>Explain Column</Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setPrompt(`Suggest graph for ${activeColumn.displayName}`)}>Suggest Graph</Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setPrompt(`Detect anomalies in ${activeColumn.displayName}`)}>Detect Anomalies</Button>
        </div>
      )}
    </div>
  );
};
