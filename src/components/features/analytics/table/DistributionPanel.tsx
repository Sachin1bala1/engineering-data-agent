import React, { useMemo } from "react";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { ColumnMetadata, WorkbenchRow } from "@/stores/dataWorkbenchStore";

interface DistributionPanelProps {
  column?: ColumnMetadata;
  rows: WorkbenchRow[];
}

const isMissingValue = (value: any): boolean => {
  if (value === null || value === undefined) return true;
  const text = String(value).trim().toLowerCase();
  return text === "" || text === "null" || text === "nan" || text === "none" || text === "n/a" || text === "na";
};

export const DistributionPanel: React.FC<DistributionPanelProps> = ({ column, rows }) => {
  const data = useMemo(() => {
    if (!column) return [] as Array<{ label: string; value: number }>;
    const values = rows.map((row) => row[column.key]).filter((value) => !isMissingValue(value));
    if (column.modelingType === "continuous") {
      const numeric = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
      if (!numeric.length) return [];
      const min = Math.min(...numeric);
      const max = Math.max(...numeric);
      const bins = Math.min(12, Math.max(4, Math.round(Math.sqrt(numeric.length))));
      const span = max - min || 1;
      const step = span / bins;
      const histogram = Array.from({ length: bins }, (_, index) => ({
        label: `${(min + step * index).toFixed(2)}`,
        value: 0,
      }));
      for (const value of numeric) {
        const index = Math.min(bins - 1, Math.floor((value - min) / step));
        histogram[index].value += 1;
      }
      return histogram;
    }

    const counts = new Map<string, number>();
    for (const value of values) {
      const key = String(value);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([label, value]) => ({ label, value }));
  }, [column, rows]);

  if (!column) {
    return <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">Choose a column to inspect its distribution.</div>;
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-semibold">Distribution</div>
        <div className="text-xs text-muted-foreground">{column.displayName}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded border p-2"><div className="text-muted-foreground">Missing</div><div className="font-medium">{column.stats?.missingCount ?? 0}</div></div>
        <div className="rounded border p-2"><div className="text-muted-foreground">Unique</div><div className="font-medium">{column.stats?.uniqueCount ?? 0}</div></div>
        <div className="rounded border p-2"><div className="text-muted-foreground">Mean</div><div className="font-medium">{column.stats?.mean?.toFixed?.(4) ?? "-"}</div></div>
        <div className="rounded border p-2"><div className="text-muted-foreground">Median</div><div className="font-medium">{column.stats?.median?.toFixed?.(4) ?? "-"}</div></div>
      </div>
      <div className="h-56 w-full rounded-md border bg-background p-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="value" fill="#16a34a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
