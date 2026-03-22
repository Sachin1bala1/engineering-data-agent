import React from "react";
import { BarChart3, Filter, MoreHorizontal, Pencil, Sigma, Type } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { ColumnModelingType } from "@/stores/dataWorkbenchStore";
import { getModelingTypeLabel } from "@/stores/dataWorkbenchStore";

interface ColumnMenuProps {
  columnKey: string;
  modelingType: ColumnModelingType;
  onSortAsc?: () => void;
  onSortDesc?: () => void;
  onClearSort?: () => void;
  onFilter?: () => void;
  onInfo?: () => void;
  onDistribution?: () => void;
  onSummary?: () => void;
  onMetadata?: () => void;
  onRename?: () => void;
  onCreateFormula?: () => void;
  onRecode?: () => void;
  onHide?: () => void;
  onDeleteDerived?: () => void;
  onAddToGraph?: () => void;
  onQuickChart?: (mode: "histogram" | "box" | "scatter" | "trend") => void;
  onSetUnits?: () => void;
  onPinLeft?: () => void;
  onPinRight?: () => void;
  onUnpin?: () => void;
  onSetType?: (type: ColumnModelingType) => void;
  isDerived?: boolean;
  compact?: boolean;
}

const MODELING_TYPES: ColumnModelingType[] = ["continuous", "nominal", "ordinal", "datetime", "text"];

export const ColumnMenu: React.FC<ColumnMenuProps> = ({
  modelingType,
  onSortAsc,
  onSortDesc,
  onClearSort,
  onFilter,
  onInfo,
  onDistribution,
  onSummary,
  onMetadata,
  onRename,
  onCreateFormula,
  onRecode,
  onHide,
  onDeleteDerived,
  onAddToGraph,
  onQuickChart,
  onSetUnits,
  onPinLeft,
  onPinRight,
  onUnpin,
  onSetType,
  isDerived = false,
  compact = false,
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={compact ? "h-6 w-6 rounded-sm text-muted-foreground hover:text-foreground" : "h-7 w-7 rounded-sm"}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Column Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={onSortAsc}>Sort Ascending</DropdownMenuItem>
        <DropdownMenuItem onClick={onSortDesc}>Sort Descending</DropdownMenuItem>
        <DropdownMenuItem onClick={onClearSort}>Clear Sort</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onFilter}>
          <Filter className="mr-2 h-4 w-4" />
          Filter
          <DropdownMenuShortcut>Ctrl+Shift+F</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onInfo}>
          <Type className="mr-2 h-4 w-4" />
          Column Info
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDistribution}>
          Distribution
          <DropdownMenuShortcut>Ctrl+Shift+D</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSummary}>
          <Sigma className="mr-2 h-4 w-4" />
          Summary Stats
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onMetadata}>
          <Type className="mr-2 h-4 w-4" />
          Edit Metadata
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <BarChart3 className="mr-2 h-4 w-4" />
            Quick Chart
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => onQuickChart?.("histogram")}>Histogram</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onQuickChart?.("box")}>Box Plot</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onQuickChart?.("scatter")}>Scatter</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onQuickChart?.("trend")}>Trend</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onRename}>
          <Pencil className="mr-2 h-4 w-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCreateFormula}>
          Create Formula
          <DropdownMenuShortcut>Ctrl+Enter</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onRecode}>Recode Values</DropdownMenuItem>
        <DropdownMenuItem onClick={onSetUnits}>Set Units</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Freeze / Pin</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={onPinLeft}>Pin Left</DropdownMenuItem>
            <DropdownMenuItem onClick={onPinRight}>Pin Right</DropdownMenuItem>
            <DropdownMenuItem onClick={onUnpin}>Unpin</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onClick={onAddToGraph}>Add to Graph</DropdownMenuItem>
        <DropdownMenuItem onClick={onHide}>Hide Column</DropdownMenuItem>
        {isDerived && <DropdownMenuItem onClick={onDeleteDerived}>Delete Derived Column</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Set Modeling Type</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={modelingType} onValueChange={(value) => onSetType?.(value as ColumnModelingType)}>
              {MODELING_TYPES.map((type) => (
                <DropdownMenuRadioItem key={type} value={type}>
                  {getModelingTypeLabel(type)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
