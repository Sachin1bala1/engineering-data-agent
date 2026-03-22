import React, { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ColumnMetadata, WorkbenchRow } from "@/stores/dataWorkbenchStore";

type AggType = "count" | "sum" | "mean" | "min" | "max";

type PivotPreset = {
  name: string;
  rowColumn: string;
  columnColumn: string;
  valueColumn: string;
  agg: AggType;
};

const inferSuggestedChartType = (rows: WorkbenchRow[], xColumn: string, yColumn?: string): "scatter" | "bar" => {
  if (!yColumn) return "bar";
  const sample = rows.slice(0, 200);
  const numericX = sample.filter((row) => Number.isFinite(Number(row[xColumn]))).length;
  const numericY = sample.filter((row) => Number.isFinite(Number(row[yColumn]))).length;
  const xIsNumeric = sample.length > 0 && numericX / sample.length >= 0.8;
  const yIsNumeric = sample.length > 0 && numericY / sample.length >= 0.8;
  return xIsNumeric && yIsNumeric ? "scatter" : "bar";
};

interface PivotPanelProps {
  rows: WorkbenchRow[];
  columns: ColumnMetadata[];
  scopeKey: string;
  onExportToTab?: (payload: { label: string; rows: WorkbenchRow[]; columns: string[] }) => void;
  onOpenGraphBuilder?: (payload: { label: string; rows: WorkbenchRow[]; columns: string[]; xColumn: string; yColumn?: string }) => void;
  onOpenChartTab?: (payload: { label: string; rows: WorkbenchRow[]; columns: string[]; xColumn: string; yColumn?: string; chartType: "scatter" | "bar" }) => void;
}

const PRESET_STORAGE_KEY = "data_workbench_pivot_presets_v1";

const aggregate = (values: number[], type: AggType): number => {
  if (type === "count") return values.length;
  if (!values.length) return 0;
  if (type === "sum") return values.reduce((sum, value) => sum + value, 0);
  if (type === "mean") return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (type === "min") return Math.min(...values);
  return Math.max(...values);
};

const getPresetStorageKey = (scopeKey: string) => `${PRESET_STORAGE_KEY}:${scopeKey || "default"}`;

const loadPresets = (scopeKey: string): PivotPreset[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getPresetStorageKey(scopeKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const savePresets = (scopeKey: string, presets: PivotPreset[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getPresetStorageKey(scopeKey), JSON.stringify(presets));
};

export const PivotPanel: React.FC<PivotPanelProps> = ({ rows, columns, scopeKey, onExportToTab, onOpenGraphBuilder, onOpenChartTab }) => {
  const categoricalColumns = columns.filter((column) => column.modelingType !== "continuous");
  const numericColumns = columns.filter((column) => column.modelingType === "continuous");
  const [rowColumn, setRowColumn] = useState<string>(categoricalColumns[0]?.key || columns[0]?.key || "");
  const [columnColumn, setColumnColumn] = useState<string>(categoricalColumns[1]?.key || categoricalColumns[0]?.key || columns[1]?.key || "");
  const [valueColumn, setValueColumn] = useState<string>(numericColumns[0]?.key || columns[0]?.key || "");
  const [agg, setAgg] = useState<AggType>("mean");
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<PivotPreset[]>([]);

  useEffect(() => {
    setPresets(loadPresets(scopeKey));
  }, [scopeKey]);

  const matrix = useMemo(() => {
    const rowKeys = Array.from(new Set(rows.map((row) => String(row[rowColumn] ?? "(blank)")))).sort((a, b) => a.localeCompare(b));
    const columnKeys = Array.from(new Set(rows.map((row) => String(row[columnColumn] ?? "(blank)")))).sort((a, b) => a.localeCompare(b));
    const data = new Map<string, number[]>();

    for (const row of rows) {
      const rKey = String(row[rowColumn] ?? "(blank)");
      const cKey = String(row[columnColumn] ?? "(blank)");
      const numericValue = Number(row[valueColumn]);
      const key = `${rKey}__${cKey}`;
      if (!data.has(key)) data.set(key, []);
      if (agg === "count") {
        data.get(key)!.push(1);
      } else if (Number.isFinite(numericValue)) {
        data.get(key)!.push(numericValue);
      }
    }

    const values = rowKeys.map((rKey) => ({
      rowKey: rKey,
      cells: columnKeys.map((cKey) => aggregate(data.get(`${rKey}__${cKey}`) || [], agg)),
    }));

    const exportRows: WorkbenchRow[] = values.map((row, index) => {
      const pivotRow: WorkbenchRow = { __row_index__: index, [rowColumn]: row.rowKey };
      columnKeys.forEach((key, keyIndex) => {
        pivotRow[key] = row.cells[keyIndex];
      });
      return pivotRow;
    });

    return { rowKeys, columnKeys, values, exportRows };
  }, [rows, rowColumn, columnColumn, valueColumn, agg]);

  const persistPresets = (next: PivotPreset[]) => {
    setPresets(next);
    savePresets(scopeKey, next);
  };
  const suggestedChartType = inferSuggestedChartType(matrix.exportRows, rowColumn, matrix.columnKeys[0]);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold">Pivot Workspace</div>
        <div className="text-xs text-muted-foreground">Group rows, columns, and aggregate a value column on the current analysis subset.</div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-[11px]">Rows</Label>
          <Select value={rowColumn || "__none__"} onValueChange={(value) => value !== "__none__" && setRowColumn(value)}>
            <SelectTrigger><SelectValue placeholder="Rows" /></SelectTrigger>
            <SelectContent>{columns.map((column) => <SelectItem key={column.key} value={column.key}>{column.displayName}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Columns</Label>
          <Select value={columnColumn || "__none__"} onValueChange={(value) => value !== "__none__" && setColumnColumn(value)}>
            <SelectTrigger><SelectValue placeholder="Columns" /></SelectTrigger>
            <SelectContent>{columns.map((column) => <SelectItem key={column.key} value={column.key}>{column.displayName}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Values</Label>
          <Select value={valueColumn || "__none__"} onValueChange={(value) => value !== "__none__" && setValueColumn(value)}>
            <SelectTrigger><SelectValue placeholder="Values" /></SelectTrigger>
            <SelectContent>{columns.map((column) => <SelectItem key={column.key} value={column.key}>{column.displayName}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Aggregation</Label>
          <Select value={agg} onValueChange={(value) => setAgg(value as AggType)}>
            <SelectTrigger><SelectValue placeholder="Aggregation" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="count">Count</SelectItem>
              <SelectItem value="sum">Sum</SelectItem>
              <SelectItem value="mean">Mean</SelectItem>
              <SelectItem value="min">Min</SelectItem>
              <SelectItem value="max">Max</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <Input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Preset name" />
        <Button
          variant="outline"
          onClick={() => {
            const name = presetName.trim();
            if (!name) return;
            const nextPreset: PivotPreset = { name, rowColumn, columnColumn, valueColumn, agg };
            const next = [...presets.filter((preset) => preset.name !== name), nextPreset].sort((a, b) => a.name.localeCompare(b.name));
            persistPresets(next);
          }}
        >
          Save Preset
        </Button>
        <Select onValueChange={(value) => {
          const preset = presets.find((item) => item.name === value);
          if (!preset) return;
          setPresetName(preset.name);
          setRowColumn(preset.rowColumn);
          setColumnColumn(preset.columnColumn);
          setValueColumn(preset.valueColumn);
          setAgg(preset.agg);
        }}>
          <SelectTrigger><SelectValue placeholder="Load preset" /></SelectTrigger>
          <SelectContent>
            {presets.map((preset) => <SelectItem key={preset.name} value={preset.name}>{preset.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="text-[11px] text-muted-foreground">
        Presets are scoped to this dataset/session.
      </div>

      <div className="rounded-md border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{columns.find((column) => column.key === rowColumn)?.displayName || rowColumn}</TableHead>
              {matrix.columnKeys.map((key) => <TableHead key={key}>{key}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {matrix.values.map((row) => (
              <TableRow key={row.rowKey}>
                <TableCell className="font-medium">{row.rowKey}</TableCell>
                {row.cells.map((value, index) => <TableCell key={`${row.rowKey}-${index}`}>{Number.isFinite(value) ? value.toFixed(4) : String(value)}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (!presetName.trim()) return;
            const next = presets.filter((preset) => preset.name !== presetName.trim());
            persistPresets(next);
          }}
        >
          Delete Preset
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            onOpenChartTab?.({
              label: `${columns.find((column) => column.key === rowColumn)?.displayName || rowColumn} Pivot Chart`,
              rows: matrix.exportRows,
              columns: [rowColumn, ...matrix.columnKeys],
              xColumn: rowColumn,
              yColumn: matrix.columnKeys[0],
              chartType: suggestedChartType,
            })
          }
        >
          Open as Chart Tab ({suggestedChartType === "scatter" ? "Scatter" : "Bar"})
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            onOpenGraphBuilder?.({
              label: `${columns.find((column) => column.key === rowColumn)?.displayName || rowColumn} Pivot Graph`,
              rows: matrix.exportRows,
              columns: [rowColumn, ...matrix.columnKeys],
              xColumn: rowColumn,
              yColumn: matrix.columnKeys[0],
            })
          }
        >
          Open in Graph Builder
        </Button>
        <Button
          size="sm"
          onClick={() => onExportToTab?.({
            label: `${columns.find((column) => column.key === rowColumn)?.displayName || rowColumn} Pivot`,
            rows: matrix.exportRows,
            columns: [rowColumn, ...matrix.columnKeys],
          })}
        >
          Export to Tab
        </Button>
      </div>
    </div>
  );
};
