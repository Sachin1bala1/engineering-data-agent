import React, { useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, type ColDef, type GridApi, type IHeaderParams } from "ag-grid-community";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, Cell, Brush, Legend } from "recharts";
import Plot from "react-plotly.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GraphBuilder, type GraphBuilderState } from "@/components/features/analytics/graph-builder/GraphBuilder";
import type { GraphChartType } from "@/components/features/analytics/graph-builder/types";
import { useDataWorkbenchStore, type ColumnSemanticType, type WorkbenchChartType, type WorkbenchRow } from "@/stores/dataWorkbenchStore";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

ModuleRegistry.registerModules([AllCommunityModule]);

interface LinkedDataWorkbenchProps {
  rows: WorkbenchRow[];
  columns: string[];
  height?: number;
  showVisualizationByDefault?: boolean;
  openEditableChartRequest?: OpenEditableChartRequest | null;
}

type WorkbenchTabType = "data" | "chart" | "graph_builder";
type DataSourceMode = "linked" | "empty";

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

const HeaderWithType: React.FC<IHeaderParams> = (props) => {
  const setColumnType = useDataWorkbenchStore((s) => s.setColumnType);
  const typeValue = useDataWorkbenchStore((s) => s.columnDefinitions[props.column.getColId()]?.semanticType || "nominal");
  const col = props.column.getColId();
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="font-medium text-xs">{props.displayName}</span>
      <select
        value={typeValue}
        className="text-[10px] border rounded px-1 py-0.5 bg-background"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setColumnType(col, e.target.value as ColumnSemanticType)}
      >
        <option value="continuous">Continuous</option>
        <option value="nominal">Nominal</option>
        <option value="ordinal">Ordinal</option>
      </select>
    </div>
  );
};

export const LinkedDataWorkbench: React.FC<LinkedDataWorkbenchProps> = ({ rows, columns, height = 620, showVisualizationByDefault = false, openEditableChartRequest = null }) => {
  const gridApiRef = useRef<GridApi<WorkbenchRow> | null>(null);
  const brushRangeRef = useRef<{ startIndex: number; endIndex: number } | null>(null);

  const masterDataset = useDataWorkbenchStore((s) => s.masterDataset);
  const selectedRowIds = useDataWorkbenchStore((s) => s.selectedRowIds);
  const columnDefinitions = useDataWorkbenchStore((s) => s.columnDefinitions);
  const setDataset = useDataWorkbenchStore((s) => s.setDataset);
  const setSelectedRowIds = useDataWorkbenchStore((s) => s.setSelectedRowIds);
  const updateCell = useDataWorkbenchStore((s) => s.updateCell);

  const [columnAliases, setColumnAliases] = useState<Record<string, string>>({});
  const [renameColumnKey, setRenameColumnKey] = useState<string>("");
  const [renameColumnValue, setRenameColumnValue] = useState<string>("");
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabLabel, setEditingTabLabel] = useState<string>("");

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

  useEffect(() => {
    if (!columns.length) return;
    setDataset(rows, columns);
  }, [rows, columns, setDataset]);

  useEffect(() => {
    setColumnAliases((prev) => {
      const next: Record<string, string> = {};
      for (const col of columns) next[col] = prev[col] || col;
      return next;
    });
    if (!renameColumnKey && columns.length) {
      setRenameColumnKey(columns[0]);
      setRenameColumnValue(columns[0]);
    } else if (renameColumnKey && !columns.includes(renameColumnKey)) {
      const fallback = columns[0] || "";
      setRenameColumnKey(fallback);
      setRenameColumnValue(columnAliases[fallback] || fallback);
    }
  }, [columns]);

  const normalizedDataset = useMemo<WorkbenchRow[]>(() => {
    return masterDataset.map((row, idx) => {
      const existing = Number((row as any).__row_index__);
      if (Number.isFinite(existing)) return row;
      return { ...row, __row_index__: idx } as WorkbenchRow;
    });
  }, [masterDataset]);

  const defaultX = useMemo(() => {
    if (!columns.length) return "";
    const nominal = columns.filter((c) => columnDefinitions[c]?.semanticType !== "continuous");
    return nominal[0] || columns[0];
  }, [columns, columnDefinitions]);

  const defaultY = useMemo(() => {
    if (!columns.length) return "";
    const continuous = columns.filter((c) => columnDefinitions[c]?.semanticType === "continuous");
    const fallback = columns.find((c) => c !== defaultX);
    return continuous[0] || fallback || columns[0];
  }, [columns, columnDefinitions, defaultX]);

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

  const makeDefaultGraphBuilderState = (): GraphBuilderState => ({
    roles: { y: [], overlay: [] },
    config: {
      chartType: "auto",
      summary: "mean",
      title: "Graph Builder",
      xLabel: "",
      yLabel: "",
      showLegend: true,
      fontSize: 12,
      markerSize: 8,
      chartHeight: 520,
      colorPreset: "default",
    },
  });

  const graphTypeFromWorkbench = (t: WorkbenchChartType): GraphChartType => (t === "scatter" ? "scatter" : "bar_grouped");

  const inferGraphTypeFromSpec = (spec: any, fallback: GraphChartType): GraphChartType => {
    const title = String(spec?.title || "").toLowerCase();
    const panels = Array.isArray(spec?.panels) ? spec.panels : [];
    const traces = panels.length ? (panels[0]?.traces || []) : (Array.isArray(spec?.traces) ? spec.traces : []);
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

  const makeGraphBuilderStateFromChart = (cfg: Partial<ChartTabConfig>, fallbackTitle: string): GraphBuilderState => {
    const base = makeDefaultGraphBuilderState();
    const inferredType = inferGraphTypeFromSpec(
      cfg.sourceSpec,
      graphTypeFromWorkbench((cfg.chartType || defaultChartType) as WorkbenchChartType)
    );
    const yCol = cfg.yColumn || defaultY;
    const xCol = cfg.xColumn || defaultX;
    return {
      roles: {
        x: xCol || undefined,
        y: yCol ? [yCol] : [],
        overlay: [],
      },
      config: {
        ...base.config,
        chartType: inferredType,
        title: cfg.title || fallbackTitle,
        xLabel: cfg.xAxisLabel || "",
        yLabel: cfg.yAxisLabel || "",
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
        const nextX = columns.includes(cfg.xColumn) ? cfg.xColumn : defaultX;
        const nextY = columns.includes(cfg.yColumn) ? cfg.yColumn : defaultY;
        const existingBuilder = cfg.builderState || makeGraphBuilderStateFromChart(cfg, tab.label);
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
                x: existingBuilder.roles?.x && columns.includes(existingBuilder.roles.x) ? existingBuilder.roles.x : nextX,
                y: Array.isArray(existingBuilder.roles?.y)
                  ? existingBuilder.roles.y.filter((y) => columns.includes(y))
                  : [nextY],
                overlay: Array.isArray(existingBuilder.roles?.overlay)
                  ? existingBuilder.roles.overlay.filter((o) => columns.includes(o))
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

  const tabColumns = activeTab?.type === "data" && activeTab.dataMode === "empty" ? [] : columns;
  const tabRows = activeTab?.type === "data" && activeTab.dataMode === "empty" ? [] : normalizedDataset;

  const colDefs = useMemo<ColDef<WorkbenchRow>[]>(() => {
    return tabColumns.map((column) => ({
      field: column,
      headerName: columnAliases[column] || column,
      editable: true,
      sortable: true,
      filter: true,
      minWidth: 130,
      headerComponent: HeaderWithType,
      valueParser: (params) => params.newValue,
    }));
  }, [tabColumns, columnAliases]);

  const selectedSet = useMemo(() => new Set(selectedRowIds.map(Number)), [selectedRowIds]);

  useEffect(() => {
    const api = gridApiRef.current;
    if (!api) return;
    api.forEachNode((node) => {
      const rowId = Number(node.data?.__row_index__);
      const shouldSelect = selectedSet.has(rowId);
      if (node.isSelected() !== shouldSelect) node.setSelected(shouldSelect);
    });
    const first = selectedRowIds[0];
    if (first !== undefined && first !== null) {
      const rowIndex = normalizedDataset.findIndex((r) => Number(r.__row_index__) === Number(first));
      if (rowIndex >= 0) api.ensureIndexVisible(rowIndex, "middle");
    }
  }, [selectedSet, selectedRowIds, normalizedDataset]);

  const scatterData = useMemo(() => {
    return normalizedDataset
      .map((row) => {
        const x = toNumberOrNull(row[activeChartConfig.xColumn]);
        const y = toNumberOrNull(row[activeChartConfig.yColumn]);
        if (x === null || y === null) return null;
        return { x, y, rowId: Number(row.__row_index__), selected: selectedSet.has(Number(row.__row_index__)) };
      })
      .filter(Boolean) as Array<{ x: number; y: number; rowId: number; selected: boolean }>;
  }, [normalizedDataset, activeChartConfig.xColumn, activeChartConfig.yColumn, selectedSet]);

  const barData = useMemo(() => {
    const groups = new Map<string, { ids: number[]; y: number[] }>();
    for (const row of normalizedDataset) {
      const xRaw = row[activeChartConfig.xColumn];
      const y = toNumberOrNull(row[activeChartConfig.yColumn]);
      if (isMissingValue(xRaw) || y === null) continue;
      const key = String(row[activeChartConfig.xColumn] ?? "");
      if (!groups.has(key)) groups.set(key, { ids: [], y: [] });
      const g = groups.get(key)!;
      g.ids.push(Number(row.__row_index__));
      g.y.push(y);
    }
    const items: Array<{ x: string; y: number; ids: number[]; selectedCount: number }> = [];
    for (const [x, value] of groups.entries()) {
      const selectedCount = value.ids.filter((id) => selectedSet.has(id)).length;
      items.push({
        x,
        y: value.y.length ? value.y.reduce((a, b) => a + b, 0) / value.y.length : 0,
        ids: value.ids,
        selectedCount,
      });
    }
    return items;
  }, [normalizedDataset, activeChartConfig.xColumn, activeChartConfig.yColumn, selectedSet]);

  const applyColumnRename = () => {
    if (!renameColumnKey) return;
    const nextLabel = renameColumnValue.trim();
    setColumnAliases((prev) => ({
      ...prev,
      [renameColumnKey]: nextLabel || renameColumnKey,
    }));
  };

  return (
    <div className="space-y-3">
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

      {columns.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Rename Columns (Display Names)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Select value={renameColumnKey || "__none__"} onValueChange={(v) => {
              if (v === "__none__") return;
              setRenameColumnKey(v);
              setRenameColumnValue(columnAliases[v] || v);
            }}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Select column" /></SelectTrigger>
              <SelectContent>
                {columns.map((col) => (
                  <SelectItem key={col} value={col}>{columnAliases[col] || col}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={renameColumnValue} onChange={(e) => setRenameColumnValue(e.target.value)} placeholder="New display name" className="w-[260px]" />
            <Button type="button" size="sm" onClick={applyColumnRename}>Rename</Button>
          </CardContent>
        </Card>
      )}

      {activeTab?.type === "data" ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{activeTab.label} - Interactive Grid</CardTitle>
          </CardHeader>
          <CardContent>
            {activeTab.dataMode === "empty" ? (
              <div className="border rounded-md p-4 text-sm text-muted-foreground">
                This is a new empty data table. Use linked tables for existing dataset rows.
              </div>
            ) : (
              <div className="ag-theme-quartz w-full" style={{ height }}>
                <AgGridReact
                  rowData={tabRows}
                  columnDefs={colDefs}
                  rowSelection="multiple"
                  animateRows
                  getRowId={(params) => String(Number(params.data.__row_index__))}
                  onGridReady={(e) => {
                    gridApiRef.current = e.api;
                  }}
                  onSelectionChanged={() => {
                    const api = gridApiRef.current;
                    if (!api) return;
                    const ids = api.getSelectedNodes().map((n) => Number(n.data?.__row_index__)).filter((v) => Number.isFinite(v));
                    setSelectedRowIds(ids);
                  }}
                  onCellValueChanged={(event) => {
                    const rowId = Number(event.data?.__row_index__);
                    if (!Number.isFinite(rowId)) return;
                    updateCell(rowId, event.colDef.field || "", event.newValue);
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      ) : activeTab?.type === "chart" ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{activeTab.label} - Editable Visualization</CardTitle>
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
                  {columns.map((col) => (
                    <SelectItem key={col} value={col}>{columnAliases[col] || col}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={activeChartConfig.yColumn} onValueChange={(v) => activeTab && updateChartTab(activeTab.id, { yColumn: v })}>
                <SelectTrigger><SelectValue placeholder="Y column" /></SelectTrigger>
                <SelectContent>
                  {columns.map((col) => (
                    <SelectItem key={col} value={col}>{columnAliases[col] || col}</SelectItem>
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
              Column types: {columns.map((c) => `${columnAliases[c] || c}:${columnDefinitions[c]?.semanticType || "nominal"}`).join(" | ")}
            </div>

            {activeChartConfig.viewMode !== "image" && activeChartConfig.editorMode === "builder" ? (
              <GraphBuilder
                rows={normalizedDataset}
                columns={columns}
                columnLabels={columnAliases}
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
                  <Plot
                    data={(() => {
                      const panels = Array.isArray(activeChartConfig.sourceSpec?.panels)
                        ? activeChartConfig.sourceSpec.panels
                        : [];
                      const panelIndex = Math.max(0, Math.min(Number(activeChartConfig.specPanelIndex || 0), Math.max(0, panels.length - 1)));
                      const panel = panels.length ? panels[panelIndex] : null;
                      const traces = panel?.traces || activeChartConfig.sourceSpec?.traces || [];
                      return Array.isArray(traces)
                        ? traces.map((trace: any, idx: number) => {
                          const baseName = String(trace?.name || `Series ${idx + 1}`);
                          if (trace?.type === "bar") {
                            return {
                              type: "bar",
                              name: baseName,
                              x: Array.isArray(trace?.x) ? trace.x : [],
                              y: Array.isArray(trace?.y) ? trace.y : [],
                              marker: { color: activeChartConfig.seriesColor },
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
                            line: { color: activeChartConfig.seriesColor },
                            marker: { color: activeChartConfig.seriesColor, size: activeChartConfig.markerSize },
                            hovertemplate: "x=%{x}<br>y=%{y}<extra>" + baseName + "</extra>",
                          };
                        })
                        : [];
                    })()}
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
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  {activeChartConfig.chartType === "scatter" ? (
                    <ScatterChart margin={{ top: 12, right: 16, bottom: 30, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="x" name={activeChartConfig.xColumn} label={{ value: activeChartConfig.xAxisLabel || (columnAliases[activeChartConfig.xColumn] || activeChartConfig.xColumn), position: "insideBottom", dy: 16, style: { fontSize: activeChartConfig.fontSize } }} tick={{ fontSize: activeChartConfig.fontSize }} />
                      <YAxis dataKey="y" name={activeChartConfig.yColumn} label={{ value: activeChartConfig.yAxisLabel || (columnAliases[activeChartConfig.yColumn] || activeChartConfig.yColumn), angle: -90, position: "insideLeft", style: { fontSize: activeChartConfig.fontSize } }} tick={{ fontSize: activeChartConfig.fontSize }} />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                      <Scatter
                        name="rows"
                        data={scatterData}
                        fill={activeChartConfig.seriesColor}
                        legendType={activeChartConfig.showLegend ? "circle" : "none"}
                        shape={(props: any) => (
                          <circle
                            cx={props.cx}
                            cy={props.cy}
                            r={Math.max(2, activeChartConfig.markerSize / 2)}
                            fill={props.fill}
                            fillOpacity={0.9}
                          />
                        )}
                        onClick={(point: any) => {
                          const rowId = Number(point?.rowId);
                          if (Number.isFinite(rowId)) setSelectedRowIds([rowId]);
                        }}
                      >
                        {scatterData.map((entry) => (
                          <Cell key={entry.rowId} fill={entry.selected || selectedSet.size === 0 ? "#16a34a" : activeChartConfig.seriesColor} />
                        ))}
                      </Scatter>
                      {activeChartConfig.showLegend && <Legend />}
                    </ScatterChart>
                  ) : (
                    <BarChart data={barData} margin={{ top: 12, right: 16, bottom: 30, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="x" label={{ value: activeChartConfig.xAxisLabel || (columnAliases[activeChartConfig.xColumn] || activeChartConfig.xColumn), position: "insideBottom", dy: 16, style: { fontSize: activeChartConfig.fontSize } }} tick={{ fontSize: activeChartConfig.fontSize }} />
                      <YAxis label={{ value: activeChartConfig.yAxisLabel || (columnAliases[activeChartConfig.yColumn] || activeChartConfig.yColumn), angle: -90, position: "insideLeft", style: { fontSize: activeChartConfig.fontSize } }} tick={{ fontSize: activeChartConfig.fontSize }} />
                      <Tooltip />
                      <Bar
                        dataKey="y"
                        name={activeChartConfig.yAxisLabel || (columnAliases[activeChartConfig.yColumn] || activeChartConfig.yColumn)}
                        onClick={(data: any) => {
                          if (Array.isArray(data?.ids)) setSelectedRowIds(data.ids.map((id: any) => Number(id)).filter((v: number) => Number.isFinite(v)));
                        }}
                      >
                        {barData.map((entry, idx) => (
                          <Cell key={`cell-${idx}`} fill={selectedSet.size === 0 ? activeChartConfig.seriesColor : entry.selectedCount > 0 ? "#16a34a" : "#93c5fd"} />
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
        <GraphBuilder
          rows={normalizedDataset}
          columns={columns}
          columnLabels={columnAliases}
          state={activeTab?.graphBuilderState || makeDefaultGraphBuilderState()}
          onStateChange={(next) => {
            if (!activeTab || activeTab.type !== "graph_builder") return;
            updateGraphBuilderTabState(activeTab.id, next);
          }}
        />
      )}
    </div>
  );
};
