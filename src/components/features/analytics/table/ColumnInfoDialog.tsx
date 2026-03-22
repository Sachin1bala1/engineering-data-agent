import React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ColumnMetadata, ColumnModelingType } from "@/stores/dataWorkbenchStore";
import { getModelingTypeLabel } from "@/stores/dataWorkbenchStore";

interface ColumnInfoDialogProps {
  open: boolean;
  column?: ColumnMetadata;
  compact?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: Partial<ColumnMetadata>) => void;
}

const TYPES: ColumnModelingType[] = ["continuous", "nominal", "ordinal", "datetime", "text"];

export const ColumnInfoDialog: React.FC<ColumnInfoDialogProps> = ({ open, column, compact = false, onOpenChange, onSave }) => {
  const [displayName, setDisplayName] = React.useState("");
  const [modelingType, setModelingType] = React.useState<ColumnModelingType>("nominal");
  const [units, setUnits] = React.useState("");
  const [format, setFormat] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [role, setRole] = React.useState("response");

  React.useEffect(() => {
    if (!open || !column) return;
    setDisplayName(column.displayName || column.name);
    setModelingType(column.modelingType);
    setUnits(column.units || "");
    setFormat(column.format || "");
    setDescription(column.description || "");
    setRole(column.group || "response");
  }, [open, column]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={compact ? "max-w-lg" : "max-w-2xl"}>
        <DialogHeader>
          <DialogTitle>{compact ? "Edit Column Metadata" : "Column Info"}</DialogTitle>
          <DialogDescription>
            {compact
              ? "Rename the column and adjust units, format, and analytical role."
              : "Metadata, units, format, description, and analytical role for the selected column."}
          </DialogDescription>
        </DialogHeader>
        {column ? (
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Source Name</Label>
                <Input value={column.name} disabled />
              </div>
              <div className="space-y-1">
                <Label>Display Name</Label>
                <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Modeling Type</Label>
                <Select value={modelingType} onValueChange={(value) => setModelingType(value as ColumnModelingType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{getModelingTypeLabel(type)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="response">Response</SelectItem>
                    <SelectItem value="factor">Factor</SelectItem>
                    <SelectItem value="id">ID</SelectItem>
                    <SelectItem value="signal">Signal</SelectItem>
                    <SelectItem value="metadata">Metadata</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Units</Label>
                <Input value={units} onChange={(event) => setUnits(event.target.value)} placeholder="°C" />
              </div>
              <div className="space-y-1">
                <Label>Format</Label>
                <Input value={format} onChange={(event) => setFormat(event.target.value)} placeholder="0.00" />
              </div>
            </div>

            {!compact && (
              <>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the analytical meaning of this column" />
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded border p-3 text-xs">
                    <div className="text-muted-foreground">Missing Values</div>
                    <div className="mt-1 text-base font-semibold">{column.stats?.missingCount ?? 0}</div>
                  </div>
                  <div className="rounded border p-3 text-xs">
                    <div className="text-muted-foreground">Unique Values</div>
                    <div className="mt-1 text-base font-semibold">{column.stats?.uniqueCount ?? 0}</div>
                  </div>
                  <div className="rounded border p-3 text-xs">
                    <div className="text-muted-foreground">Formula</div>
                    <div className="mt-1 truncate font-mono">{column.formula || "-"}</div>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No column selected.</div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              onSave({
                displayName,
                modelingType,
                units: units || undefined,
                format: format || undefined,
                description: description || undefined,
                group: role || undefined,
              });
              onOpenChange(false);
            }}
            disabled={!column}
          >
            Save Column Info
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
