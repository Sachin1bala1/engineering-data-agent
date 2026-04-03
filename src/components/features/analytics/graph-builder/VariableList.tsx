import React, { useMemo, useState } from "react";
import { CalendarDays, Hash, ListTree } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { VariableMeta } from "./types";

interface VariableListProps {
  variables: VariableMeta[];
  onDragStateChange?: (dragging: boolean) => void;
}

const typeToken = (type: VariableMeta["type"]) => {
  if (type === "continuous") return "NUM";
  if (type === "datetime") return "TIME";
  if (type === "ordinal") return "ORD";
  return "CAT";
};

const typeIcon = (type: VariableMeta["type"]) => {
  if (type === "continuous") return <Hash className="h-3.5 w-3.5" />;
  if (type === "datetime") return <CalendarDays className="h-3.5 w-3.5" />;
  return <ListTree className="h-3.5 w-3.5" />;
};

export const VariableList: React.FC<VariableListProps> = ({ variables, onDragStateChange }) => {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return variables;
    return variables.filter((v) => v.label.toLowerCase().includes(needle) || v.key.toLowerCase().includes(needle));
  }, [variables, search]);

  return (
    <TooltipProvider delayDuration={120}>
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[10px]">
      <Input
        placeholder="Search variables"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 rounded-xl border-slate-200 bg-white text-[10px]"
      />
      <div className="max-h-[calc(100vh-14rem)] space-y-2 overflow-auto pr-1">
        {filtered.map((v) => {
          const hoverStats = v.sampleStats
            ? [
                `Mean: ${v.sampleStats.mean?.toFixed(4) ?? "-"}`,
                `Median: ${v.sampleStats.median?.toFixed(4) ?? "-"}`,
                `Std: ${v.sampleStats.std?.toFixed(4) ?? "-"}`,
                `Min: ${v.sampleStats.min?.toFixed(4) ?? "-"}`,
                `Max: ${v.sampleStats.max?.toFixed(4) ?? "-"}`,
              ].join("\n")
            : "";

          return (
            <Tooltip key={v.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", v.key);
                    event.dataTransfer.effectAllowed = "copy";
                    onDragStateChange?.(true);
                  }}
                  onDragEnd={() => onDragStateChange?.(false)}
                  className="group flex h-10 w-full cursor-grab items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/40 hover:shadow-md active:cursor-grabbing"
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-700">
                    <span className="scale-90">{typeIcon(v.type)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[9px] font-semibold text-slate-950">{v.label}</div>
                  </div>
                  <div className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-1 py-0.5 text-[7px] font-semibold tracking-[0.08em] text-slate-600">
                    {typeToken(v.type)}
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" align="start" className="max-w-[220px] text-[10px] leading-4">
                <div className="font-semibold">{v.label}</div>
                <div className="text-muted-foreground">{v.key}</div>
                <div className="mt-1">Type: {v.type}</div>
                <div>Missing: {(v.missingPct * 100).toFixed(2)}%</div>
                <div>Unique: {v.uniqueCount}</div>
                {hoverStats ? (
                  <div className="mt-1 whitespace-pre-line text-muted-foreground">{hoverStats}</div>
                ) : null}
              </TooltipContent>
            </Tooltip>
          );
        })}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
            No columns matched your search.
          </div>
        ) : null}
      </div>
    </div>
    </TooltipProvider>
  );
};
