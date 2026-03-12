import React, { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import type { VariableMeta } from "./types";

interface VariableListProps {
  variables: VariableMeta[];
}

const ROW_HEIGHT = 44;
const VIEWPORT_HEIGHT = 280;

export const VariableList: React.FC<VariableListProps> = ({ variables }) => {
  const [search, setSearch] = useState("");
  const [scrollTop, setScrollTop] = useState(0);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return variables;
    return variables.filter((v) => v.label.toLowerCase().includes(needle) || v.key.toLowerCase().includes(needle));
  }, [variables, search]);

  const totalHeight = filtered.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 4);
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + 8;
  const endIndex = Math.min(filtered.length, startIndex + visibleCount);
  const visible = filtered.slice(startIndex, endIndex);

  return (
    <div className="space-y-2">
      <Input
        placeholder="Search variables"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div
        className="border rounded-md overflow-auto bg-background"
        style={{ height: VIEWPORT_HEIGHT }}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          {visible.map((v, idx) => {
            const i = startIndex + idx;
            const typeIcon =
              v.type === "continuous"
                ? "📈"
                : v.type === "datetime"
                  ? "⏱"
                  : v.type === "ordinal"
                    ? "🔢"
                    : "🏷";
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
              <div
                key={v.key}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", v.key);
                  event.dataTransfer.effectAllowed = "copy";
                }}
                title={`${v.label}\nType: ${v.type}\nMissing: ${(v.missingPct * 100).toFixed(2)}%\nUnique: ${v.uniqueCount}${hoverStats ? `\n${hoverStats}` : ""}`}
                className="absolute left-0 right-0 px-2 py-1 text-xs cursor-grab active:cursor-grabbing border-b bg-background hover:bg-accent/50"
                style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {typeIcon} {v.label}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    miss {(v.missingPct * 100).toFixed(1)}% | uniq {v.uniqueCount}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground">{v.numeric ? "num" : "cat"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
