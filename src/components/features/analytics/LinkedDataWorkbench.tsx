import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, type ColDef, type GridApi, type ICellRendererParams } from "ag-grid-community";
import { BarChart3, Columns3, Download, Flag, PanelBottom, PanelLeft, Sigma } from "lucide-react";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip as RechartsTooltip, XAxis, YAxis, Cell, Brush, Legend } from "recharts";
import Plot from "react-plotly.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { GraphBuilder, type GraphBuilderState } from "@/components/features/analytics/graph-builder/GraphBuilder";
import type { GraphChartType } from "@/components/features/analytics/graph-builder/types";
import { BottomAnalyticsPanel } from "@/components/features/analytics/table/BottomAnalyticsPanel";
import { ColumnInspector } from "@/components/features/analytics/table/ColumnInspector";
import { ColumnInfoDialog } from "@/components/features/analytics/table/ColumnInfoDialog";
import { ColumnManagerPanel } from "@/components/features/analytics/table/ColumnManagerPanel";
import { DerivedColumnDialogs } from "@/components/features/analytics/table/DerivedColumnDialogs";
import { FilterPanel } from "@/components/features/analytics/table/FilterPanel";
import { RowStateToolbar } from "@/components/features/analytics/table/RowStateToolbar";
import { ScientificColumnHeader } from "@/components/features/analytics/table/ScientificColumnHeader";
import { TableAIHelper } from "@/components/features/analytics/table/TableAIHelper";
import { buildFillPreviewPlan, resolvePastePlan } from "@/components/features/analytics/table/tableInteractionUtils";
import { PersistedResizableGroup } from "@/components/layout/PersistedResizableGroup";
import { WorkspaceActionBar } from "@/components/workspace/WorkspaceActionBar";
import { workspaceToolbarButtonClassName, workspaceToolbarInputClassName } from "@/components/workspace/workspaceToolbarTokens";
import { WorkspaceMetricChip } from "@/components/workspace/WorkspaceMetricChip";
import { ResizableHandle, ResizablePanel } from "@/components/ui/resizable";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DEFAULT_INSPECTOR_STATE,
  DEFAULT_ROW_STATE,
  applyDerivedColumns,
  applyFiltersAndSearch,
  buildColumnMetadata,
  buildFormulaEvaluator,
  ensureRowIndices,
  extractFormulaDependencies,
  refreshMetadataStats,
  sanitizeColumnKey,
  syncSelectedRowIds,
  useDataWorkbenchStore,
  type ColumnFilterState,
  type ColumnMetadata,
  type DerivedColumnDefinition,
  type RowState,
  type SortRule,
  type TableInspectorState,
  type TableLayoutState,
  type WorkbenchChartType,
  type WorkbenchRow,
} from "@/stores/dataWorkbenchStore";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

ModuleRegistry.registerModules([AllCommunityModule]);

interface LinkedDataWorkbenchProps {
  rows: WorkbenchRow[];
  columns: string[];
  height?: number;
  showVisualizationByDefault?: boolean;
  openEditableChartRequest?: OpenEditableChartRequest | null;
  layoutSessionKey?: string;
}

type WorkbenchTabType = "data" | "chart" | "graph_builder";
type DataSourceMode = "linked" | "empty" | "custom";

interface ChartTabConfig {
  chartType: WorkbenchChartType;
  xColumn: string;
  yColumn: string;
  title: string;
  seriesColor: string;
  xAxisLabel: string;
  yAxisLabel: string;
  showLegend: boolean;
  fontSize: number;
  markerSize: number;
  chartHeight: number;
  sourceImage?: string | null;
  sourceSpec?: any | null;
  viewMode?: "image" | "linked";
  specPanelIndex?: number;
  editorMode?: "classic" | "builder";
  builderState?: GraphBuilderState;
}

interface WorkbenchTab {
  id: string;
  type: WorkbenchTabType;
  label: string;
  dataMode?: DataSourceMode;
  customRows?: WorkbenchRow[];
  customColumns?: string[];
  workspaceState?: CustomDataWorkspaceState;
  chartRows?: WorkbenchRow[];
  chartColumns?: string[];
  chartColumnLabels?: Record<string, string>;
  graphBuilderRows?: WorkbenchRow[];
  graphBuilderColumns?: string[];
  graphBuilderColumnLabels?: Record<string, string>;
  chartConfig?: ChartTabConfig;
  graphBuilderState?: GraphBuilderState;
}

export interface OpenEditableChartRequest {
  requestId: number;
  title?: string;
  chartType?: WorkbenchChartType;
  xColumn?: string;
  yColumn?: string;
  seriesColor?: string;
  sourceImage?: string | null;
  sourceSpec?: any | null;
}

interface CustomDataWorkspaceState {
  sourceDataset: WorkbenchRow[];
  masterDataset: WorkbenchRow[];
  columnMetadata: Record<string, ColumnMetadata>;
  derivedColumns: Record<string, DerivedColumnDefinition>;
  rowStates: Record<number, RowState>;
  selectedRowIds: number[];
  columnFilters: Record<string, ColumnFilterState>;
  sortRules: SortRule[];
  tableLayoutState: TableLayoutState;
  inspectorState: TableInspectorState;
  searchQuery: string;
  activeCell?: { rowId?: number; columnKey?: string };
}

interface FillPreviewState {
  columnKey: string;
  rowIds: number[];
  values: Record<number, unknown>;
}

interface FillHandleRect {
  top: number;
  left: number;
  size: number;
}

interface FillDragState {
  rowId: number;
  columnKey: string;
}

interface ValueCellState {
  excluded?: boolean;
  hidden?: boolean;
}

interface RowSweepSelectionState {
  anchorRowId: number;
}

interface ColumnSweepSelectionState {
  anchorColumnKey: string;
}

interface CellSweepSelectionState {
  anchorRowId: number;
  anchorColumnKey: string;
}

type ColumnInspectorSectionState = {
  actions: boolean;
  metadata: boolean;
  dependencies: boolean;
  stats: boolean;
};

const DEFAULT_COLUMN_INSPECTOR_SECTIONS: ColumnInspectorSectionState = {
  actions: true,
  metadata: true,
  dependencies: true,
  stats: true,
};

const arraysEqual = (left: Array<string | number>, right: Array<string | number>) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const readStoredSidebarWidth = (storageKey: string, fallback: number) => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
};

const recordNumberEqual = (left: Record<string, number>, right: Record<string, number>) => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
};

const getValueCellStateKey = (rowId: number, columnKey: string) => `${rowId}:${columnKey}`;

const applyValueCellStatesToRows = (
  rows: WorkbenchRow[],
  cellStates: Record<string, ValueCellState>,
  mode: "display" | "analysis"
): WorkbenchRow[] => {
  return rows.map((row) => {
    let nextRow: WorkbenchRow | null = null;
    for (const [key, value] of Object.entries(row)) {
      if (key === "__row_index__") continue;
      const cellState = cellStates[getValueCellStateKey(Number(row.__row_index__), key)];
      if (!cellState) continue;
      const shouldMaskForDisplay = mode === "display" && cellState.hidden;
      const shouldMaskForAnalysis = mode === "analysis" && (cellState.hidden || cellState.excluded);
      if (!shouldMaskForDisplay && !shouldMaskForAnalysis) continue;
      if (!nextRow) nextRow = { ...row };
      nextRow[key] = shouldMaskForDisplay || shouldMaskForAnalysis ? null : value;
    }
    return nextRow || row;
  });
};

const WORKBENCH_STATE_COLUMN_WIDTH = 112;
const WORKBENCH_INDEX_COLUMN_WIDTH = 78;
const getFormulaHistoryKey = (scope: string, columnKey: string) => `table_formula_history:${scope}:${columnKey}`;

interface RowStateCellProps {
  rowId: number;
  rowState?: RowState;
  onToggle: (patch: Partial<RowState>) => void;
}

const RowStateCell: React.FC<RowStateCellProps> = ({ rowId, rowState, onToggle }) => {
  const effectiveState = rowState || DEFAULT_ROW_STATE;
  const toggles: Array<{ key: keyof RowState; label: string; active: boolean; activeClassName: string }> = [
    { key: "selected", label: "S", active: effectiveState.selected, activeClassName: "border-primary bg-primary/10 text-primary" },
    { key: "excluded", label: "E", active: effectiveState.excluded, activeClassName: "border-amber-300 bg-amber-50 text-amber-800" },
    { key: "hidden", label: "H", active: effectiveState.hidden, activeClassName: "border-slate-300 bg-slate-100 text-slate-700" },
    { key: "labeled", label: "L", active: effectiveState.labeled, activeClassName: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full items-center justify-center gap-1 px-1">
        {toggles.map((toggle) => (
          <Tooltip key={toggle.key}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`inline-flex h-5 w-5 items-center justify-center rounded-[4px] border text-[10px] font-semibold transition-colors ${
                  toggle.active ? toggle.activeClassName : "border-border/80 bg-background text-muted-foreground hover:bg-muted"
                }`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggle({ [toggle.key]: !effectiveState[toggle.key] });
                }}
              >
                {toggle.label}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[11px]">
              Row {rowId + 1}: {toggle.key}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
};

const RowIndexCell: React.FC<ICellRendererParams<WorkbenchRow>> = (params) => {
  const rowIndex = Number(params.data?.__row_index__);
  return <div className="flex h-full items-center justify-end pr-2 font-mono text-[11px] text-muted-foreground">{Number.isFinite(rowIndex) ? rowIndex + 1 : ""}</div>;
};

const getCustomDisplayedRows = (state: CustomDataWorkspaceState): WorkbenchRow[] =>
  applyFiltersAndSearch(
    state.masterDataset,
    state.rowStates,
    state.columnFilters,
    state.searchQuery,
    state.tableLayoutState.visibleColumns
  );

const getCustomAnalysisRows = (state: CustomDataWorkspaceState): WorkbenchRow[] =>
  getCustomDisplayedRows(state).filter((row) => !(state.rowStates[Number(row.__row_index__)] || DEFAULT_ROW_STATE).excluded);

const buildCustomWorkspaceState = (rows: WorkbenchRow[], columns: string[]): CustomDataWorkspaceState => {
  const sourceDataset = ensureRowIndices(rows || []);
  const masterDataset = sourceDataset.map((row) => ({ ...row }));
  const columnMetadata = buildColumnMetadata(masterDataset, columns, {});
  const rowStates: Record<number, RowState> = {};
  for (const row of masterDataset) {
    rowStates[Number(row.__row_index__)] = { ...DEFAULT_ROW_STATE };
  }
  return {
    sourceDataset,
    masterDataset,
    columnMetadata,
    derivedColumns: {},
    rowStates,
    selectedRowIds: [],
    columnFilters: {},
    sortRules: [],
    tableLayoutState: {
      visibleColumns: [...columns],
      pinnedColumns: [],
      columnWidths: {},
      columnOrder: [...columns],
    },
    inspectorState: { ...DEFAULT_INSPECTOR_STATE },
    searchQuery: "",
    activeCell: {},
  };
};

export const LinkedDataWorkbench: React.FC<LinkedDataWorkbenchProps> = ({ rows, columns, height, showVisualizationByDefault = false, openEditableChartRequest = null, layoutSessionKey }) => {
  const computedWorkbenchHeight = useMemo(() => {
    const targetVisibleRows = clampNumber(rows.length || 0, 60, 100);
    const baseChromeHeight = 380;
    return baseChromeHeight + targetVisibleRows * 28;
  }, [rows.length]);
  const workbenchHeight = height ?? computedWorkbenchHeight;
  const gridApiRef = useRef<GridApi<WorkbenchRow> | null>(null);
  const brushRangeRef = useRef<{ startIndex: number; endIndex: number } | null>(null);
  const gridShellRef = useRef<HTMLDivElement | null>(null);
  const workspaceSplitRef = useRef<HTMLDivElement | null>(null);
  const sidebarDragRef = useRef<null | { side: "left" | "right" }>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const columnManagerSearchInputRef = useRef<HTMLInputElement | null>(null);
  const filterSelectTriggerRef = useRef<HTMLButtonElement | null>(null);
  const columnInspectorFocusRef = useRef<HTMLDivElement | null>(null);
  const lastLayoutSessionKeyRef = useRef<string | null>(null);

  const masterDataset = useDataWorkbenchStore((s) => s.masterDataset);
  const selectedRowIds = useDataWorkbenchStore((s) => s.selectedRowIds);
  const columnDefinitions = useDataWorkbenchStore((s) => s.columnDefinitions);
  const columnMetadata = useDataWorkbenchStore((s) => s.columnMetadata);
  const derivedColumns = useDataWorkbenchStore((s) => s.derivedColumns);
  const rowStates = useDataWorkbenchStore((s) => s.rowStates);
  const columnFilters = useDataWorkbenchStore((s) => s.columnFilters);
  const sortRules = useDataWorkbenchStore((s) => s.sortRules);
  const tableLayoutState = useDataWorkbenchStore((s) => s.tableLayoutState);
  const inspectorState = useDataWorkbenchStore((s) => s.inspectorState);
  const searchQuery = useDataWorkbenchStore((s) => s.searchQuery);
  const activeCell = useDataWorkbenchStore((s) => s.activeCell);
  const setDataset = useDataWorkbenchStore((s) => s.setDataset);
  const setSelectedRowIds = useDataWorkbenchStore((s) => s.setSelectedRowIds);
  const updateCell = useDataWorkbenchStore((s) => s.updateCell);
  const setColumnDisplayName = useDataWorkbenchStore((s) => s.setColumnDisplayName);
  const setColumnGroup = useDataWorkbenchStore((s) => s.setColumnGroup);
  const setColumnUnits = useDataWorkbenchStore((s) => s.setColumnUnits);
  const setRowsExcluded = useDataWorkbenchStore((s) => s.setRowsExcluded);
  const setRowsHidden = useDataWorkbenchStore((s) => s.setRowsHidden);
  const setRowsLabeled = useDataWorkbenchStore((s) => s.setRowsLabeled);
  const clearAllRowStateFlags = useDataWorkbenchStore((s) => s.clearAllRowStateFlags);
  const setRowState = useDataWorkbenchStore((s) => s.setRowState);
  const setColumnFilter = useDataWorkbenchStore((s) => s.setColumnFilter);
  const clearColumnFilter = useDataWorkbenchStore((s) => s.clearColumnFilter);
  const clearAllFilters = useDataWorkbenchStore((s) => s.clearAllFilters);
  const setSortRules = useDataWorkbenchStore((s) => s.setSortRules);
  const clearSortRules = useDataWorkbenchStore((s) => s.clearSortRules);
  const setInspectorState = useDataWorkbenchStore((s) => s.setInspectorState);
  const setTableLayoutState = useDataWorkbenchStore((s) => s.setTableLayoutState);
  const setSearchQuery = useDataWorkbenchStore((s) => s.setSearchQuery);
  const setActiveCell = useDataWorkbenchStore((s) => s.setActiveCell);
  const insertRow = useDataWorkbenchStore((s) => s.insertRow);
  const duplicateRows = useDataWorkbenchStore((s) => s.duplicateRows);
  const deleteRows = useDataWorkbenchStore((s) => s.deleteRows);
  const createEmptyColumn = useDataWorkbenchStore((s) => s.createEmptyColumn);
  const createFormulaColumn = useDataWorkbenchStore((s) => s.createFormulaColumn);
  const recodeColumn = useDataWorkbenchStore((s) => s.recodeColumn);
  const deleteDerivedColumn = useDataWorkbenchStore((s) => s.deleteDerivedColumn);
  const getDisplayedRows = useDataWorkbenchStore((s) => s.getDisplayedRows);
  const getAnalysisRows = useDataWorkbenchStore((s) => s.getAnalysisRows);

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabLabel, setEditingTabLabel] = useState<string>("");
  const [derivedDialogMode, setDerivedDialogMode] = useState<"formula" | "recode" | null>(null);
  const [derivedDialogColumnKey, setDerivedDialogColumnKey] = useState<string>("");
  const [contextMenuRowId, setContextMenuRowId] = useState<number | null>(null);
  const [formulaBarValue, setFormulaBarValue] = useState<string>("");
  const [findPanelOpen, setFindPanelOpen] = useState(false);
  const [findValue, setFindValue] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [findColumnScope, setFindColumnScope] = useState<string>("__all__");
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);
  const [findUseRegex, setFindUseRegex] = useState(false);
  const [columnInfoOpen, setColumnInfoOpen] = useState(false);
  const [columnInfoCompact, setColumnInfoCompact] = useState(false);
  const [selectionPulse, setSelectionPulse] = useState(false);
  const [fillPreview, setFillPreview] = useState<FillPreviewState | null>(null);
  const [fillHandleRect, setFillHandleRect] = useState<FillHandleRect | null>(null);
  const [fillDragState, setFillDragState] = useState<FillDragState | null>(null);
  const [pasteStatus, setPasteStatus] = useState("");
  const [cellSelectionBadge, setCellSelectionBadge] = useState("");
  const [selectedCellTargets, setSelectedCellTargets] = useState<Array<{ rowId: number; columnKey: string }>>([]);
  const [linkedValueCellStates, setLinkedValueCellStates] = useState<Record<string, ValueCellState>>({});
  const [customTabValueCellStates, setCustomTabValueCellStates] = useState<Record<string, Record<string, ValueCellState>>>({});
  const [rowSweepSelection, setRowSweepSelection] = useState<RowSweepSelectionState | null>(null);
  const [columnSweepSelection, setColumnSweepSelection] = useState<ColumnSweepSelectionState | null>(null);
  const [cellSweepSelection, setCellSweepSelection] = useState<CellSweepSelectionState | null>(null);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(() => clampNumber(readStoredSidebarWidth("workspace.dataWorkbench.leftSidebarWidth.v1", 320), 220, 520));
  const [rightSidebarWidth, setRightSidebarWidth] = useState(() => clampNumber(readStoredSidebarWidth("workspace.dataWorkbench.rightSidebarWidth.v1", 320), 240, 520));
  const [sidebarDragSide, setSidebarDragSide] = useState<"left" | "right" | null>(null);
  const [columnInspectorSections, setColumnInspectorSections] = useState<ColumnInspectorSectionState>(DEFAULT_COLUMN_INSPECTOR_SECTIONS);

  const isMissingValue = (value: any): boolean => {
    if (value === null || value === undefined) return true;
    const text = String(value).trim().toLowerCase();
    return text === "" || text === "null" || text === "nan" || text === "none" || text === "n/a" || text === "na";
  };

  const toNumberOrNull = (value: any): number | null => {
    if (isMissingValue(value)) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const coerceValueForColumn = (columnKey: string, rawValue: any) => {
    const modelingType = workspaceColumnMetadata[columnKey]?.modelingType;
    if (rawValue === "" || rawValue === null || rawValue === undefined) return null;
    if (modelingType === "continuous") {
      const numeric = Number(rawValue);
      return Number.isFinite(numeric) ? numeric : rawValue;
    }
    if (modelingType === "datetime") {
      const date = new Date(rawValue);
      return Number.isFinite(date.getTime()) ? date.toISOString() : rawValue;
    }
    return rawValue;
  };

  const updateCellSelectionBadge = (api?: any) => {
    const ranges = typeof api?.getCellRanges === "function" ? api.getCellRanges() || [] : [];
    if (!ranges.length) {
      setSelectedCellTargets([]);
      setCellSelectionBadge("");
      return;
    }
    const columnKeys = new Set<string>();
    const targetMap = new Map<string, { rowId: number; columnKey: string }>();
    let cellCount = 0;
    for (const range of ranges) {
      const rangeColumns = Array.isArray(range.columns) ? range.columns : [];
      const startIndex = Math.min(range.startRow?.rowIndex ?? 0, range.endRow?.rowIndex ?? 0);
      const endIndex = Math.max(range.startRow?.rowIndex ?? 0, range.endRow?.rowIndex ?? 0);
      const rowCount = endIndex - startIndex + 1;
      for (let displayIndex = startIndex; displayIndex <= endIndex; displayIndex += 1) {
        const rowId = Number(tabRows[displayIndex]?.__row_index__);
        if (!Number.isFinite(rowId)) continue;
        for (const column of rangeColumns) {
          const columnKey = typeof column?.getColId === "function" ? column.getColId() : String(column?.colId || "");
          if (!columnKey) continue;
          targetMap.set(`${rowId}:${columnKey}`, { rowId, columnKey });
        }
      }
      for (const column of rangeColumns) {
        const columnKey = typeof column?.getColId === "function" ? column.getColId() : String(column?.colId || "");
        if (columnKey) columnKeys.add(columnKey);
      }
      cellCount += Math.max(0, rowCount) * Math.max(1, rangeColumns.length);
    }
    setSelectedCellTargets(Array.from(targetMap.values()));
    const columnList = Array.from(columnKeys);
    const label =
      columnList.length === 1
        ? `${workspaceColumnLabels[columnList[0]] || columnList[0]} | ${cellCount} cell${cellCount === 1 ? "" : "s"} selected`
        : `${columnList.length} columns | ${cellCount} cells selected`;
    setCellSelectionBadge(label);
  };

  useEffect(() => {
    if (!columns.length) return;
    setDataset(rows, columns);
  }, [rows, columns, setDataset]);

  const allColumns = useMemo(() => {
    const storeColumns = Object.keys(columnMetadata);
    return storeColumns.length ? storeColumns : columns;
  }, [columnMetadata, columns]);

  const displayedRows = useMemo(
    () => applyValueCellStatesToRows(getDisplayedRows(), linkedValueCellStates, "display"),
    [getDisplayedRows, masterDataset, rowStates, columnFilters, searchQuery, tableLayoutState.visibleColumns, linkedValueCellStates]
  );
  const analysisRows = useMemo(
    () => applyValueCellStatesToRows(getAnalysisRows(), linkedValueCellStates, "analysis"),
    [getAnalysisRows, masterDataset, rowStates, columnFilters, searchQuery, tableLayoutState.visibleColumns, linkedValueCellStates]
  );

  const defaultX = useMemo(() => {
    if (!allColumns.length) return "";
    const nominal = allColumns.filter((c) => columnDefinitions[c]?.semanticType !== "continuous");
    return nominal[0] || allColumns[0];
  }, [allColumns, columnDefinitions]);

  const defaultY = useMemo(() => {
    if (!allColumns.length) return "";
    const continuous = allColumns.filter((c) => columnDefinitions[c]?.semanticType === "continuous");
    const fallback = allColumns.find((c) => c !== defaultX);
    return continuous[0] || fallback || allColumns[0];
  }, [allColumns, columnDefinitions, defaultX]);

  const defaultChartType = useMemo<WorkbenchChartType>(() => {
    if (!defaultX || !defaultY) return "bar";
    const xType = columnDefinitions[defaultX]?.semanticType;
    const yType = columnDefinitions[defaultY]?.semanticType;
    return xType === "continuous" && yType === "continuous" ? "scatter" : "bar";
  }, [defaultX, defaultY, columnDefinitions]);

  const newChartTab = (index: number, patch?: Partial<ChartTabConfig>): WorkbenchTab => ({
    id: `chart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "chart",
    label: `Chart ${index}`,
      chartConfig: {
        chartType: defaultChartType,
        xColumn: defaultX,
        yColumn: defaultY,
        title: `Chart ${index}`,
        seriesColor: "#2563eb",
        xAxisLabel: "",
        yAxisLabel: "",
        showLegend: true,
        fontSize: 12,
        markerSize: 8,
        chartHeight: 520,
        sourceImage: null,
        sourceSpec: null,
        viewMode: "linked",
        specPanelIndex: 0,
        editorMode: "classic",
        builderState: undefined,
        ...patch,
      },
  });

  const [tabs, setTabs] = useState<WorkbenchTab[]>(() => {
    const base: WorkbenchTab[] = [{ id: "data-1", type: "data", dataMode: "linked", label: "Data 1" }];
    if (showVisualizationByDefault) base.push(newChartTab(1));
    return base;
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => "data-1");

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  const customWorkspace = activeTab?.type === "data" && activeTab.dataMode === "custom" ? activeTab.workspaceState : undefined;
  const activeChartRows = activeTab?.type === "chart" && activeTab.chartRows ? activeTab.chartRows : analysisRows;
  const activeChartColumns = activeTab?.type === "chart" && activeTab.chartColumns ? activeTab.chartColumns : allColumns;

  const updateCustomWorkspace = (tabId: string, updater: (state: CustomDataWorkspaceState) => CustomDataWorkspaceState) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId || tab.type !== "data" || tab.dataMode !== "custom" || !tab.workspaceState) return tab;
        return { ...tab, workspaceState: updater(tab.workspaceState) };
      })
    );
  };

  const makeDefaultGraphBuilderState = (): GraphBuilderState => ({
    roles: { y: [], overlay: [] },
    config: {
      chartType: "auto",
      layerSelectionMode: "solo",
      summary: "mean",
      title: "Graph Builder",
      xLabel: "",
      yLabel: "",
      xShelfOrientation: "horizontal",
      yShelfOrientation: "vertical",
      xShelfFontSize: 12,
      yShelfFontSize: 12,
      showLegend: true,
      fontSize: 12,
      markerSize: 8,
      chartHeight: 520,
      colorPreset: "default",
    },
  });

  const graphTypeFromWorkbench = (t: WorkbenchChartType): GraphChartType => (t === "scatter" ? "scatter" : "bar_grouped");

  const mapSemanticChartTypeToGraphType = (semanticType?: string | null): GraphChartType | null => {
    const value = String(semanticType || "").toLowerCase();
    if (!value) return null;
    if (value === "box" || value === "violin") return "box";
    if (value === "histogram") return "histogram";
    if (value === "heatmap") return "heatmap";
    if (value === "contour") return "contour";
    if (value === "line" || value === "multi_series_line" || value === "spc") return "line";
    if (value === "scatter" || value === "multi_series_scatter") return "scatter";
    if (value === "bar" || value === "grouped_bar" || value === "fft_bar") return "bar_grouped";
    return null;
  };

  const getPrimarySpecPanel = (spec: any, panelIndex?: number) => {
    const panels = Array.isArray(spec?.panels) ? spec.panels : [];
    if (!panels.length) return null;
    const index = Math.max(0, Math.min(Number(panelIndex || 0), Math.max(0, panels.length - 1)));
    return panels[index] || panels[0] || null;
  };

  const inferGraphTypeFromSpec = (spec: any, fallback: GraphChartType): GraphChartType => {
    const panel = getPrimarySpecPanel(spec);
    const explicitType = mapSemanticChartTypeToGraphType(panel?.chart_type || spec?.chart_type);
    if (explicitType) return explicitType;
    const title = String(spec?.title || "").toLowerCase();
    const traces = panel?.traces || (Array.isArray(spec?.traces) ? spec.traces : []);
    const traceTypes = traces.map((t: any) => String(t?.type || "").toLowerCase());
    if (/box|distribution|violin/.test(title)) return "box";
    if (/hist/.test(title)) return "histogram";
    if (/heat/.test(title)) return "heatmap";
    if (/contour/.test(title)) return "contour";
    if (traceTypes.length && traceTypes.every((t: string) => t === "line")) return "line";
    if (traceTypes.includes("scatter")) return "scatter";
    if (traceTypes.includes("bar")) return "bar_grouped";
    return fallback;
  };

  const extractMentionedColumnsFromText = (texts: Array<string | undefined | null>, availableColumns: string[]) => {
    const found: string[] = [];
    const lowerMap = new Map(availableColumns.map((column) => [column.toLowerCase(), column]));
    for (const text of texts) {
      const haystack = String(text || "").toLowerCase();
      if (!haystack) continue;
      for (const column of availableColumns) {
        const lower = column.toLowerCase();
        if (haystack.includes(lower) && !found.includes(column)) found.push(column);
      }
      for (const [lower, original] of lowerMap.entries()) {
        if (haystack.includes(lower) && !found.includes(original)) found.push(original);
      }
    }
    return found;
  };

  const extractSpecColumns = (
    spec: any,
    availableColumns: string[],
    fallbackTexts: Array<string | undefined | null> = []
  ) => {
    const panel = getPrimarySpecPanel(spec);
    const candidates = [
      ...(Array.isArray(panel?.matched_columns) ? panel.matched_columns : []),
      ...(Array.isArray(spec?.data_columns) ? spec.data_columns : []),
      ...extractMentionedColumnsFromText(
        [
          spec?.title,
          spec?.x_label,
          spec?.y_label,
          panel?.title,
          panel?.x_label,
          panel?.y_label,
          ...(Array.isArray(panel?.legend_labels) ? panel.legend_labels : []),
          ...(Array.isArray(panel?.xtick_labels) ? panel.xtick_labels : []),
          ...(Array.isArray(panel?.ytick_labels) ? panel.ytick_labels : []),
          ...fallbackTexts,
        ],
        availableColumns
      ),
    ];
    return Array.from(
      new Set(
        candidates.filter(
          (column): column is string => typeof column === "string" && availableColumns.includes(column)
        )
      )
    );
  };

  const makeGraphBuilderStateFromChart = (cfg: Partial<ChartTabConfig>, fallbackTitle: string): GraphBuilderState => {
    const base = makeDefaultGraphBuilderState();
    const sourcePanel = getPrimarySpecPanel(cfg.sourceSpec, cfg.specPanelIndex);
    const inferredType = inferGraphTypeFromSpec(
      cfg.sourceSpec,
      graphTypeFromWorkbench((cfg.chartType || defaultChartType) as WorkbenchChartType)
    );
    const specColumns = extractSpecColumns(cfg.sourceSpec, columns, [cfg.title, fallbackTitle]);
    const xHint = extractMentionedColumnsFromText(
      [cfg.sourceSpec?.x_label, sourcePanel?.x_label, cfg.xAxisLabel],
      columns
    )[0];
    const yHintColumns = extractMentionedColumnsFromText(
      [cfg.sourceSpec?.y_label, sourcePanel?.y_label, cfg.yAxisLabel],
      columns
    );
    const fallbackX = cfg.xColumn || xHint || specColumns[0] || defaultX;
    const fallbackY = cfg.yColumn || yHintColumns[0] || specColumns.find((column) => column !== fallbackX) || defaultY;
    let nextX: string | undefined = fallbackX || undefined;
    let nextY: string[] = fallbackY ? [fallbackY] : [];

    if (inferredType === "box") {
      nextX = undefined;
      nextY = specColumns.length
        ? specColumns.filter((column) => !xHint || column !== xHint)
        : yHintColumns.length
        ? yHintColumns
        : fallbackY
        ? [fallbackY]
        : [];
    } else if (inferredType === "line" || inferredType === "bar_grouped" || inferredType === "histogram") {
      nextX = xHint || cfg.xColumn || fallbackX || undefined;
      nextY = specColumns.filter((column) => column !== nextX);
      if (!nextY.length && fallbackY) nextY = [fallbackY];
    } else if (inferredType === "scatter" || inferredType === "heatmap" || inferredType === "contour") {
      nextX = xHint || cfg.xColumn || fallbackX || undefined;
      nextY = yHintColumns.length
        ? [yHintColumns[0]]
        : specColumns.filter((column) => column !== nextX).slice(0, 1);
      if (!nextY.length && fallbackY) nextY = [fallbackY];
    }

    return {
      roles: {
        x: nextX,
        y: nextY,
        overlay: [],
      },
      config: {
        ...base.config,
        chartType: inferredType,
        title: cfg.title || fallbackTitle,
        xLabel: cfg.xAxisLabel || "",
        yLabel: cfg.yAxisLabel || "",
        xShelfOrientation: "horizontal",
        yShelfOrientation: "vertical",
        xShelfFontSize: 12,
        yShelfFontSize: 12,
        showLegend: cfg.showLegend ?? true,
        fontSize: Number(cfg.fontSize || 12),
        markerSize: Number(cfg.markerSize || 8),
        chartHeight: Number(cfg.chartHeight || 520),
      },
    };
  };

  useEffect(() => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.type !== "chart") return tab;
        const cfg = tab.chartConfig || {
          chartType: defaultChartType,
          xColumn: defaultX,
          yColumn: defaultY,
          title: tab.label,
          seriesColor: "#2563eb",
          xAxisLabel: "",
          yAxisLabel: "",
          showLegend: true,
          fontSize: 12,
          markerSize: 8,
          chartHeight: 520,
          sourceImage: null,
          sourceSpec: null,
          viewMode: "linked",
          specPanelIndex: 0,
          editorMode: "classic",
          builderState: makeGraphBuilderStateFromChart({}, tab.label),
        };
        const availableColumns = tab.chartColumns?.length ? tab.chartColumns : columns;
        const fallbackX = availableColumns[0] || defaultX;
        const fallbackY = availableColumns.find((column) => column !== fallbackX) || availableColumns[0] || defaultY;
        const nextX = availableColumns.includes(cfg.xColumn) ? cfg.xColumn : fallbackX;
        const nextY = availableColumns.includes(cfg.yColumn) ? cfg.yColumn : fallbackY;
        const existingBuilder = cfg.builderState || makeGraphBuilderStateFromChart(cfg, tab.label);
        const builderIsBox = existingBuilder.config?.chartType === "box";
        return {
          ...tab,
          chartConfig: {
            ...cfg,
            xColumn: nextX,
            yColumn: nextY,
            editorMode: cfg.editorMode || "classic",
            builderState: {
              ...existingBuilder,
              roles: {
                ...existingBuilder.roles,
                x: builderIsBox
                  ? undefined
                  : existingBuilder.roles?.x && availableColumns.includes(existingBuilder.roles.x)
                  ? existingBuilder.roles.x
                  : nextX,
                y: Array.isArray(existingBuilder.roles?.y)
                  ? existingBuilder.roles.y.filter((y) => availableColumns.includes(y))
                  : [nextY],
                overlay: Array.isArray(existingBuilder.roles?.overlay)
                  ? existingBuilder.roles.overlay.filter((o) => availableColumns.includes(o))
                  : [],
              },
            },
          },
        };
      })
    );
  }, [columns, defaultChartType, defaultX, defaultY]);

  useEffect(() => {
    if (!openEditableChartRequest?.requestId) return;
    setTabs((prev) => {
      const next = prev.filter((t) => t.type === "chart").length + 1;
      const tab = newChartTab(next, {
        chartType: openEditableChartRequest.chartType || defaultChartType,
        xColumn: openEditableChartRequest.xColumn || defaultX,
        yColumn: openEditableChartRequest.yColumn || defaultY,
        title: openEditableChartRequest.title || `Chart ${next}`,
        seriesColor: openEditableChartRequest.seriesColor || "#2563eb",
        sourceImage: openEditableChartRequest.sourceImage || null,
        sourceSpec: openEditableChartRequest.sourceSpec || null,
        viewMode: openEditableChartRequest.sourceImage ? "image" : "linked",
        specPanelIndex: 0,
        editorMode: "builder",
        builderState: makeGraphBuilderStateFromChart(
          {
            chartType: openEditableChartRequest.chartType || defaultChartType,
            xColumn: openEditableChartRequest.xColumn || defaultX,
            yColumn: openEditableChartRequest.yColumn || defaultY,
            title: openEditableChartRequest.title || `Chart ${next}`,
            sourceSpec: openEditableChartRequest.sourceSpec || null,
          },
          openEditableChartRequest.title || `Chart ${next}`
        ),
      });
      setActiveTabId(tab.id);
      return [...prev, tab];
    });
  }, [openEditableChartRequest?.requestId]);

  const addDataTab = () => {
    const next = tabs.filter((t) => t.type === "data").length + 1;
    const tab: WorkbenchTab = {
      id: `data-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "data",
      dataMode: "empty",
      label: `Data ${next}`,
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const addChartTab = () => {
    const next = tabs.filter((t) => t.type === "chart").length + 1;
    const tab = newChartTab(next);
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const addGraphBuilderTab = () => {
    const next = tabs.filter((t) => t.type === "graph_builder").length + 1;
    const tab: WorkbenchTab = {
      id: `graph-builder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "graph_builder",
      label: `Graph Builder ${next}`,
      graphBuilderState: makeDefaultGraphBuilderState(),
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const openPivotInGraphBuilder = (payload: { label: string; rows: WorkbenchRow[]; columns: string[]; xColumn: string; yColumn?: string }) => {
    const next = tabs.filter((t) => t.type === "graph_builder").length + 1;
    const graphBuilderState: GraphBuilderState = {
      roles: {
        x: payload.xColumn || payload.columns[0],
        y: payload.yColumn ? [payload.yColumn] : payload.columns[1] ? [payload.columns[1]] : [],
        overlay: [],
      },
      config: {
        ...makeDefaultGraphBuilderState().config,
        title: payload.label || `Graph Builder ${next}`,
      },
    };
    const tab: WorkbenchTab = {
      id: `graph-builder-pivot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "graph_builder",
      label: payload.label || `Graph Builder ${next}`,
      graphBuilderState,
      graphBuilderRows: payload.rows,
      graphBuilderColumns: payload.columns,
      graphBuilderColumnLabels: Object.fromEntries(payload.columns.map((column) => [column, column])),
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const openPivotAsChartTab = (payload: { label: string; rows: WorkbenchRow[]; columns: string[]; xColumn: string; yColumn?: string; chartType: "scatter" | "bar" }) => {
    const next = tabs.filter((t) => t.type === "chart").length + 1;
    const chartLabels = Object.fromEntries(payload.columns.map((column) => [column, column]));
    const tab = newChartTab(next, {
      chartType: payload.chartType || "bar",
      xColumn: payload.xColumn || payload.columns[0],
      yColumn: payload.yColumn || payload.columns[1] || payload.columns[0],
      title: payload.label || `Chart ${next}`,
    });
    tab.chartRows = payload.rows;
    tab.chartColumns = payload.columns;
    tab.chartColumnLabels = chartLabels;
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const exportPivotToTab = (payload: { label: string; rows: WorkbenchRow[]; columns: string[] }) => {
    const next = tabs.filter((t) => t.type === "data").length + 1;
    const tab: WorkbenchTab = {
      id: `data-pivot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "data",
      dataMode: "custom",
      label: payload.label || `Pivot ${next}`,
      customRows: payload.rows,
      customColumns: payload.columns,
      workspaceState: buildCustomWorkspaceState(payload.rows, payload.columns),
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const updateGraphBuilderTabState = (tabId: string, nextState: GraphBuilderState) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId || tab.type !== "graph_builder") return tab;
        return { ...tab, graphBuilderState: nextState };
      })
    );
  };

  const renameTab = (tabId: string, label: string) => {
    const clean = label.trim();
    if (!clean) return;
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, label: clean } : tab)));
  };

  const closeTab = (tabId: string) => {
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx < 0) return;
    const nextTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(nextTabs);
    if (editingTabId === tabId) setEditingTabId(null);
    if (activeTabId === tabId) {
      const fallback = nextTabs[Math.max(0, Math.min(idx, nextTabs.length - 1))];
      if (fallback) setActiveTabId(fallback.id);
    }
  };

  const updateChartTab = (tabId: string, patch: Partial<ChartTabConfig>) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId || tab.type !== "chart") return tab;
        const base = tab.chartConfig || {
          chartType: defaultChartType,
          xColumn: defaultX,
          yColumn: defaultY,
          title: tab.label,
          seriesColor: "#2563eb",
          xAxisLabel: "",
          yAxisLabel: "",
          showLegend: true,
          fontSize: 12,
          markerSize: 8,
          chartHeight: 520,
          sourceImage: null,
          sourceSpec: null,
          viewMode: "linked",
          specPanelIndex: 0,
          editorMode: "classic",
          builderState: makeDefaultGraphBuilderState(),
        };
        return { ...tab, chartConfig: { ...base, ...patch } };
      })
    );
  };

  const activeChartConfig: ChartTabConfig = activeTab?.type === "chart"
    ? {
        chartType: activeTab.chartConfig?.chartType || defaultChartType,
        xColumn: activeTab.chartConfig?.xColumn || defaultX,
        yColumn: activeTab.chartConfig?.yColumn || defaultY,
        title: activeTab.chartConfig?.title || activeTab.label,
        seriesColor: activeTab.chartConfig?.seriesColor || "#2563eb",
        xAxisLabel: activeTab.chartConfig?.xAxisLabel || "",
        yAxisLabel: activeTab.chartConfig?.yAxisLabel || "",
        showLegend: activeTab.chartConfig?.showLegend ?? true,
        fontSize: Number(activeTab.chartConfig?.fontSize || 12),
        markerSize: Number(activeTab.chartConfig?.markerSize || 8),
        chartHeight: Number(activeTab.chartConfig?.chartHeight || 520),
        sourceImage: activeTab.chartConfig?.sourceImage || null,
        sourceSpec: activeTab.chartConfig?.sourceSpec || null,
        viewMode: activeTab.chartConfig?.viewMode || "linked",
        specPanelIndex: Number(activeTab.chartConfig?.specPanelIndex || 0),
        editorMode: activeTab.chartConfig?.editorMode || "classic",
        builderState: activeTab.chartConfig?.builderState || makeGraphBuilderStateFromChart(activeTab.chartConfig || {}, activeTab.label),
      }
    : {
        chartType: defaultChartType,
        xColumn: defaultX,
        yColumn: defaultY,
        title: "Chart",
        seriesColor: "#2563eb",
        xAxisLabel: "",
        yAxisLabel: "",
        showLegend: true,
        fontSize: 12,
        markerSize: 8,
        chartHeight: 520,
        sourceImage: null,
        sourceSpec: null,
        viewMode: "linked",
        specPanelIndex: 0,
        editorMode: "classic",
        builderState: makeDefaultGraphBuilderState(),
      };

  const columnLabels = useMemo(() => {
    return Object.fromEntries(allColumns.map((column) => [column, columnMetadata[column]?.displayName || column]));
  }, [allColumns, columnMetadata]);
  const activeChartColumnLabels = activeTab?.type === "chart" && activeTab.chartColumnLabels ? activeTab.chartColumnLabels : columnLabels;

  const orderedVisibleColumns = useMemo(() => {
    const source = tableLayoutState.columnOrder.length ? tableLayoutState.columnOrder : allColumns;
    const visibleSet = new Set(
      (tableLayoutState.visibleColumns.length ? tableLayoutState.visibleColumns : allColumns).filter((column) => allColumns.includes(column))
    );
    return source.filter((column) => visibleSet.has(column));
  }, [allColumns, tableLayoutState.columnOrder, tableLayoutState.visibleColumns]);

  const currentValueCellStates = customWorkspace && activeTab?.id ? customTabValueCellStates[activeTab.id] || {} : linkedValueCellStates;
  const customDisplayedRows = useMemo(
    () => (customWorkspace ? applyValueCellStatesToRows(getCustomDisplayedRows(customWorkspace), currentValueCellStates, "display") : []),
    [customWorkspace, currentValueCellStates]
  );
  const customAnalysisRows = useMemo(
    () => (customWorkspace ? applyValueCellStatesToRows(getCustomAnalysisRows(customWorkspace), currentValueCellStates, "analysis") : []),
    [customWorkspace, currentValueCellStates]
  );
  const workspaceColumnMetadata = useMemo(
    () => refreshMetadataStats({ columnMetadata: customWorkspace?.columnMetadata || columnMetadata }, customWorkspace ? customAnalysisRows : analysisRows),
    [customWorkspace, columnMetadata, customWorkspace?.columnMetadata, customAnalysisRows, analysisRows]
  );
  const workspaceDerivedColumns = customWorkspace?.derivedColumns || derivedColumns;
  const workspaceRowStates = customWorkspace?.rowStates || rowStates;
  const workspaceSelectedRowIds = customWorkspace?.selectedRowIds || selectedRowIds;
  const workspaceColumnFilters = customWorkspace?.columnFilters || columnFilters;
  const workspaceSortRules = customWorkspace?.sortRules || sortRules;
  const workspaceTableLayoutState = customWorkspace?.tableLayoutState || tableLayoutState;
  const workspaceInspectorState = customWorkspace?.inspectorState || inspectorState;
  const workspaceSearchQuery = customWorkspace?.searchQuery || searchQuery;
  const workspaceActiveCell = customWorkspace?.activeCell || activeCell;
  const workspaceMasterDataset = customWorkspace?.masterDataset || masterDataset;
  const workspaceAllColumns = customWorkspace ? Object.keys(customWorkspace.columnMetadata) : allColumns;
  const workspaceColumnDefinitions = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(workspaceColumnMetadata).map(([key, value]) => [
          key,
          { name: key, semanticType: value.modelingType },
        ])
      ),
    [workspaceColumnMetadata]
  );
  const workspaceColumnLabels = useMemo(
    () => Object.fromEntries(workspaceAllColumns.map((column) => [column, workspaceColumnMetadata[column]?.displayName || column])),
    [workspaceAllColumns, workspaceColumnMetadata]
  );
  const workspaceOrderedVisibleColumns = useMemo(() => {
    const source = workspaceTableLayoutState.columnOrder.length ? workspaceTableLayoutState.columnOrder : workspaceAllColumns;
    const visibleSet = new Set(
      (workspaceTableLayoutState.visibleColumns.length ? workspaceTableLayoutState.visibleColumns : workspaceAllColumns).filter((column) =>
        workspaceAllColumns.includes(column)
      )
    );
    return source.filter((column) => visibleSet.has(column));
  }, [workspaceAllColumns, workspaceTableLayoutState.columnOrder, workspaceTableLayoutState.visibleColumns]);
  const tabColumns = activeTab?.type === "data" && activeTab.dataMode === "empty" ? [] : workspaceOrderedVisibleColumns;
  const tabRows =
    activeTab?.type === "data" && activeTab.dataMode === "empty"
      ? []
      : customWorkspace
      ? customDisplayedRows
      : displayedRows;
  const derivedDependencyMap = useMemo(
    () =>
      Object.fromEntries(
        Object.values(workspaceDerivedColumns).map((definition) => [definition.columnKey, definition.dependencies || []])
      ),
    [workspaceDerivedColumns]
  );
  const formulaHistoryScope = customWorkspace ? `custom:${activeTab?.id || "tab"}` : `linked:${columns.join("|")}:${rows.length}`;
  const inspectorSectionScope = `workspace:${formulaHistoryScope}`;
  const formulaHistory = useMemo(() => {
    const columnKey = workspaceInspectorState.activeColumnKey;
    if (!columnKey || typeof window === "undefined") return [] as string[];
    try {
      const raw = window.localStorage.getItem(getFormulaHistoryKey(formulaHistoryScope, columnKey));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [workspaceInspectorState.activeColumnKey, formulaHistoryScope]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawColumn = window.localStorage.getItem(`columnInspectorSections:${inspectorSectionScope}`);
      setColumnInspectorSections(rawColumn ? { ...DEFAULT_COLUMN_INSPECTOR_SECTIONS, ...JSON.parse(rawColumn) } : DEFAULT_COLUMN_INSPECTOR_SECTIONS);
    } catch {
      setColumnInspectorSections(DEFAULT_COLUMN_INSPECTOR_SECTIONS);
    }
  }, [inspectorSectionScope]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(`columnInspectorSections:${inspectorSectionScope}`, JSON.stringify(columnInspectorSections));
  }, [inspectorSectionScope, columnInspectorSections]);

  const setWorkspaceInspectorState = (patch: Partial<TableInspectorState>) => {
    const normalizedPatch: Partial<TableInspectorState> = { ...patch };
    if (normalizedPatch.rightPanelOpen) {
      normalizedPatch.leftPanelOpen = true;
      normalizedPatch.rightPanelOpen = false;
    }
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => ({
        ...state,
        inspectorState: { ...state.inspectorState, ...normalizedPatch, rightPanelOpen: false },
      }));
      return;
    }
    setInspectorState({ ...normalizedPatch, rightPanelOpen: false });
  };

  const setWorkspaceTableLayoutState = (patch: Partial<TableLayoutState>) => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => ({
        ...state,
        tableLayoutState: { ...state.tableLayoutState, ...patch },
      }));
      return;
    }
    setTableLayoutState(patch);
  };

  useLayoutEffect(() => {
    if (!layoutSessionKey) return;
    if (!workspaceAllColumns.length) return;
    if (lastLayoutSessionKeyRef.current === layoutSessionKey) return;
    lastLayoutSessionKeyRef.current = layoutSessionKey;
    const nextColumns = [...workspaceAllColumns];
    setWorkspaceTableLayoutState({
      visibleColumns: nextColumns,
      pinnedColumns: [],
      columnWidths: {},
      columnOrder: nextColumns,
    });
  }, [layoutSessionKey, setWorkspaceTableLayoutState, workspaceAllColumns]);

  const setWorkspaceSearchQuery = (query: string) => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => {
        const nextState = { ...state, searchQuery: query };
        return {
          ...nextState,
          columnMetadata: refreshMetadataStats({ columnMetadata: nextState.columnMetadata }, getCustomAnalysisRows(nextState)),
        };
      });
      return;
    }
    setSearchQuery(query);
  };

  const setWorkspaceActiveCell = (patch: { rowId?: number; columnKey?: string }) => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => ({
        ...state,
        activeCell: { ...(state.activeCell || {}), ...patch },
      }));
      return;
    }
    setActiveCell(patch);
  };

  const setWorkspaceSelectedRowIds = (ids: number[]) => {
    if (customWorkspace && activeTab?.id) {
      const normalized = Array.from(new Set((ids || []).map((id) => Number(id)).filter((id) => Number.isFinite(id))));
      updateCustomWorkspace(activeTab.id, (state) => {
        const nextRowStates: Record<number, RowState> = { ...state.rowStates };
        for (const row of state.masterDataset) {
          const rowId = Number(row.__row_index__);
          nextRowStates[rowId] = { ...(nextRowStates[rowId] || DEFAULT_ROW_STATE), selected: normalized.includes(rowId) };
        }
        return {
          ...state,
          rowStates: nextRowStates,
          selectedRowIds: normalized,
          inspectorState: { ...state.inspectorState, activeRowId: normalized[0] },
        };
      });
      return;
    }
    setSelectedRowIds(ids);
  };

  const setWorkspaceRowState = (rowId: number, patch: Partial<RowState>) => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => {
        const nextRowStates = { ...state.rowStates, [rowId]: { ...(state.rowStates[rowId] || DEFAULT_ROW_STATE), ...patch } };
        const nextState = { ...state, rowStates: nextRowStates, selectedRowIds: syncSelectedRowIds(nextRowStates) };
        return {
          ...nextState,
          columnMetadata: refreshMetadataStats({ columnMetadata: nextState.columnMetadata }, getCustomAnalysisRows(nextState)),
        };
      });
      return;
    }
    setRowState(rowId, patch);
  };

  const setWorkspaceRowsExcluded = (rowIds: number[], excluded: boolean) => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => {
        const nextRowStates = { ...state.rowStates };
        for (const rowId of rowIds) {
          nextRowStates[Number(rowId)] = { ...(nextRowStates[Number(rowId)] || DEFAULT_ROW_STATE), excluded };
        }
        const nextState = { ...state, rowStates: nextRowStates };
        return {
          ...nextState,
          columnMetadata: refreshMetadataStats({ columnMetadata: nextState.columnMetadata }, getCustomAnalysisRows(nextState)),
        };
      });
      return;
    }
    setRowsExcluded(rowIds, excluded);
  };

  const setWorkspaceRowsHidden = (rowIds: number[], hidden: boolean) => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => {
        const nextRowStates = { ...state.rowStates };
        for (const rowId of rowIds) {
          nextRowStates[Number(rowId)] = { ...(nextRowStates[Number(rowId)] || DEFAULT_ROW_STATE), hidden };
        }
        const nextState = { ...state, rowStates: nextRowStates };
        return {
          ...nextState,
          columnMetadata: refreshMetadataStats({ columnMetadata: nextState.columnMetadata }, getCustomAnalysisRows(nextState)),
        };
      });
      return;
    }
    setRowsHidden(rowIds, hidden);
  };

  const setWorkspaceRowsLabeled = (rowIds: number[], labeled: boolean) => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => {
        const nextRowStates = { ...state.rowStates };
        for (const rowId of rowIds) {
          nextRowStates[Number(rowId)] = { ...(nextRowStates[Number(rowId)] || DEFAULT_ROW_STATE), labeled };
        }
        return { ...state, rowStates: nextRowStates };
      });
      return;
    }
    setRowsLabeled(rowIds, labeled);
  };

  const clearWorkspaceAllRowStateFlags = () => {
    if (customWorkspace && activeTab?.id) {
      setCustomTabValueCellStates((prev) => ({ ...prev, [activeTab.id]: {} }));
      updateCustomWorkspace(activeTab.id, (state) => {
        const nextRowStates: Record<number, RowState> = {};
        for (const row of state.masterDataset) {
          nextRowStates[Number(row.__row_index__)] = { ...DEFAULT_ROW_STATE };
        }
        const nextState = { ...state, rowStates: nextRowStates, selectedRowIds: [] };
        return {
          ...nextState,
          columnMetadata: refreshMetadataStats({ columnMetadata: nextState.columnMetadata }, getCustomAnalysisRows(nextState)),
        };
      });
      return;
    }
    setLinkedValueCellStates({});
    clearAllRowStateFlags();
  };

  const setWorkspaceColumnFilter = (columnKey: string, filter: ColumnFilterState) => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => {
        const nextState = {
          ...state,
          columnFilters: { ...state.columnFilters, [columnKey]: filter },
          inspectorState: { ...state.inspectorState, activeColumnKey: columnKey, bottomPanelOpen: true, bottomPanelTab: "distribution" },
        };
        return {
          ...nextState,
          columnMetadata: refreshMetadataStats({ columnMetadata: nextState.columnMetadata }, getCustomAnalysisRows(nextState)),
        };
      });
      return;
    }
    setColumnFilter(columnKey, filter);
  };

  const clearWorkspaceColumnFilter = (columnKey: string) => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => {
        const nextFilters = { ...state.columnFilters };
        delete nextFilters[columnKey];
        const nextState = { ...state, columnFilters: nextFilters };
        return {
          ...nextState,
          columnMetadata: refreshMetadataStats({ columnMetadata: nextState.columnMetadata }, getCustomAnalysisRows(nextState)),
        };
      });
      return;
    }
    clearColumnFilter(columnKey);
  };

  const clearWorkspaceAllFilters = () => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => {
        const nextState = { ...state, columnFilters: {}, searchQuery: "" };
        return {
          ...nextState,
          columnMetadata: refreshMetadataStats({ columnMetadata: nextState.columnMetadata }, getCustomAnalysisRows(nextState)),
        };
      });
      return;
    }
    clearAllFilters();
  };

  const setWorkspaceSortRules = (rules: SortRule[]) => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => ({ ...state, sortRules: rules }));
      return;
    }
    setSortRules(rules);
  };

  const clearWorkspaceSortRules = () => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => ({ ...state, sortRules: [] }));
      return;
    }
    clearSortRules();
  };

  const setWorkspaceColumnDisplayName = (columnKey: string, displayName: string) => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => ({
        ...state,
        columnMetadata: {
          ...state.columnMetadata,
          [columnKey]: { ...state.columnMetadata[columnKey], displayName: displayName || columnKey },
        },
      }));
      return;
    }
    setColumnDisplayName(columnKey, displayName);
  };

  const setWorkspaceColumnGroup = (columnKey: string, groupName?: string) => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => ({
        ...state,
        columnMetadata: {
          ...state.columnMetadata,
          [columnKey]: { ...state.columnMetadata[columnKey], group: groupName },
        },
      }));
      return;
    }
    setColumnGroup(columnKey, groupName);
  };

  const setWorkspaceColumnUnits = (columnKey: string, units?: string) => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => ({
        ...state,
        columnMetadata: {
          ...state.columnMetadata,
          [columnKey]: { ...state.columnMetadata[columnKey], units },
        },
      }));
      return;
    }
    setColumnUnits(columnKey, units);
  };

  const persistFormulaHistory = (columnKey: string, formula: string) => {
    if (!columnKey || !formula || typeof window === "undefined") return;
    const storageKey = getFormulaHistoryKey(formulaHistoryScope, columnKey);
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      const history = Array.isArray(parsed) ? parsed : [];
      const next = [formula, ...history.filter((entry: string) => entry !== formula)].slice(0, 12);
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // ignore local history persistence failures
    }
  };

  const setWorkspaceColumnType = (columnKey: string, modelingType: ColumnMetadata["modelingType"]) => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => {
        const nextMetadata = {
          ...state.columnMetadata,
          [columnKey]: {
            ...state.columnMetadata[columnKey],
            modelingType,
          },
        };
        return {
          ...state,
          columnMetadata: refreshMetadataStats({ columnMetadata: nextMetadata }, getCustomAnalysisRows({ ...state, columnMetadata: nextMetadata })),
        };
      });
      return;
    }
    useDataWorkbenchStore.getState().setColumnType(columnKey, modelingType);
  };

  const updateWorkspaceCell = (rowId: number, columnKey: string, value: any) => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => {
        const nextSource = state.sourceDataset.map((row) =>
          Number(row.__row_index__) === Number(rowId) ? { ...row, [columnKey]: value } : row
        );
        const nextMaster = applyDerivedColumns(nextSource, state.derivedColumns);
        const nextState = { ...state, sourceDataset: nextSource, masterDataset: nextMaster };
        return {
          ...nextState,
          columnMetadata: refreshMetadataStats({ columnMetadata: nextState.columnMetadata }, getCustomAnalysisRows(nextState)),
        };
      });
      return;
    }
    updateCell(rowId, columnKey, value);
  };

  const createWorkspaceFormulaColumn = (payload: { formula: string; columnKey?: string; newColumnName?: string }) => {
    if (customWorkspace && activeTab?.id) {
      let result: { ok: boolean; columnKey?: string; error?: string } = { ok: false, error: "Unknown error" };
      updateCustomWorkspace(activeTab.id, (state) => {
        const nextColumnKey = sanitizeColumnKey(payload.columnKey || payload.newColumnName || `derived_${Object.keys(state.derivedColumns).length + 1}`);
        if (!nextColumnKey) {
          result = { ok: false, error: "Column name required" };
          return state;
        }
        const evaluator = buildFormulaEvaluator(payload.formula);
        if (!evaluator) {
          result = { ok: false, error: "Invalid formula syntax" };
          return state;
        }
        const knownColumns = Array.from(new Set([...Object.keys(state.columnMetadata), ...Object.keys(state.derivedColumns)]));
        const nextOrder = Math.max(0, ...Object.values(state.derivedColumns).map((entry) => entry.order || 0)) + 1;
        const nextDerivedColumns = {
          ...state.derivedColumns,
          [nextColumnKey]: {
            kind: "formula",
            columnKey: nextColumnKey,
            formula: payload.formula,
            dependencies: extractFormulaDependencies(payload.formula, knownColumns).filter((dependency) => dependency !== nextColumnKey),
            order: state.derivedColumns[nextColumnKey]?.order ?? nextOrder,
          } as DerivedColumnDefinition,
        };
        const nextMaster = applyDerivedColumns(state.sourceDataset, nextDerivedColumns);
        const nextMetadata = buildColumnMetadata(
          nextMaster,
          [...Object.keys(state.columnMetadata).filter((column) => column !== nextColumnKey), nextColumnKey],
          {
            ...state.columnMetadata,
            [nextColumnKey]: {
              key: nextColumnKey,
              name: nextColumnKey,
              displayName: payload.newColumnName?.trim() || nextColumnKey,
              modelingType: state.columnMetadata[nextColumnKey]?.modelingType || "continuous",
              derived: true,
              formula: payload.formula,
            },
          }
        );
        result = { ok: true, columnKey: nextColumnKey };
        return {
          ...state,
          masterDataset: nextMaster,
          derivedColumns: nextDerivedColumns,
          columnMetadata: refreshMetadataStats({ columnMetadata: nextMetadata }, getCustomAnalysisRows({
            ...state,
            masterDataset: nextMaster,
            derivedColumns: nextDerivedColumns,
            columnMetadata: nextMetadata,
          })),
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
        };
      });
      return result;
    }
    return createFormulaColumn(payload);
  };

  const createWorkspaceEmptyColumn = (payload: { newColumnName: string; initialValue?: any }) => {
    if (customWorkspace && activeTab?.id) {
      let result: { ok: boolean; columnKey?: string; error?: string } = { ok: false, error: "Unknown error" };
      updateCustomWorkspace(activeTab.id, (state) => {
        const nextColumnKey = sanitizeColumnKey(payload.newColumnName || "");
        if (!nextColumnKey) {
          result = { ok: false, error: "Column name required" };
          return state;
        }
        if (state.columnMetadata[nextColumnKey]) {
          result = { ok: false, error: "Column already exists" };
          return state;
        }
        const nextSource = state.sourceDataset.map((row) => ({ ...row, [nextColumnKey]: payload.initialValue ?? null }));
        const nextMaster = applyDerivedColumns(nextSource, state.derivedColumns);
        const nextMetadata = buildColumnMetadata(
          nextMaster,
          [...Object.keys(state.columnMetadata), nextColumnKey],
          {
            ...state.columnMetadata,
            [nextColumnKey]: {
              key: nextColumnKey,
              name: nextColumnKey,
              displayName: payload.newColumnName.trim() || nextColumnKey,
              modelingType: "nominal",
            },
          }
        );
        result = { ok: true, columnKey: nextColumnKey };
        return {
          ...state,
          sourceDataset: nextSource,
          masterDataset: nextMaster,
          columnMetadata: refreshMetadataStats({ columnMetadata: nextMetadata }, getCustomAnalysisRows({
            ...state,
            sourceDataset: nextSource,
            masterDataset: nextMaster,
            columnMetadata: nextMetadata,
          })),
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
        };
      });
      return result;
    }
    return createEmptyColumn(payload);
  };

  const recodeWorkspaceColumn = (payload: { sourceColumn: string; mapping: Record<string, string>; newColumnName?: string; keepUnmapped?: boolean }) => {
    if (customWorkspace && activeTab?.id) {
      let result: { ok: boolean; columnKey?: string; error?: string } = { ok: false, error: "Unknown error" };
      updateCustomWorkspace(activeTab.id, (state) => {
        const nextColumnKey = sanitizeColumnKey(payload.newColumnName || `${payload.sourceColumn}_recode`);
        if (!nextColumnKey) {
          result = { ok: false, error: "Column name required" };
          return state;
        }
        const nextOrder = Math.max(0, ...Object.values(state.derivedColumns).map((entry) => entry.order || 0)) + 1;
        const nextDerivedColumns = {
          ...state.derivedColumns,
          [nextColumnKey]: {
            kind: "recode",
            columnKey: nextColumnKey,
            sourceColumn: payload.sourceColumn,
            mapping: payload.mapping,
            keepUnmapped: payload.keepUnmapped ?? true,
            dependencies: [payload.sourceColumn],
            order: state.derivedColumns[nextColumnKey]?.order ?? nextOrder,
          } as DerivedColumnDefinition,
        };
        const nextMaster = applyDerivedColumns(state.sourceDataset, nextDerivedColumns);
        const nextMetadata = buildColumnMetadata(
          nextMaster,
          [...Object.keys(state.columnMetadata).filter((column) => column !== nextColumnKey), nextColumnKey],
          {
            ...state.columnMetadata,
            [nextColumnKey]: {
              key: nextColumnKey,
              name: nextColumnKey,
              displayName: payload.newColumnName?.trim() || nextColumnKey,
              modelingType: "nominal",
              derived: true,
              description: `Recoded from ${payload.sourceColumn}`,
            },
          }
        );
        result = { ok: true, columnKey: nextColumnKey };
        return {
          ...state,
          masterDataset: nextMaster,
          derivedColumns: nextDerivedColumns,
          columnMetadata: refreshMetadataStats({ columnMetadata: nextMetadata }, getCustomAnalysisRows({
            ...state,
            masterDataset: nextMaster,
            derivedColumns: nextDerivedColumns,
            columnMetadata: nextMetadata,
          })),
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
        };
      });
      return result;
    }
    return recodeColumn(payload);
  };

  const pinWorkspaceColumn = (columnKey: string, pinned: "left" | "right" | null) => {
    if (gridApiRef.current && typeof (gridApiRef.current as any).applyColumnState === "function") {
      (gridApiRef.current as any).applyColumnState({
        state: [{ colId: columnKey, pinned }],
        defaultState: {},
      });
    }
    const currentPinned = new Set(workspaceTableLayoutState.pinnedColumns || []);
    if (pinned) currentPinned.add(columnKey);
    else currentPinned.delete(columnKey);
    setWorkspaceTableLayoutState({ pinnedColumns: Array.from(currentPinned) });
  };

  const applyFillDown = (rowId: number, columnKey: string) => {
    const nextIds = Array.from(new Set((workspaceSelectedRowIds.length ? workspaceSelectedRowIds : [rowId]).map(Number))).sort((a, b) => a - b);
    if (nextIds.length <= 1) return;
    const preview = buildFillPreviewPlan({
      rows: workspaceMasterDataset,
      columnKey,
      startRowId: rowId,
      endRowId: nextIds[nextIds.length - 1],
      seedRowIds: nextIds.includes(rowId) ? nextIds.filter((id) => id <= rowId) : [rowId],
    });
    Object.entries(preview.values).forEach(([targetRowId, value]) => {
      updateWorkspaceCell(Number(targetRowId), columnKey, coerceValueForColumn(columnKey, value));
    });
  };

  const clearSelectedCells = (columnKey?: string) => {
    if (!columnKey) return;
    const targetIds = Array.from(new Set(workspaceSelectedRowIds.map(Number)));
    targetIds.forEach((rowId) => updateWorkspaceCell(rowId, columnKey, null));
  };

  const insertWorkspaceRow = (position: "above" | "below", anchorRowId?: number) => {
    if (customWorkspace && activeTab?.id) {
      let insertedRowId: number | undefined;
      updateCustomWorkspace(activeTab.id, (state) => {
        const sourceRows = [...state.sourceDataset];
        const anchorIndex =
          anchorRowId !== undefined ? sourceRows.findIndex((row) => Number(row.__row_index__) === Number(anchorRowId)) : sourceRows.length - 1;
        const insertIndex = anchorIndex < 0 ? sourceRows.length : position === "above" ? anchorIndex : anchorIndex + 1;
        const blankRow = { __row_index__: -1 } as WorkbenchRow;
        for (const key of Object.keys(state.columnMetadata)) {
          if (key === "__row_index__") continue;
          blankRow[key] = null;
        }
        sourceRows.splice(Math.max(0, insertIndex), 0, blankRow);
        const nextSource = ensureRowIndices(sourceRows.map((row, index) => ({ ...row, __row_index__: index })));
        const nextMaster = applyDerivedColumns(nextSource, state.derivedColumns);
        const nextRowStates: Record<number, RowState> = {};
        for (let index = 0; index < nextSource.length; index += 1) {
          if (index < insertIndex) nextRowStates[index] = { ...(state.rowStates[index] || DEFAULT_ROW_STATE) };
          else if (index === insertIndex) nextRowStates[index] = { ...DEFAULT_ROW_STATE };
          else nextRowStates[index] = { ...(state.rowStates[index - 1] || DEFAULT_ROW_STATE) };
        }
        insertedRowId = insertIndex;
        const nextState = {
          ...state,
          sourceDataset: nextSource,
          masterDataset: nextMaster,
          rowStates: nextRowStates,
          selectedRowIds: [],
          activeCell: { rowId: insertIndex, columnKey: state.activeCell?.columnKey },
          inspectorState: { ...state.inspectorState, activeRowId: insertIndex },
        } as any;
        return {
          ...nextState,
          columnMetadata: refreshMetadataStats({ columnMetadata: nextState.columnMetadata }, getCustomAnalysisRows(nextState)),
        };
      });
      return insertedRowId;
    }
    return insertRow({ anchorRowId, position }).rowId;
  };

  const duplicateWorkspaceRows = (rowIds: number[]) => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => {
        const normalizedIds = Array.from(new Set((rowIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)))).sort((a, b) => a - b);
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
        const nextSource = ensureRowIndices(sourceRows.map((row, index) => ({ ...row, __row_index__: index })));
        const nextMaster = applyDerivedColumns(nextSource, state.derivedColumns);
        const nextRowStates: Record<number, RowState> = {};
        const duplicatedIds: number[] = [];
        let sourcePointer = 0;
        for (let index = 0; index < nextSource.length; index += 1) {
          const nextRowComparable = { ...nextSource[index] } as any;
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
        const nextState = {
          ...state,
          sourceDataset: nextSource,
          masterDataset: nextMaster,
          rowStates: nextRowStates,
          selectedRowIds: duplicatedIds,
          inspectorState: { ...state.inspectorState, activeRowId: duplicatedIds[0] },
        } as any;
        return {
          ...nextState,
          columnMetadata: refreshMetadataStats({ columnMetadata: nextState.columnMetadata }, getCustomAnalysisRows(nextState)),
        };
      });
      return;
    }
    duplicateRows(rowIds);
  };

  const deleteWorkspaceRows = (rowIds: number[]) => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => {
        const idsToDelete = new Set((rowIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)));
        const filteredSource = state.sourceDataset.filter((row) => !idsToDelete.has(Number(row.__row_index__)));
        const nextSource = ensureRowIndices(filteredSource.map((row, index) => ({ ...row, __row_index__: index })));
        const nextMaster = applyDerivedColumns(nextSource, state.derivedColumns);
        const nextRowStates: Record<number, RowState> = {};
        let sourcePointer = 0;
        for (let index = 0; index < nextSource.length; index += 1) {
          while (idsToDelete.has(sourcePointer)) sourcePointer += 1;
          nextRowStates[index] = { ...(state.rowStates[sourcePointer] || DEFAULT_ROW_STATE) };
          sourcePointer += 1;
        }
        const nextState = {
          ...state,
          sourceDataset: nextSource,
          masterDataset: nextMaster,
          rowStates: nextRowStates,
          selectedRowIds: [],
          activeCell: { ...state.activeCell, rowId: undefined },
          inspectorState: { ...state.inspectorState, activeRowId: undefined },
        } as any;
        return {
          ...nextState,
          columnMetadata: refreshMetadataStats({ columnMetadata: nextState.columnMetadata }, getCustomAnalysisRows(nextState)),
        };
      });
      return;
    }
    deleteRows(rowIds);
  };

  const pasteMatrixIntoWorkspace = (startRowId: number, startColumnKey: string, matrix: string[][]) => {
    const plan = resolvePastePlan(matrix, workspaceOrderedVisibleColumns, workspaceColumnMetadata, startColumnKey);
    if (!plan.columnOrder.length) return;
    const effectiveMatrix = matrix.slice(plan.rowOffset);
    const requiredRowCount = startRowId + effectiveMatrix.length;
    let currentRowCount = workspaceMasterDataset.length;
    while (currentRowCount < requiredRowCount) {
      const inserted = insertWorkspaceRow("below", currentRowCount ? currentRowCount - 1 : undefined);
      if (inserted === undefined) break;
      currentRowCount += 1;
    }

    effectiveMatrix.forEach((rowValues, rowOffset) => {
      const targetRowId = startRowId + rowOffset;
      rowValues.forEach((cellValue, columnOffset) => {
        const targetColumnKey = plan.columnOrder[columnOffset];
        if (!targetColumnKey) return;
        updateWorkspaceCell(targetRowId, targetColumnKey, coerceValueForColumn(targetColumnKey, cellValue));
      });
    });
    setPasteStatus(
      plan.mode === "header-match"
        ? `Pasted ${effectiveMatrix.length} row(s) using header alignment.`
        : `Pasted ${effectiveMatrix.length} row(s) at current position.`
    );
    window.setTimeout(() => setPasteStatus(""), 2200);
  };

  const applyFindReplace = () => {
    if (!findValue) return;
    const targetColumns = findColumnScope === "__all__" ? workspaceOrderedVisibleColumns : [findColumnScope];
    const matcher = findUseRegex ? new RegExp(findValue, findCaseSensitive ? "g" : "gi") : null;

    for (const row of workspaceMasterDataset) {
      const rowId = Number(row.__row_index__);
      for (const columnKey of targetColumns) {
        const current = String(row[columnKey] ?? "");
        const source = findCaseSensitive ? current : current.toLowerCase();
        const needle = findCaseSensitive ? findValue : findValue.toLowerCase();
        const matched = matcher ? new RegExp(matcher.source, matcher.flags).test(current) : source.includes(needle);
        if (!matched) continue;
        const nextValue = matcher ? current.replace(matcher, replaceValue) : current.split(findValue).join(replaceValue);
        updateWorkspaceCell(rowId, columnKey, coerceValueForColumn(columnKey, nextValue));
      }
    }
  };

  const deleteWorkspaceDerivedColumn = (columnKey: string) => {
    if (customWorkspace && activeTab?.id) {
      updateCustomWorkspace(activeTab.id, (state) => {
        if (!state.derivedColumns[columnKey]) return state;
        const nextDerivedColumns = { ...state.derivedColumns };
        delete nextDerivedColumns[columnKey];
        const nextMaster = applyDerivedColumns(state.sourceDataset, nextDerivedColumns);
        const nextMetadata = { ...state.columnMetadata };
        delete nextMetadata[columnKey];
        const visibleColumns = state.tableLayoutState.visibleColumns.filter((column) => column !== columnKey);
        const nextState = {
          ...state,
          masterDataset: nextMaster,
          derivedColumns: nextDerivedColumns,
          tableLayoutState: {
            ...state.tableLayoutState,
            visibleColumns,
            columnOrder: state.tableLayoutState.columnOrder.filter((column) => column !== columnKey),
          },
          inspectorState: {
            ...state.inspectorState,
            activeColumnKey: state.inspectorState.activeColumnKey === columnKey ? undefined : state.inspectorState.activeColumnKey,
          },
        };
        return {
          ...nextState,
          columnMetadata: refreshMetadataStats({ columnMetadata: nextMetadata }, getCustomAnalysisRows({ ...nextState, columnMetadata: nextMetadata })),
        };
      });
      return;
    }
    deleteDerivedColumn(columnKey);
  };

  const colDefs = useMemo<ColDef<WorkbenchRow>[]>(() => {
    const utilityColumns: ColDef<WorkbenchRow>[] = [
      {
        colId: "__row_state__",
        headerName: "State",
        pinned: "left",
        lockPinned: true,
        suppressMovable: true,
        sortable: false,
        editable: false,
        filter: false,
        resizable: false,
        width: WORKBENCH_STATE_COLUMN_WIDTH,
        minWidth: WORKBENCH_STATE_COLUMN_WIDTH,
        maxWidth: WORKBENCH_STATE_COLUMN_WIDTH,
        cellClass: "scientific-grid__utility-cell",
        headerClass: "scientific-grid__utility-header",
        cellRenderer: (params: ICellRendererParams<WorkbenchRow>) => {
          const rowId = Number(params.data?.__row_index__);
          if (!Number.isFinite(rowId)) return null;
          return (
            <RowStateCell
              rowId={rowId}
              rowState={workspaceRowStates[rowId]}
              onToggle={(patch) => {
                if (patch.excluded === true && selectedCellTargets.length) {
                  excludeSelectedCells();
                  return;
                }
                const nextPatch = { ...patch };
                if ("selected" in patch) {
                  const nextSelected = Boolean(patch.selected);
                  const selected = new Set(workspaceSelectedRowIds.map(Number));
                  if (nextSelected) selected.add(rowId);
                  else selected.delete(rowId);
                  setWorkspaceSelectedRowIds(Array.from(selected));
                  delete (nextPatch as any).selected;
                }
                if (Object.keys(nextPatch).length) setWorkspaceRowState(rowId, nextPatch);
              }}
            />
          );
        },
      },
      {
        colId: "__row_number__",
        headerName: "#",
        pinned: "left",
        lockPinned: true,
        suppressMovable: true,
        sortable: false,
        editable: false,
        filter: false,
        resizable: false,
        width: WORKBENCH_INDEX_COLUMN_WIDTH,
        minWidth: WORKBENCH_INDEX_COLUMN_WIDTH,
        maxWidth: WORKBENCH_INDEX_COLUMN_WIDTH,
        cellClass: "scientific-grid__row-number-cell",
        headerClass: "scientific-grid__utility-header scientific-grid__row-number-header",
        cellRenderer: RowIndexCell,
      },
    ];

    const dataColumns = tabColumns.map((column) => ({
      field: column,
      headerName: workspaceColumnLabels[column] || column,
      editable: true,
      sortable: true,
      filter: false,
      minWidth: 170,
      resizable: true,
      headerClass: [
        "scientific-grid__data-header",
        workspaceInspectorState.activeColumnKey === column ? "scientific-grid__header-cell--active-column" : "",
      ]
        .filter(Boolean)
        .join(" "),
      headerComponent: ScientificColumnHeader,
      headerComponentParams: {
        rows: workspaceMasterDataset,
        metadataOverride: workspaceColumnMetadata[column],
        filterOverride: workspaceColumnFilters[column],
        sortRuleOverride: workspaceSortRules.find((rule) => rule.columnKey === column),
        onOpenFilter: (columnKey: string) =>
          setWorkspaceInspectorState({
            activeColumnKey: columnKey,
            leftPanelOpen: true,
            rightPanelOpen: true,
            bottomPanelOpen: true,
            bottomPanelTab: "distribution",
          }),
        onOpenDistribution: (columnKey: string) =>
          setWorkspaceInspectorState({
            activeColumnKey: columnKey,
            rightPanelOpen: true,
            bottomPanelOpen: true,
            bottomPanelTab: "distribution",
          }),
        onOpenInspector: (columnKey: string) => {
          setWorkspaceInspectorState({
            activeColumnKey: columnKey,
            rightPanelOpen: true,
          });
        },
        onOpenMetadata: (columnKey: string) => {
          setWorkspaceInspectorState({
            activeColumnKey: columnKey,
            rightPanelOpen: true,
          });
          setColumnInfoCompact(true);
          setColumnInfoOpen(true);
        },
        onSelectColumnRange: (columnKey: string) => {
          applyColumnRangeSelection([columnKey]);
        },
        onStartColumnSweep: (columnKey: string) => {
          setColumnSweepSelection({ anchorColumnKey: columnKey });
          applyColumnRangeSelection([columnKey]);
        },
        onSweepColumnHover: (columnKey: string) => {
          if (!columnSweepSelection) return;
          updateSweptColumnSelection(columnSweepSelection.anchorColumnKey, columnKey);
        },
        onRenameColumn: (columnKey: string, nextLabel?: string) => {
          if (typeof nextLabel === "string") {
            setWorkspaceColumnDisplayName(columnKey, nextLabel);
            return;
          }
          setWorkspaceInspectorState({
            activeColumnKey: columnKey,
            rightPanelOpen: true,
          });
          setColumnInfoCompact(true);
          setColumnInfoOpen(true);
        },
        onSetUnits: (columnKey: string) => {
          const nextUnits = window.prompt("Column units", workspaceColumnMetadata[columnKey]?.units || "");
          if (nextUnits !== null) setWorkspaceColumnUnits(columnKey, nextUnits || undefined);
        },
        onCreateFormula: (columnKey: string) => {
          setDerivedDialogColumnKey(columnKey);
          setDerivedDialogMode("formula");
        },
        onRecode: (columnKey: string) => {
          setDerivedDialogColumnKey(columnKey);
          setDerivedDialogMode("recode");
        },
        onHideColumn: (columnKey: string) => {
          setWorkspaceTableLayoutState({
            visibleColumns: workspaceOrderedVisibleColumns.filter((item) => item !== columnKey),
          });
        },
        onDeleteDerived: (columnKey: string) => {
          deleteWorkspaceDerivedColumn(columnKey);
        },
        onAddToGraph: (columnKey: string) => {
          if (customWorkspace) return;
          const next = tabs.filter((t) => t.type === "chart").length + 1;
          const isContinuous = workspaceColumnDefinitions[columnKey]?.semanticType === "continuous";
          const tab = newChartTab(next, {
            xColumn: isContinuous ? defaultX : columnKey,
            yColumn: isContinuous ? columnKey : defaultY,
            title: `${workspaceColumnLabels[columnKey] || columnKey} View`,
          });
          setTabs((prev) => [...prev, tab]);
          setActiveTabId(tab.id);
        },
        onQuickChart: (columnKey: string, mode: "histogram" | "box" | "scatter" | "trend") => {
          if (mode === "histogram") {
            setWorkspaceInspectorState({
              activeColumnKey: columnKey,
              rightPanelOpen: true,
              bottomPanelOpen: true,
              bottomPanelTab: "distribution",
            });
            return;
          }
          if (mode === "box") {
            const next = tabs.filter((t) => t.type === "graph_builder").length + 1;
            const tab: WorkbenchTab = {
              id: `graph-builder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              type: "graph_builder",
              label: `${workspaceColumnLabels[columnKey] || columnKey} Box`,
              graphBuilderRows: customWorkspace ? customAnalysisRows : analysisRows,
              graphBuilderColumns: workspaceAllColumns,
              graphBuilderColumnLabels: workspaceColumnLabels,
              graphBuilderState: {
                roles: { y: [columnKey], overlay: [] },
                config: { ...makeDefaultGraphBuilderState().config, chartType: "box", title: `${workspaceColumnLabels[columnKey] || columnKey} Box Plot` },
              },
            };
            setTabs((prev) => [...prev, tab]);
            setActiveTabId(tab.id);
            return;
          }
          if (mode === "trend") {
            const next = tabs.filter((t) => t.type === "graph_builder").length + 1;
            const xColumn = workspaceColumnDefinitions[columnKey]?.semanticType === "datetime" ? columnKey : defaultX;
            const yColumn = workspaceColumnDefinitions[columnKey]?.semanticType === "datetime" ? defaultY : columnKey;
            const tab: WorkbenchTab = {
              id: `graph-builder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              type: "graph_builder",
              label: `${workspaceColumnLabels[columnKey] || columnKey} Trend`,
              graphBuilderRows: customWorkspace ? customAnalysisRows : analysisRows,
              graphBuilderColumns: workspaceAllColumns,
              graphBuilderColumnLabels: workspaceColumnLabels,
              graphBuilderState: {
                roles: { x: xColumn, y: yColumn ? [yColumn] : [], overlay: [] },
                config: { ...makeDefaultGraphBuilderState().config, chartType: "line", title: `${workspaceColumnLabels[columnKey] || columnKey} Trend` },
              },
            };
            setTabs((prev) => [...prev, tab]);
            setActiveTabId(tab.id);
            return;
          }
          const next = tabs.filter((t) => t.type === "chart").length + 1;
          const tab = newChartTab(next, {
            chartType: "scatter",
            xColumn: workspaceColumnDefinitions[columnKey]?.semanticType === "continuous" ? defaultX : columnKey,
            yColumn: workspaceColumnDefinitions[columnKey]?.semanticType === "continuous" ? columnKey : defaultY,
            title: `${workspaceColumnLabels[columnKey] || columnKey} Scatter`,
          });
          setTabs((prev) => [...prev, tab]);
          setActiveTabId(tab.id);
        },
        onPinLeft: (columnKey: string) => pinWorkspaceColumn(columnKey, "left"),
        onPinRight: (columnKey: string) => pinWorkspaceColumn(columnKey, "right"),
        onUnpin: (columnKey: string) => pinWorkspaceColumn(columnKey, null),
        onSetType: (columnKey: string, type: any) => setWorkspaceColumnType(columnKey, type),
        onSetFilterValue: (columnKey: string, filter: ColumnFilterState) => setWorkspaceColumnFilter(columnKey, filter),
        onClearFilterValue: (columnKey: string) => clearWorkspaceColumnFilter(columnKey),
      },
      valueParser: (params) => params.newValue,
      cellClass: (params) => {
        const rowId = Number(params.data?.__row_index__);
        const rowState = workspaceRowStates[rowId];
        const cellState = currentValueCellStates[getValueCellStateKey(rowId, String(params.colDef.field || ""))];
        const isFillPreview =
          fillPreview?.columnKey === params.colDef.field && fillPreview.rowIds.includes(rowId);
        return [
          "scientific-grid__data-cell",
          params.colDef.field === workspaceInspectorState.activeColumnKey ? "scientific-grid__cell--active-column" : "",
          params.colDef.field === workspaceInspectorState.activeColumnKey && rowState?.selected ? "scientific-grid__cell--active-column-selected-row" : "",
          selectedCellTargetLookup.has(`${rowId}:${String(params.colDef.field || "")}`) ? "scientific-grid__cell--range-selected-explicit" : "",
          rowState?.selected ? "scientific-grid__cell--selected" : "",
          rowState?.excluded ? "scientific-grid__cell--excluded" : "",
          cellState?.excluded ? "scientific-grid__cell--value-excluded" : "",
          cellState?.hidden ? "scientific-grid__cell--value-hidden" : "",
          rowState?.labeled ? "scientific-grid__cell--labeled" : "",
          isFillPreview ? "scientific-grid__cell--fill-preview" : "",
        ]
          .filter(Boolean)
          .join(" ");
      },
    }));

    return [...utilityColumns, ...dataColumns];
  }, [tabColumns, workspaceMasterDataset, workspaceColumnMetadata, workspaceColumnFilters, workspaceSortRules, setWorkspaceInspectorState, workspaceColumnLabels, setWorkspaceColumnDisplayName, setWorkspaceTableLayoutState, workspaceOrderedVisibleColumns, deleteWorkspaceDerivedColumn, tabs, workspaceColumnDefinitions, defaultX, defaultY, workspaceRowStates, customWorkspace, workspaceSelectedRowIds, setWorkspaceColumnUnits, fillPreview, tabRows, setWorkspaceActiveCell, workspaceInspectorState.activeColumnKey, currentValueCellStates, columnSweepSelection]);

  const selectedSet = useMemo(() => new Set(workspaceSelectedRowIds.map(Number)), [workspaceSelectedRowIds]);
  const selectedCellTargetLookup = useMemo(
    () => new Set(selectedCellTargets.map((target) => `${Number(target.rowId)}:${target.columnKey}`)),
    [selectedCellTargets]
  );

  useEffect(() => {
    const api = gridApiRef.current;
    if (!api) return;
    api.forEachNode((node) => {
      const rowId = Number(node.data?.__row_index__);
      const shouldSelect = selectedSet.has(rowId);
      if (node.isSelected() !== shouldSelect) node.setSelected(shouldSelect);
    });
    const first = workspaceSelectedRowIds[0];
    if (first !== undefined && first !== null) {
      const rowIndex = tabRows.findIndex((r) => Number(r.__row_index__) === Number(first));
      if (rowIndex >= 0) api.ensureIndexVisible(rowIndex, "middle");
    }
  }, [selectedSet, workspaceSelectedRowIds, tabRows]);

  useEffect(() => {
    if (activeTab?.type !== "chart" && activeTab?.type !== "graph_builder") return;
    setSelectionPulse(true);
    const timer = window.setTimeout(() => setSelectionPulse(false), 500);
    return () => window.clearTimeout(timer);
  }, [workspaceSelectedRowIds, activeTab?.type]);

  useEffect(() => {
    if (!rowSweepSelection) return;
    const handleMouseUp = () => setRowSweepSelection(null);
    window.addEventListener("mouseup", handleMouseUp, { once: true });
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [rowSweepSelection]);

  useEffect(() => {
    if (!columnSweepSelection) return;
    const handleMouseUp = () => setColumnSweepSelection(null);
    window.addEventListener("mouseup", handleMouseUp, { once: true });
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [columnSweepSelection]);

  useEffect(() => {
    if (!cellSweepSelection) return;
    const handleMove = (event: MouseEvent) => {
      const shell = gridShellRef.current;
      if (!shell || (event.buttons & 1) !== 1) return;
      const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      if (!target || !shell.contains(target)) return;
      const cellElement = target.closest(".ag-cell") as HTMLElement | null;
      const rowElement = target.closest(".ag-row") as HTMLElement | null;
      const columnId = String(cellElement?.getAttribute("col-id") || "");
      const displayIndex = Number(rowElement?.getAttribute("row-index"));
      if (!workspaceOrderedVisibleColumns.includes(columnId) || !Number.isFinite(displayIndex)) return;
      const row = tabRows[displayIndex];
      if (!row) return;
      applyCellRectSelection(
        cellSweepSelection.anchorRowId,
        cellSweepSelection.anchorColumnKey,
        Number(row.__row_index__),
        columnId
      );
    };
    const handleMouseUp = () => setCellSweepSelection(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleMouseUp, { once: true });
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [cellSweepSelection, tabRows, workspaceOrderedVisibleColumns]);

  useEffect(() => {
    const api = gridApiRef.current as any;
    if (!api || typeof api.applyColumnState !== "function") return;
    const visibleColumns = workspaceTableLayoutState.visibleColumns.length ? workspaceTableLayoutState.visibleColumns : workspaceAllColumns;
    const pinnedColumns = new Set(workspaceTableLayoutState.pinnedColumns || []);
    const columnState = workspaceAllColumns.map((columnKey, index) => ({
      colId: columnKey,
      hide: !visibleColumns.includes(columnKey),
      pinned: pinnedColumns.has(columnKey) ? "left" : null,
      width: workspaceTableLayoutState.columnWidths[columnKey],
      order: workspaceTableLayoutState.columnOrder.indexOf(columnKey) >= 0 ? workspaceTableLayoutState.columnOrder.indexOf(columnKey) : index,
    }));
    api.applyColumnState({
      state: columnState,
      applyOrder: true,
    });
  }, [workspaceAllColumns, workspaceTableLayoutState]);

  useEffect(() => {
    if (activeTab?.type !== "data") return;
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "g") {
        event.preventDefault();
        const currentActiveRowId = workspaceInspectorState.activeRowId ?? workspaceSelectedRowIds[0];
        const requested = window.prompt("Go to row number", currentActiveRowId !== undefined ? String(Number(currentActiveRowId) + 1) : "1");
        if (requested === null) return;
        const rowNumber = Number(requested);
        if (!Number.isFinite(rowNumber) || rowNumber < 1) return;
        gridApiRef.current?.ensureIndexVisible(rowNumber - 1, "middle");
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [activeTab?.type, workspaceInspectorState.activeRowId, workspaceSelectedRowIds]);

  useEffect(() => {
    if (activeTab?.type !== "data") return;
    const handleKeydown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier || !event.altKey) return;
      if (event.key === "1") {
        event.preventDefault();
        setWorkspaceInspectorState({ leftPanelOpen: true });
        window.setTimeout(() => {
          columnManagerSearchInputRef.current?.focus();
          columnManagerSearchInputRef.current?.select();
        }, 0);
        return;
      }
      if (event.key === "2") {
        event.preventDefault();
        setWorkspaceInspectorState({ leftPanelOpen: true });
        window.setTimeout(() => {
          filterSelectTriggerRef.current?.focus();
        }, 0);
        return;
      }
      if (event.key === "4") {
        event.preventDefault();
        setWorkspaceInspectorState({ rightPanelOpen: true });
        window.setTimeout(() => {
          columnInspectorFocusRef.current?.focus();
        }, 0);
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [activeTab?.type, setWorkspaceInspectorState]);

  const scatterData = useMemo(() => {
    return activeChartRows
      .map((row) => {
        const x = toNumberOrNull(row[activeChartConfig.xColumn]);
        const y = toNumberOrNull(row[activeChartConfig.yColumn]);
        if (x === null || y === null) return null;
        const rowId = Number(row.__row_index__);
        const state = workspaceRowStates[rowId] || DEFAULT_ROW_STATE;
        return { x, y, rowId, selected: selectedSet.has(rowId), excluded: state.excluded, labeled: state.labeled, hidden: state.hidden };
      })
      .filter(Boolean) as Array<{ x: number; y: number; rowId: number; selected: boolean }>;
  }, [activeChartRows, activeChartConfig.xColumn, activeChartConfig.yColumn, selectedSet, workspaceRowStates]);

  const barData = useMemo(() => {
    const groups = new Map<string, { ids: number[]; y: number[] }>();
    for (const row of activeChartRows) {
      const xRaw = row[activeChartConfig.xColumn];
      const y = toNumberOrNull(row[activeChartConfig.yColumn]);
      if (isMissingValue(xRaw) || y === null) continue;
      const key = String(row[activeChartConfig.xColumn] ?? "");
      if (!groups.has(key)) groups.set(key, { ids: [], y: [] });
      const g = groups.get(key)!;
      g.ids.push(Number(row.__row_index__));
      g.y.push(y);
    }
    const items: Array<{ x: string; y: number; ids: number[]; selectedCount: number; excludedCount: number; labeledCount: number }> = [];
    for (const [x, value] of groups.entries()) {
      const selectedCount = value.ids.filter((id) => selectedSet.has(id)).length;
      const excludedCount = value.ids.filter((id) => workspaceRowStates[id]?.excluded).length;
      const labeledCount = value.ids.filter((id) => workspaceRowStates[id]?.labeled).length;
      items.push({
        x,
        y: value.y.length ? value.y.reduce((a, b) => a + b, 0) / value.y.length : 0,
        ids: value.ids,
        selectedCount,
        excludedCount,
        labeledCount,
      });
    }
    return items;
  }, [activeChartRows, activeChartConfig.xColumn, activeChartConfig.yColumn, selectedSet, workspaceRowStates]);

  const columnCards = useMemo(() => {
    return workspaceAllColumns.map((column) => {
      return (
        workspaceColumnMetadata[column] || {
          key: column,
          name: column,
          displayName: column,
          modelingType: workspaceColumnDefinitions[column]?.semanticType || "nominal",
        }
      );
    });
  }, [workspaceAllColumns, workspaceColumnMetadata, workspaceColumnDefinitions]);

  const groupOptions = useMemo(() => {
    const base = ["Process Variables", "Quality Metrics", "Signals", "Metadata"];
    const existing = columnCards.map((column) => column.group).filter(Boolean) as string[];
    return Array.from(new Set([...base, ...existing])).sort((a, b) => a.localeCompare(b));
  }, [columnCards]);

  const activeColumn = workspaceInspectorState.activeColumnKey ? workspaceColumnMetadata[workspaceInspectorState.activeColumnKey] : undefined;
  const activeRowId = workspaceInspectorState.activeRowId ?? workspaceSelectedRowIds[0];
  const activeRow = tabRows.find((row) => Number(row.__row_index__) === Number(activeRowId));
  const contextRowId = contextMenuRowId ?? activeRowId;
  const contextRow = tabRows.find((row) => Number(row.__row_index__) === Number(contextRowId));
  const contextColumnKey = workspaceActiveCell.columnKey || workspaceInspectorState.activeColumnKey;
  const contextColumn = contextColumnKey ? workspaceColumnMetadata[contextColumnKey] : undefined;
  const resizableEnabled = typeof window === "undefined" ? true : window.innerWidth >= 1024;
  const filteredCount = Math.max(0, workspaceMasterDataset.length - tabRows.length);
  const minLeftSidebarWidth = 220;
  const minRightSidebarWidth = 240;
  const maxSidebarWidth = 520;
  const selectedValueTargets = useMemo(() => {
    if (selectedCellTargets.length) return selectedCellTargets;
    const activeColumnKey = workspaceActiveCell.columnKey || workspaceInspectorState.activeColumnKey;
    if (!activeColumnKey || !workspaceSelectedRowIds.length) return [];
    return workspaceSelectedRowIds
      .filter((rowId) => Number.isFinite(Number(rowId)))
      .map((rowId) => ({ rowId: Number(rowId), columnKey: activeColumnKey }));
  }, [selectedCellTargets, workspaceActiveCell.columnKey, workspaceInspectorState.activeColumnKey, workspaceSelectedRowIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("workspace.dataWorkbench.leftSidebarWidth.v1", String(leftSidebarWidth));
  }, [leftSidebarWidth]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("workspace.dataWorkbench.rightSidebarWidth.v1", String(rightSidebarWidth));
  }, [rightSidebarWidth]);

  useEffect(() => {
    if (!sidebarDragSide) return;
    const handleMove = (event: MouseEvent) => {
      const container = workspaceSplitRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const totalWidth = rect.width;
      if (!Number.isFinite(totalWidth) || totalWidth <= 0) return;
      if (sidebarDragSide === "left") {
        const reservedRight = workspaceInspectorState.rightPanelOpen ? rightSidebarWidth + 8 : 0;
        const next = clampNumber(event.clientX - rect.left, minLeftSidebarWidth, maxSidebarWidth);
        const maxAllowed = Math.max(minLeftSidebarWidth, totalWidth - reservedRight - 360);
        setLeftSidebarWidth(clampNumber(next, minLeftSidebarWidth, maxAllowed));
        return;
      }
      const reservedLeft = workspaceInspectorState.leftPanelOpen ? leftSidebarWidth + 8 : 0;
      const next = clampNumber(rect.right - event.clientX, minRightSidebarWidth, maxSidebarWidth);
      const maxAllowed = Math.max(minRightSidebarWidth, totalWidth - reservedLeft - 360);
      setRightSidebarWidth(clampNumber(next, minRightSidebarWidth, maxAllowed));
    };
    const handleUp = () => {
      sidebarDragRef.current = null;
      setSidebarDragSide(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [
    sidebarDragSide,
    leftSidebarWidth,
    rightSidebarWidth,
    workspaceInspectorState.leftPanelOpen,
    workspaceInspectorState.rightPanelOpen,
  ]);

  useEffect(() => {
    const container = workspaceSplitRef.current;
    if (!container || !resizableEnabled) return;
    const rect = container.getBoundingClientRect();
    const totalWidth = rect.width;
    if (!Number.isFinite(totalWidth) || totalWidth <= 0) return;
    if (workspaceInspectorState.leftPanelOpen) {
      const reservedRight = workspaceInspectorState.rightPanelOpen ? rightSidebarWidth + 8 : 0;
      const maxAllowedLeft = Math.max(minLeftSidebarWidth, totalWidth - reservedRight - 360);
      const nextLeft = clampNumber(leftSidebarWidth, minLeftSidebarWidth, maxAllowedLeft);
      if (nextLeft !== leftSidebarWidth) setLeftSidebarWidth(nextLeft);
    }
    if (workspaceInspectorState.rightPanelOpen) {
      const reservedLeft = workspaceInspectorState.leftPanelOpen ? leftSidebarWidth + 8 : 0;
      const maxAllowedRight = Math.max(minRightSidebarWidth, totalWidth - reservedLeft - 360);
      const nextRight = clampNumber(rightSidebarWidth, minRightSidebarWidth, maxAllowedRight);
      if (nextRight !== rightSidebarWidth) setRightSidebarWidth(nextRight);
    }
  }, [
    leftSidebarWidth,
    rightSidebarWidth,
    resizableEnabled,
    workspaceInspectorState.leftPanelOpen,
    workspaceInspectorState.rightPanelOpen,
  ]);

  useEffect(() => {
    const columnKey = workspaceActiveCell.columnKey;
    if (!columnKey) {
      setFormulaBarValue("");
      return;
    }
    const row = workspaceMasterDataset.find((item) => Number(item.__row_index__) === Number(workspaceActiveCell.rowId));
    const metadata = workspaceColumnMetadata[columnKey];
    if (metadata?.derived && metadata.formula) {
      setFormulaBarValue(metadata.formula.startsWith("=") ? metadata.formula : `=${metadata.formula}`);
      return;
    }
    setFormulaBarValue(row ? String(row[columnKey] ?? "") : "");
  }, [workspaceActiveCell, workspaceMasterDataset, workspaceColumnMetadata]);

  useEffect(() => {
    const shell = gridShellRef.current;
    const rowId = workspaceActiveCell.rowId;
    const columnKey = workspaceActiveCell.columnKey;
    if (!shell || rowId === undefined || !columnKey) {
      setFillHandleRect(null);
      return;
    }
    const displayIndex = tabRows.findIndex((row) => Number(row.__row_index__) === Number(rowId));
    if (displayIndex < 0) {
      setFillHandleRect(null);
      return;
    }
    const cell = shell.querySelector(`.ag-row[row-index="${displayIndex}"] .ag-cell[col-id="${columnKey}"]`) as HTMLElement | null;
    const shellRect = shell.getBoundingClientRect();
    const cellRect = cell?.getBoundingClientRect();
    if (!cellRect) {
      setFillHandleRect(null);
      return;
    }
    setFillHandleRect({
      top: cellRect.bottom - shellRect.top - 7,
      left: cellRect.right - shellRect.left - 7,
      size: 8,
    });
  }, [workspaceActiveCell, tabRows, workspaceOrderedVisibleColumns, fillPreview, workspaceTableLayoutState]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (activeTab?.type !== "data") return;
      if (event.key === "Escape") {
        const api = gridApiRef.current as any;
        if (typeof api?.clearCellSelection === "function") {
          api.clearCellSelection();
          updateCellSelectionBadge(api);
        }
        return;
      }
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier || !event.shiftKey) return;
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        const columnKey = workspaceActiveCell.columnKey || workspaceInspectorState.activeColumnKey;
        if (!columnKey) return;
        setWorkspaceInspectorState({
          activeColumnKey: columnKey,
          leftPanelOpen: true,
          rightPanelOpen: true,
          bottomPanelOpen: true,
          bottomPanelTab: "query",
        });
        return;
      }
      if (event.key.toLowerCase() === "d") {
        event.preventDefault();
        const columnKey = workspaceActiveCell.columnKey || workspaceInspectorState.activeColumnKey;
        if (!columnKey) return;
        setWorkspaceInspectorState({
          activeColumnKey: columnKey,
          rightPanelOpen: true,
          bottomPanelOpen: true,
          bottomPanelTab: "distribution",
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab?.type, workspaceActiveCell.columnKey, workspaceInspectorState.activeColumnKey, setWorkspaceInspectorState]);

  const applyFormulaBar = () => {
    const columnKey = workspaceActiveCell.columnKey || workspaceInspectorState.activeColumnKey;
    if (!columnKey) return;
    const value = formulaBarValue;
    if (value.trim().startsWith("=")) {
      const result = createWorkspaceFormulaColumn({ formula: value.trim(), columnKey });
      if (result.ok) persistFormulaHistory(columnKey, value.trim());
      if (!result.ok && result.error) window.alert(result.error);
      return;
    }
    const rowId = workspaceActiveCell.rowId;
    if (rowId !== undefined) updateWorkspaceCell(Number(rowId), columnKey, value);
  };

  function excludeSelectedCells() {
    if (!selectedValueTargets.length) return;
    if (customWorkspace && activeTab?.id) {
      setCustomTabValueCellStates((prev) => {
        const nextTabState = { ...(prev[activeTab.id] || {}) };
        selectedValueTargets.forEach(({ rowId, columnKey }) => {
          const key = getValueCellStateKey(Number(rowId), columnKey);
          nextTabState[key] = { ...(nextTabState[key] || {}), excluded: true };
        });
        return { ...prev, [activeTab.id]: nextTabState };
      });
    } else {
      setLinkedValueCellStates((prev) => {
        const nextState = { ...prev };
        selectedValueTargets.forEach(({ rowId, columnKey }) => {
          const key = getValueCellStateKey(Number(rowId), columnKey);
          nextState[key] = { ...(nextState[key] || {}), excluded: true };
        });
        return nextState;
      });
    }
    setPasteStatus(`Excluded ${selectedValueTargets.length} selected value${selectedValueTargets.length === 1 ? "" : "s"} from analysis.`);
    window.setTimeout(() => setPasteStatus(""), 2200);
    const api = gridApiRef.current as any;
    if (typeof api?.clearCellSelection === "function") {
      api.clearCellSelection();
      updateCellSelectionBadge(api);
    }
  }

  function hideSelectedCells() {
    if (!selectedValueTargets.length) return;
    if (customWorkspace && activeTab?.id) {
      setCustomTabValueCellStates((prev) => {
        const nextTabState = { ...(prev[activeTab.id] || {}) };
        selectedValueTargets.forEach(({ rowId, columnKey }) => {
          const key = getValueCellStateKey(Number(rowId), columnKey);
          nextTabState[key] = { ...(nextTabState[key] || {}), hidden: true };
        });
        return { ...prev, [activeTab.id]: nextTabState };
      });
    } else {
      setLinkedValueCellStates((prev) => {
        const nextState = { ...prev };
        selectedValueTargets.forEach(({ rowId, columnKey }) => {
          const key = getValueCellStateKey(Number(rowId), columnKey);
          nextState[key] = { ...(nextState[key] || {}), hidden: true };
        });
        return nextState;
      });
    }
    setPasteStatus(`Hidden ${selectedValueTargets.length} selected value${selectedValueTargets.length === 1 ? "" : "s"}.`);
    window.setTimeout(() => setPasteStatus(""), 2200);
    const api = gridApiRef.current as any;
    if (typeof api?.clearCellSelection === "function") {
      api.clearCellSelection();
      updateCellSelectionBadge(api);
    }
  }

  useEffect(() => {
    if (!fillDragState) return;
    const handleMove = (event: MouseEvent) => {
      const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const rowElement = target?.closest(".ag-row") as HTMLElement | null;
      const displayIndex = Number(rowElement?.getAttribute("row-index"));
      if (!Number.isFinite(displayIndex)) {
        setFillPreview(null);
        return;
      }
      const targetRow = tabRows[displayIndex];
      if (!targetRow) return;
      const seedIds = workspaceSelectedRowIds.length ? workspaceSelectedRowIds.map(Number).sort((a, b) => a - b) : [fillDragState.rowId];
      const nextPreview = buildFillPreviewPlan({
        rows: workspaceMasterDataset,
        columnKey: fillDragState.columnKey,
        startRowId: fillDragState.rowId,
        endRowId: Number(targetRow.__row_index__),
        seedRowIds: seedIds,
      });
      setFillPreview({ columnKey: fillDragState.columnKey, rowIds: nextPreview.rowIds, values: nextPreview.values });
    };
    const handleUp = () => {
      if (fillPreview && fillPreview.columnKey === fillDragState.columnKey) {
        Object.entries(fillPreview.values).forEach(([targetRowId, value]) => {
          updateWorkspaceCell(Number(targetRowId), fillDragState.columnKey, coerceValueForColumn(fillDragState.columnKey, value));
        });
      }
      setFillDragState(null);
      setFillPreview(null);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp, { once: true });
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [fillDragState, fillPreview, tabRows, workspaceMasterDataset, workspaceSelectedRowIds]);

  const updateSweptRowSelection = (anchorRowId: number, targetRowId: number) => {
    const anchorIndex = tabRows.findIndex((row) => Number(row.__row_index__) === Number(anchorRowId));
    const targetIndex = tabRows.findIndex((row) => Number(row.__row_index__) === Number(targetRowId));
    if (anchorIndex < 0 || targetIndex < 0) return;
    const startIndex = Math.min(anchorIndex, targetIndex);
    const endIndex = Math.max(anchorIndex, targetIndex);
    const nextIds = tabRows
      .slice(startIndex, endIndex + 1)
      .map((row) => Number(row.__row_index__))
      .filter((value) => Number.isFinite(value));
    if (!arraysEqual(nextIds, workspaceSelectedRowIds.map(Number))) {
      setWorkspaceSelectedRowIds(nextIds);
    }
    setWorkspaceInspectorState({
      activeRowId: Number(targetRowId),
      rightPanelOpen: true,
    });
  };

  const applyColumnRangeSelection = (columnKeys: string[]) => {
    const api = gridApiRef.current as any;
    const visibleDisplayIndexes = tabRows
      .map((row, displayIndex) => ({
        rowId: Number(row.__row_index__),
        displayIndex,
      }))
      .filter((item) => Number.isFinite(item.rowId));
    const selectedDisplayIndexes = visibleDisplayIndexes
      .filter((item) => workspaceSelectedRowIds.includes(item.rowId))
      .map((item) => item.displayIndex)
      .sort((a, b) => a - b);
    const targetDisplayIndexes = selectedDisplayIndexes.length
      ? selectedDisplayIndexes
      : visibleDisplayIndexes.map((item) => item.displayIndex);
    const firstTargetDisplayIndex = targetDisplayIndexes[0] ?? 0;
    const firstTargetRowId = tabRows[firstTargetDisplayIndex]?.__row_index__;
    const firstColumnKey = columnKeys[0];
    if (firstColumnKey) {
      setWorkspaceActiveCell({ rowId: firstTargetRowId, columnKey: firstColumnKey });
      setWorkspaceInspectorState({
        activeRowId: firstTargetRowId,
        activeColumnKey: firstColumnKey,
        rightPanelOpen: true,
      });
    }
    if (!api || typeof api.clearCellSelection !== "function" || typeof api.addCellRange !== "function" || !targetDisplayIndexes.length || !columnKeys.length) return;
    api.clearCellSelection();
    let startIndex = targetDisplayIndexes[0];
    let previousIndex = targetDisplayIndexes[0];
    for (let index = 1; index <= targetDisplayIndexes.length; index += 1) {
      const currentIndex = targetDisplayIndexes[index];
      const isContiguous = currentIndex === previousIndex + 1;
      if (currentIndex !== undefined && isContiguous) {
        previousIndex = currentIndex;
        continue;
      }
      api.addCellRange({
        rowStartIndex: startIndex,
        rowEndIndex: previousIndex,
        columns: columnKeys,
      });
      if (currentIndex !== undefined) {
        startIndex = currentIndex;
        previousIndex = currentIndex;
      }
    }
    updateCellSelectionBadge(api);
  };

  const updateSweptColumnSelection = (anchorColumnKey: string, targetColumnKey: string) => {
    const anchorIndex = workspaceOrderedVisibleColumns.indexOf(anchorColumnKey);
    const targetIndex = workspaceOrderedVisibleColumns.indexOf(targetColumnKey);
    if (anchorIndex < 0 || targetIndex < 0) return;
    const startIndex = Math.min(anchorIndex, targetIndex);
    const endIndex = Math.max(anchorIndex, targetIndex);
    applyColumnRangeSelection(workspaceOrderedVisibleColumns.slice(startIndex, endIndex + 1));
  };

  const applyCellRectSelection = (
    anchorRowId: number,
    anchorColumnKey: string,
    targetRowId: number,
    targetColumnKey: string
  ) => {
    const api = gridApiRef.current as any;
    const anchorRowIndex = tabRows.findIndex((row) => Number(row.__row_index__) === Number(anchorRowId));
    const targetRowIndex = tabRows.findIndex((row) => Number(row.__row_index__) === Number(targetRowId));
    const anchorColumnIndex = workspaceOrderedVisibleColumns.indexOf(anchorColumnKey);
    const targetColumnIndex = workspaceOrderedVisibleColumns.indexOf(targetColumnKey);
    if (
      !api ||
      typeof api.clearCellSelection !== "function" ||
      typeof api.addCellRange !== "function" ||
      anchorRowIndex < 0 ||
      targetRowIndex < 0 ||
      anchorColumnIndex < 0 ||
      targetColumnIndex < 0
    ) {
      return;
    }
    const rowStartIndex = Math.min(anchorRowIndex, targetRowIndex);
    const rowEndIndex = Math.max(anchorRowIndex, targetRowIndex);
    const columnStartIndex = Math.min(anchorColumnIndex, targetColumnIndex);
    const columnEndIndex = Math.max(anchorColumnIndex, targetColumnIndex);
    const columnKeys = workspaceOrderedVisibleColumns.slice(columnStartIndex, columnEndIndex + 1);
    const explicitTargets: Array<{ rowId: number; columnKey: string }> = [];
    for (let displayIndex = rowStartIndex; displayIndex <= rowEndIndex; displayIndex += 1) {
      const row = tabRows[displayIndex];
      const rowId = Number(row?.__row_index__);
      if (!Number.isFinite(rowId)) continue;
      for (const columnKey of columnKeys) {
        explicitTargets.push({ rowId, columnKey });
      }
    }
    setSelectedCellTargets(explicitTargets);
    const selectionLabel =
      columnKeys.length === 1
        ? `${workspaceColumnLabels[columnKeys[0]] || columnKeys[0]} | ${explicitTargets.length} cell${explicitTargets.length === 1 ? "" : "s"} selected`
        : `${columnKeys.length} columns | ${explicitTargets.length} cells selected`;
    setCellSelectionBadge(selectionLabel);
    api.clearCellSelection();
    api.addCellRange({
      rowStartIndex,
      rowEndIndex,
      columns: columnKeys,
    });
    setWorkspaceActiveCell({ rowId: targetRowId, columnKey: targetColumnKey });
    setWorkspaceInspectorState({
      activeRowId: targetRowId,
      activeColumnKey: targetColumnKey,
      rightPanelOpen: true,
    });
  };

  return (
    <div className="flex min-h-0 flex-col gap-3" style={{ minHeight: workbenchHeight }}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((tab) => (
            <div key={tab.id} className="flex items-center gap-1">
              {editingTabId === tab.id ? (
                <Input
                  value={editingTabLabel}
                  className="h-9 w-[130px]"
                  onChange={(e) => setEditingTabLabel(e.target.value)}
                  onBlur={() => {
                    renameTab(tab.id, editingTabLabel);
                    setEditingTabId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      renameTab(tab.id, editingTabLabel);
                      setEditingTabId(null);
                    }
                    if (e.key === "Escape") setEditingTabId(null);
                  }}
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  className={`h-9 min-w-[110px] px-3 rounded-md border text-sm inline-flex items-center justify-between gap-2 ${
                    activeTabId === tab.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-input hover:bg-accent hover:text-accent-foreground"
                  }`}
                  onClick={() => setActiveTabId(tab.id)}
                  onDoubleClick={() => {
                    setEditingTabId(tab.id);
                    setEditingTabLabel(tab.label);
                  }}
                >
                  <span className="truncate">{tab.label}</span>
                  {tabs.length > 1 && (
                    <span
                      role="button"
                      aria-label={`Close ${tab.label}`}
                      className={`inline-flex items-center justify-center h-4 w-4 rounded-sm text-xs ${
                        activeTabId === tab.id ? "hover:bg-primary-foreground/20" : "hover:bg-muted"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                    >
                      x
                    </span>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={addDataTab}>+ Data Tab</Button>
          <Button type="button" size="sm" variant="outline" onClick={addChartTab}>+ Chart Tab</Button>
          <Button type="button" size="sm" variant="outline" onClick={addGraphBuilderTab}>+ Graph Builder</Button>
        </div>
      </div>

      {activeTab?.type === "data" ? (
        <div className="flex min-h-0 flex-col gap-3">
          <WorkspaceActionBar
            title={`${activeTab.label} Data Workspace`}
            description="Analytical sheet with linked row states, typed filters, metadata-aware headers, and virtualized scrolling."
            metrics={
              <>
                <WorkspaceMetricChip label="Rows" value={`${tabRows.length}${!customWorkspace ? ` / ${masterDataset.length}` : ""}`} />
                <WorkspaceMetricChip label="Cols" value={tabColumns.length} />
                <WorkspaceMetricChip label="Selected" value={workspaceSelectedRowIds.length} />
                <WorkspaceMetricChip label="Filters" value={Object.keys(workspaceColumnFilters).length} />
                <WorkspaceMetricChip label="Derived" value={Object.keys(workspaceDerivedColumns).length} />
              </>
            }
            actions={
              <>
                <Button variant="outline" size="sm" className={workspaceToolbarButtonClassName} onClick={() => setWorkspaceInspectorState({ leftPanelOpen: !workspaceInspectorState.leftPanelOpen })}>
                  <PanelLeft className="mr-2 h-4 w-4" />
                  Columns
                </Button>
                <Button variant="outline" size="sm" className={workspaceToolbarButtonClassName} onClick={() => setWorkspaceInspectorState({ bottomPanelOpen: !workspaceInspectorState.bottomPanelOpen })}>
                  <PanelBottom className="mr-2 h-4 w-4" />
                  Stats
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={workspaceToolbarButtonClassName}
                  onClick={() => {
                    const exportColumns = tabColumns;
                    const exportRows = tabRows;
                    const csvRows = [exportColumns.join(","), ...exportRows.map((row) => exportColumns.map((column) => JSON.stringify(row[column] ?? "")).join(","))];
                    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = `${activeTab.label.replace(/\s+/g, "_").toLowerCase() || "data"}.csv`;
                    anchor.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </>
            }
            secondary={
              <div className="space-y-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <div className="relative min-w-[220px] max-w-sm flex-1">
                      <Input
                        ref={searchInputRef}
                        value={workspaceSearchQuery}
                        onChange={(event) => setWorkspaceSearchQuery(event.target.value)}
                        className={workspaceToolbarInputClassName}
                        placeholder="Search visible table values (Ctrl+F)"
                      />
                    </div>
                    <Button variant="outline" size="sm" className={workspaceToolbarButtonClassName} onClick={() => setWorkspaceInspectorState({ bottomPanelOpen: true, bottomPanelTab: "query" })}>
                      <Columns3 className="mr-2 h-4 w-4" />
                      Query
                    </Button>
                    <Button variant="outline" size="sm" className={workspaceToolbarButtonClassName} onClick={() => setFindPanelOpen((open) => !open)}>
                      Find
                    </Button>
                    <Button variant="outline" size="sm" className={workspaceToolbarButtonClassName} onClick={() => setWorkspaceInspectorState({ bottomPanelOpen: true, bottomPanelTab: "distribution" })}>
                      <BarChart3 className="mr-2 h-4 w-4" />
                      Distribution
                    </Button>
                    <Button variant="outline" size="sm" className={workspaceToolbarButtonClassName} onClick={() => setWorkspaceInspectorState({ bottomPanelOpen: true, bottomPanelTab: "summary" })}>
                      <Sigma className="mr-2 h-4 w-4" />
                      Summary
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className={workspaceToolbarButtonClassName}
                      onClick={() => {
                        const nextLabel = window.prompt("New column name", "New_Column");
                        if (nextLabel === null) return;
                        const result = createWorkspaceEmptyColumn({ newColumnName: nextLabel });
                        if (!result.ok && result.error) window.alert(result.error);
                      }}
                    >
                      + Column
                    </Button>
                    <Button variant="outline" size="sm" className={workspaceToolbarButtonClassName} onClick={() => { setDerivedDialogColumnKey(workspaceInspectorState.activeColumnKey || workspaceAllColumns[0] || ""); setDerivedDialogMode("formula"); }}>
                      Formula
                    </Button>
                    <Button variant="outline" size="sm" className={workspaceToolbarButtonClassName} onClick={() => { setDerivedDialogColumnKey(workspaceInspectorState.activeColumnKey || workspaceAllColumns[0] || ""); setDerivedDialogMode("recode"); }}>
                      Recode
                    </Button>
                  </div>
                  {Object.keys(workspaceColumnFilters).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(workspaceColumnFilters).map(([columnKey, filter]) => (
                        <button
                          key={columnKey}
                          type="button"
                          className="inline-flex items-center gap-1 rounded-sm border bg-muted/60 px-2 py-1 text-[10px] font-medium transition-colors hover:bg-muted"
                          onClick={() =>
                            setWorkspaceInspectorState({
                              activeColumnKey: columnKey,
                              leftPanelOpen: true,
                              rightPanelOpen: true,
                              bottomPanelOpen: true,
                              bottomPanelTab: "query",
                            })
                          }
                        >
                          <span>{workspaceColumnLabels[columnKey] || columnKey}</span>
                          <span className="rounded-sm bg-background px-1 py-0.5 uppercase tracking-wide text-muted-foreground">{filter.type}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {findPanelOpen && (
                  <div className="grid gap-2 rounded-md border bg-muted/10 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_auto_auto_auto_auto]">
                    <Input value={findValue} onChange={(event) => setFindValue(event.target.value)} className="h-8 text-xs" placeholder="Find value or regex" />
                    <Input value={replaceValue} onChange={(event) => setReplaceValue(event.target.value)} className="h-8 text-xs" placeholder="Replace with" />
                    <Select value={findColumnScope} onValueChange={setFindColumnScope}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Column scope" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All visible columns</SelectItem>
                        {workspaceOrderedVisibleColumns.map((columnKey) => (
                          <SelectItem key={columnKey} value={columnKey}>{workspaceColumnLabels[columnKey] || columnKey}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant={findCaseSensitive ? "default" : "outline"} size="sm" onClick={() => setFindCaseSensitive((value) => !value)}>Case</Button>
                    <Button variant={findUseRegex ? "default" : "outline"} size="sm" onClick={() => setFindUseRegex((value) => !value)}>Regex</Button>
                    <Button size="sm" onClick={applyFindReplace}>Replace</Button>
                    <Button variant="ghost" size="sm" onClick={() => { setFindValue(""); setReplaceValue(""); setFindColumnScope("__all__"); }}>Clear</Button>
                  </div>
                )}

                <RowStateToolbar
                  selectedCount={workspaceSelectedRowIds.length}
                  selectedCellCount={selectedValueTargets.length}
                  onSelectAllVisible={() => setWorkspaceSelectedRowIds(tabRows.map((row) => Number(row.__row_index__)))}
                  onExcludeValues={excludeSelectedCells}
                  onHideValues={hideSelectedCells}
                  onExcludeSelected={() => {
                    setWorkspaceRowsExcluded(workspaceSelectedRowIds, true);
                  }}
                  onHideSelected={() => setWorkspaceRowsHidden(workspaceSelectedRowIds, true)}
                  onLabelSelected={() => setWorkspaceRowsLabeled(workspaceSelectedRowIds, true)}
                  onClearAllStates={clearWorkspaceAllRowStateFlags}
                />
                <div className="text-[11px] text-muted-foreground">Right-click rows for actions. Use <span className="font-medium text-foreground">Ctrl+D</span> to fill down.</div>
              </div>
            }
          />

          {activeTab.dataMode === "empty" ? (
            <Card>
              <CardContent className="p-6">
                <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                  This is a new empty data table. Link or derive a dataset to use the scientific table workspace.
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex min-h-0 flex-col" style={{ height: workbenchHeight }}>
            <PersistedResizableGroup
              storageKey="workspace.dataWorkbench.main.v1"
              direction="vertical"
              defaultSizes={workspaceInspectorState.bottomPanelOpen ? [72, 28] : [100]}
              minSizes={workspaceInspectorState.bottomPanelOpen ? [48, 16] : [100]}
              className="min-h-0 flex-1"
              enabled={resizableEnabled && workspaceInspectorState.bottomPanelOpen}
            >
              <ResizablePanel>
                <div
                  ref={workspaceSplitRef}
                  className={resizableEnabled ? "grid h-full min-h-0 items-stretch" : "flex h-full min-h-0 flex-col gap-3"}
                  style={
                    resizableEnabled
                      ? {
                          gridTemplateColumns: [
                            workspaceInspectorState.leftPanelOpen ? `${leftSidebarWidth}px` : null,
                            workspaceInspectorState.leftPanelOpen ? "8px" : null,
                            "minmax(0,1fr)",
                          ]
                            .filter(Boolean)
                            .join(" "),
                        }
                      : undefined
                  }
                >
                  {workspaceInspectorState.leftPanelOpen && (
                    <div className="min-h-0 min-w-0">
                      <Card className="h-full">
                        <CardContent className="h-full p-3">
                          <div className="grid h-full min-h-0 gap-3 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
                            <div className="min-h-0 overflow-hidden rounded-md border bg-muted/10 p-3">
                              <ColumnManagerPanel
                                columns={columnCards}
                                searchQuery={workspaceSearchQuery}
                                visibleColumns={workspaceOrderedVisibleColumns}
                                groups={groupOptions}
                                activeColumnKey={workspaceInspectorState.activeColumnKey}
                                searchInputRef={columnManagerSearchInputRef}
                                onSearchChange={setWorkspaceSearchQuery}
                                onSelectColumn={(columnKey) => setWorkspaceInspectorState({ activeColumnKey: columnKey, leftPanelOpen: true })}
                                onOpenDistribution={(columnKey) =>
                                  setWorkspaceInspectorState({
                                    activeColumnKey: columnKey,
                                    bottomPanelOpen: true,
                                    bottomPanelTab: "distribution",
                                  })
                                }
                                onOpenInfo={(columnKey) => setWorkspaceInspectorState({ activeColumnKey: columnKey, leftPanelOpen: true })}
                                onAddToGraph={(columnKey) => {
                                  if (customWorkspace) return;
                                  const next = tabs.filter((t) => t.type === "chart").length + 1;
                                  const isContinuous = workspaceColumnDefinitions[columnKey]?.semanticType === "continuous";
                                  const tab = newChartTab(next, {
                                    xColumn: isContinuous ? defaultX : columnKey,
                                    yColumn: isContinuous ? columnKey : defaultY,
                                    title: `${workspaceColumnLabels[columnKey] || columnKey} View`,
                                  });
                                  setTabs((prev) => [...prev, tab]);
                                  setActiveTabId(tab.id);
                                }}
                                onToggleVisibility={(columnKey) => {
                                  const visibleSet = new Set(workspaceOrderedVisibleColumns);
                                  if (visibleSet.has(columnKey)) {
                                    setWorkspaceTableLayoutState({ visibleColumns: workspaceOrderedVisibleColumns.filter((item) => item !== columnKey) });
                                  } else {
                                    setWorkspaceTableLayoutState({ visibleColumns: [...workspaceOrderedVisibleColumns, columnKey] });
                                  }
                                }}
                                onSetGroup={setWorkspaceColumnGroup}
                              />
                            </div>
                            <div className="min-h-0 overflow-hidden rounded-md border bg-muted/10 p-3">
                              <div className="grid h-full min-h-0 gap-3 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                                <div ref={columnInspectorFocusRef} tabIndex={-1} className="scientific-sidebar-focus min-h-0 overflow-hidden rounded-md border bg-background p-3">
                                  <ColumnInspector
                                    column={activeColumn}
                                    allColumns={columnCards}
                                    derivedDependencyMap={derivedDependencyMap}
                                    formulaHistory={formulaHistory}
                                    sections={columnInspectorSections}
                                    onToggleSection={(key) => setColumnInspectorSections((current) => ({ ...current, [key]: !current[key] }))}
                                    onSetAllSections={(expanded) =>
                                      setColumnInspectorSections({
                                        actions: expanded,
                                        metadata: expanded,
                                        dependencies: expanded,
                                        stats: expanded,
                                      })
                                    }
                                    onOpenDistribution={() => setWorkspaceInspectorState({ bottomPanelOpen: true, bottomPanelTab: "distribution" })}
                                    onDeleteDerived={() => activeColumn?.derived && deleteWorkspaceDerivedColumn(activeColumn.key)}
                                    onSelectColumn={(columnKey) => setWorkspaceInspectorState({ activeColumnKey: columnKey, leftPanelOpen: true })}
                                  />
                                </div>
                                <div className="min-h-0 overflow-hidden rounded-md border bg-background p-3">
                                  <FilterPanel
                                    activeColumnKey={workspaceInspectorState.activeColumnKey}
                                    columnMetadata={workspaceColumnMetadata}
                                    rows={workspaceMasterDataset}
                                    filters={workspaceColumnFilters}
                                    selectTriggerRef={filterSelectTriggerRef}
                                    onSelectColumn={(columnKey) => setWorkspaceInspectorState({ activeColumnKey: columnKey })}
                                    onSetFilter={setWorkspaceColumnFilter}
                                    onClearColumnFilter={clearWorkspaceColumnFilter}
                                    onClearAll={clearWorkspaceAllFilters}
                                  />
                                </div>
                                <TableAIHelper
                                  activeColumn={activeColumn}
                                  rows={customWorkspace ? customAnalysisRows : analysisRows}
                                  onOpenDistribution={(columnKey) =>
                                    setWorkspaceInspectorState({
                                      activeColumnKey: columnKey,
                                      bottomPanelOpen: true,
                                      bottomPanelTab: "distribution",
                                    })
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                  {workspaceInspectorState.leftPanelOpen && resizableEnabled && (
                    <div
                      className="group relative h-full w-3 cursor-col-resize touch-none select-none bg-transparent"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        sidebarDragRef.current = { side: "left" };
                        setSidebarDragSide("left");
                      }}
                    >
                      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary/60" />
                      <div className="absolute left-1/2 top-1/2 flex h-7 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-sm">
                        <span className="text-[10px] text-muted-foreground">⋮</span>
                      </div>
                    </div>
                  )}
                  <div className="min-h-0 min-w-0 flex-1">
                    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
                      <CardHeader className="border-b bg-muted/20 pb-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <CardTitle className="text-base">Data Table</CardTitle>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Analytical sheet with linked row states, typed filters, metadata-aware headers, and virtualized scrolling.
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{tabRows.length} visible</span>
                            <span className="h-3 w-px bg-border" />
                            <span>{workspaceSelectedRowIds.length} selected</span>
                            <span className="h-3 w-px bg-border" />
                            <span>{Object.values(workspaceRowStates).filter((state) => state?.excluded).length} excluded</span>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                        <div className="flex flex-none items-center gap-2 border-b bg-background px-3 py-2">
                          <div className="rounded-sm border bg-muted/40 px-2 py-1 font-mono text-[11px] text-muted-foreground">fx</div>
                          <div className="min-w-0 flex-1">
                            <Input
                              value={formulaBarValue}
                              onChange={(event) => setFormulaBarValue(event.target.value)}
                              className="h-8 rounded-sm text-xs"
                              placeholder="Formula bar for active cell or active derived column (Ctrl+Enter to apply)"
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey && !event.shiftKey)) return;
                                applyFormulaBar();
                              }}
                            />
                          </div>
                          <Button size="sm" variant="outline" className="h-8 rounded-sm text-[11px]" onClick={applyFormulaBar}>
                            Apply
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 rounded-sm text-[11px]"
                            onClick={() => {
                              const columnKey = workspaceActiveCell.columnKey;
                              const row = workspaceMasterDataset.find((item) => Number(item.__row_index__) === Number(workspaceActiveCell.rowId));
                              setFormulaBarValue(columnKey && row ? String(row[columnKey] ?? "") : "");
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-sm text-[11px]"
                            onClick={() =>
                              setWorkspaceInspectorState({
                                leftPanelOpen: true,
                                activeColumnKey: workspaceActiveCell.columnKey || workspaceInspectorState.activeColumnKey,
                              })
                            }
                          >
                            Ask AI
                          </Button>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            {cellSelectionBadge ? (
                              <span className="rounded-sm border border-primary/30 bg-primary/10 px-2 py-1 text-primary">
                                {cellSelectionBadge}
                              </span>
                            ) : null}
                            <span>
                              {workspaceActiveCell.columnKey ? `${workspaceColumnLabels[workspaceActiveCell.columnKey] || workspaceActiveCell.columnKey}${workspaceActiveCell.rowId !== undefined ? ` | row ${Number(workspaceActiveCell.rowId) + 1}` : ""}` : "No active cell"}
                            </span>
                          </div>
                        </div>
                        <div className="flex-none border-b bg-muted/10 px-3 py-1.5 text-[11px] text-muted-foreground">
                          Shortcuts: <span className="font-medium text-foreground">Ctrl+Shift+F</span> filter column, <span className="font-medium text-foreground">Ctrl+Shift+D</span> distribution, <span className="font-medium text-foreground">Ctrl+Enter</span> apply formula, <span className="font-medium text-foreground">Ctrl+Alt+1</span> column manager, <span className="font-medium text-foreground">Ctrl+Alt+2</span> filters, <span className="font-medium text-foreground">Ctrl+Alt+4</span> column inspector.
                        </div>
                        <ContextMenu>
                          <ContextMenuTrigger asChild>
                            <div ref={gridShellRef} className="ag-theme-quartz scientific-grid relative h-full min-h-[28rem] min-w-0 flex-1 overflow-hidden w-full">
                              {pasteStatus && (
                                <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-md border border-emerald-200 bg-emerald-50/95 px-2.5 py-1 text-[11px] font-medium text-emerald-800 shadow-sm">
                                  {pasteStatus}
                                </div>
                              )}
                              <AgGridReact
                                className="h-full w-full"
                                rowData={tabRows}
                                columnDefs={colDefs}
                                rowSelection="multiple"
                                cellSelection={{
                                  enableHeaderHighlight: true,
                                  enableColumnSelection: true,
                                  handle: { mode: "range" },
                                } as any}
                                animateRows
                                rowBuffer={24}
                                valueCache
                                suppressColumnVirtualisation={false}
                                suppressDragLeaveHidesColumns
                                headerHeight={56}
                                rowHeight={28}
                                suppressContextMenu={false}
                                suppressRowClickSelection={false}
                                tooltipShowDelay={150}
                                ensureDomOrder
                                stopEditingWhenCellsLoseFocus
                                enterNavigatesVertically
                                enterNavigatesVerticallyAfterEdit
                                undoRedoCellEditing
                                singleClickEdit={false}
                                enableCellTextSelection={false}
                                suppressMultiRanges={false as any}
                                copyHeadersToClipboard
                                sendToClipboard={(params) => {
                                  const api = gridApiRef.current as any;
                                  const ranges = typeof api?.getCellRanges === "function" ? api.getCellRanges() : null;
                                  const text = ranges && ranges.length ? params.data : "";
                                  if (!text) return;
                                  if (navigator?.clipboard?.writeText) {
                                    navigator.clipboard.writeText(text).catch(() => undefined);
                                    return;
                                  }
                                  const textArea = document.createElement("textarea");
                                  textArea.value = text;
                                  textArea.style.position = "fixed";
                                  textArea.style.opacity = "0";
                                  document.body.appendChild(textArea);
                                  textArea.focus();
                                  textArea.select();
                                  document.execCommand("copy");
                                  document.body.removeChild(textArea);
                                }}
                                defaultColDef={{
                                  editable: true,
                                  sortable: true,
                                  minWidth: 170,
                                  flex: 1,
                                  wrapHeaderText: false,
                                  suppressHeaderMenuButton: true,
                                  cellClass: "scientific-grid__data-cell",
                                }}
                                getRowId={(params) => String(Number(params.data.__row_index__))}
                                getRowClass={(params) => {
                                  const rowState = workspaceRowStates[Number(params.data?.__row_index__)] || DEFAULT_ROW_STATE;
                                  return [
                                    "scientific-grid__row",
                                    rowState.selected ? "scientific-grid__row--selected" : "",
                                    rowState.excluded ? "scientific-grid__row--excluded" : "",
                                    rowState.hidden ? "scientific-grid__row--hidden" : "",
                                    rowState.labeled ? "scientific-grid__row--labeled" : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" ");
                                }}
                                onGridReady={(event) => {
                                  gridApiRef.current = event.api;
                                  updateCellSelectionBadge(event.api as any);
                                }}
                                onCellSelectionChanged={() => {
                                  updateCellSelectionBadge(gridApiRef.current as any);
                                }}
                                onSelectionChanged={() => {
                                  const api = gridApiRef.current;
                                  if (!api) return;
                                  const ids = api
                                    .getSelectedNodes()
                                    .map((node) => Number(node.data?.__row_index__))
                                    .filter((value) => Number.isFinite(value));
                                  if (arraysEqual(ids, workspaceSelectedRowIds.map(Number))) return;
                                  setWorkspaceSelectedRowIds(ids);
                                }}
                                onCellClicked={(event) => {
                                  const rowId = Number(event.data?.__row_index__);
                                  setWorkspaceActiveCell({ rowId, columnKey: event.colDef.field });
                                  setWorkspaceInspectorState({
                                    activeRowId: rowId,
                                    activeColumnKey: event.colDef.field,
                                    rightPanelOpen: true,
                                  });
                                }}
                                onCellMouseDown={(event: any) => {
                                  const rowId = Number(event.data?.__row_index__);
                                  const columnId = String(event.colDef?.colId || event.column?.getColId?.() || "");
                                  const nativeEvent = event.event as MouseEvent | undefined;
                                  if (!Number.isFinite(rowId) || nativeEvent?.button !== 0) return;
                                  nativeEvent?.preventDefault();
                                  if (nativeEvent?.target instanceof HTMLElement && nativeEvent.target.closest("button")) return;
                                  if (columnId === "__row_state__" || columnId === "__row_number__") {
                                    setRowSweepSelection({ anchorRowId: rowId });
                                    updateSweptRowSelection(rowId, rowId);
                                    return;
                                  }
                                  if (!workspaceOrderedVisibleColumns.includes(columnId)) return;
                                  setCellSweepSelection({ anchorRowId: rowId, anchorColumnKey: columnId });
                                  applyCellRectSelection(rowId, columnId, rowId, columnId);
                                }}
                                onCellMouseOver={(event: any) => {
                                  const rowId = Number(event.data?.__row_index__);
                                  const columnId = String(event.colDef?.colId || event.column?.getColId?.() || "");
                                  const nativeEvent = event.event as MouseEvent | undefined;
                                  if (!Number.isFinite(rowId) || (nativeEvent && (nativeEvent.buttons & 1) !== 1)) return;
                                  if (rowSweepSelection) {
                                    updateSweptRowSelection(rowSweepSelection.anchorRowId, rowId);
                                    return;
                                  }
                                }}
                                onCellContextMenu={(event) => {
                                  const rowId = Number(event.data?.__row_index__);
                                  setContextMenuRowId(rowId);
                                  setWorkspaceActiveCell({ rowId, columnKey: event.colDef.field });
                                  setWorkspaceInspectorState({
                                    activeRowId: rowId,
                                    activeColumnKey: event.colDef.field,
                                    rightPanelOpen: true,
                                  });
                                }}
                                onCellKeyDown={(event) => {
                                  const rowId = Number(event.data?.__row_index__);
                                  const columnKey = event.colDef.field;
                                  if (!columnKey || !Number.isFinite(rowId)) return;
                                  if ((event.event.ctrlKey || event.event.metaKey) && event.event.key.toLowerCase() === "d") {
                                    event.event.preventDefault();
                                    applyFillDown(rowId, columnKey);
                                  }
                                  if ((event.event.ctrlKey || event.event.metaKey) && event.event.key === "-") {
                                    event.event.preventDefault();
                                    deleteWorkspaceRows(workspaceSelectedRowIds.length ? workspaceSelectedRowIds : [rowId]);
                                  }
                                  if (
                                    (event.event.ctrlKey || event.event.metaKey) &&
                                    event.event.shiftKey &&
                                    (event.event.key === "+" || event.event.key === "=")
                                  ) {
                                    event.event.preventDefault();
                                    insertWorkspaceRow("below", rowId);
                                  }
                                  if (event.event.key === "Delete" || event.event.key === "Backspace") {
                                    event.event.preventDefault();
                                    clearSelectedCells(columnKey);
                                  }
                                }}
                                processDataFromClipboard={(params: any) => {
                                  const startRowId = workspaceActiveCell.rowId;
                                  const startColumnKey = workspaceActiveCell.columnKey;
                                  if (startRowId === undefined || !startColumnKey) return params.data;
                                  pasteMatrixIntoWorkspace(Number(startRowId), startColumnKey, params.data || []);
                                  return null;
                                }}
                                onCellValueChanged={(event) => {
                                  const rowId = Number(event.data?.__row_index__);
                                  if (!Number.isFinite(rowId)) return;
                                  updateWorkspaceCell(rowId, event.colDef.field || "", event.newValue);
                                }}
                                onSortChanged={(event) => {
                                  const rules = event.columnApi
                                    .getColumnState()
                                    .filter((state) => Boolean(state.sort))
                                    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
                                    .map((state, index) => ({
                                      columnKey: state.colId,
                                      direction: state.sort as "asc" | "desc",
                                      priority: index,
                                    }));
                                  if (
                                    rules.length === workspaceSortRules.length &&
                                    rules.every((rule, index) =>
                                      rule.columnKey === workspaceSortRules[index]?.columnKey &&
                                      rule.direction === workspaceSortRules[index]?.direction &&
                                      rule.priority === workspaceSortRules[index]?.priority
                                    )
                                  ) {
                                    return;
                                  }
                                  setWorkspaceSortRules(rules);
                                }}
                                onColumnMoved={(event) => {
                                  const columnOrder = event.columnApi
                                    .getAllGridColumns()
                                    .map((column) => column.getColId())
                                    .filter((column) => !column.startsWith("__row_"));
                                  if (arraysEqual(columnOrder, workspaceTableLayoutState.columnOrder)) return;
                                  setWorkspaceTableLayoutState({ columnOrder });
                                }}
                                onColumnVisible={(event) => {
                                  const visibleColumns = event.columnApi
                                    .getAllGridColumns()
                                    .filter((column) => column.isVisible())
                                    .map((column) => column.getColId());
                                  const nextVisibleColumns = visibleColumns.filter((column) => !column.startsWith("__row_"));
                                  if (arraysEqual(nextVisibleColumns, workspaceTableLayoutState.visibleColumns)) return;
                                  setWorkspaceTableLayoutState({ visibleColumns: nextVisibleColumns });
                                }}
                                onColumnResized={(event) => {
                                  if (!event.finished) return;
                                  const widths = Object.fromEntries(
                                    event.columnApi
                                      .getAllGridColumns()
                                      .filter((column) => !column.getColId().startsWith("__row_"))
                                      .map((column) => [column.getColId(), column.getActualWidth()])
                                  );
                                  if (recordNumberEqual(widths, workspaceTableLayoutState.columnWidths)) return;
                                  setWorkspaceTableLayoutState({ columnWidths: widths });
                                }}
                              />
                              {fillHandleRect && workspaceActiveCell.rowId !== undefined && workspaceActiveCell.columnKey && (
                                <div
                                  className="absolute z-20 h-2 w-2 cursor-crosshair rounded-[2px] border border-white bg-primary shadow"
                                  style={{ top: fillHandleRect.top, left: fillHandleRect.left }}
                                  title="Drag fill handle"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setFillDragState({
                                      rowId: Number(workspaceActiveCell.rowId),
                                      columnKey: workspaceActiveCell.columnKey!,
                                    });
                                  }}
                                />
                              )}
                              {fillPreview && fillPreview.rowIds.length > 0 && (
                                <div className="pointer-events-none absolute bottom-3 right-3 z-20 rounded-md border bg-background/95 px-2.5 py-1 text-[11px] shadow">
                                  Fill preview: {fillPreview.rowIds.length} row(s)
                                </div>
                              )}
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-64">
                            <ContextMenuLabel>
                              Row {contextRow ? Number(contextRow.__row_index__) + 1 : "-"}
                              {contextColumn ? ` | ${contextColumn.displayName}` : ""}
                            </ContextMenuLabel>
                            <ContextMenuItem onClick={() => contextRow && setWorkspaceSelectedRowIds([Number(contextRow.__row_index__)])}>
                              Select Row
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => contextRow && setWorkspaceRowsExcluded([Number(contextRow.__row_index__)], true)}>
                              Exclude Row
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => contextRow && setWorkspaceRowsHidden([Number(contextRow.__row_index__)], true)}>
                              Hide Row
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => contextRow && setWorkspaceRowsLabeled([Number(contextRow.__row_index__)], true)}>
                              Label Row
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem onClick={() => insertWorkspaceRow("above", contextRow ? Number(contextRow.__row_index__) : undefined)}>
                              Insert Row Above
                              <ContextMenuShortcut>Ctrl+Shift+=</ContextMenuShortcut>
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => insertWorkspaceRow("below", contextRow ? Number(contextRow.__row_index__) : undefined)}>
                              Insert Row Below
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => duplicateWorkspaceRows(workspaceSelectedRowIds.length ? workspaceSelectedRowIds : contextRow ? [Number(contextRow.__row_index__)] : [])}>
                              Duplicate Row
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => deleteWorkspaceRows(workspaceSelectedRowIds.length ? workspaceSelectedRowIds : contextRow ? [Number(contextRow.__row_index__)] : [])}>
                              Delete Row
                              <ContextMenuShortcut>Ctrl+-</ContextMenuShortcut>
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onClick={() => {
                                if (contextRow && contextColumnKey) applyFillDown(Number(contextRow.__row_index__), contextColumnKey);
                              }}
                            >
                              Fill Down
                              <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => clearSelectedCells(contextColumnKey)}>
                              Clear Selected Values
                              <ContextMenuShortcut>Del</ContextMenuShortcut>
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuSub>
                              <ContextMenuSubTrigger>Column Actions</ContextMenuSubTrigger>
                              <ContextMenuSubContent className="w-56">
                                <ContextMenuItem
                                  onClick={() => {
                                    if (!contextColumnKey) return;
                                    setWorkspaceInspectorState({ activeColumnKey: contextColumnKey, rightPanelOpen: true });
                                  }}
                                >
                                  Column Info
                                </ContextMenuItem>
                                <ContextMenuItem
                                  onClick={() => {
                                    if (!contextColumnKey) return;
                                    setDerivedDialogColumnKey(contextColumnKey);
                                    setDerivedDialogMode("formula");
                                  }}
                                >
                                  Create Formula
                                </ContextMenuItem>
                                <ContextMenuItem
                                  onClick={() => {
                                    if (!contextColumnKey) return;
                                    setDerivedDialogColumnKey(contextColumnKey);
                                    setDerivedDialogMode("recode");
                                  }}
                                >
                                  Recode Values
                                </ContextMenuItem>
                                <ContextMenuItem
                                  onClick={() => {
                                    if (!contextColumnKey) return;
                                    pinWorkspaceColumn(contextColumnKey, "left");
                                  }}
                                >
                                  Pin Left
                                </ContextMenuItem>
                                <ContextMenuItem
                                  onClick={() => {
                                    if (!contextColumnKey) return;
                                    pinWorkspaceColumn(contextColumnKey, "right");
                                  }}
                                >
                                  Pin Right
                                </ContextMenuItem>
                                <ContextMenuItem
                                  onClick={() => {
                                    if (!contextColumnKey) return;
                                    pinWorkspaceColumn(contextColumnKey, null);
                                  }}
                                >
                                  Unpin
                                </ContextMenuItem>
                              </ContextMenuSubContent>
                            </ContextMenuSub>
                          </ContextMenuContent>
                        </ContextMenu>
                        <div className="flex flex-none flex-wrap items-center gap-3 border-t bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground">
                          <span>Rows: <span className="font-medium text-foreground">{workspaceMasterDataset.length}</span></span>
                          <span>Visible: <span className="font-medium text-foreground">{tabRows.length}</span></span>
                          <span>Selected: <span className="font-medium text-foreground">{workspaceSelectedRowIds.length}</span></span>
                          <span>Excluded: <span className="font-medium text-foreground">{Object.values(workspaceRowStates).filter((state) => state?.excluded).length}</span></span>
                          <span>Hidden: <span className="font-medium text-foreground">{Object.values(workspaceRowStates).filter((state) => state?.hidden).length}</span></span>
                          <span>Filtered: <span className="font-medium text-foreground">{filteredCount}</span></span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  {false && workspaceInspectorState.rightPanelOpen && resizableEnabled && (
                    <div
                      className="group relative h-full w-3 cursor-col-resize touch-none select-none bg-transparent"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        sidebarDragRef.current = { side: "right" };
                        setSidebarDragSide("right");
                      }}
                    >
                      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary/60" />
                      <div className="absolute left-1/2 top-1/2 flex h-7 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-sm">
                        <span className="text-[10px] text-muted-foreground">⋮</span>
                      </div>
                    </div>
                  )}
                  {false && workspaceInspectorState.rightPanelOpen && (
                    <div className="min-h-0 min-w-[240px]">
                      <Card className="h-full">
                        <CardContent className="h-full min-h-0 p-3">
                          <div ref={columnInspectorFocusRef} tabIndex={-1} className="scientific-sidebar-focus min-h-0 overflow-hidden rounded-md border bg-muted/10 p-3">
                            <ColumnInspector
                              column={activeColumn}
                              allColumns={columnCards}
                              derivedDependencyMap={derivedDependencyMap}
                              formulaHistory={formulaHistory}
                              sections={columnInspectorSections}
                              onToggleSection={(key) => setColumnInspectorSections((current) => ({ ...current, [key]: !current[key] }))}
                              onSetAllSections={(expanded) =>
                                setColumnInspectorSections({
                                  actions: expanded,
                                  metadata: expanded,
                                  dependencies: expanded,
                                  stats: expanded,
                                })
                              }
                              onOpenDistribution={() => setWorkspaceInspectorState({ bottomPanelOpen: true, bottomPanelTab: "distribution" })}
                              onDeleteDerived={() => activeColumn?.derived && deleteWorkspaceDerivedColumn(activeColumn.key)}
                              onSelectColumn={(columnKey) => setWorkspaceInspectorState({ activeColumnKey: columnKey, rightPanelOpen: true })}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>
              </ResizablePanel>
              {workspaceInspectorState.bottomPanelOpen && <ResizableHandle withHandle />}
              {workspaceInspectorState.bottomPanelOpen && (
                <ResizablePanel className="min-h-0 min-w-0">
                  <Card className="h-full">
                    <CardContent className="h-full p-4">
                      <BottomAnalyticsPanel
                        activeTab={workspaceInspectorState.bottomPanelTab}
                        onTabChange={(value) => setWorkspaceInspectorState({ bottomPanelTab: value, bottomPanelOpen: true })}
                        activeColumn={activeColumn}
                        displayedRows={tabRows}
                        analysisRows={customWorkspace ? customAnalysisRows : analysisRows}
                        selectedRowIds={workspaceSelectedRowIds}
                        rowStates={workspaceRowStates}
                        filters={workspaceColumnFilters}
                        sortRules={workspaceSortRules}
                        rows={workspaceMasterDataset}
                        columns={columnCards}
                        pivotScopeKey={customWorkspace ? activeTab.id : `linked:${columns.join("|")}:${rows.length}`}
                        onClearFilters={clearWorkspaceAllFilters}
                        onClearSorts={clearWorkspaceSortRules}
                        onExportPivot={exportPivotToTab}
                        onOpenPivotInGraphBuilder={openPivotInGraphBuilder}
                        onOpenPivotAsChartTab={openPivotAsChartTab}
                      />
                    </CardContent>
                  </Card>
                </ResizablePanel>
              )}
            </PersistedResizableGroup>
            </div>
          )}
          <DerivedColumnDialogs
            mode={derivedDialogMode}
            open={Boolean(derivedDialogMode)}
            columns={columnCards}
            rows={customWorkspace ? customAnalysisRows : analysisRows}
            derivedDependencyMap={derivedDependencyMap}
            initialColumnKey={derivedDialogColumnKey}
            onOpenChange={(open) => {
              if (!open) {
                setDerivedDialogMode(null);
                setDerivedDialogColumnKey("");
              }
            }}
            onCreateFormula={createWorkspaceFormulaColumn}
            onRecode={recodeWorkspaceColumn}
          />
          <ColumnInfoDialog
            open={columnInfoOpen}
            column={activeColumn}
            compact={columnInfoCompact}
            onOpenChange={(open) => {
              setColumnInfoOpen(open);
              if (!open) setColumnInfoCompact(false);
            }}
            onSave={(patch) => {
              if (!activeColumn) return;
              if (patch.displayName !== undefined) setWorkspaceColumnDisplayName(activeColumn.key, patch.displayName || activeColumn.key);
              if (patch.group !== undefined) setWorkspaceColumnGroup(activeColumn.key, patch.group);
              if (patch.units !== undefined) setWorkspaceColumnUnits(activeColumn.key, patch.units);
              if (patch.modelingType !== undefined) setWorkspaceColumnType(activeColumn.key, patch.modelingType);
              if (customWorkspace && activeTab?.id) {
                updateCustomWorkspace(activeTab.id, (state) => ({
                  ...state,
                  columnMetadata: {
                    ...state.columnMetadata,
                    [activeColumn.key]: {
                      ...state.columnMetadata[activeColumn.key],
                      format: patch.format ?? state.columnMetadata[activeColumn.key]?.format,
                      description: patch.description ?? state.columnMetadata[activeColumn.key]?.description,
                    },
                  },
                }));
              } else {
                useDataWorkbenchStore.getState().setColumnFormat(activeColumn.key, patch.format);
                useDataWorkbenchStore.getState().setColumnMetadata(activeColumn.key, { description: patch.description });
              }
            }}
          />
        </div>
      ) : activeTab?.type === "chart" ? (
        <Card className={selectionPulse && workspaceSelectedRowIds.length ? "ring-2 ring-primary/25 transition-shadow" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span>{activeTab.label} - Editable Visualization</span>
              <span className={`rounded-md border px-2 py-1 text-[11px] ${workspaceSelectedRowIds.length ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                {workspaceSelectedRowIds.length} selected
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
              <Input
                value={activeChartConfig.title}
                placeholder="Chart title"
                onChange={(e) => activeTab && updateChartTab(activeTab.id, { title: e.target.value })}
              />
              <Input
                value={activeChartConfig.xAxisLabel}
                placeholder="X-axis label"
                onChange={(e) => activeTab && updateChartTab(activeTab.id, { xAxisLabel: e.target.value })}
              />
              <Input
                value={activeChartConfig.yAxisLabel}
                placeholder="Y-axis label"
                onChange={(e) => activeTab && updateChartTab(activeTab.id, { yAxisLabel: e.target.value })}
              />
              <Select value={activeChartConfig.chartType} onValueChange={(v) => activeTab && updateChartTab(activeTab.id, { chartType: v as WorkbenchChartType })}>
                <SelectTrigger><SelectValue placeholder="Chart type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scatter">Scatter</SelectItem>
                  <SelectItem value="bar">Bar</SelectItem>
                </SelectContent>
              </Select>
              <Select value={activeChartConfig.xColumn} onValueChange={(v) => activeTab && updateChartTab(activeTab.id, { xColumn: v })}>
                <SelectTrigger><SelectValue placeholder="X column" /></SelectTrigger>
                <SelectContent>
                  {activeChartColumns.map((col) => (
                    <SelectItem key={col} value={col}>{activeChartColumnLabels[col] || col}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={activeChartConfig.yColumn} onValueChange={(v) => activeTab && updateChartTab(activeTab.id, { yColumn: v })}>
                <SelectTrigger><SelectValue placeholder="Y column" /></SelectTrigger>
                <SelectContent>
                  {activeChartColumns.map((col) => (
                    <SelectItem key={col} value={col}>{activeChartColumnLabels[col] || col}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                value={String(activeChartConfig.fontSize)}
                placeholder="Font size"
                onChange={(e) => activeTab && updateChartTab(activeTab.id, { fontSize: Math.max(8, Number(e.target.value) || 12) })}
              />
              <Input
                type="number"
                value={String(activeChartConfig.markerSize)}
                placeholder="Marker size"
                onChange={(e) => activeTab && updateChartTab(activeTab.id, { markerSize: Math.max(2, Number(e.target.value) || 8) })}
              />
              <Input
                type="number"
                value={String(activeChartConfig.chartHeight)}
                placeholder="Chart height"
                onChange={(e) => activeTab && updateChartTab(activeTab.id, { chartHeight: Math.max(280, Number(e.target.value) || 520) })}
              />
              <Button
                type="button"
                size="sm"
                variant={activeChartConfig.showLegend ? "default" : "outline"}
                onClick={() => activeTab && updateChartTab(activeTab.id, { showLegend: !activeChartConfig.showLegend })}
              >
                Legend
              </Button>
            </div>
            {activeChartConfig.sourceImage && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={activeChartConfig.viewMode === "image" ? "default" : "outline"}
                  onClick={() => activeTab && updateChartTab(activeTab.id, { viewMode: "image" })}
                >
                  Exact Image
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={activeChartConfig.viewMode === "linked" ? "default" : "outline"}
                  onClick={() => activeTab && updateChartTab(activeTab.id, { viewMode: "linked" })}
                >
                  Linked Editable
                </Button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={activeChartConfig.editorMode === "classic" ? "default" : "outline"}
                onClick={() => activeTab && updateChartTab(activeTab.id, { editorMode: "classic" })}
              >
                Classic Editor
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeChartConfig.editorMode === "builder" ? "default" : "outline"}
                onClick={() =>
                  activeTab &&
                  updateChartTab(activeTab.id, {
                    editorMode: "builder",
                    builderState: activeChartConfig.builderState || makeGraphBuilderStateFromChart(activeChartConfig, activeTab.label),
                  })
                }
              >
                Graph Builder Mode
              </Button>
            </div>
            {Array.isArray(activeChartConfig.sourceSpec?.panels) && activeChartConfig.sourceSpec.panels.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Panel</span>
                <Select
                  value={String(activeChartConfig.specPanelIndex || 0)}
                  onValueChange={(v) => activeTab && updateChartTab(activeTab.id, { specPanelIndex: Number(v) || 0 })}
                >
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Select panel" /></SelectTrigger>
                  <SelectContent>
                    {activeChartConfig.sourceSpec.panels.map((p: any, idx: number) => (
                      <SelectItem key={idx} value={String(idx)}>
                        {p?.title ? `Panel ${idx + 1}: ${String(p.title)}` : `Panel ${idx + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Series color</span>
              <Input
                type="color"
                value={activeChartConfig.seriesColor}
                onChange={(e) => activeTab && updateChartTab(activeTab.id, { seriesColor: e.target.value })}
                className="w-16 p-1 h-9"
                title="Series color"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Column types: {activeChartColumns.map((c) => `${activeChartColumnLabels[c] || c}:${(activeChartRows.some((row) => Number.isFinite(Number(row[c]))) ? "continuous" : "nominal")}`).join(" | ")}
            </div>

            {activeChartConfig.viewMode !== "image" && activeChartConfig.editorMode === "builder" ? (
              <GraphBuilder
                rows={analysisRows}
                columns={allColumns}
                columnLabels={columnLabels}
                state={activeChartConfig.builderState || makeGraphBuilderStateFromChart(activeChartConfig, activeTab?.label || "Chart")}
                onStateChange={(next) => {
                  if (!activeTab || activeTab.type !== "chart") return;
                  updateChartTab(activeTab.id, {
                    builderState: next,
                    title: next.config.title,
                    xAxisLabel: next.config.xLabel,
                    yAxisLabel: next.config.yLabel,
                    chartHeight: next.config.chartHeight,
                    showLegend: next.config.showLegend,
                    fontSize: next.config.fontSize,
                    markerSize: next.config.markerSize,
                  });
                }}
              />
            ) : (
            <div style={{ width: "100%", height: activeChartConfig.chartHeight }}>
              <div className="text-sm font-medium mb-2">{activeChartConfig.title || activeTab?.label}</div>
              {activeChartConfig.viewMode === "image" && activeChartConfig.sourceImage ? (
                <div className="h-full border rounded-md p-2 bg-background overflow-auto">
                  <img src={activeChartConfig.sourceImage} alt={activeChartConfig.title || "Python chart"} className="w-full h-auto rounded" />
                </div>
              ) : activeChartConfig.sourceSpec ? (
                <div className="h-full border rounded-md p-2 bg-background overflow-hidden">
                  {(() => {
                    const panels = Array.isArray(activeChartConfig.sourceSpec?.panels)
                      ? activeChartConfig.sourceSpec.panels
                      : [];
                    const panelIndex = Math.max(0, Math.min(Number(activeChartConfig.specPanelIndex || 0), Math.max(0, panels.length - 1)));
                    const panel = panels.length ? panels[panelIndex] : null;
                    const panelSemanticType = String(panel?.chart_type || activeChartConfig.sourceSpec?.chart_type || "").toLowerCase();
                    const traces = panel?.traces || activeChartConfig.sourceSpec?.traces || [];
                    const plotData = panelSemanticType === "box"
                      ? (Array.isArray(panel?.box_groups) ? panel.box_groups : []).map((group: any, idx: number) => ({
                          type: "box",
                          name: String(group?.label || `Group ${idx + 1}`),
                          q1: Number.isFinite(Number(group?.q1)) ? [Number(group.q1)] : undefined,
                          median: Number.isFinite(Number(group?.median))
                            ? [Number(group.median)]
                            : Number.isFinite(Number(group?.q1)) && Number.isFinite(Number(group?.q3))
                            ? [(Number(group.q1) + Number(group.q3)) / 2]
                            : undefined,
                          q3: Number.isFinite(Number(group?.q3)) ? [Number(group.q3)] : undefined,
                          lowerfence: Number.isFinite(Number(group?.min)) ? [Number(group.min)] : undefined,
                          upperfence: Number.isFinite(Number(group?.max)) ? [Number(group.max)] : undefined,
                          marker: { color: activeChartConfig.seriesColor },
                          line: { color: activeChartConfig.seriesColor },
                          boxpoints: false,
                        }))
                      : panelSemanticType === "violin"
                      ? (Array.isArray(panel?.violin_groups) ? panel.violin_groups : []).map((group: any, idx: number) => ({
                          type: "violin",
                          name: String(group?.label || `Group ${idx + 1}`),
                          y: [Number(group?.min), Number(group?.max)].filter((value) => Number.isFinite(value)),
                          line: { color: activeChartConfig.seriesColor },
                          fillcolor: activeChartConfig.seriesColor,
                          opacity: 0.6,
                          box: { visible: true },
                          meanline: { visible: true },
                        }))
                      : Array.isArray(traces)
                      ? traces.map((trace: any, idx: number) => {
                          const baseName = String(trace?.name || `Series ${idx + 1}`);
                          if (trace?.type === "bar") {
                            return {
                              type: "bar",
                              name: baseName,
                              x: Array.isArray(trace?.x) ? trace.x : [],
                              y: Array.isArray(trace?.y) ? trace.y : [],
                              marker: { color: trace?.color || activeChartConfig.seriesColor },
                              textfont: { size: activeChartConfig.fontSize },
                              hovertemplate: "x=%{x}<br>y=%{y}<extra>" + baseName + "</extra>",
                            };
                          }
                          return {
                            type: "scatter",
                            mode: trace?.type === "scatter" ? "markers" : "lines",
                            name: baseName,
                            x: Array.isArray(trace?.x) ? trace.x : [],
                            y: Array.isArray(trace?.y) ? trace.y : [],
                            line: { color: trace?.color || activeChartConfig.seriesColor },
                            marker: { color: trace?.color || activeChartConfig.seriesColor, size: activeChartConfig.markerSize },
                            hovertemplate: "x=%{x}<br>y=%{y}<extra>" + baseName + "</extra>",
                          };
                        })
                      : [];
                    return (
                  <Plot
                    data={plotData}
                    layout={{
                      autosize: true,
                      title: activeChartConfig.title || activeChartConfig.sourceSpec?.title || panel?.title || "Python Chart",
                      xaxis: { title: { text: activeChartConfig.xAxisLabel || activeChartConfig.sourceSpec?.x_label || panel?.x_label || "X", standoff: 10 } },
                      yaxis: { title: { text: activeChartConfig.yAxisLabel || activeChartConfig.sourceSpec?.y_label || panel?.y_label || "Y", standoff: 10 } },
                      showlegend: activeChartConfig.showLegend,
                      font: { size: activeChartConfig.fontSize },
                      margin: { t: 60, r: 24, b: 60, l: 66 },
                      hovermode: "closest",
                    }}
                    config={{ responsive: true, displaylogo: false, scrollZoom: true }}
                    useResizeHandler
                    style={{ width: "100%", height: "100%" }}
                  />
                    );
                  })()}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  {activeChartConfig.chartType === "scatter" ? (
                    <ScatterChart margin={{ top: 12, right: 16, bottom: 30, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="x" name={activeChartConfig.xColumn} label={{ value: activeChartConfig.xAxisLabel || (activeChartColumnLabels[activeChartConfig.xColumn] || activeChartConfig.xColumn), position: "insideBottom", dy: 16, style: { fontSize: activeChartConfig.fontSize } }} tick={{ fontSize: activeChartConfig.fontSize }} />
                      <YAxis dataKey="y" name={activeChartConfig.yColumn} label={{ value: activeChartConfig.yAxisLabel || (activeChartColumnLabels[activeChartConfig.yColumn] || activeChartConfig.yColumn), angle: -90, position: "insideLeft", style: { fontSize: activeChartConfig.fontSize } }} tick={{ fontSize: activeChartConfig.fontSize }} />
                      <RechartsTooltip cursor={{ strokeDasharray: "3 3" }} formatter={(value: any) => value} />
                      <Scatter
                        name="rows"
                        data={scatterData}
                        fill={activeChartConfig.seriesColor}
                        legendType={activeChartConfig.showLegend ? "circle" : "none"}
                        shape={(props: any) => (
                          <circle
                            cx={props.cx}
                            cy={props.cy}
                            r={props.payload?.labeled ? Math.max(3, activeChartConfig.markerSize / 2 + 1.5) : Math.max(2, activeChartConfig.markerSize / 2)}
                            fill={props.fill}
                            stroke={props.payload?.labeled ? "#166534" : props.payload?.selected ? "#14532d" : "transparent"}
                            strokeWidth={props.payload?.labeled || props.payload?.selected ? 1.5 : 0}
                            fillOpacity={props.payload?.excluded ? 0.35 : 0.9}
                          />
                        )}
                        onClick={(point: any) => {
                          const rowId = Number(point?.rowId);
                          if (Number.isFinite(rowId)) setSelectedRowIds([rowId]);
                        }}
                      >
                        {scatterData.map((entry) => (
                          <Cell
                            key={entry.rowId}
                            fill={
                              entry.excluded
                                ? "#9ca3af"
                                : entry.selected || selectedSet.size === 0
                                ? "#16a34a"
                                : entry.labeled
                                ? "#0f766e"
                                : activeChartConfig.seriesColor
                            }
                          />
                        ))}
                      </Scatter>
                      {activeChartConfig.showLegend && <Legend />}
                    </ScatterChart>
                  ) : (
                    <BarChart data={barData} margin={{ top: 12, right: 16, bottom: 30, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="x" label={{ value: activeChartConfig.xAxisLabel || (activeChartColumnLabels[activeChartConfig.xColumn] || activeChartConfig.xColumn), position: "insideBottom", dy: 16, style: { fontSize: activeChartConfig.fontSize } }} tick={{ fontSize: activeChartConfig.fontSize }} />
                      <YAxis label={{ value: activeChartConfig.yAxisLabel || (activeChartColumnLabels[activeChartConfig.yColumn] || activeChartConfig.yColumn), angle: -90, position: "insideLeft", style: { fontSize: activeChartConfig.fontSize } }} tick={{ fontSize: activeChartConfig.fontSize }} />
                      <RechartsTooltip />
                      <Bar
                        dataKey="y"
                        name={activeChartConfig.yAxisLabel || (activeChartColumnLabels[activeChartConfig.yColumn] || activeChartConfig.yColumn)}
                        onClick={(data: any) => {
                          if (Array.isArray(data?.ids)) setSelectedRowIds(data.ids.map((id: any) => Number(id)).filter((v: number) => Number.isFinite(v)));
                        }}
                      >
                        {barData.map((entry, idx) => (
                          <Cell
                            key={`cell-${idx}`}
                            fill={
                              entry.excludedCount === entry.ids.length
                                ? "#9ca3af"
                                : entry.selectedCount > 0
                                ? "#16a34a"
                                : entry.labeledCount > 0
                                ? "#0f766e"
                                : selectedSet.size === 0
                                ? activeChartConfig.seriesColor
                                : "#93c5fd"
                            }
                            fillOpacity={entry.excludedCount === entry.ids.length ? 0.45 : 0.95}
                          />
                        ))}
                      </Bar>
                      {activeChartConfig.showLegend && <Legend />}
                      <Brush
                        dataKey="x"
                        height={20}
                        stroke="#16a34a"
                        onChange={(range: any) => {
                          if (!range || typeof range.startIndex !== "number" || typeof range.endIndex !== "number") return;
                          brushRangeRef.current = { startIndex: range.startIndex, endIndex: range.endIndex };
                          const inRange = barData
                            .slice(range.startIndex, range.endIndex + 1)
                            .flatMap((g) => g.ids)
                            .map(Number)
                            .filter((v) => Number.isFinite(v));
                          setSelectedRowIds(inRange);
                        }}
                      />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className={selectionPulse && workspaceSelectedRowIds.length ? "rounded-lg ring-2 ring-primary/25 transition-shadow" : ""}>
          <div className="mb-2 flex items-center justify-end">
            <span className={`rounded-md border px-2 py-1 text-[11px] ${workspaceSelectedRowIds.length ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
              {workspaceSelectedRowIds.length} selected
            </span>
          </div>
          <GraphBuilder
            rows={activeTab?.graphBuilderRows || analysisRows}
            columns={activeTab?.graphBuilderColumns || allColumns}
            columnLabels={activeTab?.graphBuilderColumnLabels || columnLabels}
            state={activeTab?.graphBuilderState || makeDefaultGraphBuilderState()}
            onStateChange={(next) => {
              if (!activeTab || activeTab.type !== "graph_builder") return;
              updateGraphBuilderTabState(activeTab.id, next);
            }}
          />
        </div>
      )}
    </div>
  );
};
