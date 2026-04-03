import React, { useEffect, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import Plotly from "plotly.js-cartesian-dist-min";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { GraphChartType, GraphLayerType, LayerSelectionMode, LegendBehavior } from "./types";

interface ChartDisplayProps {
  data: any[];
  layout: any;
  height?: number;
  chartTitle?: string;
  chartType: GraphChartType;
  resetNonce?: number;
  layerSelectionMode: LayerSelectionMode;
  layerButtons: Array<{ id: GraphChartType; label: string; glyph: string; active: boolean }>;
  legendBehaviorByLayer?: Partial<Record<GraphLayerType, LegendBehavior>>;
  xDropItem?: { key: string; label: string };
  yDropItems?: Array<{ key: string; label: string }>;
  xAxisLabelText?: string;
  yAxisLabelText?: string;
  xShelfOrientation: "horizontal" | "vertical";
  yShelfOrientation: "horizontal" | "vertical";
  xShelfFontSize: number;
  yShelfFontSize: number;
  onXRemove?: () => void;
  onYRemove?: (columnKey: string) => void;
  onXAxisDrop?: (columnKey: string) => void;
  onYAxisDrop?: (columnKey: string) => void;
  onXAxisLabelRename?: (nextLabel: string) => void;
  onYAxisLabelRename?: (nextLabel: string) => void;
  onXAxisShelfOrientationChange?: (next: "horizontal" | "vertical") => void;
  onYAxisShelfOrientationChange?: (next: "horizontal" | "vertical") => void;
  onXAxisShelfFontSizeChange?: (next: number) => void;
  onYAxisShelfFontSizeChange?: (next: number) => void;
  onChartTitleRename?: (nextTitle: string) => void;
  onChartTypeChange: (next: GraphChartType) => void;
  onLayerSelectionModeChange: (next: LayerSelectionMode) => void;
  onToggleLegend: () => void;
}

const ChartTypeIcon: React.FC<{ type: GraphChartType; className?: string }> = ({ type, className = "h-3.5 w-3.5" }) => {
  const stroke = "currentColor";
  const common = { fill: "none", stroke, strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (type === "scatter") {
    return <svg viewBox="0 0 20 20" className={className}><circle cx="5" cy="14" r="1.7" fill={stroke} /><circle cx="9" cy="9" r="1.7" fill={stroke} /><circle cx="14" cy="6" r="1.7" fill={stroke} /><circle cx="15.5" cy="13" r="1.7" fill={stroke} /></svg>;
  }
  if (type === "line") {
    return <svg viewBox="0 0 20 20" className={className}><path d="M3 14 7.5 10.5 11 12 16.5 5.5" {...common} /><circle cx="3" cy="14" r="1.2" fill={stroke} /><circle cx="7.5" cy="10.5" r="1.2" fill={stroke} /><circle cx="11" cy="12" r="1.2" fill={stroke} /><circle cx="16.5" cy="5.5" r="1.2" fill={stroke} /></svg>;
  }
  if (type === "bar_grouped" || type === "bar_stacked") {
    return <svg viewBox="0 0 20 20" className={className}><rect x="3" y="9" width="3" height="7" rx="1" fill={stroke} /><rect x="8.5" y="5" width="3" height="11" rx="1" fill={stroke} /><rect x="14" y="7" width="3" height="9" rx="1" fill={stroke} /></svg>;
  }
  if (type === "histogram") {
    return <svg viewBox="0 0 20 20" className={className}><path d="M3 16V9M7 16V6M11 16V11M15 16V4" {...common} /></svg>;
  }
  if (type === "box") {
    return <svg viewBox="0 0 20 20" className={className}><path d="M4 10h12M7 6h6v8H7zM10 3v3M10 14v3" {...common} /></svg>;
  }
  if (type === "heatmap") {
    return <svg viewBox="0 0 20 20" className={className}><rect x="3" y="3" width="5" height="5" rx="1" fill={stroke} opacity=".45" /><rect x="9" y="3" width="8" height="5" rx="1" fill={stroke} opacity=".7" /><rect x="3" y="9" width="6" height="8" rx="1" fill={stroke} opacity=".75" /><rect x="10" y="10" width="7" height="7" rx="1" fill={stroke} /></svg>;
  }
  if (type === "contour") {
    return <svg viewBox="0 0 20 20" className={className}><path d="M4 13c2.2-3.5 4.4-5 7-5 2.2 0 3.6.8 5 2.2M3.5 9.5c2.6-2 4.7-3 7.2-3 2.5 0 4.4.8 5.8 2.4M6 16c1.4-2 3-3 5-3 1.6 0 3 .5 4 1.5" {...common} /></svg>;
  }
  return <svg viewBox="0 0 20 20" className={className}><path d="M3 10h14" {...common} /></svg>;
};

export const ChartDisplay: React.FC<ChartDisplayProps> = ({
  data,
  layout,
  height = 520,
  chartTitle,
  chartType,
  resetNonce = 0,
  layerSelectionMode,
  layerButtons,
  legendBehaviorByLayer,
  xDropItem,
  yDropItems = [],
  xAxisLabelText,
  yAxisLabelText,
  xShelfOrientation,
  yShelfOrientation,
  xShelfFontSize,
  yShelfFontSize,
  onXRemove,
  onYRemove,
  onXAxisDrop,
  onYAxisDrop,
  onXAxisLabelRename,
  onYAxisLabelRename,
  onXAxisShelfOrientationChange,
  onYAxisShelfOrientationChange,
  onXAxisShelfFontSizeChange,
  onYAxisShelfFontSizeChange,
  onChartTitleRename,
  onChartTypeChange,
  onLayerSelectionModeChange,
  onToggleLegend,
}) => {
  const plotRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [axisDropOver, setAxisDropOver] = useState<"x" | "y" | null>(null);
  const [editingAxis, setEditingAxis] = useState<"x" | "y" | null>(null);
  const [axisDraft, setAxisDraft] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const exportImage = async (format: "png" | "svg") => {
    const graphDiv = plotRef.current;
    if (!graphDiv) return;
    const dataUrl = await Plotly.toImage(graphDiv, {
      format,
      width: 1200,
      height: 700,
      scale: 2,
    });
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `graph-builder.${format}`;
    link.click();
  };

  const resetLegendView = () => {
    if (!plotRef.current) return;
    const graphDiv = plotRef.current;
    const idx = (graphDiv?.data || []).map((_: any, i: number) => i);
    if (!idx.length) return;
    Plotly.restyle(graphDiv, { visible: true }, idx);
    const opacities = (graphDiv?.data || []).map((trace: any) => {
      const metaOpacity = trace?.meta?.baseOpacity;
      if (typeof metaOpacity === "number") return metaOpacity;
      if (typeof trace?.opacity === "number") return trace.opacity;
      return 1;
    });
    Plotly.restyle(graphDiv, { opacity: opacities }, idx);
  };

  const handleLegendClick = (event: any) => {
    try {
      const graphDiv = plotRef.current;
      if (!graphDiv || !event?.data) return true;
      const clicked = event.data[event.curveNumber];
      const layerType = clicked?.meta?.layerType as GraphLayerType | undefined;
      if (!layerType) return true;
      const behavior = legendBehaviorByLayer?.[layerType] || "toggle";
      if (behavior === "toggle") return true;

      const traces = event.data as any[];
      const indices = traces.map((_, i) => i);

      if (behavior === "isolate") {
        const visibleVals = traces.map((trace) => (trace?.meta?.layerType === layerType ? true : "legendonly"));
        Plotly.restyle(graphDiv, { visible: visibleVals }, indices);
        return false;
      }

      if (behavior === "highlight") {
        const opacities = traces.map((trace) => {
          const base =
            typeof trace?.meta?.baseOpacity === "number"
              ? trace.meta.baseOpacity
              : typeof trace?.opacity === "number"
              ? trace.opacity
              : 1;
          return trace?.meta?.layerType === layerType ? base : Math.max(0.08, base * 0.18);
        });
        Plotly.restyle(graphDiv, { visible: true }, indices);
        Plotly.restyle(graphDiv, { opacity: opacities }, indices);
        return false;
      }

      return true;
    } catch {
      return true;
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const resizePlot = () => {
      if (!plotRef.current) return;
      try {
        Plotly.Plots.resize(plotRef.current);
      } catch {
        // ignore transient resize errors during mount/unmount
      }
    };
    const observer = new ResizeObserver(() => resizePlot());
    observer.observe(container);
    const timer = window.setTimeout(resizePlot, 0);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!plotRef.current || resetNonce === 0) return;
    try {
      Plotly.relayout(plotRef.current, {
        "xaxis.autorange": true,
        "yaxis.autorange": true,
      });
    } catch {
      // ignore reset errors while the plot is remounting
    }
  }, [resetNonce]);

  const effectiveLayout = useMemo(() => {
    const next = { ...(layout || {}) };
    next.title = {
      ...(typeof layout?.title === "object" ? layout.title : {}),
      text: "",
    };
    next.xaxis = {
      ...(layout?.xaxis || {}),
      title: {
        ...(layout?.xaxis?.title || {}),
        font: {
          ...(layout?.xaxis?.title?.font || {}),
          size: xShelfFontSize,
        },
      },
    };
    next.yaxis = {
      ...(layout?.yaxis || {}),
      title: {
        ...(layout?.yaxis?.title || {}),
        font: {
          ...(layout?.yaxis?.title?.font || {}),
          size: yShelfFontSize,
        },
      },
    };
    return next;
  }, [chartTitle, layout, xShelfFontSize, yShelfFontSize]);

  const startAxisRename = (axis: "x" | "y") => {
    const current = axis === "x" ? xAxisLabelText : yAxisLabelText;
    setEditingAxis(axis);
    setAxisDraft(current || "");
  };

  const commitAxisRename = () => {
    if (!editingAxis) return;
    if (editingAxis === "x") onXAxisLabelRename?.(axisDraft.trim());
    else onYAxisLabelRename?.(axisDraft.trim());
    setEditingAxis(null);
  };

  const cancelAxisRename = () => {
    setEditingAxis(null);
    setAxisDraft("");
  };

  const startTitleRename = () => {
    setTitleDraft(chartTitle || "");
    setIsEditingTitle(true);
  };

  const commitTitleRename = () => {
    onChartTitleRename?.(titleDraft.trim());
    setIsEditingTitle(false);
  };

  const cancelTitleRename = () => {
    setIsEditingTitle(false);
    setTitleDraft("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 pb-1">
        <div className="inline-flex rounded-md border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={layerSelectionMode === "solo" ? "default" : "ghost"}
            onClick={() => onLayerSelectionModeChange("solo")}
            className="h-6 rounded-sm px-1.5 text-[9px]"
            title="Solo mode: choose one primary chart family"
          >
            Solo
          </Button>
          <Button
            type="button"
            size="sm"
            variant={layerSelectionMode === "compose" ? "default" : "ghost"}
            onClick={() => onLayerSelectionModeChange("compose")}
            className="h-6 rounded-sm px-1.5 text-[9px]"
            title="Compose mode: combine multiple chart layers like JMP Graph Builder"
          >
            Compose
          </Button>
        </div>
        {layerButtons.map((btn) => (
          <Button
            key={btn.id}
            type="button"
            size="sm"
            variant={btn.active ? "default" : "outline"}
            onClick={() => onChartTypeChange(btn.id)}
            title={`${btn.label}${btn.id === "auto" ? "" : layerSelectionMode === "compose" ? " (toggle layer)" : " (solo layer)"}`}
            className={`h-7 gap-1 rounded-xl px-1.5 text-[9px] font-medium ${btn.id === "auto" ? "min-w-7" : ""}`}
          >
            {btn.id === "auto" ? <span aria-hidden="true" className="font-semibold">A</span> : <ChartTypeIcon type={btn.id} className="h-3 w-3" />}
            <span>{btn.id === "auto" ? "" : btn.label.replace("Bar ", "").replace("Grouped", "Bar").replace("Stacked", "Stacked")}</span>
          </Button>
        ))}
        <Button type="button" size="sm" variant="outline" className="h-7 px-1.5 text-[9px]" onClick={onToggleLegend}>Legend</Button>
        <Button type="button" size="sm" variant="outline" className="h-7 px-1.5 text-[9px]" onClick={resetLegendView}>Reset View</Button>
        <Button type="button" size="sm" variant="outline" className="h-7 px-1.5 text-[9px]" onClick={() => exportImage("png")}>PNG</Button>
        <Button type="button" size="sm" variant="outline" className="h-7 px-1.5 text-[9px]" onClick={() => exportImage("svg")}>SVG</Button>
      </div>
      <div ref={containerRef} className="border rounded-md p-2 min-w-0 overflow-hidden" style={{ height }}>
        <div className="relative h-full w-full pl-16 pb-12">
          {isEditingTitle ? (
            <div className="absolute left-1/2 top-2 z-30 w-[240px] -translate-x-1/2 rounded-sm border bg-background/95 p-1 shadow-sm">
              <Input
                autoFocus
                value={titleDraft}
                className="h-8 text-center text-sm"
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={commitTitleRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitTitleRename();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelTitleRename();
                  }
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              className="absolute left-1/2 top-2 z-20 max-w-[70%] -translate-x-1/2 rounded-sm px-3 py-1 text-center text-[13px] font-semibold text-slate-700 hover:bg-background/50"
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                startTitleRename();
              }}
              title="Double-click to edit chart title"
            >
              <span className="truncate block">{chartTitle?.trim() ? chartTitle : "Double-click to add chart title"}</span>
            </button>
          )}
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div
                className={`absolute bottom-12 left-0 top-0 z-10 flex w-14 flex-col items-center justify-center gap-2 rounded-sm border border-dashed px-1 py-2 text-[11px] font-medium transition-colors ${
                  axisDropOver === "y" ? "border-primary bg-primary/10 text-primary" : "border-border/70 bg-muted/25 text-muted-foreground"
                }`}
                onDoubleClick={() => startAxisRename("y")}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (onYAxisDrop) {
                    event.dataTransfer.dropEffect = "copy";
                    setAxisDropOver("y");
                  }
                }}
                onDragLeave={() => setAxisDropOver((prev) => (prev === "y" ? null : prev))}
                onDrop={(event) => {
                  event.preventDefault();
                  setAxisDropOver(null);
                  const key = event.dataTransfer.getData("text/plain");
                  if (key && onYAxisDrop) onYAxisDrop(key);
                }}
                title="Drop variable here for Y axis"
              >
                <div
                  className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                >
                  {yAxisLabelText || "Y Axis"}
                </div>
                <div className={`flex ${yShelfOrientation === "vertical" ? "flex-col" : "flex-row flex-wrap justify-center"} items-stretch gap-1`}>
                  {yDropItems.length ? (
                    yDropItems.map((item) => (
                      <button
                        key={`y-role:${item.key}`}
                        type="button"
                        className="rounded-sm border bg-background/90 px-1 py-1 font-medium text-foreground shadow-sm hover:bg-background"
                        style={{
                          fontSize: `${yShelfFontSize}px`,
                          writingMode: yShelfOrientation === "vertical" ? "vertical-rl" : "horizontal-tb",
                          transform: yShelfOrientation === "vertical" ? "rotate(180deg)" : "none",
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onYRemove?.(item.key);
                        }}
                        title={`Remove ${item.label} from Y axis`}
                      >
                        <span className="block truncate">{item.label}</span>
                        <span className="text-[9px] text-muted-foreground">x</span>
                      </button>
                    ))
                  ) : (
                    <span
                      className="text-center"
                      style={{
                        fontSize: `${yShelfFontSize}px`,
                        writingMode: "vertical-rl",
                        transform: "rotate(180deg)",
                      }}
                    >
                      Drop Y
                    </span>
                  )}
                </div>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-44">
              <ContextMenuLabel>Y Axis</ContextMenuLabel>
              <ContextMenuItem onClick={() => startAxisRename("y")}>Rename Axis Label</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onYAxisShelfOrientationChange?.("vertical")}>Vertical Labels</ContextMenuItem>
              <ContextMenuItem onClick={() => onYAxisShelfOrientationChange?.("horizontal")}>Horizontal Labels</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onYAxisShelfFontSizeChange?.(10)}>Small Text</ContextMenuItem>
              <ContextMenuItem onClick={() => onYAxisShelfFontSizeChange?.(12)}>Medium Text</ContextMenuItem>
              <ContextMenuItem onClick={() => onYAxisShelfFontSizeChange?.(14)}>Large Text</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div
                className={`absolute bottom-0 left-16 right-0 z-10 flex h-10 items-center justify-center rounded-sm border border-dashed px-3 text-[11px] font-medium transition-colors ${
                  axisDropOver === "x" ? "border-primary bg-primary/10 text-primary" : "border-border/70 bg-muted/25 text-muted-foreground"
                }`}
                onDoubleClick={() => startAxisRename("x")}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (onXAxisDrop) {
                    event.dataTransfer.dropEffect = "copy";
                    setAxisDropOver("x");
                  }
                }}
                onDragLeave={() => setAxisDropOver((prev) => (prev === "x" ? null : prev))}
                onDrop={(event) => {
                  event.preventDefault();
                  setAxisDropOver(null);
                  const key = event.dataTransfer.getData("text/plain");
                  if (key && onXAxisDrop) onXAxisDrop(key);
                }}
                title="Drop variable here for X axis"
              >
                {xDropItem ? (
                  <button
                    type="button"
                    className={`inline-flex max-w-full items-center gap-2 rounded-sm border bg-background/90 px-2 py-1 font-medium text-foreground shadow-sm hover:bg-background ${xShelfOrientation === "vertical" ? "flex-col" : ""}`}
                    style={{
                      fontSize: `${xShelfFontSize}px`,
                      writingMode: xShelfOrientation === "vertical" ? "vertical-rl" : "horizontal-tb",
                      transform: xShelfOrientation === "vertical" ? "rotate(180deg)" : "none",
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onXRemove?.();
                    }}
                    title={`Remove ${xDropItem.label} from X axis`}
                  >
                    <span className="text-muted-foreground">{xAxisLabelText || "X"}:</span>
                    <span className="truncate">{xDropItem.label}</span>
                    <span className="text-[10px] text-muted-foreground">x</span>
                  </button>
                ) : (
                  <span className="truncate" style={{ fontSize: `${xShelfFontSize}px` }}>
                    Drop X variable
                  </span>
                )}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-44">
              <ContextMenuLabel>X Axis</ContextMenuLabel>
              <ContextMenuItem onClick={() => startAxisRename("x")}>Rename Axis Label</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onXAxisShelfOrientationChange?.("horizontal")}>Horizontal Labels</ContextMenuItem>
              <ContextMenuItem onClick={() => onXAxisShelfOrientationChange?.("vertical")}>Vertical Labels</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onXAxisShelfFontSizeChange?.(10)}>Small Text</ContextMenuItem>
              <ContextMenuItem onClick={() => onXAxisShelfFontSizeChange?.(12)}>Medium Text</ContextMenuItem>
              <ContextMenuItem onClick={() => onXAxisShelfFontSizeChange?.(14)}>Large Text</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          <div className="h-full w-full">
            {editingAxis === "x" && (
              <div className="absolute bottom-14 left-1/2 z-30 w-40 -translate-x-1/2 rounded-sm border bg-background/95 p-1 shadow-sm">
                <Input
                  autoFocus
                  value={axisDraft}
                  className="h-8 text-center text-sm"
                  onChange={(event) => setAxisDraft(event.target.value)}
                  onBlur={commitAxisRename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitAxisRename();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelAxisRename();
                    }
                  }}
                />
              </div>
            )}
            {editingAxis === "y" && (
              <div className="absolute left-[4.2rem] top-1/2 z-30 w-32 -translate-y-1/2 rounded-sm border bg-background/95 p-1 shadow-sm">
                <Input
                  autoFocus
                  value={axisDraft}
                  className="h-8 text-center text-sm"
                  onChange={(event) => setAxisDraft(event.target.value)}
                  onBlur={commitAxisRename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitAxisRename();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelAxisRename();
                    }
                  }}
                />
              </div>
            )}
            <button
              type="button"
              className="absolute bottom-14 left-1/2 z-20 h-8 min-w-[120px] -translate-x-1/2 rounded-sm bg-transparent hover:bg-background/35 focus:bg-background/45"
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                startAxisRename("x");
              }}
              title="Double-click to rename X axis label"
            >
              <span className="sr-only">Rename X axis label</span>
            </button>
            <button
              type="button"
              className="absolute left-[4.5rem] top-1/2 z-20 h-24 w-8 -translate-y-1/2 rounded-sm bg-transparent hover:bg-background/35 focus:bg-background/45"
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                startAxisRename("y");
              }}
              title="Double-click to rename Y axis label"
            >
              <span className="sr-only">Rename Y axis label</span>
            </button>
            <Plot
              data={data}
              layout={effectiveLayout}
              style={{ width: "100%", height: "100%" }}
              useResizeHandler
              onInitialized={(_, graphDiv) => {
                plotRef.current = graphDiv;
              }}
              onUpdate={(_, graphDiv) => {
                plotRef.current = graphDiv;
              }}
              onLegendClick={handleLegendClick}
              config={{
                responsive: true,
                displaylogo: false,
                scrollZoom: true,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
