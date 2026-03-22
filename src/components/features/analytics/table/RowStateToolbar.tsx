import React from "react";
import { Eraser, EyeOff, Flag, MousePointerSquareDashed } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface RowStateToolbarProps {
  selectedCount: number;
  selectedCellCount?: number;
  onSelectAllVisible?: () => void;
  onExcludeValues?: () => void;
  onHideValues?: () => void;
  onExcludeSelected: () => void;
  onHideSelected: () => void;
  onLabelSelected: () => void;
  onClearAllStates: () => void;
}

export const RowStateToolbar: React.FC<RowStateToolbarProps> = ({
  selectedCount,
  selectedCellCount = 0,
  onSelectAllVisible,
  onExcludeValues,
  onHideValues,
  onExcludeSelected,
  onHideSelected,
  onLabelSelected,
  onClearAllStates,
}) => {
  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/15 px-3 py-2">
        <div className="mr-2 flex items-center gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Row State</div>
          <div className="rounded-sm border bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground">{selectedCount} selected</div>
        </div>
        <Button size="sm" variant="outline" className="h-7 rounded-sm text-[11px]" onClick={onSelectAllVisible}>
          <MousePointerSquareDashed className="mr-1.5 h-3.5 w-3.5" />
          Select Visible
        </Button>
        {selectedCellCount > 0 && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-sm border-amber-300 text-[11px] text-amber-800"
                  onClick={onExcludeValues}
                  disabled={!selectedCellCount}
                >
                  Exclude Values
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-[11px]">Exclude only the selected column values from analysis.</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-sm border-slate-300 text-[11px] text-slate-700"
                  onClick={onHideValues}
                  disabled={!selectedCellCount}
                >
                  <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                  Hide Values
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-[11px]">Hide only the selected column values by blanking those cells.</TooltipContent>
            </Tooltip>
          </>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-sm border-amber-300 text-[11px] text-amber-800"
              onClick={onExcludeSelected}
              disabled={!selectedCount}
            >
              Exclude Rows
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-[11px]">E = Excluded rows from analysis</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 rounded-sm border-slate-300 text-[11px] text-slate-700" onClick={onHideSelected} disabled={!selectedCount}>
              <EyeOff className="mr-1.5 h-3.5 w-3.5" />
              Hide Rows
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-[11px]">H = Hidden from table and analytics views</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 rounded-sm border-sky-300 text-[11px] text-sky-800" onClick={onLabelSelected} disabled={!selectedCount}>
              <Flag className="mr-1.5 h-3.5 w-3.5" />
              Label
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-[11px]">L = Mark for labeling in linked charts</TooltipContent>
        </Tooltip>
        <Button size="sm" variant="ghost" className="h-7 rounded-sm text-[11px]" onClick={onClearAllStates}>
          <Eraser className="mr-1.5 h-3.5 w-3.5" />
          Clear
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-1 text-[10px]">
          <span className="text-muted-foreground">Legend</span>
          <span className="inline-flex items-center gap-1 rounded-sm border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-emerald-700">S Selected</span>
          <span className="inline-flex items-center gap-1 rounded-sm border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-800">E Excluded</span>
          <span className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-slate-700">H Hidden</span>
          <span className="inline-flex items-center gap-1 rounded-sm border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-sky-800">L Labeled</span>
        </div>
      </div>
    </TooltipProvider>
  );
};
