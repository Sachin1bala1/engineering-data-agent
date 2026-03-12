export type GraphChartType =
  | "auto"
  | "scatter"
  | "line"
  | "bar_grouped"
  | "bar_stacked"
  | "histogram"
  | "box"
  | "heatmap"
  | "contour";

export type GraphRoleKey =
  | "x"
  | "y"
  | "color"
  | "size"
  | "shape"
  | "group"
  | "overlay"
  | "wrap"
  | "label"
  | "weight";

export type SummaryStatistic = "mean" | "sum" | "count";

export type GraphLayerType =
  | "scatter"
  | "line"
  | "bar"
  | "box"
  | "histogram"
  | "density"
  | "heatmap"
  | "contour";

export type StatisticalOverlay =
  | "fit_line"
  | "polynomial_fit"
  | "loess"
  | "mean_line"
  | "median_line"
  | "confidence_interval";

export type LegendBehavior = "toggle" | "isolate" | "highlight";

export type AxisScale = "linear" | "log" | "sqrt";

export interface GraphRoles {
  x?: string;
  y: string[];
  color?: string;
  size?: string;
  shape?: string;
  group?: string;
  overlay: string[];
  wrap?: string;
  label?: string;
  weight?: string;
}

export interface GraphBuilderConfig {
  chartType: GraphChartType;
  summary: SummaryStatistic;
  title: string;
  xLabel: string;
  yLabel: string;
  showLegend: boolean;
  fontSize: number;
  markerSize: number;
  chartHeight: number;
  colorPreset: "default" | "ocean" | "warm" | "mono";
}

export interface AxisSettings {
  scale: AxisScale;
  autoRange: boolean;
  min?: number;
  max?: number;
  referenceLine?: number;
  tickDensity: number;
  showGrid: boolean;
}

export interface GraphFilter {
  column: string;
  selectedValues: string[];
}

export interface GraphLayerConfig {
  id: string;
  type: GraphLayerType;
  enabled: boolean;
  order?: number;
  legendGroup?: string;
  showInLegend?: boolean;
  legendBehavior?: LegendBehavior;
  opacity?: number;
  lineWidth?: number;
  markerSymbol?: "circle" | "square" | "diamond" | "x";
  jitter?: number;
  statistics?: StatisticalOverlay[];
}

export interface GraphSpec {
  mappings: GraphRoles;
  geometry: GraphChartType;
  layers: GraphLayerConfig[];
  statistics: StatisticalOverlay[];
  filters: GraphFilter[];
  aggregation: SummaryStatistic;
  paneling: { wrap?: string };
  axis: {
    x: AxisSettings;
    y: AxisSettings;
  };
  styling: {
    title: string;
    xLabel: string;
    yLabel: string;
    colorPreset: GraphBuilderConfig["colorPreset"];
    fontSize: number;
    markerSize: number;
    chartHeight: number;
    showLegend: boolean;
  };
}

export interface VariableMeta {
  key: string;
  label: string;
  numeric: boolean;
  type: "continuous" | "categorical" | "datetime" | "ordinal";
  missingPct: number;
  uniqueCount: number;
  sampleStats?: {
    mean?: number;
    median?: number;
    std?: number;
    min?: number;
    max?: number;
  };
}
