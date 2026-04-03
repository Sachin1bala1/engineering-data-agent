import { create } from "zustand";
import type {
  AxisSettings,
  GraphBuilderConfig,
  GraphFilter,
  GraphLayerConfig,
  GraphRoles,
  GraphSpec,
  StatisticalOverlay,
  SummaryStatistic,
  VariableMeta,
} from "@/components/features/analytics/graph-builder/types";
import type { WorkbenchRow } from "./dataWorkbenchStore";

const defaultAxis = (): AxisSettings => ({
  scale: "linear",
  autoRange: true,
  tickDensity: 6,
  showGrid: true,
});

const defaultLayers = (): GraphLayerConfig[] => [
  { id: "scatter", type: "scatter", enabled: true, order: 0, legendGroup: "scatter", showInLegend: true, legendBehavior: "toggle", opacity: 0.85, lineWidth: 2, markerSymbol: "circle", jitter: 0, statistics: [] },
  { id: "line", type: "line", enabled: false, order: 1, legendGroup: "line", showInLegend: true, legendBehavior: "toggle", opacity: 0.9, lineWidth: 2, markerSymbol: "circle", jitter: 0, statistics: [] },
  { id: "bar", type: "bar", enabled: false, order: 2, legendGroup: "bar", showInLegend: true, legendBehavior: "toggle", opacity: 0.7, lineWidth: 1, markerSymbol: "square", jitter: 0, statistics: [] },
  { id: "box", type: "box", enabled: false, order: 3, legendGroup: "box", showInLegend: true, legendBehavior: "toggle", opacity: 0.8, lineWidth: 1, markerSymbol: "circle", jitter: 0.2, statistics: [] },
  { id: "histogram", type: "histogram", enabled: false, order: 4, legendGroup: "histogram", showInLegend: true, legendBehavior: "toggle", opacity: 0.75, lineWidth: 1, markerSymbol: "circle", jitter: 0, statistics: [] },
  { id: "density", type: "density", enabled: false, order: 5, legendGroup: "density", showInLegend: true, legendBehavior: "toggle", opacity: 0.45, lineWidth: 1, markerSymbol: "circle", jitter: 0, statistics: [] },
  { id: "heatmap", type: "heatmap", enabled: false, order: 6, legendGroup: "heatmap", showInLegend: true, legendBehavior: "toggle", opacity: 0.9, lineWidth: 1, markerSymbol: "circle", jitter: 0, statistics: [] },
  { id: "contour", type: "contour", enabled: false, order: 7, legendGroup: "contour", showInLegend: true, legendBehavior: "toggle", opacity: 0.8, lineWidth: 1, markerSymbol: "circle", jitter: 0, statistics: [] },
];

interface GraphBuilderStoreState {
  datasetName: string;
  rows: WorkbenchRow[];
  variables: VariableMeta[];
  roles: GraphRoles;
  config: GraphBuilderConfig;
  layers: GraphLayerConfig[];
  statistics: StatisticalOverlay[];
  filters: GraphFilter[];
  axisX: AxisSettings;
  axisY: AxisSettings;
  setDatasetContext: (payload: {
    datasetName: string;
    rows: WorkbenchRow[];
    variables: VariableMeta[];
  }) => void;
  setRoles: (roles: GraphRoles) => void;
  setConfig: (config: GraphBuilderConfig) => void;
  setLayers: (layers: GraphLayerConfig[]) => void;
  setStatistics: (statistics: StatisticalOverlay[]) => void;
  setFilters: (filters: GraphFilter[]) => void;
  setAxisX: (axis: AxisSettings) => void;
  setAxisY: (axis: AxisSettings) => void;
  resetExploration: () => void;
  getGraphSpec: () => GraphSpec;
}

export const useGraphBuilderStore = create<GraphBuilderStoreState>((set, get) => ({
  datasetName: "Dataset",
  rows: [],
  variables: [],
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
  layers: defaultLayers(),
  statistics: [],
  filters: [],
  axisX: defaultAxis(),
  axisY: defaultAxis(),
  setDatasetContext: ({ datasetName, rows, variables }) => set({ datasetName, rows, variables }),
  setRoles: (roles) => set({ roles }),
  setConfig: (config) => set({ config }),
  setLayers: (layers) => set({ layers }),
  setStatistics: (statistics) => set({ statistics }),
  setFilters: (filters) => set({ filters }),
  setAxisX: (axisX) => set({ axisX }),
  setAxisY: (axisY) => set({ axisY }),
  resetExploration: () =>
    set((state) => ({
      roles: { y: [], overlay: [] },
      config: { ...state.config, chartType: "auto", layerSelectionMode: "solo", xLabel: "", yLabel: "", xShelfOrientation: "horizontal", yShelfOrientation: "vertical", xShelfFontSize: 12, yShelfFontSize: 12 },
      layers: defaultLayers(),
      statistics: [],
      filters: [],
      axisX: defaultAxis(),
      axisY: defaultAxis(),
    })),
  getGraphSpec: () => {
    const state = get();
    return {
      mappings: state.roles,
      geometry: state.config.chartType,
      layers: state.layers,
      statistics: state.statistics,
      filters: state.filters,
      aggregation: state.config.summary as SummaryStatistic,
      paneling: { wrap: state.roles.wrap },
      axis: { x: state.axisX, y: state.axisY },
      styling: {
        title: state.config.title,
        xLabel: state.config.xLabel,
        yLabel: state.config.yLabel,
        colorPreset: state.config.colorPreset,
        fontSize: state.config.fontSize,
        markerSize: state.config.markerSize,
        chartHeight: state.config.chartHeight,
        showLegend: state.config.showLegend,
      },
    };
  },
}));
