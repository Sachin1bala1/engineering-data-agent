import React, { useState } from "react";
import { Button } from "@/components/ui/button";

interface DropZoneProps {
  title: string;
  values: string[];
  labels: Record<string, string>;
  multiple?: boolean;
  onDropVariable: (key: string) => void;
  onRemoveVariable: (key: string) => void;
}

export const DropZone: React.FC<DropZoneProps> = ({
  title,
  values,
  labels,
  multiple = false,
  onDropVariable,
  onRemoveVariable,
}) => {
  const [over, setOver] = useState(false);

  return (
    <div
      className={`min-h-[18px] rounded-xl border px-2 py-1.5 transition ${over ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background"}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const key = e.dataTransfer.getData("text/plain");
        if (key) onDropVariable(key);
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-1">
        <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {title}
        </div>
        <div className="text-[8px] text-muted-foreground">{multiple ? "multi" : "single"}</div>
      </div>
      <div className="flex flex-wrap gap-1">
        {values.length === 0 && <span className="text-[9px] text-muted-foreground">Drop here</span>}
        {values.map((v) => (
          <Button
            key={v}
            type="button"
            size="sm"
            variant="secondary"
            className="h-5 rounded-full px-2 text-[9px]"
            onClick={() => onRemoveVariable(v)}
            title="Remove"
          >
            {labels[v] || v} x
          </Button>
        ))}
      </div>
    </div>
  );
};
