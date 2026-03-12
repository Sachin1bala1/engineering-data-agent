import React, { useEffect, useMemo, useRef } from "react";
import Plot from "react-plotly.js";
import Plotly from "plotly.js-cartesian-dist-min";
import { Button } from "@/components/ui/button";
import type { GraphChartType, GraphLayerType, LegendBehavior } from "./types";

interface ChartDisplayProps {
  data: any[];
  layout: any;
  height?: number;
  chartType: GraphChartType;
  legendBehaviorByLayer?: Partial<Record<GraphLayerType, LegendBehavior>>;
  onChartTypeChange: (next: GraphChartType) => void;
  onToggleLegend: () => void;
}

export const ChartDisplay: React.FC<ChartDisplayProps> = ({
  data,
  layout,
  height = 520,
  chartType,
  legendBehaviorByLayer,
  onChartTypeChange,
  onToggleLegend,
}) => {
  const plotRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const typeButtons = useMemo<Array<{ id: GraphChartType; label: string; glyph: string }>>(
    () => [
      { id: "auto", label: "Auto", glyph: "A" },
      { id: "scatter", label: "Scatter", glyph: "*" },
      { id: "line", label: "Line", glyph: "/" },
      { id: "bar_grouped", label: "Bar Grouped", glyph: "|||" },
      { id: "bar_stacked", label: "Bar Stacked", glyph: "=" },
      { id: "histogram", label: "Histogram", glyph: "##" },
      { id: "box", label: "Box", glyph: "[ ]" },
      { id: "heatmap", label: "Heatmap", glyph: "HM" },
      { id: "contour", label: "Contour", glyph: "CT" },
    ],
    []
  );

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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1 items-center">
        {typeButtons.map((btn) => (
          <Button
            key={btn.id}
            type="button"
            size="sm"
            variant={chartType === btn.id ? "default" : "outline"}
            onClick={() => onChartTypeChange(btn.id)}
            title={btn.label}
            className="min-w-9 px-2 font-mono"
          >
            <span aria-hidden="true">{btn.glyph}</span>
            <span className="sr-only">{btn.label}</span>
          </Button>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={onToggleLegend}>Legend</Button>
        <Button type="button" size="sm" variant="outline" onClick={resetLegendView}>Reset View</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => exportImage("png")}>PNG</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => exportImage("svg")}>SVG</Button>
      </div>
      <div ref={containerRef} className="border rounded-md p-2 min-w-0 overflow-hidden" style={{ height }}>
        <Plot
          data={data}
          layout={layout}
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
  );
};
