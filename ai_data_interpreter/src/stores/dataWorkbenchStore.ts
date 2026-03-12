import { create } from "zustand";

export type ColumnSemanticType = "continuous" | "nominal" | "ordinal";
export type WorkbenchChartType = "scatter" | "bar";

export interface WorkbenchColumnDefinition {
  name: string;
  semanticType: ColumnSemanticType;
}

export interface WorkbenchRow {
  __row_index__: number;
  [key: string]: any;
}

interface DataWorkbenchState {
  masterDataset: WorkbenchRow[];
  columnDefinitions: Record<string, WorkbenchColumnDefinition>;
  selectedRowIds: number[];
  xColumn: string;
  yColumn: string;
  chartType: WorkbenchChartType;
  setDataset: (rows: WorkbenchRow[], columns: string[]) => void;
  updateCell: (rowId: number, column: string, value: any) => void;
  setSelectedRowIds: (ids: number[]) => void;
  setColumnType: (column: string, semanticType: ColumnSemanticType) => void;
  setXColumn: (column: string) => void;
  setYColumn: (column: string) => void;
  setChartType: (chartType: WorkbenchChartType) => void;
}

const isMostlyNumeric = (values: any[]): boolean => {
  if (!values.length) return false;
  let numeric = 0;
  for (const value of values) {
    if (value === null || value === undefined || String(value).trim() === "") continue;
    const num = Number(value);
    if (!Number.isNaN(num) && Number.isFinite(num)) numeric += 1;
  }
  return numeric / Math.max(values.length, 1) >= 0.7;
};

const inferColumnType = (rows: WorkbenchRow[], column: string): ColumnSemanticType => {
  const sample = rows.slice(0, 200).map((r) => r[column]);
  return isMostlyNumeric(sample) ? "continuous" : "nominal";
};

export const useDataWorkbenchStore = create<DataWorkbenchState>((set, get) => ({
  masterDataset: [],
  columnDefinitions: {},
  selectedRowIds: [],
  xColumn: "",
  yColumn: "",
  chartType: "scatter",
  setDataset: (rows, columns) => {
    const defs: Record<string, WorkbenchColumnDefinition> = {};
    for (const col of columns) {
      defs[col] = { name: col, semanticType: inferColumnType(rows, col) };
    }
    const continuous = columns.filter((c) => defs[c]?.semanticType === "continuous");
    const nominal = columns.filter((c) => defs[c]?.semanticType !== "continuous");
    const nextX = nominal[0] || columns[0] || "";
    const nextY = continuous[0] || columns[1] || columns[0] || "";
    set({
      masterDataset: rows,
      columnDefinitions: defs,
      selectedRowIds: [],
      xColumn: nextX,
      yColumn: nextY,
      chartType: defs[nextX]?.semanticType === "continuous" && defs[nextY]?.semanticType === "continuous" ? "scatter" : "bar",
    });
  },
  updateCell: (rowId, column, value) => {
    const current = get().masterDataset;
    const next = current.map((row) => {
      if (Number(row.__row_index__) !== Number(rowId)) return row;
      return { ...row, [column]: value };
    });
    set({ masterDataset: next });
  },
  setSelectedRowIds: (ids) => set({ selectedRowIds: Array.from(new Set(ids.map((i) => Number(i)))) }),
  setColumnType: (column, semanticType) =>
    set((state) => ({
      columnDefinitions: {
        ...state.columnDefinitions,
        [column]: { name: column, semanticType },
      },
    })),
  setXColumn: (column) => set({ xColumn: column }),
  setYColumn: (column) => set({ yColumn: column }),
  setChartType: (chartType) => set({ chartType }),
}));

