import { create } from "zustand";

export type ColumnModelingType = "continuous" | "nominal" | "ordinal" | "datetime" | "text";
export type ColumnSemanticType = ColumnModelingType;
export type WorkbenchChartType = "scatter" | "bar";

export interface WorkbenchColumnDefinition {
  name: string;
  semanticType: ColumnSemanticType;
}

export interface WorkbenchRow {
  __row_index__: number;
  [key: string]: any;
}

export interface RowState {
  selected: boolean;
  excluded: boolean;
  hidden: boolean;
  labeled: boolean;
}

export interface ColumnStats {
  count: number;
  missingCount: number;
  missingPct: number;
  uniqueCount: number;
  mean?: number;
  median?: number;
  stdDev?: number;
  min?: number;
  max?: number;
  topCategories?: Array<{ value: string; count: number }>;
}

export interface ColumnMetadata {
  key: string;
  name: string;
  displayName: string;
  modelingType: ColumnModelingType;
  units?: string;
  format?: string;
  formula?: string;
  group?: string;
  description?: string;
  stats?: ColumnStats;
  derived?: boolean;
}

export type DerivedColumnDefinition =
  | {
      kind: "formula";
      columnKey: string;
      formula: string;
      dependencies: string[];
      order: number;
    }
  | {
      kind: "recode";
      columnKey: string;
      sourceColumn: string;
      mapping: Record<string, string>;
      keepUnmapped: boolean;
      dependencies: string[];
      order: number;
    };

export type ColumnFilterState =
  | { type: "range"; min?: number; max?: number }
  | { type: "category"; values: string[] }
  | { type: "text"; operator: "contains" | "equals" | "startsWith"; value: string }
  | { type: "datetime"; from?: string; to?: string };

export interface SortRule {
  columnKey: string;
  direction: "asc" | "desc";
  priority: number;
}

export interface TableLayoutState {
  visibleColumns: string[];
  pinnedColumns: string[];
  columnWidths: Record<string, number>;
  columnOrder: string[];
}

export interface TableInspectorState {
  activeColumnKey?: string;
  activeRowId?: number;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  bottomPanelOpen: boolean;
  bottomPanelTab: "summary" | "distribution" | "query" | "pivot";
}

export interface TableActiveCell {
  rowId?: number;
  columnKey?: string;
}

interface DataWorkbenchState {
  sourceDataset: WorkbenchRow[];
  masterDataset: WorkbenchRow[];
  columnDefinitions: Record<string, WorkbenchColumnDefinition>;
  columnMetadata: Record<string, ColumnMetadata>;
  derivedColumns: Record<string, DerivedColumnDefinition>;
  rowStates: Record<number, RowState>;
  selectedRowIds: number[];
  columnFilters: Record<string, ColumnFilterState>;
  sortRules: SortRule[];
  tableLayoutState: TableLayoutState;
  inspectorState: TableInspectorState;
  searchQuery: string;
  activeCell: TableActiveCell;
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
  setColumnMetadata: (columnKey: string, patch: Partial<ColumnMetadata>) => void;
  setColumnDisplayName: (columnKey: string, displayName: string) => void;
  setColumnGroup: (columnKey: string, groupName?: string) => void;
  setColumnUnits: (columnKey: string, units?: string) => void;
  setColumnFormat: (columnKey: string, format?: string) => void;
  setRowState: (rowId: number, patch: Partial<RowState>) => void;
  setRowsSelected: (rowIds: number[], selected: boolean) => void;
  setRowsExcluded: (rowIds: number[], excluded: boolean) => void;
  setRowsHidden: (rowIds: number[], hidden: boolean) => void;
  setRowsLabeled: (rowIds: number[], labeled: boolean) => void;
  clearAllRowStateFlags: () => void;
  setColumnFilter: (columnKey: string, filter: ColumnFilterState) => void;
  clearColumnFilter: (columnKey: string) => void;
  clearAllFilters: () => void;
  setSortRules: (rules: SortRule[]) => void;
  clearSortRules: () => void;
  setInspectorState: (patch: Partial<TableInspectorState>) => void;
  setTableLayoutState: (patch: Partial<TableLayoutState>) => void;
  setSearchQuery: (query: string) => void;
  setActiveCell: (patch: TableActiveCell) => void;
  insertRow: (payload: { anchorRowId?: number; position: "above" | "below"; template?: Partial<WorkbenchRow> }) => { ok: boolean; rowId?: number };
  duplicateRows: (rowIds: number[]) => { ok: boolean; rowIds: number[] };
  deleteRows: (rowIds: number[]) => { ok: boolean; deletedCount: number };
  createEmptyColumn: (payload: { newColumnName: string; initialValue?: any }) => { ok: boolean; columnKey?: string; error?: string };
  createFormulaColumn: (payload: { formula: string; columnKey?: string; newColumnName?: string }) => { ok: boolean; columnKey?: string; error?: string };
  recodeColumn: (payload: { sourceColumn: string; mapping: Record<string, string>; newColumnName?: string; keepUnmapped?: boolean }) => { ok: boolean; columnKey?: string; error?: string };
  deleteDerivedColumn: (columnKey: string) => void;
  computeColumnStats: (columnKey: string) => ColumnStats;
  getDisplayedRows: () => WorkbenchRow[];
  getAnalysisRows: () => WorkbenchRow[];
}

export const DEFAULT_ROW_STATE: RowState = {
  selected: false,
  excluded: false,
  hidden: false,
  labeled: false,
};

export const DEFAULT_INSPECTOR_STATE: TableInspectorState = {
  leftPanelOpen: true,
  rightPanelOpen: true,
  bottomPanelOpen: false,
  bottomPanelTab: "summary",
};

export const sanitizeColumnKey = (value: string): string => {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/^([^A-Za-z_])/, "_$1");
};

const isMissingValue = (value: any): boolean => {
  if (value === null || value === undefined) return true;
  const text = String(value).trim().toLowerCase();
  return text === "" || text === "null" || text === "nan" || text === "none" || text === "n/a" || text === "na";
};

const toNumberOrNull = (value: any): number | null => {
  if (isMissingValue(value)) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const toComparableDate = (value: any): number | null => {
  if (isMissingValue(value)) return null;
  const date = new Date(value);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const isMostlyNumeric = (values: any[]): boolean => {
  const meaningful = values.filter((value) => !isMissingValue(value));
  if (!meaningful.length) return false;
  let numeric = 0;
  for (const value of meaningful) {
    const num = Number(value);
    if (!Number.isNaN(num) && Number.isFinite(num)) numeric += 1;
  }
  return numeric / meaningful.length >= 0.8;
};

const isMostlyDatetime = (values: any[], columnName: string): boolean => {
  const meaningful = values.filter((value) => !isMissingValue(value));
  if (!meaningful.length) return false;
  const columnHint = /date|time|timestamp|day|month|year|hour|minute|second/i.test(columnName);
  let datetimeLike = 0;
  for (const value of meaningful) {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) datetimeLike += 1;
  }
  return columnHint ? datetimeLike / meaningful.length >= 0.4 : datetimeLike / meaningful.length >= 0.8;
};

const inferColumnType = (rows: WorkbenchRow[], column: string): ColumnSemanticType => {
  const sample = rows.slice(0, 500).map((row) => row[column]);
  if (isMostlyDatetime(sample, column)) return "datetime";
  if (isMostlyNumeric(sample)) return "continuous";

  const meaningful = sample.filter((value) => !isMissingValue(value));
  if (!meaningful.length) return "nominal";

  const unique = new Set(meaningful.map((value) => String(value))).size;
  const uniqueRatio = unique / Math.max(meaningful.length, 1);
  const averageLength = meaningful.reduce((sum, value) => sum + String(value).length, 0) / meaningful.length;
  if (averageLength > 32 && uniqueRatio > 0.6) return "text";
  return uniqueRatio <= 0.25 ? "nominal" : "text";
};

const median = (numbers: number[]): number | undefined => {
  if (!numbers.length) return undefined;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const stdDev = (numbers: number[]): number | undefined => {
  if (numbers.length < 2) return undefined;
  const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  const variance = numbers.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (numbers.length - 1);
  return Math.sqrt(variance);
};

export const computeColumnStatsForRows = (
  rows: WorkbenchRow[],
  columnKey: string,
  modelingType: ColumnModelingType
): ColumnStats => {
  const values = rows.map((row) => row[columnKey]);
  const meaningful = values.filter((value) => !isMissingValue(value));
  const missingCount = values.length - meaningful.length;
  const uniqueCount = new Set(meaningful.map((value) => String(value))).size;

  if (modelingType === "continuous") {
    const numericValues = meaningful
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    const mean = numericValues.length ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length : undefined;
    return {
      count: meaningful.length,
      missingCount,
      missingPct: values.length ? missingCount / values.length : 0,
      uniqueCount,
      mean,
      median: median(numericValues),
      stdDev: stdDev(numericValues),
      min: numericValues.length ? Math.min(...numericValues) : undefined,
      max: numericValues.length ? Math.max(...numericValues) : undefined,
    };
  }

  const counts = new Map<string, number>();
  for (const value of meaningful) {
    const key = String(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return {
    count: meaningful.length,
    missingCount,
    missingPct: values.length ? missingCount / values.length : 0,
    uniqueCount,
    topCategories: Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([value, count]) => ({ value, count })),
  };
};

export const buildFormulaEvaluator = (formula: string) => {
  const normalized = String(formula || "").trim().replace(/^=/, "");
  if (!normalized) return null;
  const withBracketAccess = normalized.replace(/\[([^\]]+)\]/g, (_, name) => `__get(${JSON.stringify(String(name))})`);
  try {
    return new Function(
      "__row",
      "__get",
      `with(__row){ return (${withBracketAccess}); }`
    ) as (row: WorkbenchRow, getter: (column: string) => any) => any;
  } catch {
    return null;
  }
};

export const extractFormulaDependencies = (formula: string, knownColumns: string[]): string[] => {
  const normalized = String(formula || "").trim().replace(/^=/, "");
  const dependencies = new Set<string>();
  const bracketMatches = normalized.match(/\[([^\]]+)\]/g) || [];
  for (const match of bracketMatches) {
    const column = match.slice(1, -1).trim();
    if (column) dependencies.add(column);
  }

  const bareMatches = normalized.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
  const reserved = new Set(["Math", "true", "false", "null", "undefined", "NaN", "Infinity"]);
  const knownSet = new Set(knownColumns);
  for (const token of bareMatches) {
    if (reserved.has(token)) continue;
    if (knownSet.has(token)) dependencies.add(token);
  }

  return Array.from(dependencies);
};

export const sortDerivedDefinitions = (definitions: Record<string, DerivedColumnDefinition>): DerivedColumnDefinition[] => {
  const entries = Object.values(definitions);
  const byKey = new Map(entries.map((entry) => [entry.columnKey, entry]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const ordered: DerivedColumnDefinition[] = [];

  const visit = (key: string) => {
    if (visited.has(key)) return;
    if (visiting.has(key)) return;
    const current = byKey.get(key);
    if (!current) return;
    visiting.add(key);
    const deps = [...(current.dependencies || [])].sort((a, b) => {
      const left = byKey.get(a)?.order ?? -1;
      const right = byKey.get(b)?.order ?? -1;
      return left - right;
    });
    for (const dependency of deps) {
      if (byKey.has(dependency)) visit(dependency);
    }
    visiting.delete(key);
    visited.add(key);
    ordered.push(current);
  };

  entries
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .forEach((entry) => visit(entry.columnKey));

  return ordered;
};

export const wouldIntroduceDerivedCycle = (
  definitions: Record<string, DerivedColumnDefinition>,
  targetColumn: string,
  dependencies: string[]
): boolean => {
  const nextDependencyMap: Record<string, string[]> = {};
  for (const [key, definition] of Object.entries(definitions)) {
    nextDependencyMap[key] = [...(definition.dependencies || [])];
  }
  nextDependencyMap[targetColumn] = [...dependencies];

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (column: string): boolean => {
    if (visiting.has(column)) return true;
    if (visited.has(column)) return false;
    visiting.add(column);
    for (const dependency of nextDependencyMap[column] || []) {
      if (!(dependency in nextDependencyMap)) continue;
      if (dfs(dependency)) return true;
    }
    visiting.delete(column);
    visited.add(column);
    return false;
  };

  return dfs(targetColumn);
};

export const applyDerivedColumns = (
  rows: WorkbenchRow[],
  derivedColumns: Record<string, DerivedColumnDefinition>
): WorkbenchRow[] => {
  const nextRows = rows.map((row) => ({ ...row }));
  for (const definition of sortDerivedDefinitions(derivedColumns)) {
    if (definition.kind === "formula") {
      const evaluator = buildFormulaEvaluator(definition.formula);
      for (const row of nextRows) {
        if (!evaluator) {
          row[definition.columnKey] = null;
          continue;
        }
        try {
          row[definition.columnKey] = evaluator(row, (column) => row[column]);
        } catch {
          row[definition.columnKey] = null;
        }
      }
      continue;
    }

    for (const row of nextRows) {
      const key = String(row[definition.sourceColumn] ?? "");
      if (Object.prototype.hasOwnProperty.call(definition.mapping, key)) {
        row[definition.columnKey] = definition.mapping[key];
      } else {
        row[definition.columnKey] = definition.keepUnmapped ? row[definition.sourceColumn] : null;
      }
    }
  }
  return nextRows;
};

export const buildColumnMetadata = (
  rows: WorkbenchRow[],
  columns: string[],
  previousMetadata: Record<string, ColumnMetadata> = {}
): Record<string, ColumnMetadata> => {
  const metadata: Record<string, ColumnMetadata> = {};
  for (const column of columns) {
    const existing = previousMetadata[column];
    const modelingType = existing?.modelingType || inferColumnType(rows, column);
    metadata[column] = {
      key: column,
      name: column,
      displayName: existing?.displayName || column,
      modelingType,
      units: existing?.units,
      format: existing?.format,
      formula: existing?.formula,
      group: existing?.group,
      description: existing?.description,
      derived: existing?.derived,
      stats: computeColumnStatsForRows(rows, column, modelingType),
    };
  }
  return metadata;
};

const buildColumnDefinitions = (metadata: Record<string, ColumnMetadata>): Record<string, WorkbenchColumnDefinition> => {
  const definitions: Record<string, WorkbenchColumnDefinition> = {};
  for (const [key, value] of Object.entries(metadata)) {
    definitions[key] = { name: key, semanticType: value.modelingType };
  }
  return definitions;
};

const makeBlankRowFromMetadata = (columnMetadata: Record<string, ColumnMetadata>, template?: Partial<WorkbenchRow>): WorkbenchRow => {
  const row: WorkbenchRow = { __row_index__: -1 };
  for (const columnKey of Object.keys(columnMetadata)) {
    if (columnKey === "__row_index__") continue;
    row[columnKey] = template && columnKey in template ? template[columnKey] : null;
  }
  return row;
};

export const ensureRowIndices = (rows: WorkbenchRow[]): WorkbenchRow[] => {
  return rows.map((row, index) => {
    const rowIndex = Number((row as any).__row_index__);
    return Number.isFinite(rowIndex) ? row : { ...row, __row_index__: index };
  });
};

export const reindexRows = (rows: WorkbenchRow[]): WorkbenchRow[] =>
  rows.map((row, index) => ({ ...row, __row_index__: index }));

export const remapRowStatesByOrder = (
  previousRows: WorkbenchRow[],
  nextRows: WorkbenchRow[],
  previousRowStates: Record<number, RowState>
): Record<number, RowState> => {
  const nextRowStates: Record<number, RowState> = {};
  for (const row of nextRows) {
    const source = previousRows.find((previousRow) => {
      const prevComparable = { ...previousRow };
      const nextComparable = { ...row };
      delete (prevComparable as any).__row_index__;
      delete (nextComparable as any).__row_index__;
      return JSON.stringify(prevComparable) === JSON.stringify(nextComparable);
    });
    if (source) {
      nextRowStates[Number(row.__row_index__)] = { ...(previousRowStates[Number(source.__row_index__)] || DEFAULT_ROW_STATE) };
    } else {
      nextRowStates[Number(row.__row_index__)] = { ...DEFAULT_ROW_STATE };
    }
  }
  return nextRowStates;
};

export const syncSelectedRowIds = (rowStates: Record<number, RowState>): number[] => {
  return Object.entries(rowStates)
    .filter(([, state]) => state?.selected)
    .map(([key]) => Number(key))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
};

const rowMatchesFilter = (row: WorkbenchRow, columnKey: string, filter: ColumnFilterState): boolean => {
  const value = row[columnKey];
  if (!filter) return true;

  if (filter.type === "range") {
    const numericValue = toNumberOrNull(value);
    if (numericValue === null) return false;
    if (filter.min !== undefined && numericValue < filter.min) return false;
    if (filter.max !== undefined && numericValue > filter.max) return false;
    return true;
  }

  if (filter.type === "category") {
    if (!filter.values.length) return true;
    return filter.values.includes(String(value));
  }

  if (filter.type === "text") {
    if (!filter.value) return true;
    const normalizedValue = String(value ?? "").toLowerCase();
    const target = filter.value.toLowerCase();
    if (filter.operator === "equals") return normalizedValue === target;
    if (filter.operator === "startsWith") return normalizedValue.startsWith(target);
    return normalizedValue.includes(target);
  }

  const dateValue = toComparableDate(value);
  if (dateValue === null) return false;
  const from = filter.from ? toComparableDate(filter.from) : null;
  const to = filter.to ? toComparableDate(filter.to) : null;
  if (from !== null && dateValue < from) return false;
  if (to !== null && dateValue > to) return false;
  return true;
};

export const applyFiltersAndSearch = (
  rows: WorkbenchRow[],
  rowStates: Record<number, RowState>,
  filters: Record<string, ColumnFilterState>,
  searchQuery: string,
  visibleColumns?: string[]
): WorkbenchRow[] => {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  return rows.filter((row) => {
    const rowId = Number(row.__row_index__);
    const rowState = rowStates[rowId] || DEFAULT_ROW_STATE;
    if (rowState.hidden) return false;

    for (const [columnKey, filter] of Object.entries(filters)) {
      if (!rowMatchesFilter(row, columnKey, filter)) return false;
    }

    if (!normalizedQuery) return true;
    const keys = visibleColumns?.length ? visibleColumns : Object.keys(row).filter((key) => key !== "__row_index__");
    return keys.some((key) => String(row[key] ?? "").toLowerCase().includes(normalizedQuery));
  });
};

export const refreshMetadataStats = (state: Pick<DataWorkbenchState, "columnMetadata">, analysisRows: WorkbenchRow[]) => {
  const nextMetadata: Record<string, ColumnMetadata> = {};
  for (const [key, value] of Object.entries(state.columnMetadata)) {
    nextMetadata[key] = {
      ...value,
      stats: computeColumnStatsForRows(analysisRows, key, value.modelingType),
    };
  }
  return nextMetadata;
};

export const getModelingTypeLabel = (type: ColumnModelingType): string => {
  if (type === "continuous") return "Continuous";
  if (type === "ordinal") return "Ordinal";
  if (type === "datetime") return "Datetime";
  if (type === "text") return "Text";
  return "Nominal";
};

export const useDataWorkbenchStore = create<DataWorkbenchState>((set, get) => ({
  masterDataset: [],
  sourceDataset: [],
  columnDefinitions: {},
  columnMetadata: {},
  derivedColumns: {},
  rowStates: {},
  selectedRowIds: [],
  columnFilters: {},
  sortRules: [],
  tableLayoutState: {
    visibleColumns: [],
    pinnedColumns: [],
    columnWidths: {},
    columnOrder: [],
  },
  inspectorState: DEFAULT_INSPECTOR_STATE,
  searchQuery: "",
  activeCell: {},
  xColumn: "",
  yColumn: "",
  chartType: "scatter",
  setDataset: (rows, columns) => {
    const normalizedRows = ensureRowIndices(rows || []);
    const derivedColumns = get().derivedColumns;
    const withDerived = applyDerivedColumns(normalizedRows, derivedColumns);
    const nextColumns = [...columns, ...Object.keys(derivedColumns).filter((column) => !columns.includes(column))];
    const previousMetadata = get().columnMetadata;
    const metadata = buildColumnMetadata(withDerived, nextColumns, previousMetadata);
    const definitions = buildColumnDefinitions(metadata);
    const continuous = nextColumns.filter((column) => metadata[column]?.modelingType === "continuous");
    const nominalLike = nextColumns.filter((column) => metadata[column]?.modelingType !== "continuous");
    const nextX = nominalLike[0] || nextColumns[0] || "";
    const nextY = continuous[0] || nextColumns.find((column) => column !== nextX) || nextColumns[0] || "";
    const rowStates: Record<number, RowState> = {};
    for (const row of withDerived) {
      const rowId = Number(row.__row_index__);
      rowStates[rowId] = { ...(get().rowStates[rowId] || DEFAULT_ROW_STATE) };
    }

    set({
      sourceDataset: normalizedRows,
      masterDataset: withDerived,
      columnDefinitions: definitions,
      columnMetadata: metadata,
      derivedColumns,
      rowStates,
      selectedRowIds: syncSelectedRowIds(rowStates),
      tableLayoutState: {
        visibleColumns: [...nextColumns],
        pinnedColumns: get().tableLayoutState.pinnedColumns.filter((column) => nextColumns.includes(column)),
        columnWidths: Object.fromEntries(
          Object.entries(get().tableLayoutState.columnWidths).filter(([column]) => nextColumns.includes(column))
        ),
        columnOrder: [...nextColumns],
      },
      xColumn: nextX,
      yColumn: nextY,
      chartType: metadata[nextX]?.modelingType === "continuous" && metadata[nextY]?.modelingType === "continuous" ? "scatter" : "bar",
    });
  },
  updateCell: (rowId, column, value) => {
    const state = get();
    const nextRows = state.sourceDataset.map((row) => {
      if (Number(row.__row_index__) !== Number(rowId)) return row;
      return { ...row, [column]: value };
    });
    const nextWithDerived = applyDerivedColumns(nextRows, state.derivedColumns);
    const displayRows = applyFiltersAndSearch(
      nextWithDerived,
      state.rowStates,
      state.columnFilters,
      state.searchQuery,
      state.tableLayoutState.visibleColumns
    );
    const analysisRows = displayRows.filter((row) => !(state.rowStates[Number(row.__row_index__)] || DEFAULT_ROW_STATE).excluded);
    const nextMetadata = refreshMetadataStats(state, analysisRows);
    set({ sourceDataset: nextRows, masterDataset: nextWithDerived, columnMetadata: nextMetadata, columnDefinitions: buildColumnDefinitions(nextMetadata) });
  },
  setSelectedRowIds: (ids) => {
    const normalized = Array.from(new Set((ids || []).map((id) => Number(id)).filter((id) => Number.isFinite(id))));
    set((state) => {
      const rowStates: Record<number, RowState> = { ...state.rowStates };
      for (const row of state.masterDataset) {
        const rowId = Number(row.__row_index__);
        const current = rowStates[rowId] || DEFAULT_ROW_STATE;
        rowStates[rowId] = { ...current, selected: normalized.includes(rowId) };
      }
      return { rowStates, selectedRowIds: normalized, inspectorState: { ...state.inspectorState, activeRowId: normalized[0] } };
    });
  },
  setColumnType: (column, semanticType) => {
    set((state) => {
      const nextMetadata = {
        ...state.columnMetadata,
        [column]: {
          ...(state.columnMetadata[column] || {
            key: column,
            name: column,
            displayName: column,
            modelingType: semanticType,
          }),
          modelingType: semanticType,
          stats: computeColumnStatsForRows(state.getAnalysisRows(), column, semanticType),
        },
      };
      return {
        columnMetadata: nextMetadata,
        columnDefinitions: buildColumnDefinitions(nextMetadata),
      };
    });
  },
  setXColumn: (column) => set({ xColumn: column }),
  setYColumn: (column) => set({ yColumn: column }),
  setChartType: (chartType) => set({ chartType }),
  setColumnMetadata: (columnKey, patch) => {
    set((state) => {
      const nextMetadata = {
        ...state.columnMetadata,
        [columnKey]: {
          ...(state.columnMetadata[columnKey] || {
            key: columnKey,
            name: columnKey,
            displayName: columnKey,
            modelingType: "nominal",
          }),
          ...patch,
        },
      };
      return {
        columnMetadata: nextMetadata,
        columnDefinitions: buildColumnDefinitions(nextMetadata),
      };
    });
  },
  setColumnDisplayName: (columnKey, displayName) => get().setColumnMetadata(columnKey, { displayName: displayName || columnKey }),
  setColumnGroup: (columnKey, groupName) => get().setColumnMetadata(columnKey, { group: groupName }),
  setColumnUnits: (columnKey, units) => get().setColumnMetadata(columnKey, { units }),
  setColumnFormat: (columnKey, format) => get().setColumnMetadata(columnKey, { format }),
  setRowState: (rowId, patch) => {
    set((state) => {
      const nextState = { ...(state.rowStates[rowId] || DEFAULT_ROW_STATE), ...patch };
      const nextRowStates = { ...state.rowStates, [rowId]: nextState };
      const displayRows = applyFiltersAndSearch(
        state.masterDataset,
        nextRowStates,
        state.columnFilters,
        state.searchQuery,
        state.tableLayoutState.visibleColumns
      );
      const analysisRows = displayRows.filter((row) => !(nextRowStates[Number(row.__row_index__)] || DEFAULT_ROW_STATE).excluded);
      return {
        rowStates: nextRowStates,
        selectedRowIds: syncSelectedRowIds(nextRowStates),
        columnMetadata: refreshMetadataStats(state, analysisRows),
      };
    });
  },
  setRowsSelected: (rowIds, selected) => {
    set((state) => {
      const nextRowStates = { ...state.rowStates };
      for (const rowId of rowIds) {
        nextRowStates[Number(rowId)] = { ...(nextRowStates[Number(rowId)] || DEFAULT_ROW_STATE), selected };
      }
      return {
        rowStates: nextRowStates,
        selectedRowIds: syncSelectedRowIds(nextRowStates),
        inspectorState: { ...state.inspectorState, activeRowId: rowIds[0] },
      };
    });
  },
  setRowsExcluded: (rowIds, excluded) => {
    set((state) => {
      const nextRowStates = { ...state.rowStates };
      for (const rowId of rowIds) {
        nextRowStates[Number(rowId)] = { ...(nextRowStates[Number(rowId)] || DEFAULT_ROW_STATE), excluded };
      }
      const displayRows = applyFiltersAndSearch(
        state.masterDataset,
        nextRowStates,
        state.columnFilters,
        state.searchQuery,
        state.tableLayoutState.visibleColumns
      );
      const analysisRows = displayRows.filter((row) => !(nextRowStates[Number(row.__row_index__)] || DEFAULT_ROW_STATE).excluded);
      return {
        rowStates: nextRowStates,
        columnMetadata: refreshMetadataStats(state, analysisRows),
      };
    });
  },
  setRowsHidden: (rowIds, hidden) => {
    set((state) => {
      const nextRowStates = { ...state.rowStates };
      for (const rowId of rowIds) {
        nextRowStates[Number(rowId)] = { ...(nextRowStates[Number(rowId)] || DEFAULT_ROW_STATE), hidden };
      }
      const displayRows = applyFiltersAndSearch(
        state.masterDataset,
        nextRowStates,
        state.columnFilters,
        state.searchQuery,
        state.tableLayoutState.visibleColumns
      );
      const analysisRows = displayRows.filter((row) => !(nextRowStates[Number(row.__row_index__)] || DEFAULT_ROW_STATE).excluded);
      return {
        rowStates: nextRowStates,
        columnMetadata: refreshMetadataStats(state, analysisRows),
      };
    });
  },
  setRowsLabeled: (rowIds, labeled) => {
    set((state) => {
      const nextRowStates = { ...state.rowStates };
      for (const rowId of rowIds) {
        nextRowStates[Number(rowId)] = { ...(nextRowStates[Number(rowId)] || DEFAULT_ROW_STATE), labeled };
      }
      return { rowStates: nextRowStates };
    });
  },
  clearAllRowStateFlags: () => {
    set((state) => {
      const nextRowStates: Record<number, RowState> = {};
      for (const row of state.masterDataset) {
        nextRowStates[Number(row.__row_index__)] = { ...DEFAULT_ROW_STATE };
      }
      return {
        rowStates: nextRowStates,
        selectedRowIds: [],
        columnMetadata: refreshMetadataStats(state, state.masterDataset),
      };
    });
  },
  setColumnFilter: (columnKey, filter) => {
    set((state) => {
      const nextFilters = { ...state.columnFilters, [columnKey]: filter };
      const displayRows = applyFiltersAndSearch(
        state.masterDataset,
        state.rowStates,
        nextFilters,
        state.searchQuery,
        state.tableLayoutState.visibleColumns
      );
      const analysisRows = displayRows.filter((row) => !(state.rowStates[Number(row.__row_index__)] || DEFAULT_ROW_STATE).excluded);
      return {
        columnFilters: nextFilters,
        columnMetadata: refreshMetadataStats(state, analysisRows),
        inspectorState: { ...state.inspectorState, activeColumnKey: columnKey, bottomPanelOpen: true, bottomPanelTab: "distribution" },
      };
    });
  },
  clearColumnFilter: (columnKey) => {
    set((state) => {
      const nextFilters = { ...state.columnFilters };
      delete nextFilters[columnKey];
      const displayRows = applyFiltersAndSearch(
        state.masterDataset,
        state.rowStates,
        nextFilters,
        state.searchQuery,
        state.tableLayoutState.visibleColumns
      );
      const analysisRows = displayRows.filter((row) => !(state.rowStates[Number(row.__row_index__)] || DEFAULT_ROW_STATE).excluded);
      return {
        columnFilters: nextFilters,
        columnMetadata: refreshMetadataStats(state, analysisRows),
      };
    });
  },
  clearAllFilters: () => {
    set((state) => {
      const displayRows = applyFiltersAndSearch(
        state.masterDataset,
        state.rowStates,
        {},
        "",
        state.tableLayoutState.visibleColumns
      );
      const analysisRows = displayRows.filter((row) => !(state.rowStates[Number(row.__row_index__)] || DEFAULT_ROW_STATE).excluded);
      return {
        columnFilters: {},
        searchQuery: "",
        columnMetadata: refreshMetadataStats(state, analysisRows),
      };
    });
  },
  setSortRules: (rules) => set({ sortRules: rules }),
  clearSortRules: () => set({ sortRules: [] }),
  setInspectorState: (patch) => set((state) => ({ inspectorState: { ...state.inspectorState, ...patch } })),
  setTableLayoutState: (patch) => set((state) => ({ tableLayoutState: { ...state.tableLayoutState, ...patch } })),
  setSearchQuery: (query) => {
    set((state) => {
      const displayRows = applyFiltersAndSearch(
        state.masterDataset,
        state.rowStates,
        state.columnFilters,
        query,
        state.tableLayoutState.visibleColumns
      );
      const analysisRows = displayRows.filter((row) => !(state.rowStates[Number(row.__row_index__)] || DEFAULT_ROW_STATE).excluded);
      return {
        searchQuery: query,
        columnMetadata: refreshMetadataStats(state, analysisRows),
      };
    });
  },
  setActiveCell: (patch) => set({ activeCell: patch }),
  insertRow: ({ anchorRowId, position, template }) => {
    const state = get();
    const sourceRows = [...state.sourceDataset];
    const anchorIndex =
      anchorRowId !== undefined ? sourceRows.findIndex((row) => Number(row.__row_index__) === Number(anchorRowId)) : sourceRows.length - 1;
    const insertIndex = anchorIndex < 0 ? sourceRows.length : position === "above" ? anchorIndex : anchorIndex + 1;
    sourceRows.splice(Math.max(0, insertIndex), 0, makeBlankRowFromMetadata(state.columnMetadata, template));
    const nextSourceDataset = reindexRows(sourceRows);
    const nextMasterDataset = applyDerivedColumns(nextSourceDataset, state.derivedColumns);
    const nextRowStates: Record<number, RowState> = {};
    for (let index = 0; index < nextSourceDataset.length; index += 1) {
      if (index < insertIndex) nextRowStates[index] = { ...(state.rowStates[index] || DEFAULT_ROW_STATE) };
      else if (index === insertIndex) nextRowStates[index] = { ...DEFAULT_ROW_STATE };
      else nextRowStates[index] = { ...(state.rowStates[index - 1] || DEFAULT_ROW_STATE) };
    }
    const displayRows = applyFiltersAndSearch(nextMasterDataset, nextRowStates, state.columnFilters, state.searchQuery, state.tableLayoutState.visibleColumns);
    const analysisRows = displayRows.filter((row) => !(nextRowStates[Number(row.__row_index__)] || DEFAULT_ROW_STATE).excluded);
    set({
      sourceDataset: nextSourceDataset,
      masterDataset: nextMasterDataset,
      rowStates: nextRowStates,
      selectedRowIds: [],
      columnMetadata: refreshMetadataStats(state, analysisRows),
      activeCell: { rowId: insertIndex, columnKey: state.activeCell.columnKey },
      inspectorState: { ...state.inspectorState, activeRowId: insertIndex },
    });
    return { ok: true, rowId: insertIndex };
  },
  duplicateRows: (rowIds) => {
    const state = get();
    const normalizedIds = Array.from(new Set((rowIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)))).sort((a, b) => a - b);
    if (!normalizedIds.length) return { ok: true, rowIds: [] };
    const sourceRows = [...state.sourceDataset];
    let inserted = 0;
    for (const rowId of normalizedIds) {
      const sourceIndex = sourceRows.findIndex((row) => Number(row.__row_index__) === rowId);
      if (sourceIndex < 0) continue;
      const clone = { ...sourceRows[sourceIndex] };
      delete (clone as any).__row_index__;
      sourceRows.splice(sourceIndex + 1 + inserted, 0, { __row_index__: -1, ...clone });
      inserted += 1;
    }
    const nextSourceDataset = reindexRows(sourceRows);
    const nextMasterDataset = applyDerivedColumns(nextSourceDataset, state.derivedColumns);
    const nextRowStates: Record<number, RowState> = {};
    const duplicatedIds: number[] = [];
    let sourcePointer = 0;
    for (let index = 0; index < nextSourceDataset.length; index += 1) {
      const nextRowComparable = { ...nextSourceDataset[index] } as any;
      delete nextRowComparable.__row_index__;
      const sourceComparable = sourcePointer < state.sourceDataset.length ? ({ ...state.sourceDataset[sourcePointer] } as any) : null;
      if (sourceComparable) delete sourceComparable.__row_index__;
      if (sourceComparable && JSON.stringify(nextRowComparable) === JSON.stringify(sourceComparable)) {
        nextRowStates[index] = { ...(state.rowStates[sourcePointer] || DEFAULT_ROW_STATE) };
        sourcePointer += 1;
      } else {
        nextRowStates[index] = { ...(state.rowStates[Math.max(0, index - 1)] || DEFAULT_ROW_STATE), selected: false };
        duplicatedIds.push(index);
      }
    }
    const displayRows = applyFiltersAndSearch(nextMasterDataset, nextRowStates, state.columnFilters, state.searchQuery, state.tableLayoutState.visibleColumns);
    const analysisRows = displayRows.filter((row) => !(nextRowStates[Number(row.__row_index__)] || DEFAULT_ROW_STATE).excluded);
    set({
      sourceDataset: nextSourceDataset,
      masterDataset: nextMasterDataset,
      rowStates: nextRowStates,
      selectedRowIds: duplicatedIds,
      columnMetadata: refreshMetadataStats(state, analysisRows),
      inspectorState: { ...state.inspectorState, activeRowId: duplicatedIds[0] },
    });
    return { ok: true, rowIds: duplicatedIds };
  },
  deleteRows: (rowIds) => {
    const state = get();
    const idsToDelete = new Set((rowIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)));
    if (!idsToDelete.size) return { ok: true, deletedCount: 0 };
    const filteredSource = state.sourceDataset.filter((row) => !idsToDelete.has(Number(row.__row_index__)));
    const nextSourceDataset = reindexRows(filteredSource);
    const nextMasterDataset = applyDerivedColumns(nextSourceDataset, state.derivedColumns);
    const nextRowStates: Record<number, RowState> = {};
    let sourcePointer = 0;
    for (let index = 0; index < nextSourceDataset.length; index += 1) {
      while (idsToDelete.has(sourcePointer)) sourcePointer += 1;
      nextRowStates[index] = { ...(state.rowStates[sourcePointer] || DEFAULT_ROW_STATE) };
      sourcePointer += 1;
    }
    const displayRows = applyFiltersAndSearch(nextMasterDataset, nextRowStates, state.columnFilters, state.searchQuery, state.tableLayoutState.visibleColumns);
    const analysisRows = displayRows.filter((row) => !(nextRowStates[Number(row.__row_index__)] || DEFAULT_ROW_STATE).excluded);
    set({
      sourceDataset: nextSourceDataset,
      masterDataset: nextMasterDataset,
      rowStates: nextRowStates,
      selectedRowIds: [],
      columnMetadata: refreshMetadataStats(state, analysisRows),
      inspectorState: { ...state.inspectorState, activeRowId: undefined },
      activeCell: { ...state.activeCell, rowId: undefined },
    });
    return { ok: true, deletedCount: idsToDelete.size };
  },
  createEmptyColumn: ({ newColumnName, initialValue = null }) => {
    const state = get();
    const nextColumnKey = sanitizeColumnKey(newColumnName || "");
    if (!nextColumnKey) return { ok: false, error: "Column name required" };
    if (state.columnMetadata[nextColumnKey]) return { ok: false, error: "Column already exists" };

    const nextSourceDataset = state.sourceDataset.map((row) => ({ ...row, [nextColumnKey]: initialValue }));
    const nextRows = applyDerivedColumns(nextSourceDataset, state.derivedColumns);
    const nextMetadata = buildColumnMetadata(
      nextRows,
      [...Object.keys(state.columnMetadata), nextColumnKey],
      {
        ...state.columnMetadata,
        [nextColumnKey]: {
          key: nextColumnKey,
          name: nextColumnKey,
          displayName: newColumnName.trim() || nextColumnKey,
          modelingType: inferColumnType(nextRows, nextColumnKey),
        },
      }
    );

    set({
      sourceDataset: nextSourceDataset,
      masterDataset: nextRows,
      columnMetadata: nextMetadata,
      columnDefinitions: buildColumnDefinitions(nextMetadata),
      tableLayoutState: {
        ...state.tableLayoutState,
        visibleColumns: Array.from(new Set([...state.tableLayoutState.visibleColumns, nextColumnKey])),
        columnOrder: Array.from(new Set([...state.tableLayoutState.columnOrder, nextColumnKey])),
      },
      inspectorState: {
        ...state.inspectorState,
        activeColumnKey: nextColumnKey,
        rightPanelOpen: true,
      },
    });

    return { ok: true, columnKey: nextColumnKey };
  },
  createFormulaColumn: ({ formula, columnKey, newColumnName }) => {
    const state = get();
    const nextColumnKey = sanitizeColumnKey(columnKey || newColumnName || `derived_${Object.keys(state.derivedColumns).length + 1}`);
    if (!nextColumnKey) return { ok: false, error: "Column name required" };
    const evaluator = buildFormulaEvaluator(formula);
    if (!evaluator) return { ok: false, error: "Invalid formula syntax" };
    const knownColumns = Array.from(new Set([...Object.keys(state.columnMetadata), ...Object.keys(state.derivedColumns)]));
    const dependencies = extractFormulaDependencies(formula, knownColumns).filter((dependency) => dependency !== nextColumnKey);
    if (wouldIntroduceDerivedCycle(state.derivedColumns, nextColumnKey, dependencies)) {
      return { ok: false, error: "Formula introduces a circular dependency" };
    }
    const nextOrder = Math.max(0, ...Object.values(state.derivedColumns).map((entry) => entry.order || 0)) + 1;

    const derivedColumns = {
      ...state.derivedColumns,
      [nextColumnKey]: {
        kind: "formula",
        columnKey: nextColumnKey,
        formula,
        dependencies,
        order: state.derivedColumns[nextColumnKey]?.order ?? nextOrder,
      } as DerivedColumnDefinition,
    };
    const nextRows = applyDerivedColumns(state.sourceDataset, derivedColumns);
    const nextMetadata = buildColumnMetadata(
      nextRows,
      [...Object.keys(state.columnMetadata).filter((column) => column !== nextColumnKey), nextColumnKey],
      {
        ...state.columnMetadata,
        [nextColumnKey]: {
          key: nextColumnKey,
          name: nextColumnKey,
          displayName: newColumnName?.trim() || nextColumnKey,
          modelingType: inferColumnType(nextRows, nextColumnKey),
          derived: true,
          formula,
        },
      }
    );
    set({
      masterDataset: nextRows,
      derivedColumns,
      columnMetadata: nextMetadata,
      columnDefinitions: buildColumnDefinitions(nextMetadata),
      tableLayoutState: {
        ...state.tableLayoutState,
        visibleColumns: Array.from(new Set([...state.tableLayoutState.visibleColumns, nextColumnKey])),
        columnOrder: Array.from(new Set([...state.tableLayoutState.columnOrder, nextColumnKey])),
      },
      inspectorState: {
        ...state.inspectorState,
        activeColumnKey: nextColumnKey,
        rightPanelOpen: true,
      },
    });
    return { ok: true, columnKey: nextColumnKey };
  },
  recodeColumn: ({ sourceColumn, mapping, newColumnName, keepUnmapped = true }) => {
    const state = get();
    const nextColumnKey = sanitizeColumnKey(newColumnName || `${sourceColumn}_recode`);
    if (!nextColumnKey) return { ok: false, error: "Column name required" };
    const nextOrder = Math.max(0, ...Object.values(state.derivedColumns).map((entry) => entry.order || 0)) + 1;
    const derivedColumns = {
      ...state.derivedColumns,
      [nextColumnKey]: {
        kind: "recode",
        columnKey: nextColumnKey,
        sourceColumn,
        mapping,
        keepUnmapped,
        dependencies: [sourceColumn],
        order: state.derivedColumns[nextColumnKey]?.order ?? nextOrder,
      } as DerivedColumnDefinition,
    };
    const nextRows = applyDerivedColumns(state.sourceDataset, derivedColumns);
    const nextMetadata = buildColumnMetadata(
      nextRows,
      [...Object.keys(state.columnMetadata).filter((column) => column !== nextColumnKey), nextColumnKey],
      {
        ...state.columnMetadata,
        [nextColumnKey]: {
          key: nextColumnKey,
          name: nextColumnKey,
          displayName: newColumnName?.trim() || nextColumnKey,
          modelingType: "nominal",
          derived: true,
          description: `Recoded from ${sourceColumn}`,
        },
      }
    );
    set({
      masterDataset: nextRows,
      derivedColumns,
      columnMetadata: nextMetadata,
      columnDefinitions: buildColumnDefinitions(nextMetadata),
      tableLayoutState: {
        ...state.tableLayoutState,
        visibleColumns: Array.from(new Set([...state.tableLayoutState.visibleColumns, nextColumnKey])),
        columnOrder: Array.from(new Set([...state.tableLayoutState.columnOrder, nextColumnKey])),
      },
      inspectorState: {
        ...state.inspectorState,
        activeColumnKey: nextColumnKey,
        rightPanelOpen: true,
      },
    });
    return { ok: true, columnKey: nextColumnKey };
  },
  deleteDerivedColumn: (columnKey) => {
    const state = get();
    if (!state.derivedColumns[columnKey]) return;
    const derivedColumns = { ...state.derivedColumns };
    delete derivedColumns[columnKey];
    const nextRows = applyDerivedColumns(state.sourceDataset, derivedColumns);
    const nextMetadata = { ...state.columnMetadata };
    delete nextMetadata[columnKey];
    const visibleColumns = state.tableLayoutState.visibleColumns.filter((column) => column !== columnKey);
    const displayRows = applyFiltersAndSearch(
      nextRows,
      state.rowStates,
      state.columnFilters,
      state.searchQuery,
      visibleColumns
    );
    const analysisRows = displayRows.filter((row) => !(state.rowStates[Number(row.__row_index__)] || DEFAULT_ROW_STATE).excluded);
    const refreshedMetadata = refreshMetadataStats({ columnMetadata: nextMetadata }, analysisRows);
    set({
      sourceDataset: state.sourceDataset,
      masterDataset: nextRows,
      derivedColumns,
      columnMetadata: refreshedMetadata,
      columnDefinitions: buildColumnDefinitions(refreshedMetadata),
      tableLayoutState: {
        ...state.tableLayoutState,
        visibleColumns,
        columnOrder: state.tableLayoutState.columnOrder.filter((column) => column !== columnKey),
      },
      inspectorState: {
        ...state.inspectorState,
        activeColumnKey: state.inspectorState.activeColumnKey === columnKey ? undefined : state.inspectorState.activeColumnKey,
      },
    });
  },
  computeColumnStats: (columnKey) => {
    const state = get();
    return computeColumnStatsForRows(
      state.getAnalysisRows(),
      columnKey,
      state.columnMetadata[columnKey]?.modelingType || "nominal"
    );
  },
  getDisplayedRows: () => {
    const state = get();
    return applyFiltersAndSearch(
      state.masterDataset,
      state.rowStates,
      state.columnFilters,
      state.searchQuery,
      state.tableLayoutState.visibleColumns
    );
  },
  getAnalysisRows: () => {
    const state = get();
    return state.getDisplayedRows().filter((row) => !(state.rowStates[Number(row.__row_index__)] || DEFAULT_ROW_STATE).excluded);
  },
}));
