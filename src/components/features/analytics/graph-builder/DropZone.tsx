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
      className={`rounded-md border p-2 min-h-[62px] ${over ? "border-primary bg-primary/5" : "border-border"}`}
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
      <div className="text-xs font-medium text-muted-foreground mb-2">
        {title} {multiple ? "(multiple)" : "(single)"}
      </div>
      <div className="flex flex-wrap gap-1">
        {values.length === 0 && <span className="text-xs text-muted-foreground">Drop variable here</span>}
        {values.map((v) => (
          <Button
            key={v}
            type="button"
            size="sm"
            variant="secondary"
            className="h-6 px-2 text-xs"
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
