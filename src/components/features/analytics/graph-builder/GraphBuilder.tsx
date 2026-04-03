
import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkspaceActionBar } from "@/components/workspace/WorkspaceActionBar";
import { WorkspaceSidebarSection } from "@/components/workspace/WorkspaceSidebarSection";
import { WorkspaceMetricChip } from "@/components/workspace/WorkspaceMetricChip";
import { workspaceSectionCardHeaderClassName, workspaceSectionCardTitleClassName, workspaceToolbarButtonClassName, workspaceToolbarInputClassName, workspaceToolbarSelectClassName } from "@/components/workspace/workspaceToolbarTokens";
import type { WorkbenchRow } from "@/stores/dataWorkbenchStore";
import { useGraphBuilderStore } from "@/stores/graphBuilderStore";
import { ChartDisplay } from "./ChartDisplay";
import { DropZone } from "./DropZone";
import { VariableList } from "./VariableList";
import type {
  GraphBuilderConfig,
  GraphChartType,
  GraphFilter,
  GraphLayerConfig,
  GraphRoles,
  LayerSelectionMode,
  LegendBehavior,
  StatisticalOverlay,
  SummaryStatistic,
  VariableMeta,
} from "./types";

export interface GraphBuilderState {
  roles: GraphRoles;
  config: GraphBuilderConfig;
}

interface GraphBuilderProps {
  rows: WorkbenchRow[];
  columns: string[];
  columnLabels: Record<string, string>;
  state: GraphBuilderState;
  onStateChange: (next: GraphBuilderState) => void;
}

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

const toDateIsoOrNull = (value: any): string | null => {
  if (isMissingValue(value)) return null;
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

const toAxisNumberOrNull = (value: any): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const percentile = (values: number[], p: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
};

const deriveVariableMeta = (rows: WorkbenchRow[], columns: string[], labels: Record<string, string>): VariableMeta[] => {
  return columns.map((col) => {
    const sample = rows.slice(0, 2000).map((r) => r[col]);
    const nonMissing = sample.filter((v) => !isMissingValue(v));
    const numericVals = nonMissing.map((v) => Number(v)).filter((n) => Number.isFinite(n));
    const numericRatio = nonMissing.length ? numericVals.length / nonMissing.length : 0;
    const uniqueCount = new Set(nonMissing.map((v) => String(v))).size;
    const lower = col.toLowerCase();
    const isDatetime = /time|date|timestamp/.test(lower);
    const type: VariableMeta["type"] = isDatetime
      ? "datetime"
      : numericRatio >= 0.65
      ? "continuous"
      : "categorical";
    const mean = numericVals.length ? numericVals.reduce((a, b) => a + b, 0) / numericVals.length : undefined;
    return {
      key: col,
      label: labels[col] || col,
      numeric: type === "continuous",
      type,
      missingPct: sample.length ? (sample.length - nonMissing.length) / sample.length : 0,
      uniqueCount,
      sampleStats:
        numericVals.length > 0
          ? {
              mean,
              median: percentile(numericVals, 0.5),
              std: mean !== undefined
                ? Math.sqrt(numericVals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / Math.max(1, numericVals.length - 1))
                : undefined,
              min: Math.min(...numericVals),
              max: Math.max(...numericVals),
            }
          : undefined,
    };
  });
};

const aggregate = (values: number[], summary: SummaryStatistic): number => {
  if (summary === "count") return values.length;
  if (!values.length) return 0;
  if (summary === "sum") return values.reduce((a, b) => a + b, 0);
  return values.reduce((a, b) => a + b, 0) / values.length;
};

const mean = (values: number[]): number => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

const chooseAutoType = (roles: GraphRoles, variables: VariableMeta[]): GraphChartType => {
  const metaMap = new Map(variables.map((v) => [v.key, v]));
  if (roles.x && roles.y.length) {
    const xType = metaMap.get(roles.x)?.type;
    const yType = metaMap.get(roles.y[0])?.type;
    if (xType === "continuous" && yType === "continuous") return "scatter";
    if (xType !== "continuous" && yType === "continuous") return "box";
    if (xType === "continuous" && yType !== "continuous") return "bar_grouped";
  }
  if (!roles.x && roles.y.length) return "histogram";
  return "scatter";
};

const layerToChartType = (layer: GraphLayerConfig[]): GraphChartType | null => {
  const active = layer.find((l) => l.enabled);
  if (!active) return null;
  const map: Record<string, GraphChartType> = {
    scatter: "scatter",
    line: "line",
    bar: "bar_grouped",
    box: "box",
    histogram: "histogram",
    heatmap: "heatmap",
    contour: "contour",
  };
  return map[active.type] || null;
};

const chartTypeToLayer = (type: GraphChartType): GraphLayerConfig["type"] => {
  const map: Record<GraphChartType, GraphLayerConfig["type"]> = {
    auto: "scatter",
    scatter: "scatter",
    line: "line",
    bar_grouped: "bar",
    bar_stacked: "bar",
    histogram: "histogram",
    box: "box",
    heatmap: "heatmap",
    contour: "contour",
  };
  return map[type] || "scatter";
};

const LAYER_META: Record<GraphLayerConfig["type"], { label: string; glyph: string }> = {
  scatter: { label: "Scatter", glyph: "*" },
  line: { label: "Line", glyph: "/" },
  bar: { label: "Bar", glyph: "|||" },
  box: { label: "Box", glyph: "[ ]" },
  histogram: { label: "Histogram", glyph: "##" },
  density: { label: "Density", glyph: "~" },
  heatmap: { label: "Heatmap", glyph: "HM" },
  contour: { label: "Contour", glyph: "CT" },
};

const LayerTypeIcon: React.FC<{ type: GraphLayerConfig["type"]; className?: string }> = ({ type, className = "h-4 w-4" }) => {
  const stroke = "currentColor";
  const common = { fill: "none", stroke, strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (type === "scatter") {
    return <svg viewBox="0 0 20 20" className={className}><circle cx="5" cy="14" r="1.7" fill={stroke} /><circle cx="9" cy="9" r="1.7" fill={stroke} /><circle cx="14" cy="6" r="1.7" fill={stroke} /><circle cx="15.5" cy="13" r="1.7" fill={stroke} /></svg>;
  }
  if (type === "line") {
    return <svg viewBox="0 0 20 20" className={className}><path d="M3 14 7.5 10.5 11 12 16.5 5.5" {...common} /><circle cx="3" cy="14" r="1.2" fill={stroke} /><circle cx="7.5" cy="10.5" r="1.2" fill={stroke} /><circle cx="11" cy="12" r="1.2" fill={stroke} /><circle cx="16.5" cy="5.5" r="1.2" fill={stroke} /></svg>;
  }
  if (type === "bar") {
    return <svg viewBox="0 0 20 20" className={className}><rect x="3" y="9" width="3" height="7" rx="1" fill={stroke} /><rect x="8.5" y="5" width="3" height="11" rx="1" fill={stroke} /><rect x="14" y="7" width="3" height="9" rx="1" fill={stroke} /></svg>;
  }
  if (type === "histogram") {
    return <svg viewBox="0 0 20 20" className={className}><path d="M3 16V9M7 16V6M11 16V11M15 16V4" {...common} /></svg>;
  }
  if (type === "box") {
    return <svg viewBox="0 0 20 20" className={className}><path d="M4 10h12M7 6h6v8H7zM10 3v3M10 14v3" {...common} /></svg>;
  }
  if (type === "density") {
    return <svg viewBox="0 0 20 20" className={className}><path d="M2.5 14c2.2-5.4 4.4-8.1 7-8.1 2 0 3.7 1.9 5.1 5.5.6 1.5 1.4 2.4 2.9 2.6" {...common} /></svg>;
  }
  if (type === "heatmap") {
    return <svg viewBox="0 0 20 20" className={className}><rect x="3" y="3" width="5" height="5" rx="1" fill={stroke} opacity=".45" /><rect x="9" y="3" width="8" height="5" rx="1" fill={stroke} opacity=".7" /><rect x="3" y="9" width="6" height="8" rx="1" fill={stroke} opacity=".75" /><rect x="10" y="10" width="7" height="7" rx="1" fill={stroke} /></svg>;
  }
  if (type === "contour") {
    return <svg viewBox="0 0 20 20" className={className}><path d="M4 13c2.2-3.5 4.4-5 7-5 2.2 0 3.6.8 5 2.2M3.5 9.5c2.6-2 4.7-3 7.2-3 2.5 0 4.4.8 5.8 2.4M6 16c1.4-2 3-3 5-3 1.6 0 3 .5 4 1.5" {...common} /></svg>;
  }
  return <svg viewBox="0 0 20 20" className={className}><path d="M3 10h14" {...common} /></svg>;
};

const OVERLAY_OPTIONS: StatisticalOverlay[] = [
  "fit_line",
  "mean_line",
  "median_line",
  "polynomial_fit",
  "loess",
  "confidence_interval",
];
const solveLinearSystem = (matrix: number[][], vector: number[]): number[] | null => {
  const n = matrix.length;
  const a = matrix.map((row) => [...row]);
  const b = [...vector];
  for (let i = 0; i < n; i += 1) {
    let pivot = i;
    for (let r = i + 1; r < n; r += 1) {
      if (Math.abs(a[r][i]) > Math.abs(a[pivot][i])) pivot = r;
    }
    if (Math.abs(a[pivot][i]) < 1e-12) return null;
    [a[i], a[pivot]] = [a[pivot], a[i]];
    [b[i], b[pivot]] = [b[pivot], b[i]];
    const div = a[i][i];
    for (let c = i; c < n; c += 1) a[i][c] /= div;
    b[i] /= div;
    for (let r = 0; r < n; r += 1) {
      if (r === i) continue;
      const factor = a[r][i];
      for (let c = i; c < n; c += 1) a[r][c] -= factor * a[i][c];
      b[r] -= factor * b[i];
    }
  }
  return b;
};

const linearRegression = (pairs: Array<{ x: number; y: number }>) => {
  const n = pairs.length;
  if (n < 2) return null;
  const sx = pairs.reduce((a, p) => a + p.x, 0);
  const sy = pairs.reduce((a, p) => a + p.y, 0);
  const sxy = pairs.reduce((a, p) => a + p.x * p.y, 0);
  const sxx = pairs.reduce((a, p) => a + p.x * p.x, 0);
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const b1 = (n * sxy - sx * sy) / denom;
  const b0 = (sy - b1 * sx) / n;
  return { b0, b1 };
};

const polynomialRegressionDegree2 = (pairs: Array<{ x: number; y: number }>) => {
  if (pairs.length < 3) return null;
  const sx = pairs.reduce((a, p) => a + p.x, 0);
  const sx2 = pairs.reduce((a, p) => a + p.x * p.x, 0);
  const sx3 = pairs.reduce((a, p) => a + p.x * p.x * p.x, 0);
  const sx4 = pairs.reduce((a, p) => a + p.x * p.x * p.x * p.x, 0);
  const sy = pairs.reduce((a, p) => a + p.y, 0);
  const sxy = pairs.reduce((a, p) => a + p.x * p.y, 0);
  const sx2y = pairs.reduce((a, p) => a + p.x * p.x * p.y, 0);
  const coeff = solveLinearSystem(
    [
      [pairs.length, sx, sx2],
      [sx, sx2, sx3],
      [sx2, sx3, sx4],
    ],
    [sy, sxy, sx2y]
  );
  if (!coeff) return null;
  return { c0: coeff[0], c1: coeff[1], c2: coeff[2] };
};

export const GraphBuilder: React.FC<GraphBuilderProps> = ({ rows, columns, columnLabels, state, onStateChange }) => {
  const [isDesktopLayout, setIsDesktopLayout] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  const [activeBottomTab, setActiveBottomTab] = useState<"preview" | "spec" | "agg">("preview");
  const [filterCol, setFilterCol] = useState<string>("");
  const [filterValue, setFilterValue] = useState<string>("__all__");
  const [selectedLayerType, setSelectedLayerType] = useState<GraphLayerConfig["type"]>("scatter");
  const [draggingLayerType, setDraggingLayerType] = useState<GraphLayerConfig["type"] | null>(null);
  const [draggingActiveLayerType, setDraggingActiveLayerType] = useState<GraphLayerConfig["type"] | null>(null);
  const [isLayerDropOver, setIsLayerDropOver] = useState(false);
  const [isVariableDragging, setIsVariableDragging] = useState(false);
  const [columnsCollapsed, setColumnsCollapsed] = useState(false);
  const [plotResetNonce, setPlotResetNonce] = useState(0);
  const [templateName, setTemplateName] = useState("Default Template");
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("__none__");
  const [templateRevision, setTemplateRevision] = useState(0);

  const variables = useMemo<VariableMeta[]>(() => deriveVariableMeta(rows, columns, columnLabels), [rows, columns, columnLabels]);

  const datasetName = useGraphBuilderStore((s) => s.datasetName);
  const setDatasetContext = useGraphBuilderStore((s) => s.setDatasetContext);
  const rolesStore = useGraphBuilderStore((s) => s.roles);
  const configStore = useGraphBuilderStore((s) => s.config);
  const layers = useGraphBuilderStore((s) => s.layers);
  const statistics = useGraphBuilderStore((s) => s.statistics);
  const filters = useGraphBuilderStore((s) => s.filters);
  const axisX = useGraphBuilderStore((s) => s.axisX);
  const axisY = useGraphBuilderStore((s) => s.axisY);
  const setRolesStore = useGraphBuilderStore((s) => s.setRoles);
  const setConfigStore = useGraphBuilderStore((s) => s.setConfig);
  const setLayers = useGraphBuilderStore((s) => s.setLayers);
  const setStatistics = useGraphBuilderStore((s) => s.setStatistics);
  const setFilters = useGraphBuilderStore((s) => s.setFilters);
  const setAxisX = useGraphBuilderStore((s) => s.setAxisX);
  const setAxisY = useGraphBuilderStore((s) => s.setAxisY);
  const resetExploration = useGraphBuilderStore((s) => s.resetExploration);
  const getGraphSpec = useGraphBuilderStore((s) => s.getGraphSpec);

  useEffect(() => {
    setDatasetContext({ datasetName: "Linked Dataset", rows, variables });
  }, [rows, variables, setDatasetContext]);

  useEffect(() => {
    setRolesStore(state.roles);
    setConfigStore(state.config);
  }, [state.roles, state.config, setRolesStore, setConfigStore]);

  useEffect(() => {
    if ((state.config?.layerSelectionMode || "solo") === "compose") return;
    if (!state.config?.chartType || state.config.chartType === "auto") return;
    const mapped = chartTypeToLayer(state.config.chartType);
    const hasMismatch = layers.some((layer) => layer.enabled !== (layer.type === mapped));
    if (!hasMismatch) return;
    setLayers(
      layers.map((layer) => ({
        ...layer,
        enabled: layer.type === mapped,
      }))
    );
  }, [state.config?.chartType, layers, setLayers]);

  useEffect(() => {
    const enabledLayers = layers
      .filter((layer) => layer.enabled)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    if (!enabledLayers.length) return;
    const selectedEnabled = enabledLayers.some((layer) => layer.type === selectedLayerType);
    if (selectedEnabled) return;
    setSelectedLayerType(enabledLayers[0].type);
  }, [layers, selectedLayerType]);

  useEffect(() => {
    onStateChange({ roles: rolesStore, config: configStore });
  }, [rolesStore, configStore, onStateChange]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktopLayout(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const roles = rolesStore;
  const config = configStore;

  const labelsMap = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const c of columns) m[c] = columnLabels[c] || c;
    return m;
  }, [columns, columnLabels]);

  const variableTypeByKey = useMemo(() => {
    return new Map(variables.map((variable) => [variable.key, variable.type]));
  }, [variables]);

  const patchRoles = (updater: (prev: GraphRoles) => GraphRoles) => {
    setRolesStore(updater(rolesStore));
  };

  const patchConfig = (updater: (prev: GraphBuilderConfig) => GraphBuilderConfig) => {
    setConfigStore(updater(configStore));
  };

  const setLayerSelectionMode = (next: LayerSelectionMode) => {
    patchConfig((prev) => ({ ...prev, layerSelectionMode: next }));
  };

  const setZone = (zone: keyof GraphRoles, key: string, multiple: boolean) => {
    patchRoles((prev) => {
      const current = prev[zone];
      if (multiple) {
        const arr = Array.isArray(current) ? current : [];
        if (arr.includes(key)) return prev;
        return { ...prev, [zone]: [...arr, key] };
      }
      return { ...prev, [zone]: key };
    });
  };

  const removeZone = (zone: keyof GraphRoles, key: string) => {
    patchRoles((prev) => {
      const current = prev[zone];
      if (Array.isArray(current)) return { ...prev, [zone]: current.filter((v) => v !== key) };
      return { ...prev, [zone]: undefined };
    });
  };

  const resolvedType = useMemo(() => {
    if (config.chartType !== "auto") return config.chartType;
    const fromLayers = layerToChartType(layers);
    if (fromLayers) return fromLayers;
    return chooseAutoType(roles, variables);
  }, [config.chartType, layers, roles, variables]);

  const uniqueValuesForFilter = useMemo(() => {
    if (!filterCol) return [];
    return Array.from(new Set(rows.map((r) => String(r[filterCol] ?? "")))).slice(0, 200);
  }, [rows, filterCol]);

  const filteredRows = useMemo(() => {
    if (!filters.length) return rows;
    return rows.filter((row) =>
      filters.every((f) => {
        if (!f.selectedValues.length) return true;
        return f.selectedValues.includes(String(row[f.column] ?? ""));
      })
    );
  }, [rows, filters]);

  const panelRows = useMemo(() => {
    const rowKey = roles.wrap;
    const colKey = roles.facetColumn;
    if (!rowKey && !colKey) return [{ key: "__all__", rowLabel: null, colLabel: null, rows: filteredRows }];
    const grouped = new Map<string, { key: string; rowLabel: string | null; colLabel: string | null; rows: WorkbenchRow[] }>();
    for (const row of filteredRows) {
      const rowVal = rowKey ? String(row[rowKey] ?? "(blank)") : null;
      const colVal = colKey ? String(row[colKey] ?? "(blank)") : null;
      const key = `${rowVal ?? "__all__"}::${colVal ?? "__all__"}`;
      if (!grouped.has(key)) grouped.set(key, { key, rowLabel: rowVal, colLabel: colVal, rows: [] });
      grouped.get(key)!.rows.push(row);
    }
    return Array.from(grouped.values()).slice(0, 24);
  }, [filteredRows, roles.facetColumn, roles.wrap]);

  const paletteByPreset: Record<GraphBuilderConfig["colorPreset"], string[]> = {
    default: ["#2563eb", "#16a34a", "#dc2626", "#9333ea", "#f59e0b"],
    ocean: ["#0f766e", "#0369a1", "#1d4ed8", "#14b8a6", "#22d3ee"],
    warm: ["#b45309", "#dc2626", "#be123c", "#f59e0b", "#f97316"],
    mono: ["#111827", "#374151", "#6b7280", "#9ca3af", "#d1d5db"],
  };

  const appendStatOverlays = (
    traces: any[],
    xVals: any[],
    yVals: number[],
    yLabel: string,
    selectedStats: StatisticalOverlay[],
    layerCfg: GraphLayerConfig
  ) => {
    if (!yVals.length) return traces;
    const legendGroup = (layerCfg.legendGroup || layerCfg.type).trim() || layerCfg.type;
    const showInLegend = layerCfg.showInLegend !== false;
    if (selectedStats.includes("mean_line")) {
      const yMean = mean(yVals);
      traces.push({ type: "scatter", mode: "lines", name: `${yLabel} Mean`, x: xVals, y: xVals.map(() => yMean), line: { dash: "dash", color: "#ef4444", width: 2 }, legendgroup: legendGroup, showlegend: showInLegend, meta: { layerType: layerCfg.type, baseOpacity: 1 } });
    }
    if (selectedStats.includes("median_line")) {
      const med = percentile(yVals, 0.5);
      traces.push({ type: "scatter", mode: "lines", name: `${yLabel} Median`, x: xVals, y: xVals.map(() => med), line: { dash: "dot", color: "#f59e0b", width: 2 }, legendgroup: legendGroup, showlegend: showInLegend, meta: { layerType: layerCfg.type, baseOpacity: 1 } });
    }
    const pairs = xVals
      .map((x, i) => ({ x: toAxisNumberOrNull(x), rawX: x, y: yVals[i] }))
      .filter((p) => p.x !== null && Number.isFinite(p.x) && Number.isFinite(p.y))
      .sort((a, b) => Number(a.x) - Number(b.x));
    if (pairs.length < 3) return traces;
    const fit = linearRegression(pairs);
    if (selectedStats.includes("fit_line") && fit) {
      traces.push({
        type: "scatter",
        mode: "lines",
        name: `${yLabel} Fit`,
        x: pairs.map((p) => p.rawX),
        y: pairs.map((p) => fit.b0 + fit.b1 * Number(p.x)),
        line: { color: "#0ea5e9", width: 2 },
        legendgroup: legendGroup,
        showlegend: showInLegend,
        meta: { layerType: layerCfg.type, baseOpacity: 1 },
      });
    }
    if (selectedStats.includes("confidence_interval") && fit) {
      const residuals = pairs.map((p) => p.y - (fit.b0 + fit.b1 * Number(p.x)));
      const se = Math.sqrt(residuals.reduce((acc, r) => acc + r * r, 0) / Math.max(1, residuals.length - 2));
      const ci = 1.96 * se;
      const fitY = pairs.map((p) => fit.b0 + fit.b1 * Number(p.x));
      traces.push({
        type: "scatter",
        mode: "lines",
        x: pairs.map((p) => p.rawX),
        y: fitY.map((v) => v + ci),
        line: { width: 0 },
        hoverinfo: "skip",
        showlegend: false,
        legendgroup: legendGroup,
        meta: { layerType: layerCfg.type, baseOpacity: 1 },
      });
      traces.push({
        type: "scatter",
        mode: "lines",
        name: `${yLabel} 95% CI`,
        x: pairs.map((p) => p.rawX),
        y: fitY.map((v) => v - ci),
        line: { width: 0 },
        fill: "tonexty",
        fillcolor: "rgba(14,165,233,0.12)",
        legendgroup: legendGroup,
        showlegend: showInLegend,
        meta: { layerType: layerCfg.type, baseOpacity: 1 },
      });
    }
    if (selectedStats.includes("polynomial_fit")) {
      const poly = polynomialRegressionDegree2(pairs);
      if (poly) {
        traces.push({
          type: "scatter",
          mode: "lines",
          name: `${yLabel} Poly(2)`,
          x: pairs.map((p) => p.rawX),
          y: pairs.map((p) => poly.c0 + poly.c1 * Number(p.x) + poly.c2 * Number(p.x) * Number(p.x)),
          line: { color: "#8b5cf6", width: 2 },
          legendgroup: legendGroup,
          showlegend: showInLegend,
          meta: { layerType: layerCfg.type, baseOpacity: 1 },
        });
      }
    }
    if (selectedStats.includes("loess")) {
      const window = Math.max(5, Math.floor(pairs.length * 0.12));
      const smoothY = pairs.map((_, idx) => {
        const lo = Math.max(0, idx - Math.floor(window / 2));
        const hi = Math.min(pairs.length, lo + window);
        return mean(pairs.slice(lo, hi).map((p) => p.y));
      });
      traces.push({
        type: "scatter",
        mode: "lines",
        name: `${yLabel} LOESS`,
        x: pairs.map((p) => p.rawX),
        y: smoothY,
        line: { color: "#059669", width: 2, dash: "dot" },
        legendgroup: legendGroup,
        showlegend: showInLegend,
        meta: { layerType: layerCfg.type, baseOpacity: 1 },
      });
    }
    return traces;
  };

  const buildPlotForRows = (chunk: WorkbenchRow[]) => {
    const x = roles.x;
    const yVars = roles.y.length ? roles.y : [];
    const color = roles.color;
    const size = roles.size;
    const overlay = roles.overlay[0];
    const colors = paletteByPreset[config.colorPreset];
    const traces: any[] = [];
    const enabledLayers = layers
      .filter((layer) => layer.enabled)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    const activeLayers = enabledLayers.length ? enabledLayers.map((layer) => layer.type) : [chartTypeToLayer(resolvedType)];
    const yColumns = yVars.length ? yVars : columns.filter((c) => variables.find((v) => v.key === c)?.numeric).slice(0, 1);
    const groupBy = overlay || color || roles.group;
    const groupedRows = new Map<string, WorkbenchRow[]>();
    if (groupBy) {
      for (const row of chunk) {
        const key = String(row[groupBy] ?? "");
        if (!groupedRows.has(key)) groupedRows.set(key, []);
        groupedRows.get(key)!.push(row);
      }
    } else {
      groupedRows.set("Series", chunk);
    }

    const getLayerConfig = (type: GraphLayerConfig["type"]) =>
      layers.find((layer) => layer.type === type) || {
        id: type,
        type,
        enabled: true,
        order: 999,
        legendGroup: type,
        showInLegend: true,
        legendBehavior: "toggle",
        opacity: 0.85,
        lineWidth: 2,
        markerSymbol: "circle",
        jitter: 0,
        statistics: [],
      };

    const jitteredNumeric = (value: any, seed: number, jitter: number) => {
      const base = Number(value);
      if (!Number.isFinite(base) || jitter <= 0) return value;
      const noise = ((((seed * 9301 + 49297) % 233280) / 233280) * 2 - 1) * jitter;
      return base + noise;
    };

    const addScatterOrLineLayer = (mode: "markers" | "lines+markers", layerCfg: GraphLayerConfig) => {
      const legendGroup = (layerCfg.legendGroup || layerCfg.type).trim() || layerCfg.type;
      const showInLegend = layerCfg.showInLegend !== false;
      const xType = x ? variableTypeByKey.get(x) : undefined;
      let colorIndex = 0;
      for (const [g, rs] of groupedRows.entries()) {
        for (const yCol of yColumns) {
          const points = rs
            .map((r, idx) => ({
              x: x
                ? xType === "datetime"
                  ? toDateIsoOrNull(r[x])
                  : jitteredNumeric(r[x], Number(r.__row_index__ ?? idx), layerCfg.jitter ?? 0)
                : r.__row_index__,
              y: toNumberOrNull(r[yCol]),
              size: size ? toNumberOrNull(r[size]) : null,
              label: roles.label ? String(r[roles.label] ?? "") : "",
              seed: Number(r.__row_index__ ?? idx),
            }))
            .filter((p) => !isMissingValue(p.x) && p.y !== null);
          if (xType === "datetime") {
            points.sort((a, b) => {
              const left = toAxisNumberOrNull(a.x);
              const right = toAxisNumberOrNull(b.x);
              return (left ?? 0) - (right ?? 0);
            });
          }
          if (!points.length) continue;
          const trace: any = {
            type: "scatter",
            mode,
            name: yColumns.length > 1 ? `${g} - ${labelsMap[yCol]}` : g,
            x: points.map((p) => p.x),
            y: points.map((p) => Number(p.y)),
            text: points.map((p) => p.label),
            marker: { color: colors[colorIndex % colors.length], opacity: layerCfg.opacity ?? 0.85, symbol: layerCfg.markerSymbol || "circle" },
            line: { width: layerCfg.lineWidth ?? 2 },
            legendgroup: legendGroup,
            showlegend: showInLegend,
            meta: { layerType: layerCfg.type, baseOpacity: layerCfg.opacity ?? 0.85 },
            hovertemplate: `${x ? labelsMap[x] : "row"}=%{x}<br>${labelsMap[yCol]}=%{y}<extra>${g}</extra>`,
          };
          trace.marker.size = size
            ? points.map((p) => (p.size !== null ? Math.max(4, Math.min(26, Number(p.size))) : config.markerSize))
            : config.markerSize;
          traces.push(trace);
          const layerStats = (layerCfg.statistics && layerCfg.statistics.length ? layerCfg.statistics : statistics) as StatisticalOverlay[];
          appendStatOverlays(traces, trace.x, trace.y, labelsMap[yCol], layerStats, layerCfg);
          colorIndex += 1;
        }
      }
    };

    const addBarLayer = (layerCfg: GraphLayerConfig) => {
      const legendGroup = (layerCfg.legendGroup || layerCfg.type).trim() || layerCfg.type;
      const showInLegend = layerCfg.showInLegend !== false;
      if (!x || !yVars[0]) return;
      const layerGroupBy = color || overlay || roles.group;
      const groups = new Map<string, Map<string, number[]>>();
      for (const row of chunk) {
        const xVal = String(row[x] ?? "");
        if (!xVal || isMissingValue(xVal)) continue;
        const gVal = layerGroupBy ? String(row[layerGroupBy] ?? "Series") : "Series";
        if (!groups.has(gVal)) groups.set(gVal, new Map<string, number[]>());
        const xMap = groups.get(gVal)!;
        if (!xMap.has(xVal)) xMap.set(xVal, []);
        const v = toNumberOrNull(row[yVars[0]]);
        if (v !== null) xMap.get(xVal)!.push(v);
      }
      let idx = 0;
      for (const [g, xMap] of groups.entries()) {
        const xs = Array.from(xMap.keys());
        const ys = xs.map((k) => aggregate(xMap.get(k) || [], config.summary));
        traces.push({
          type: "bar",
          name: g,
          x: xs,
          y: ys,
          marker: { color: colors[idx % colors.length], opacity: layerCfg.opacity ?? 0.7, line: { width: layerCfg.lineWidth ?? 1 } },
          legendgroup: legendGroup,
          showlegend: showInLegend,
          meta: { layerType: layerCfg.type, baseOpacity: layerCfg.opacity ?? 0.7 },
        });
        idx += 1;
      }
    };

    const addBoxLayer = (layerCfg: GraphLayerConfig) => {
      const legendGroup = (layerCfg.legendGroup || layerCfg.type).trim() || layerCfg.type;
      const showInLegend = layerCfg.showInLegend !== false;
      if (!yColumns.length) return;
      const layerGroupBy = x || color || overlay || roles.group;
      if (!layerGroupBy) {
        yColumns.forEach((yCol, idx) => {
          traces.push({
            type: "box",
            y: chunk.map((r) => toNumberOrNull(r[yCol])).filter((v): v is number => v !== null),
            name: labelsMap[yCol],
            marker: { color: colors[idx % colors.length], opacity: layerCfg.opacity ?? 0.8 },
            line: { width: layerCfg.lineWidth ?? 1 },
            boxpoints: "all",
            jitter: Math.max(0, Math.min(1, layerCfg.jitter ?? 0)),
            pointpos: 0,
            legendgroup: legendGroup,
            showlegend: showInLegend,
            meta: { layerType: layerCfg.type, baseOpacity: layerCfg.opacity ?? 0.8 },
          });
        });
        return;
      }
      for (const yCol of yColumns) {
        const grouped = new Map<string, number[]>();
        for (const row of chunk) {
          const k = String(row[layerGroupBy] ?? "");
          if (!k || isMissingValue(k)) continue;
          if (!grouped.has(k)) grouped.set(k, []);
          const val = toNumberOrNull(row[yCol]);
          if (val !== null) grouped.get(k)!.push(val);
        }
        let idx = 0;
        for (const [k, vals] of grouped.entries()) {
          traces.push({
            type: "box",
            name: `${k}${yColumns.length > 1 ? ` - ${labelsMap[yCol]}` : ""}`,
            y: vals,
            marker: { color: colors[idx % colors.length], opacity: layerCfg.opacity ?? 0.8 },
            line: { width: layerCfg.lineWidth ?? 1 },
            boxpoints: "all",
            jitter: Math.max(0, Math.min(1, layerCfg.jitter ?? 0)),
            pointpos: 0,
            legendgroup: legendGroup,
            showlegend: showInLegend,
            meta: { layerType: layerCfg.type, baseOpacity: layerCfg.opacity ?? 0.8 },
          });
          idx += 1;
        }
      }
    };

    const addHistogramLayer = (layerCfg: GraphLayerConfig, density = false) => {
      const legendGroup = (layerCfg.legendGroup || layerCfg.type).trim() || layerCfg.type;
      const showInLegend = layerCfg.showInLegend !== false;
      const cols = [x, ...yColumns].filter(Boolean) as string[];
      const uniqueCols = Array.from(new Set(cols));
      uniqueCols.forEach((col, idx) => {
        const values = chunk.map((r) => toNumberOrNull(r[col])).filter((v): v is number => v !== null);
        if (!values.length) return;
        traces.push({
          type: "histogram",
          x: values,
          name: labelsMap[col],
          opacity: density ? Math.min(0.55, layerCfg.opacity ?? 0.45) : layerCfg.opacity ?? 0.75,
          histnorm: density ? "probability density" : undefined,
          marker: { color: colors[idx % colors.length], line: { width: layerCfg.lineWidth ?? 1 } },
          legendgroup: legendGroup,
          showlegend: showInLegend,
          meta: { layerType: layerCfg.type, baseOpacity: density ? Math.min(0.55, layerCfg.opacity ?? 0.45) : layerCfg.opacity ?? 0.75 },
        });
      });
    };

    const addHeatmapLayer = (layerCfg: GraphLayerConfig) => {
      const legendGroup = (layerCfg.legendGroup || layerCfg.type).trim() || layerCfg.type;
      const showInLegend = layerCfg.showInLegend !== false;
      if (!x || !yVars[0]) return;
      const pairs = chunk
        .map((r) => ({ x: r[x], y: r[yVars[0]] }))
        .filter((p) => !isMissingValue(p.x) && !isMissingValue(p.y));
      if (!pairs.length) return;
      traces.push({
        type: "histogram2d",
        x: pairs.map((p) => p.x),
        y: pairs.map((p) => p.y),
        colorscale: "Viridis",
        opacity: layerCfg.opacity ?? 0.9,
        legendgroup: legendGroup,
        showlegend: showInLegend,
        meta: { layerType: layerCfg.type, baseOpacity: layerCfg.opacity ?? 0.9 },
      });
    };

    const addContourLayer = (layerCfg: GraphLayerConfig) => {
      const legendGroup = (layerCfg.legendGroup || layerCfg.type).trim() || layerCfg.type;
      const showInLegend = layerCfg.showInLegend !== false;
      if (!x || !yVars[0]) return;
      const pairs = chunk
        .map((r) => ({ x: toNumberOrNull(r[x]), y: toNumberOrNull(r[yVars[0]]) }))
        .filter((p) => p.x !== null && p.y !== null);
      if (!pairs.length) return;
      traces.push({
        type: "histogram2dcontour",
        x: pairs.map((p) => Number(p.x)),
        y: pairs.map((p) => Number(p.y)),
        colorscale: "Viridis",
        contours: { coloring: "heatmap" },
        opacity: layerCfg.opacity ?? 0.8,
        line: { width: layerCfg.lineWidth ?? 1 },
        legendgroup: legendGroup,
        showlegend: showInLegend,
        meta: { layerType: layerCfg.type, baseOpacity: layerCfg.opacity ?? 0.8 },
      });
    };

    for (const layer of activeLayers) {
      const layerCfg = getLayerConfig(layer);
      if (layer === "scatter") addScatterOrLineLayer("markers", layerCfg);
      if (layer === "line") addScatterOrLineLayer("lines+markers", layerCfg);
      if (layer === "bar") addBarLayer(layerCfg);
      if (layer === "box") addBoxLayer(layerCfg);
      if (layer === "histogram") addHistogramLayer(layerCfg, false);
      if (layer === "density") addHistogramLayer(layerCfg, true);
      if (layer === "heatmap") addHeatmapLayer(layerCfg);
      if (layer === "contour") addContourLayer(layerCfg);
    }

    return traces;
  };

  const layoutBase = (titleSuffix: string | null) => {
    const xVariableType = roles.x ? variableTypeByKey.get(roles.x) : undefined;
    const xScale =
      xVariableType === "datetime"
        ? "date"
        : xVariableType === "categorical"
          ? "category"
          : axisX.scale === "sqrt"
            ? "linear"
            : axisX.scale;
    const yScale = axisY.scale === "sqrt" ? "linear" : axisY.scale;
    return {
      title: titleSuffix ? `${config.title} (${titleSuffix})` : config.title,
      xaxis: { title: { text: config.xLabel || (roles.x ? labelsMap[roles.x] : "X"), standoff: 12 }, automargin: true, type: xScale, showgrid: axisX.showGrid, range: axisX.autoRange ? undefined : [axisX.min, axisX.max] },
      yaxis: { title: { text: config.yLabel || (roles.y[0] ? labelsMap[roles.y[0]] : "Y"), standoff: 12 }, automargin: true, type: yScale, showgrid: axisY.showGrid, range: axisY.autoRange ? undefined : [axisY.min, axisY.max] },
      shapes: [
        axisX.referenceLine !== undefined ? { type: "line", x0: axisX.referenceLine, x1: axisX.referenceLine, y0: 0, y1: 1, xref: "x", yref: "paper", line: { color: "#ef4444", dash: "dash" } } : null,
        axisY.referenceLine !== undefined ? { type: "line", y0: axisY.referenceLine, y1: axisY.referenceLine, x0: 0, x1: 1, xref: "paper", yref: "y", line: { color: "#ef4444", dash: "dash" } } : null,
      ].filter(Boolean),
      showlegend: config.showLegend,
      barmode: config.chartType === "bar_stacked" ? "stack" : "group",
      bargap: 0.12,
      font: { size: config.fontSize },
      margin: { t: 60, r: 24, b: 70, l: 72 },
      paper_bgcolor: "white",
      plot_bgcolor: "white",
    };
  };

  const normalizeLayers = (incoming: GraphLayerConfig[]): GraphLayerConfig[] => {
    const baseByType = new Map(layers.map((l) => [l.type, l]));
    const merged = incoming.map((layer, idx) => {
      const base = baseByType.get(layer.type);
      return {
        ...(base || {}),
        ...layer,
        order: layer.order ?? base?.order ?? idx,
        legendGroup: layer.legendGroup ?? base?.legendGroup ?? layer.type,
        showInLegend: layer.showInLegend ?? base?.showInLegend ?? true,
        legendBehavior: layer.legendBehavior ?? base?.legendBehavior ?? "toggle",
        statistics: layer.statistics ?? base?.statistics ?? [],
      } as GraphLayerConfig;
    });
    return merged.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  };

  const saveConfig = () => {
    const payload = { roles, config, layers, statistics, filters, axisX, axisY, graphSpec: getGraphSpec() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "graph-builder-config.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const loadConfig = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        if (parsed?.roles) setRolesStore({ ...roles, ...parsed.roles });
        if (parsed?.config) setConfigStore({ ...config, ...parsed.config });
        if (Array.isArray(parsed?.layers)) setLayers(normalizeLayers(parsed.layers));
        if (Array.isArray(parsed?.statistics)) setStatistics(parsed.statistics);
        if (Array.isArray(parsed?.filters)) setFilters(parsed.filters);
        if (parsed?.axisX) setAxisX({ ...axisX, ...parsed.axisX });
        if (parsed?.axisY) setAxisY({ ...axisY, ...parsed.axisY });
      } catch {
        // ignore invalid config
      }
    };
    reader.readAsText(file);
  };

  const saveTemplate = () => {
    const safeName = templateName.trim() || "Template";
    const key = safeName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "template";
    const payload = { name: safeName, roles, config, layers, statistics, filters, axisX, axisY };
    try {
      const raw = localStorage.getItem(templatesStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed[key] = payload;
      localStorage.setItem(templatesStorageKey, JSON.stringify(parsed));
      setSelectedTemplateKey(key);
      setTemplateRevision((v) => v + 1);
    } catch {
      // ignore storage errors
    }
  };

  const loadTemplate = () => {
    if (!selectedTemplateKey || selectedTemplateKey === "__none__") return;
    try {
      const raw = localStorage.getItem(templatesStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      const tpl = parsed[selectedTemplateKey];
      if (!tpl) return;
      if (tpl.roles) setRolesStore({ ...roles, ...tpl.roles });
      if (tpl.config) setConfigStore({ ...config, ...tpl.config });
      if (Array.isArray(tpl.layers)) setLayers(normalizeLayers(tpl.layers));
      if (Array.isArray(tpl.statistics)) setStatistics(tpl.statistics);
      if (Array.isArray(tpl.filters)) setFilters(tpl.filters);
      if (tpl.axisX) setAxisX({ ...axisX, ...tpl.axisX });
      if (tpl.axisY) setAxisY({ ...axisY, ...tpl.axisY });
      if (tpl.name) setTemplateName(String(tpl.name));
    } catch {
      // ignore template parse errors
    }
  };

  const deleteTemplate = () => {
    if (!selectedTemplateKey || selectedTemplateKey === "__none__") return;
    try {
      const raw = localStorage.getItem(templatesStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      delete parsed[selectedTemplateKey];
      localStorage.setItem(templatesStorageKey, JSON.stringify(parsed));
      setSelectedTemplateKey("__none__");
      setTemplateRevision((v) => v + 1);
    } catch {
      // ignore storage errors
    }
  };

  const roleRows: Array<{ key: keyof GraphRoles; label: string; multiple: boolean }> = [
    { key: "x", label: "X Axis", multiple: false },
    { key: "y", label: "Y Axis", multiple: true },
    { key: "color", label: "Color", multiple: false },
    { key: "group", label: "Group", multiple: false },
    { key: "size", label: "Size", multiple: false },
    { key: "wrap", label: "Facet Row", multiple: false },
    { key: "facetColumn", label: "Facet Column", multiple: false },
    { key: "label", label: "Tooltip", multiple: false },
    { key: "overlay", label: "Overlay", multiple: true },
  ];

  const toggleLayer = (type: GraphLayerConfig["type"]) => {
    const next = layers.map((layer) => (layer.type === type ? { ...layer, enabled: !layer.enabled } : layer));
    setLayers(next);
    const mappedType = layerToChartType(next);
    if (mappedType) patchConfig((p) => ({ ...p, chartType: mappedType }));
  };

  const enableLayer = (type: GraphLayerConfig["type"]) => {
    const next = layers.map((layer) => (layer.type === type ? { ...layer, enabled: true } : layer));
    setLayers(next);
    const mappedType = layerToChartType(next);
    if (mappedType) patchConfig((p) => ({ ...p, chartType: mappedType }));
  };

  const activateSingleLayer = (type: GraphLayerConfig["type"]) => {
    const next = layers.map((layer) => ({ ...layer, enabled: layer.type === type }));
    setLayers(next);
  };

  const toggleComposeLayer = (type: GraphLayerConfig["type"]) => {
    const next = layers.map((layer) => (layer.type === type ? { ...layer, enabled: !layer.enabled } : layer));
    if (!next.some((layer) => layer.enabled)) {
      activateSingleLayer(type);
      return;
    }
    setLayers(next);
  };

  const updateLayerStyle = (type: GraphLayerConfig["type"], patch: Partial<GraphLayerConfig>) => {
    setLayers(layers.map((layer) => (layer.type === type ? { ...layer, ...patch } : layer)));
  };

  const moveLayer = (type: GraphLayerConfig["type"], dir: -1 | 1) => {
    const ordered = [...layers].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    const idx = ordered.findIndex((l) => l.type === type);
    if (idx < 0) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= ordered.length) return;
    [ordered[idx], ordered[swap]] = [ordered[swap], ordered[idx]];
    const next = ordered.map((layer, order) => ({ ...layer, order }));
    setLayers(next);
  };

  const reorderLayerToTarget = (source: GraphLayerConfig["type"], target: GraphLayerConfig["type"]) => {
    if (source === target) return;
    const ordered = [...layers].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    const from = ordered.findIndex((l) => l.type === source);
    const to = ordered.findIndex((l) => l.type === target);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    setLayers(ordered.map((layer, order) => ({ ...layer, order })));
  };

  const toggleLayerStat = (type: GraphLayerConfig["type"], stat: StatisticalOverlay) => {
    const layer = layers.find((l) => l.type === type);
    const current = layer?.statistics || [];
    const nextStats = current.includes(stat) ? current.filter((s) => s !== stat) : [...current, stat];
    updateLayerStyle(type, { statistics: nextStats });
  };

  const handleChartTypeChange = (next: GraphChartType) => {
    if (next === "auto") {
      const autoResolvedType = chooseAutoType(roles, variables);
      const autoLayer = chartTypeToLayer(autoResolvedType);
      patchConfig((p) => ({ ...p, chartType: "auto" }));
      setSelectedLayerType(autoLayer);
      activateSingleLayer(autoLayer);
      return;
    }

    const mapped = chartTypeToLayer(next);
    patchConfig((p) => ({ ...p, chartType: next }));
    setSelectedLayerType(mapped);
    if ((config.layerSelectionMode || "solo") === "compose") {
      toggleComposeLayer(mapped);
      return;
    }
    activateSingleLayer(mapped);
  };

  const toggleStat = (stat: StatisticalOverlay) => {
    if (statistics.includes(stat)) setStatistics(statistics.filter((s) => s !== stat));
    else setStatistics([...statistics, stat]);
  };

  const addFilter = () => {
    if (!filterCol || filterValue === "__all__") return;
    const existing = filters.find((f) => f.column === filterCol);
    if (!existing) {
      setFilters([...filters, { column: filterCol, selectedValues: [filterValue] }]);
      return;
    }
    if (!existing.selectedValues.includes(filterValue)) {
      const next: GraphFilter[] = filters.map((f) => (f.column === filterCol ? { ...f, selectedValues: [...f.selectedValues, filterValue] } : f));
      setFilters(next);
    }
  };

  const removeFilterValue = (column: string, value: string) => {
    const next = filters
      .map((f) => (f.column === column ? { ...f, selectedValues: f.selectedValues.filter((v) => v !== value) } : f))
      .filter((f) => f.selectedValues.length > 0);
    setFilters(next);
  };

  const graphSpec = getGraphSpec();
  const selectedLayer =
    layers.find((layer) => layer.type === selectedLayerType && layer.enabled) ||
    layers
      .filter((layer) => layer.enabled)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))[0] ||
    layers.find((layer) => layer.type === selectedLayerType) ||
    layers[0];
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (event.target as HTMLElement | null)?.isContentEditable) return;
      const key = event.key.toLowerCase();
      if (key === "f" && selectedLayer) {
        event.preventDefault();
        toggleLayerStat(selectedLayer.type, "fit_line");
      }
      if (key === "d") {
        event.preventDefault();
        setSelectedLayerType("density");
        if ((config.layerSelectionMode || "solo") === "compose") toggleComposeLayer("density");
        else activateSingleLayer("density");
      }
      if (key === "l") {
        event.preventDefault();
        patchConfig((prev) => ({ ...prev, showLegend: !prev.showLegend }));
      }
      if (key === "r") {
        event.preventDefault();
        setPlotResetNonce((value) => value + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [config.layerSelectionMode, selectedLayer]);
  useEffect(() => {
    if (!isVariableDragging || typeof window === "undefined") return;

    const edgeThreshold = 120;
    const maxScrollStep = 30;

    const handleDragOver = (event: DragEvent) => {
      const pointerY = event.clientY;
      const viewportHeight = window.innerHeight;
      if (!Number.isFinite(pointerY) || viewportHeight <= 0) return;

      let scrollDelta = 0;
      if (pointerY < edgeThreshold) {
        scrollDelta = -Math.ceil(((edgeThreshold - pointerY) / edgeThreshold) * maxScrollStep);
      } else if (pointerY > viewportHeight - edgeThreshold) {
        scrollDelta = Math.ceil(((pointerY - (viewportHeight - edgeThreshold)) / edgeThreshold) * maxScrollStep);
      }

      if (scrollDelta !== 0) {
        window.scrollBy(0, scrollDelta);
      }
    };

    const stopDragging = () => setIsVariableDragging(false);

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", stopDragging);
    window.addEventListener("dragend", stopDragging);

    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", stopDragging);
      window.removeEventListener("dragend", stopDragging);
    };
  }, [isVariableDragging]);
  const templatesStorageKey = "graph_builder_templates_v1";
  const templateEntries = useMemo(() => {
    try {
      const raw = localStorage.getItem(templatesStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      return Object.entries(parsed as Record<string, any>).map(([k, v]) => ({ key: k, label: String((v as any)?.name || k) }));
    } catch {
      return [] as Array<{ key: string; label: string }>;
    }
  }, [templateRevision]);
  const legendBehaviorByLayer = useMemo(
    () =>
      layers.reduce((acc, layer) => {
        acc[layer.type] = layer.legendBehavior || "toggle";
        return acc;
      }, {} as Record<GraphLayerConfig["type"], LegendBehavior>),
    [layers]
  );
  const layerButtons = useMemo<Array<{ id: GraphChartType; label: string; glyph: string; active: boolean }>>(() => {
    const isEnabled = (type: GraphLayerConfig["type"]) => layers.some((layer) => layer.type === type && layer.enabled);
    const barEnabled = isEnabled("bar");
    const barMode = config.chartType === "bar_stacked" ? "bar_stacked" : "bar_grouped";
    return [
      { id: "auto", label: "Auto", glyph: "A", active: config.chartType === "auto" },
      { id: "scatter", label: "Scatter", glyph: "*", active: isEnabled("scatter") },
      { id: "line", label: "Line", glyph: "/", active: isEnabled("line") },
      { id: "bar_grouped", label: "Bar Grouped", glyph: "|||", active: barEnabled && barMode === "bar_grouped" },
      { id: "bar_stacked", label: "Bar Stacked", glyph: "=", active: barEnabled && barMode === "bar_stacked" },
      { id: "histogram", label: "Histogram", glyph: "##", active: isEnabled("histogram") },
      { id: "box", label: "Box", glyph: "[ ]", active: isEnabled("box") },
      { id: "heatmap", label: "Heatmap", glyph: "HM", active: isEnabled("heatmap") },
      { id: "contour", label: "Contour", glyph: "CT", active: isEnabled("contour") },
    ];
  }, [config.chartType, layers]);
  const explorerSuggestions = useMemo(() => {
    const numericVars = variables.filter((v) => v.numeric);
    const categoricalVars = variables.filter((v) => !v.numeric);
    const missingLeader = [...variables].sort((a, b) => b.missingPct - a.missingPct)[0];
    const suggestions: Array<{ title: string; detail: string }> = [];
    if (numericVars.length >= 2) {
      suggestions.push({
        title: "Correlation View",
        detail: `Drag ${numericVars[0].label} to X and ${numericVars[1].label} to Y for an instant scatter with fit-line shortcuts.`,
      });
    }
    if (numericVars.length >= 1) {
      suggestions.push({
        title: "Distribution Check",
        detail: `Use ${numericVars[0].label} with Histogram or Density to inspect spread and skew quickly.`,
      });
    }
    if (categoricalVars.length >= 1 && numericVars.length >= 1) {
      suggestions.push({
        title: "Category Comparison",
        detail: `Drop ${categoricalVars[0].label} on X and ${numericVars[0].label} on Y for box or grouped bar views.`,
      });
    }
    if (missingLeader) {
      suggestions.push({
        title: "Data Quality Watch",
        detail: `${missingLeader.label} has ${(missingLeader.missingPct * 100).toFixed(1)}% missing values.`,
      });
    }
    return suggestions.slice(0, 4);
  }, [variables]);
  const graphWorkspaceScope = useMemo(() => {
    const datasetSegment = (datasetName || "dataset").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "dataset";
    const columnSegment = columns.slice(0, 12).join("|").toLowerCase().replace(/[^a-z0-9|]+/g, "_");
    return `${datasetSegment}:${rows.length}:${columns.length}:${columnSegment}`;
  }, [columns, datasetName, rows.length]);

  return (
    <div className="space-y-3 rounded-[28px] border border-slate-200 bg-gradient-to-b from-white to-slate-50/80 p-4 text-[10px] shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <WorkspaceActionBar
        title="Graph Builder"
        description="Drag columns into roles, combine chart layers, and explore patterns without writing code."
        metrics={
          <>
            <WorkspaceMetricChip label="Dataset" value={datasetName} />
            <WorkspaceMetricChip label="Rows" value={`${filteredRows.length.toLocaleString()} / ${rows.length.toLocaleString()}`} />
            <WorkspaceMetricChip label="Layers" value={layers.filter((layer) => layer.enabled).length} />
          </>
        }
        actions={
          <>
            <Button type="button" variant="outline" size="sm" className={workspaceToolbarButtonClassName}>Auto Chart</Button>
            <Button type="button" variant="outline" size="sm" className={workspaceToolbarButtonClassName} onClick={() => saveConfig()}>Export</Button>
            <Button type="button" variant="outline" size="sm" className={workspaceToolbarButtonClassName}>Settings</Button>
            <Button type="button" variant="outline" size="sm" className={workspaceToolbarButtonClassName} onClick={resetExploration}>Reset</Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-500 shadow-sm">
        <span className="font-semibold uppercase tracking-[0.14em] text-slate-400">Toolbar</span>
        <span className="rounded-md border px-2 py-1">Databins</span>
        <span className="rounded-md border px-2 py-1">Means</span>
        <span className="rounded-md border px-2 py-1">Fit</span>
        <span className="rounded-md border px-2 py-1">Density</span>
        <span className="rounded-md border px-2 py-1">Box</span>
        <span className="rounded-md border px-2 py-1">Bar</span>
        <span className="rounded-md border px-2 py-1">Heatmap</span>
      </div>

      <div className={isDesktopLayout ? "grid min-h-[900px] grid-cols-[180px_minmax(0,1fr)] gap-3" : "space-y-4"}>
        <div className="min-w-0">
          <div className="space-y-3">
            <section className={isDesktopLayout ? "sticky top-24 z-20 rounded-[20px] border border-slate-200 bg-white/95 shadow-sm" : "rounded-[20px] border border-slate-200 bg-white/95 shadow-sm"}>
              <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-2 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-slate-950">Columns</div>
                    <div className="mt-0.5 text-[8px] leading-4 text-slate-500">Search and drag variables into the graph.</div>
                  </div>
                  <button
                    type="button"
                    aria-label="Columns section"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500"
                    onClick={() => setColumnsCollapsed((value) => !value)}
                  >
                    <ChevronDown className={`h-3 w-3 transition-transform ${columnsCollapsed ? "-rotate-90" : ""}`} />
                  </button>
                </div>
              </div>
              <div className={`${columnsCollapsed ? "hidden" : "block"} max-h-[calc(100vh-10rem)] overflow-auto p-2 pt-2`}>
                <VariableList variables={variables} onDragStateChange={setIsVariableDragging} />
              </div>
            </section>
            <WorkspaceSidebarSection
              title="Chart Layers"
              description="Manage additive chart layers and tune the selected layer."
              storageKey={`workspace.graphBuilder.sidebar.elements.v1:${graphWorkspaceScope}`}
              className="rounded-[24px] border-slate-200 bg-white/95 shadow-sm"
              contentClassName="space-y-2 text-xs"
            >
              <div className="rounded-xl border bg-slate-50/80 p-2.5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Layer Stack</div>
                <div className="space-y-2">
                  {layers.filter((layer) => layer.enabled).sort((a, b) => (a.order ?? 999) - (b.order ?? 999)).map((layer) => (
                    <div key={`stack:${layer.type}`} className={`flex items-center justify-between rounded-lg border px-2 py-1.5 ${selectedLayerType === layer.type ? "border-primary bg-primary/5" : "bg-background"}`}>
                      <button type="button" className="inline-flex items-center gap-2 text-[13px] font-medium" onClick={() => setSelectedLayerType(layer.type)}>
                        <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                          <LayerTypeIcon type={layer.type} className="h-3.5 w-3.5" />
                        </span>
                        <span>{LAYER_META[layer.type].label}</span>
                      </button>
                      <div className="flex items-center gap-1">
                        <button type="button" className="h-6 min-w-6 rounded border px-1 text-[10px]" title="Move up" onClick={() => moveLayer(layer.type, -1)}>^</button>
                        <button type="button" className="h-6 min-w-6 rounded border px-1 text-[10px]" title="Move down" onClick={() => moveLayer(layer.type, 1)}>v</button>
                        <button type="button" className="h-6 min-w-6 rounded border px-1 text-[10px]" title="Hide layer" onClick={() => toggleLayer(layer.type)}>x</button>
                      </div>
                    </div>
                  ))}
                  {layers.every((layer) => !layer.enabled) ? <div className="text-xs text-muted-foreground">No active layers yet.</div> : null}
                </div>
              </div>
              {selectedLayer && (
                <div className="rounded border p-2 space-y-2">
                  <div className="text-xs font-medium">{LAYER_META[selectedLayer.type].label} Settings</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[11px] text-muted-foreground">Opacity</div>
                      <Input
                        className={workspaceToolbarInputClassName}
                        type="number"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={selectedLayer.opacity ?? 0.85}
                        onChange={(e) =>
                          updateLayerStyle(selectedLayer.type, {
                            opacity: Math.max(0.1, Math.min(1, Number(e.target.value) || 0.85)),
                          })
                        }
                      />
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground">Line Width</div>
                      <Input
                        className={workspaceToolbarInputClassName}
                        type="number"
                        min={1}
                        max={8}
                        step={1}
                        value={selectedLayer.lineWidth ?? 2}
                        onChange={(e) =>
                          updateLayerStyle(selectedLayer.type, {
                            lineWidth: Math.max(1, Math.min(8, Number(e.target.value) || 2)),
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[11px] text-muted-foreground">Marker</div>
                      <Select
                        value={selectedLayer.markerSymbol || "circle"}
                        onValueChange={(v) =>
                          updateLayerStyle(selectedLayer.type, {
                            markerSymbol: v as GraphLayerConfig["markerSymbol"],
                          })
                        }
                      >
                        <SelectTrigger className={workspaceToolbarSelectClassName}><SelectValue placeholder="Marker" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="circle">Circle</SelectItem>
                          <SelectItem value="square">Square</SelectItem>
                          <SelectItem value="diamond">Diamond</SelectItem>
                          <SelectItem value="x">X</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground">Jitter</div>
                      <Input
                        className={workspaceToolbarInputClassName}
                        type="number"
                        min={0}
                        max={2}
                        step={0.05}
                        value={selectedLayer.jitter ?? 0}
                        onChange={(e) =>
                          updateLayerStyle(selectedLayer.type, {
                            jitter: Math.max(0, Math.min(2, Number(e.target.value) || 0)),
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[11px] text-muted-foreground">Legend Group</div>
                      <Input
                        className={workspaceToolbarInputClassName}
                        value={selectedLayer.legendGroup || selectedLayer.type}
                        onChange={(e) =>
                          updateLayerStyle(selectedLayer.type, {
                            legendGroup: e.target.value,
                          })
                        }
                        placeholder="legend group"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="inline-flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selectedLayer.showInLegend !== false}
                          onChange={(e) =>
                            updateLayerStyle(selectedLayer.type, {
                              showInLegend: e.target.checked,
                            })
                          }
                        />
                        Show In Legend
                      </label>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">Legend Click Behavior</div>
                    <Select
                      value={selectedLayer.legendBehavior || "toggle"}
                      onValueChange={(v) =>
                        updateLayerStyle(selectedLayer.type, {
                          legendBehavior: v as LegendBehavior,
                        })
                      }
                    >
                      <SelectTrigger className={workspaceToolbarSelectClassName}><SelectValue placeholder="Legend behavior" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="toggle">Toggle</SelectItem>
                        <SelectItem value="isolate">Isolate Layer</SelectItem>
                        <SelectItem value="highlight">Highlight Layer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] text-muted-foreground">Layer Statistics</div>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      {OVERLAY_OPTIONS.map((s) => (
                        <label key={`${selectedLayer.type}:${s}`} className="flex cursor-pointer items-center gap-1">
                          <input
                            type="checkbox"
                            checked={(selectedLayer.statistics || []).includes(s)}
                            onChange={() => toggleLayerStat(selectedLayer.type, s)}
                          />
                          <span>{s.replace(/_/g, " ")}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Layer stats override global stats for this layer.
                    </div>
                  </div>
                </div>
              )}
            </WorkspaceSidebarSection>
            <WorkspaceSidebarSection
              title="Quick Help"
              description="Shortcuts and interaction tips for fast exploration."
              storageKey={`workspace.graphBuilder.sidebar.suggestions.v1:${graphWorkspaceScope}`}
              defaultExpanded={false}
              className="rounded-[24px] border-slate-200 bg-white/95 shadow-sm"
              contentClassName="grid grid-cols-1 gap-2 text-[9px]"
            >
                <div className="rounded-xl border border-dashed bg-background/70 p-3 text-xs text-muted-foreground">
                  Shortcuts: <span className="font-medium text-foreground">F</span> fit line, <span className="font-medium text-foreground">D</span> density, <span className="font-medium text-foreground">L</span> legend, <span className="font-medium text-foreground">R</span> reset view.
                </div>
                <div className="rounded-xl border bg-background/80 p-3 text-xs leading-5 text-muted-foreground">
                  Drag any numeric column to <span className="font-medium text-foreground">X</span> and <span className="font-medium text-foreground">Y</span> for an instant scatter. Add <span className="font-medium text-foreground">Color</span> or <span className="font-medium text-foreground">Facet</span> to split the view.
                </div>
            </WorkspaceSidebarSection>

            <WorkspaceSidebarSection
              title="AI Insights"
              description="Suggested patterns to inspect next."
              storageKey={`workspace.graphBuilder.sidebar.ai.v1:${graphWorkspaceScope}`}
              defaultExpanded={false}
              className="rounded-[24px] border-slate-200 bg-white/95 shadow-sm"
              contentClassName="grid grid-cols-1 gap-2 text-[9px]"
            >
              {explorerSuggestions.map((suggestion) => (
                <div key={`ai:${suggestion.title}`} className="rounded-2xl border bg-white/90 p-3 shadow-sm">
                  <div className="text-sm font-semibold text-slate-950">{suggestion.title}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{suggestion.detail}</div>
                </div>
              ))}
            </WorkspaceSidebarSection>

            <WorkspaceSidebarSection
              title="Axis Controls"
              description="Scale and reference-line settings for the current graph."
              storageKey={`workspace.graphBuilder.sidebar.axis.v1:${graphWorkspaceScope}`}
              defaultExpanded={false}
              className="rounded-[24px] border-slate-200 bg-white/95 shadow-sm"
              contentClassName="space-y-2 text-[9px]"
            >
                <div className="grid grid-cols-2 gap-2">
                  <Select value={axisX.scale} onValueChange={(v) => setAxisX({ ...axisX, scale: v as any })}>
                    <SelectTrigger className={workspaceToolbarSelectClassName}><SelectValue placeholder="X scale" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="linear">X: Linear</SelectItem>
                      <SelectItem value="log">X: Log</SelectItem>
                      <SelectItem value="sqrt">X: Sqrt</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={axisY.scale} onValueChange={(v) => setAxisY({ ...axisY, scale: v as any })}>
                    <SelectTrigger className={workspaceToolbarSelectClassName}><SelectValue placeholder="Y scale" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="linear">Y: Linear</SelectItem>
                      <SelectItem value="log">Y: Log</SelectItem>
                      <SelectItem value="sqrt">Y: Sqrt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input className={workspaceToolbarInputClassName} type="number" placeholder="X ref line" value={axisX.referenceLine ?? ""} onChange={(e) => setAxisX({ ...axisX, referenceLine: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  <Input className={workspaceToolbarInputClassName} type="number" placeholder="Y ref line" value={axisY.referenceLine ?? ""} onChange={(e) => setAxisY({ ...axisY, referenceLine: e.target.value === "" ? undefined : Number(e.target.value) })} />
                </div>
            </WorkspaceSidebarSection>

            <WorkspaceSidebarSection
              title="Filters"
              description="Limit the graph dataset by categorical values."
              storageKey={`workspace.graphBuilder.sidebar.filters.v1:${graphWorkspaceScope}`}
              defaultExpanded={false}
              className="rounded-[24px] border-slate-200 bg-white/95 shadow-sm"
              contentClassName="space-y-2 text-[9px]"
            >
                <div className="grid grid-cols-1 gap-2">
                  <Select value={filterCol || "__none__"} onValueChange={(v) => setFilterCol(v === "__none__" ? "" : v)}>
                    <SelectTrigger className={workspaceToolbarSelectClassName}><SelectValue placeholder="Filter column" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select column</SelectItem>
                      {columns.map((c) => (<SelectItem key={c} value={c}>{labelsMap[c]}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Select value={filterValue} onValueChange={setFilterValue}>
                    <SelectTrigger className={workspaceToolbarSelectClassName}><SelectValue placeholder="Value" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Select value</SelectItem>
                      {uniqueValuesForFilter.map((v) => (<SelectItem key={v} value={v}>{v || "(blank)"}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" className={workspaceToolbarButtonClassName} onClick={addFilter}>Add Filter</Button>
                </div>
                {!!filters.length && (
                  <div className="text-xs space-y-1">
                    {filters.map((f) => (
                      <div key={f.column}>
                        <div className="font-medium">{labelsMap[f.column] || f.column}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {f.selectedValues.map((v) => (
                            <button key={`${f.column}:${v}`} type="button" className="h-7 rounded border px-2 text-xs" onClick={() => removeFilterValue(f.column, v)}>
                              {v || "(blank)"} x
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </WorkspaceSidebarSection>

            <WorkspaceSidebarSection
              title="Styling"
              description="Title, labels, aggregation, templates, and saved configs."
              storageKey={`workspace.graphBuilder.sidebar.styling.v1:${graphWorkspaceScope}`}
              defaultExpanded={false}
              className="rounded-[24px] border-slate-200 bg-white/95 shadow-sm"
              contentClassName="space-y-2 text-[9px]"
            >
                <Input className={workspaceToolbarInputClassName} value={config.title} onChange={(e) => patchConfig((p) => ({ ...p, title: e.target.value }))} placeholder="Chart title" />
                <Input className={workspaceToolbarInputClassName} value={config.xLabel} onChange={(e) => patchConfig((p) => ({ ...p, xLabel: e.target.value }))} placeholder="X label" />
                <Input className={workspaceToolbarInputClassName} value={config.yLabel} onChange={(e) => patchConfig((p) => ({ ...p, yLabel: e.target.value }))} placeholder="Y label" />
                <Select value={config.summary} onValueChange={(v) => patchConfig((p) => ({ ...p, summary: v as SummaryStatistic }))}>
                  <SelectTrigger className={workspaceToolbarSelectClassName}><SelectValue placeholder="Aggregation" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mean">Mean</SelectItem>
                    <SelectItem value="sum">Sum</SelectItem>
                    <SelectItem value="count">Count</SelectItem>
                  </SelectContent>
                </Select>
                <div className="rounded border p-2 space-y-2">
                  <div className="text-xs font-medium">Graph Templates</div>
                  <Input className={workspaceToolbarInputClassName} value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Template name" />
                  <Select value={selectedTemplateKey} onValueChange={setSelectedTemplateKey}>
                    <SelectTrigger className={workspaceToolbarSelectClassName}><SelectValue placeholder="Choose template" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select template</SelectItem>
                      {templateEntries.map((tpl) => (
                        <SelectItem key={tpl.key} value={tpl.key}>{tpl.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className={workspaceToolbarButtonClassName} onClick={saveTemplate}>Save Template</Button>
                    <Button type="button" variant="outline" className={workspaceToolbarButtonClassName} onClick={loadTemplate}>Load Template</Button>
                    <Button type="button" variant="outline" className={workspaceToolbarButtonClassName} onClick={deleteTemplate}>Delete</Button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className={workspaceToolbarButtonClassName} onClick={saveConfig}>Save Config</Button>
                  <label className={`${workspaceToolbarButtonClassName} inline-flex cursor-pointer items-center border`}>
                    Load Config
                    <input type="file" className="hidden" accept=".json,application/json" onChange={(e) => loadConfig(e.target.files?.[0] || null)} />
                  </label>
                </div>
            </WorkspaceSidebarSection>
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <Card className="rounded-[24px] border-slate-200 bg-white/95 shadow-sm">
            <CardHeader className={workspaceSectionCardHeaderClassName}><CardTitle className={workspaceSectionCardTitleClassName}>Graph Canvas</CardTitle></CardHeader>
            <CardContent className="min-h-0">
              <div className="mb-3 space-y-2">
                <div className="text-xs text-muted-foreground">Drag chart elements into Active Layers</div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {layers.map((layer) => (
                    <button
                      key={`palette:${layer.type}`}
                      type="button"
                      draggable
                      className={`${workspaceToolbarButtonClassName} inline-flex h-7 min-w-0 items-center justify-start gap-1 rounded-xl border border-slate-200 bg-background px-1.5 shadow-sm text-[9px]`}
                      onDragStart={() => setDraggingLayerType(layer.type)}
                      onClick={() => {
                        setSelectedLayerType(layer.type);
                        enableLayer(layer.type);
                      }}
                      title={LAYER_META[layer.type].label}
                    >
                      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                        <LayerTypeIcon type={layer.type} className="h-3 w-3" />
                      </span>
                      <span className="truncate">{LAYER_META[layer.type].label}</span>
                    </button>
                  ))}
                </div>
                <div
                  className={`flex min-h-9 flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-slate-50/80 px-2 py-1.5 ${isLayerDropOver ? "border-primary bg-primary/5" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsLayerDropOver(true);
                  }}
                  onDragLeave={() => setIsLayerDropOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsLayerDropOver(false);
                    if (draggingLayerType) {
                      setSelectedLayerType(draggingLayerType);
                      enableLayer(draggingLayerType);
                    }
                    if (draggingActiveLayerType) {
                      const orderedEnabled = layers.filter((l) => l.enabled).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
                      const last = orderedEnabled[orderedEnabled.length - 1];
                      if (last) reorderLayerToTarget(draggingActiveLayerType, last.type);
                    }
                    setDraggingLayerType(null);
                    setDraggingActiveLayerType(null);
                  }}
                >
                  {layers.filter((l) => l.enabled).length === 0 ? (
                    <span className="text-xs text-muted-foreground">Drop here to activate chart layers</span>
                  ) : (
                    layers
                      .filter((l) => l.enabled)
                      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
                      .map((layer) => (
                        <div key={`active:${layer.type}`} className="inline-flex min-w-0 items-center gap-1">
                          <button
                            type="button"
                            draggable
                            className={`${workspaceToolbarButtonClassName} inline-flex h-6 min-w-0 items-center gap-1 rounded-xl px-1.5 text-[9px] ${selectedLayerType === layer.type ? "bg-primary text-primary-foreground border-primary" : ""}`}
                            onClick={() => setSelectedLayerType(layer.type)}
                            onDragStart={() => setDraggingActiveLayerType(layer.type)}
                            onDragEnd={() => setDraggingActiveLayerType(null)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (draggingActiveLayerType) reorderLayerToTarget(draggingActiveLayerType, layer.type);
                              setDraggingActiveLayerType(null);
                            }}
                            title={`Active: ${LAYER_META[layer.type].label}`}
                          >
                            <span className={`flex h-4 w-4 items-center justify-center rounded-md ${selectedLayerType === layer.type ? "bg-white/20 text-current" : "bg-slate-100 text-slate-700"}`}>
                              <LayerTypeIcon type={layer.type} className="h-2.5 w-2.5" />
                            </span>
                            <span className="truncate">{LAYER_META[layer.type].label}</span>
                          </button>
                          <button type="button" className="h-6 min-w-6 rounded border px-1 text-[9px]" title="Move up" onClick={() => moveLayer(layer.type, -1)}>^</button>
                          <button type="button" className="h-6 min-w-6 rounded border px-1 text-[9px]" title="Move down" onClick={() => moveLayer(layer.type, 1)}>v</button>
                        </div>
                      ))
                  )}
                </div>
              </div>
              <div className="mb-3 rounded-2xl border bg-slate-50/80 p-2">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-semibold text-slate-950">Graph Roles</div>
                    <div className="text-[9px] text-muted-foreground">Drag variables into roles to build charts instantly.</div>
                  </div>
                  <div className="text-[8px] text-muted-foreground">X, Y, Color, Group, Size, Tooltip, Facets</div>
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-9">
                  {roleRows.map((role) => (
                    <div key={role.key} className="min-w-0">
                      <DropZone
                        title={role.label}
                        values={Array.isArray(roles[role.key]) ? (roles[role.key] as string[]) : roles[role.key] ? [String(roles[role.key])] : []}
                        labels={labelsMap}
                        multiple={role.multiple}
                        onDropVariable={(k) => setZone(role.key, k, role.multiple)}
                        onRemoveVariable={(k) => removeZone(role.key, k)}
                      />
                    </div>
                  ))}
                </div>
              </div>
              {panelRows.length === 0 ? (
                <div className="text-sm text-muted-foreground">No rows after filtering.</div>
              ) : (
                <div className={`grid gap-3 ${roles.facetColumn ? "grid-cols-1 xl:grid-cols-2" : roles.wrap ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
                  {panelRows.map((chunk) => (
                    <div key={chunk.key} className="space-y-1">
                      {(chunk.rowLabel || chunk.colLabel) && (
                        <div className="text-xs text-muted-foreground px-1">
                          {chunk.rowLabel && roles.wrap ? <span>{labelsMap[roles.wrap] || roles.wrap}: <span className="font-medium text-foreground">{chunk.rowLabel}</span></span> : null}
                          {chunk.rowLabel && chunk.colLabel ? <span> · </span> : null}
                          {chunk.colLabel && roles.facetColumn ? <span>{labelsMap[roles.facetColumn] || roles.facetColumn}: <span className="font-medium text-foreground">{chunk.colLabel}</span></span> : null}
                          <span> ({chunk.rows.length.toLocaleString()} rows)</span>
                        </div>
                      )}
                      <ChartDisplay
                        data={buildPlotForRows(chunk.rows)}
                        layout={layoutBase(chunk.key === "__all__" ? null : chunk.key)}
                        height={Math.max(config.chartHeight, 760)}
                        chartTitle={config.title}
                        chartType={config.chartType}
                        resetNonce={plotResetNonce}
                        layerSelectionMode={config.layerSelectionMode || "solo"}
                        layerButtons={layerButtons}
                        legendBehaviorByLayer={legendBehaviorByLayer}
                        xDropItem={roles.x ? { key: roles.x, label: labelsMap[roles.x] || roles.x } : undefined}
                        yDropItems={roles.y.map((key) => ({ key, label: labelsMap[key] || key }))}
                        xAxisLabelText={config.xLabel || (roles.x ? labelsMap[roles.x] || roles.x : "X Axis")}
                        yAxisLabelText={config.yLabel || (roles.y[0] ? labelsMap[roles.y[0]] || roles.y[0] : "Y Axis")}
                        xShelfOrientation={config.xShelfOrientation || "horizontal"}
                        yShelfOrientation={config.yShelfOrientation || "vertical"}
                        xShelfFontSize={config.xShelfFontSize || 12}
                        yShelfFontSize={config.yShelfFontSize || 12}
                        onXRemove={() => roles.x && removeZone("x", roles.x)}
                        onYRemove={(key) => removeZone("y", key)}
                        onXAxisDrop={(key) => setZone("x", key, false)}
                        onYAxisDrop={(key) => setZone("y", key, true)}
                        onXAxisLabelRename={(nextLabel) => patchConfig((p) => ({ ...p, xLabel: nextLabel }))}
                        onYAxisLabelRename={(nextLabel) => patchConfig((p) => ({ ...p, yLabel: nextLabel }))}
                        onXAxisShelfOrientationChange={(next) => patchConfig((p) => ({ ...p, xShelfOrientation: next }))}
                        onYAxisShelfOrientationChange={(next) => patchConfig((p) => ({ ...p, yShelfOrientation: next }))}
                        onXAxisShelfFontSizeChange={(next) => patchConfig((p) => ({ ...p, xShelfFontSize: next }))}
                        onYAxisShelfFontSizeChange={(next) => patchConfig((p) => ({ ...p, yShelfFontSize: next }))}
                        onChartTitleRename={(nextTitle) => patchConfig((p) => ({ ...p, title: nextTitle }))}
                        onChartTypeChange={handleChartTypeChange}
                        onLayerSelectionModeChange={setLayerSelectionMode}
                        onToggleLegend={() => patchConfig((p) => ({ ...p, showLegend: !p.showLegend }))}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>

      <Card>
        <CardContent className="pt-4">
          <Tabs value={activeBottomTab} onValueChange={(v: any) => setActiveBottomTab(v)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="preview">Data Preview</TabsTrigger>
              <TabsTrigger value="spec">Graph Specification</TabsTrigger>
              <TabsTrigger value="agg">Aggregation Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="preview" className="pt-3">
              <div className="max-h-52 overflow-auto border rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      {columns.slice(0, 8).map((c) => (
                        <th key={c} className="text-left px-2 py-1 border-b">{labelsMap[c]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.slice(0, 20).map((r, idx) => (
                      <tr key={idx}>
                        {columns.slice(0, 8).map((c) => (
                          <td key={c} className="px-2 py-1 border-b">{String(r[c] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
            <TabsContent value="spec" className="pt-3">
              <pre className="text-xs bg-muted p-3 rounded max-h-56 overflow-auto">{JSON.stringify(graphSpec, null, 2)}</pre>
            </TabsContent>
            <TabsContent value="agg" className="pt-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                <div className="rounded border p-2"><div className="font-medium">Summary Statistic</div><div>{config.summary}</div></div>
                <div className="rounded border p-2"><div className="font-medium">Rows After Filter</div><div>{filteredRows.length.toLocaleString()}</div></div>
                <div className="rounded border p-2"><div className="font-medium">Facets</div><div>{[roles.wrap, roles.facetColumn].filter(Boolean).join(" / ") || "(none)"}</div></div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
