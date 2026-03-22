
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizableHandle, ResizablePanel } from "@/components/ui/resizable";
import { PersistedResizableGroup } from "@/components/layout/PersistedResizableGroup";
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

  const patchRoles = (updater: (prev: GraphRoles) => GraphRoles) => {
    setRolesStore(updater(rolesStore));
  };

  const patchConfig = (updater: (prev: GraphBuilderConfig) => GraphBuilderConfig) => {
    setConfigStore(updater(configStore));
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

  const baseRows = useMemo(() => {
    if (!roles.wrap) return [{ key: "__all__", rows: filteredRows }];
    const byWrap = new Map<string, WorkbenchRow[]>();
    for (const row of filteredRows) {
      const wrapVal = String(row[roles.wrap] ?? "null");
      if (!byWrap.has(wrapVal)) byWrap.set(wrapVal, []);
      byWrap.get(wrapVal)!.push(row);
    }
    return Array.from(byWrap.entries()).slice(0, 12).map(([key, list]) => ({ key, rows: list }));
  }, [filteredRows, roles.wrap]);

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
      .map((x, i) => ({ x: Number(x), y: yVals[i] }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x);
    if (pairs.length < 3) return traces;
    const fit = linearRegression(pairs);
    if (selectedStats.includes("fit_line") && fit) {
      traces.push({
        type: "scatter",
        mode: "lines",
        name: `${yLabel} Fit`,
        x: pairs.map((p) => p.x),
        y: pairs.map((p) => fit.b0 + fit.b1 * p.x),
        line: { color: "#0ea5e9", width: 2 },
        legendgroup: legendGroup,
        showlegend: showInLegend,
        meta: { layerType: layerCfg.type, baseOpacity: 1 },
      });
    }
    if (selectedStats.includes("confidence_interval") && fit) {
      const residuals = pairs.map((p) => p.y - (fit.b0 + fit.b1 * p.x));
      const se = Math.sqrt(residuals.reduce((acc, r) => acc + r * r, 0) / Math.max(1, residuals.length - 2));
      const ci = 1.96 * se;
      const fitY = pairs.map((p) => fit.b0 + fit.b1 * p.x);
      traces.push({
        type: "scatter",
        mode: "lines",
        x: pairs.map((p) => p.x),
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
        x: pairs.map((p) => p.x),
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
          x: pairs.map((p) => p.x),
          y: pairs.map((p) => poly.c0 + poly.c1 * p.x + poly.c2 * p.x * p.x),
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
        x: pairs.map((p) => p.x),
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
      let colorIndex = 0;
      for (const [g, rs] of groupedRows.entries()) {
        for (const yCol of yColumns) {
          const points = rs
            .map((r, idx) => ({
              x: x ? jitteredNumeric(r[x], Number(r.__row_index__ ?? idx), layerCfg.jitter ?? 0) : r.__row_index__,
              y: toNumberOrNull(r[yCol]),
              size: size ? toNumberOrNull(r[size]) : null,
              label: roles.label ? String(r[roles.label] ?? "") : "",
              seed: Number(r.__row_index__ ?? idx),
            }))
            .filter((p) => !isMissingValue(p.x) && p.y !== null);
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
    const xScale = axisX.scale === "sqrt" ? "linear" : axisX.scale;
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
    { key: "size", label: "Size", multiple: false },
    { key: "shape", label: "Shape", multiple: false },
    { key: "group", label: "Group", multiple: false },
    { key: "overlay", label: "Overlay", multiple: true },
    { key: "wrap", label: "Panel", multiple: false },
    { key: "label", label: "Label", multiple: false },
    { key: "weight", label: "Weight", multiple: false },
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
    patchConfig((p) => ({ ...p, chartType: next }));
    if (next !== "auto") {
      const mapped = chartTypeToLayer(next);
      setSelectedLayerType(mapped);
      enableLayer(mapped);
    }
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
  const selectedLayer = layers.find((layer) => layer.type === selectedLayerType) || layers[0];
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
  const graphWorkspaceScope = useMemo(() => {
    const datasetSegment = (datasetName || "dataset").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "dataset";
    const columnSegment = columns.slice(0, 12).join("|").toLowerCase().replace(/[^a-z0-9|]+/g, "_");
    return `${datasetSegment}:${rows.length}:${columns.length}:${columnSegment}`;
  }, [columns, datasetName, rows.length]);

  return (
    <div className="space-y-3">
      <WorkspaceActionBar
        title="Graph Builder Workspace"
        description="Interactive graph roles, layer controls, and editable chart composition."
        metrics={
          <>
            <WorkspaceMetricChip label="Dataset" value={datasetName} />
            <WorkspaceMetricChip label="Rows" value={`${filteredRows.length.toLocaleString()} / ${rows.length.toLocaleString()}`} />
            <WorkspaceMetricChip label="Layers" value={layers.filter((layer) => layer.enabled).length} />
          </>
        }
        actions={
          <>
            <Button type="button" variant="outline" size="sm" className={workspaceToolbarButtonClassName} onClick={() => saveConfig()}>Export</Button>
            <Button type="button" variant="outline" size="sm" className={workspaceToolbarButtonClassName} onClick={saveConfig}>Save Graph</Button>
            <Button type="button" variant="outline" size="sm" className={workspaceToolbarButtonClassName}>AI Insights</Button>
            <Button type="button" variant="outline" size="sm" className={workspaceToolbarButtonClassName} onClick={resetExploration}>Reset</Button>
            <Button type="button" variant="outline" size="sm" className={workspaceToolbarButtonClassName}>Settings</Button>
          </>
        }
      />

      <PersistedResizableGroup
        storageKey="workspace.graphBuilder.main.v1"
        direction="horizontal"
        defaultSizes={[24, 46, 30]}
        minSizes={[14, 24, 18]}
        enabled={isDesktopLayout}
        className="min-h-[760px]"
      >
        <ResizablePanel defaultSize={24} minSize={14}>
        <div className="h-full pr-2 min-w-0">
          <PersistedResizableGroup
            storageKey="workspace.graphBuilder.left.v1"
            direction="vertical"
            defaultSizes={[40, 60]}
            minSizes={[20, 20]}
            enabled={isDesktopLayout}
            className="h-full"
          >
          <ResizablePanel defaultSize={40} minSize={20}>
          <WorkspaceSidebarSection
            title="Columns"
            description="Search, inspect, and drag variables into the graph."
            storageKey={`workspace.graphBuilder.sidebar.columns.v1:${graphWorkspaceScope}`}
            contentClassName="pt-0"
          >
            <VariableList variables={variables} />
          </WorkspaceSidebarSection>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={60} minSize={20}>
          <WorkspaceSidebarSection
            title="Graph Roles"
            description="Assign X, Y, Color, Group, and analysis roles."
            storageKey={`workspace.graphBuilder.sidebar.roles.v1:${graphWorkspaceScope}`}
            contentClassName="grid grid-cols-1 gap-2"
          >
              {roleRows.map((role) => (
                <DropZone
                  key={role.key}
                  title={role.label}
                  values={Array.isArray(roles[role.key]) ? (roles[role.key] as string[]) : roles[role.key] ? [String(roles[role.key])] : []}
                  labels={labelsMap}
                  multiple={role.multiple}
                  onDropVariable={(k) => setZone(role.key, k, role.multiple)}
                  onRemoveVariable={(k) => removeZone(role.key, k)}
                />
              ))}
          </WorkspaceSidebarSection>
          </ResizablePanel>
          </PersistedResizableGroup>
        </div>
        </ResizablePanel>
        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={46} minSize={24}>
        <div className="h-full px-2 space-y-3 min-w-0">
          <Card>
            <CardHeader className={workspaceSectionCardHeaderClassName}><CardTitle className={workspaceSectionCardTitleClassName}>Graph Canvas</CardTitle></CardHeader>
            <CardContent className="min-h-0">
              <div className="mb-3 space-y-2">
                <div className="text-xs text-muted-foreground">Drag chart elements into Active Layers</div>
                <div className="flex flex-wrap gap-2">
                  {layers.map((layer) => (
                    <button
                      key={`palette:${layer.type}`}
                      type="button"
                      draggable
                      className={`${workspaceToolbarButtonClassName} justify-start border bg-background inline-flex items-center gap-1`}
                      onDragStart={() => setDraggingLayerType(layer.type)}
                      onClick={() => {
                        setSelectedLayerType(layer.type);
                        enableLayer(layer.type);
                      }}
                      title={LAYER_META[layer.type].label}
                    >
                      <span className="font-mono">{LAYER_META[layer.type].glyph}</span>
                      <span>{LAYER_META[layer.type].label}</span>
                    </button>
                  ))}
                </div>
                <div
                  className={`min-h-10 rounded-md border px-2 py-1 flex flex-wrap gap-1 ${isLayerDropOver ? "border-primary bg-primary/5" : ""}`}
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
                        <div key={`active:${layer.type}`} className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            draggable
                            className={`${workspaceToolbarButtonClassName} h-7 px-2 ${selectedLayerType === layer.type ? "bg-primary text-primary-foreground border-primary" : ""}`}
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
                            {LAYER_META[layer.type].glyph} {LAYER_META[layer.type].label}
                          </button>
                          <button type="button" className="h-7 min-w-7 rounded border px-1 text-[10px]" title="Move up" onClick={() => moveLayer(layer.type, -1)}>^</button>
                          <button type="button" className="h-7 min-w-7 rounded border px-1 text-[10px]" title="Move down" onClick={() => moveLayer(layer.type, 1)}>v</button>
                        </div>
                      ))
                  )}
                </div>
              </div>
              {baseRows.length === 0 ? (
                <div className="text-sm text-muted-foreground">No rows after filtering.</div>
              ) : (
                <div className={`grid gap-3 ${roles.wrap ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
                  {baseRows.map((chunk) => (
                    <div key={chunk.key} className="space-y-1">
                      {roles.wrap && chunk.key !== "__all__" && (
                        <div className="text-xs text-muted-foreground px-1">
                          {labelsMap[roles.wrap] || roles.wrap}: <span className="font-medium text-foreground">{chunk.key}</span> ({chunk.rows.length.toLocaleString()} rows)
                        </div>
                      )}
                      <ChartDisplay
                        data={buildPlotForRows(chunk.rows)}
                        layout={layoutBase(chunk.key === "__all__" ? null : chunk.key)}
                        height={config.chartHeight}
                        chartType={config.chartType}
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
                        onChartTypeChange={handleChartTypeChange}
                        onToggleLegend={() => patchConfig((p) => ({ ...p, showLegend: !p.showLegend }))}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        </ResizablePanel>
        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={30} minSize={18}>
        <div className="h-full pl-2 space-y-3 overflow-auto min-w-0">
          <WorkspaceSidebarSection
            title="Chart Elements"
            description="Toggle chart families and tune the active layer."
            storageKey={`workspace.graphBuilder.sidebar.elements.v1:${graphWorkspaceScope}`}
            contentClassName="space-y-3 text-sm"
          >
              <div className="grid grid-cols-2 gap-2">
                {layers.map((layer) => (
                  <button
                    key={layer.id}
                    type="button"
                    className={`${workspaceToolbarButtonClassName} justify-start border text-left inline-flex items-center gap-1 ${layer.enabled ? "bg-primary text-primary-foreground border-primary" : ""}`}
                    onClick={() => {
                      toggleLayer(layer.type);
                      setSelectedLayerType(layer.type);
                    }}
                  >
                    <span className="font-mono">{LAYER_META[layer.type].glyph}</span>
                    <span>{LAYER_META[layer.type].label}</span>
                  </button>
                ))}
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
                    <div className="text-[11px] text-muted-foreground mb-1">Layer Statistics</div>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      {OVERLAY_OPTIONS.map((s) => (
                        <label key={`${selectedLayer.type}:${s}`} className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(selectedLayer.statistics || []).includes(s)}
                            onChange={() => toggleLayerStat(selectedLayer.type, s)}
                          />
                          <span>{s.replace(/_/g, " ")}</span>
                        </label>
                      ))}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Layer stats override global stats for this layer.
                    </div>
                  </div>
                </div>
              )}
          </WorkspaceSidebarSection>

          <WorkspaceSidebarSection
            title="Global Statistics Defaults"
            description="Default overlays applied when a layer does not override them."
            storageKey={`workspace.graphBuilder.sidebar.stats.v1:${graphWorkspaceScope}`}
            contentClassName="grid grid-cols-1 gap-2 text-sm"
          >
              {OVERLAY_OPTIONS.map((s) => (
                <label key={s} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={statistics.includes(s)} onChange={() => toggleStat(s)} />
                  <span>{s.replace(/_/g, " ")}</span>
                </label>
              ))}
          </WorkspaceSidebarSection>

          <WorkspaceSidebarSection
            title="Axis Controls"
            description="Scale and reference-line settings for the current graph."
            storageKey={`workspace.graphBuilder.sidebar.axis.v1:${graphWorkspaceScope}`}
            contentClassName="space-y-2 text-sm"
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
            contentClassName="space-y-2"
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
            contentClassName="space-y-2"
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
        </ResizablePanel>
      </PersistedResizableGroup>

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
                <div className="rounded border p-2"><div className="font-medium">Panel Variable</div><div>{roles.wrap || "(none)"}</div></div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
