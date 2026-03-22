import React, { useEffect, useMemo, useState } from "react";

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { ColumnMetadata, WorkbenchRow } from "@/stores/dataWorkbenchStore";
import { buildFormulaDiagnostics } from "@/components/features/analytics/table/derivedDiagnostics";

interface DerivedColumnDialogsProps {
  mode: "formula" | "recode" | null;
  open: boolean;
  columns: ColumnMetadata[];
  rows: WorkbenchRow[];
  derivedDependencyMap: Record<string, string[]>;
  initialColumnKey?: string;
  onOpenChange: (open: boolean) => void;
  onCreateFormula: (payload: { formula: string; columnKey?: string; newColumnName?: string }) => { ok: boolean; error?: string };
  onRecode: (payload: { sourceColumn: string; mapping: Record<string, string>; newColumnName?: string; keepUnmapped?: boolean }) => { ok: boolean; error?: string };
}

export const DerivedColumnDialogs: React.FC<DerivedColumnDialogsProps> = ({
  mode,
  open,
  columns,
  rows,
  derivedDependencyMap,
  initialColumnKey,
  onOpenChange,
  onCreateFormula,
  onRecode,
}) => {
  const recodeTemplateStorageKey = "data_table_recode_templates_v1";
  const [formula, setFormula] = useState("");
  const [formulaColumnName, setFormulaColumnName] = useState("");
  const [overwriteTarget, setOverwriteTarget] = useState(false);
  const [recodeSourceColumn, setRecodeSourceColumn] = useState("");
  const [recodeColumnName, setRecodeColumnName] = useState("");
  const [recodeMappings, setRecodeMappings] = useState<Record<string, string>>({});
  const [keepUnmapped, setKeepUnmapped] = useState(true);
  const [error, setError] = useState("");
  const [referenceSearch, setReferenceSearch] = useState("");
  const [activeReferenceIndex, setActiveReferenceIndex] = useState(0);
  const [recodeTemplateName, setRecodeTemplateName] = useState("");
  const [selectedRecodeTemplate, setSelectedRecodeTemplate] = useState("__none__");
  const formulaTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const referenceSearchRef = React.useRef<HTMLInputElement | null>(null);

  const recodeTemplates = useMemo(() => {
    if (typeof window === "undefined") return [] as Array<{ key: string; name: string; sourceColumn: string; mapping: Record<string, string>; keepUnmapped: boolean }>;
    try {
      const raw = window.localStorage.getItem(recodeTemplateStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [open, recodeSourceColumn]);

  const sanitizeColumnKey = (value: string) =>
    value
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9_]/g, "_")
      .replace(/^([^A-Za-z_])/, "_$1");

  const formulaDiagnostics = useMemo(() => {
    const targetColumn = overwriteTarget ? (initialColumnKey || "") : sanitizeColumnKey(formulaColumnName || "");
    return buildFormulaDiagnostics({ formula, targetColumn, columns, derivedDependencyMap });
  }, [overwriteTarget, initialColumnKey, formulaColumnName, formula, columns, derivedDependencyMap]);

  const referenceMatches = useMemo(() => {
    const query = referenceSearch.trim().toLowerCase();
    return columns
      .filter((column) => !query || column.displayName.toLowerCase().includes(query) || column.key.toLowerCase().includes(query))
      .slice(0, 14);
  }, [columns, referenceSearch]);

  useEffect(() => {
    setActiveReferenceIndex(0);
  }, [referenceSearch, open, mode]);

  const insertFormulaReference = (columnKey: string) => {
    const token = `[${columnKey}]`;
    const textarea = formulaTextareaRef.current;
    if (!textarea) {
      setFormula((prev) => `${prev}${token}`);
      return;
    }
    const start = textarea.selectionStart ?? formula.length;
    const end = textarea.selectionEnd ?? formula.length;
    const nextFormula = `${formula.slice(0, start)}${token}${formula.slice(end)}`;
    setFormula(nextFormula);
    requestAnimationFrame(() => {
      textarea.focus();
      const nextCursor = start + token.length;
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  useEffect(() => {
    if (!open) return;
    setError("");
    if (mode === "formula") {
      setOverwriteTarget(false);
      setFormulaColumnName(initialColumnKey ? `${initialColumnKey}_derived` : "");
      setFormula(initialColumnKey ? `=[${initialColumnKey}]` : "");
      setReferenceSearch("");
      setActiveReferenceIndex(0);
    }
    if (mode === "recode") {
      const source = initialColumnKey || columns[0]?.key || "";
      setRecodeSourceColumn(source);
      setRecodeColumnName(source ? `${source}_recode` : "");
      setKeepUnmapped(true);
      setRecodeMappings({});
    }
  }, [open, mode, initialColumnKey, columns]);

  const title = mode === "formula" ? "Create Formula Column" : "Recode Column";
  const description = mode === "formula"
    ? "Create a derived column using a row-level formula. Use [Column Name] for columns with spaces."
    : "Map source values into a new derived categorical column with an inline preview.";

  const sourceOptions = useMemo(() => columns, [columns]);
  const recodePreviewRows = useMemo(() => {
    if (!recodeSourceColumn) return [] as Array<{ source: string; count: number; mapped: string }>;
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = String(row[recodeSourceColumn] ?? "");
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 120)
      .map(([source, count]) => ({ source, count, mapped: recodeMappings[source] ?? "" }));
  }, [rows, recodeSourceColumn, recodeMappings]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {mode === "formula" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox checked={overwriteTarget} onCheckedChange={(checked) => setOverwriteTarget(Boolean(checked))} />
              <Label>Overwrite selected target column</Label>
            </div>
            {!overwriteTarget && (
              <div className="space-y-1">
                <Label>New Column Name</Label>
                <Input value={formulaColumnName} onChange={(event) => setFormulaColumnName(event.target.value)} placeholder="efficiency_index" />
              </div>
            )}
            {overwriteTarget && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                Target column: <span className="font-medium">{initialColumnKey || "(none)"}</span>
              </div>
            )}
            <div className="space-y-1">
              <Label>Formula</Label>
              <Textarea
                ref={formulaTextareaRef}
                value={formula}
                onChange={(event) => setFormula(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === " ") {
                    event.preventDefault();
                    referenceSearchRef.current?.focus();
                  }
                  if (event.key === "ArrowDown" && referenceMatches.length > 0) {
                    event.preventDefault();
                    referenceSearchRef.current?.focus();
                  }
                }}
                placeholder="=[Temperature] * 1.8 + 32"
                className={`min-h-[140px] ${formula && !formulaDiagnostics.isValid ? "border-destructive focus-visible:ring-destructive" : ""}`}
              />
            </div>
            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-medium">Column Reference Autocomplete</Label>
                <span className="text-[11px] text-muted-foreground">Insert references like [Temperature]</span>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span className="rounded border bg-background px-2 py-1">Ctrl+Space: focus autocomplete</span>
                <span className="rounded border bg-background px-2 py-1">Arrows: move selection</span>
                <span className="rounded border bg-background px-2 py-1">Enter: insert reference</span>
                <span className="rounded border bg-background px-2 py-1">Escape: return to formula</span>
              </div>
              <Input
                ref={referenceSearchRef}
                value={referenceSearch}
                onChange={(event) => setReferenceSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (!referenceMatches.length) return;
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveReferenceIndex((prev) => Math.min(referenceMatches.length - 1, prev + 1));
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveReferenceIndex((prev) => Math.max(0, prev - 1));
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const selected = referenceMatches[activeReferenceIndex];
                    if (selected) insertFormulaReference(selected.key);
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    formulaTextareaRef.current?.focus();
                  }
                }}
                placeholder="Search columns to insert"
                className="h-8 text-xs"
              />
              <div className="max-h-[160px] overflow-auto rounded border bg-background">
                {referenceMatches.length ? (
                  <div className="divide-y">
                    {referenceMatches.map((column) => (
                      <button
                        key={column.key}
                        type="button"
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-muted ${referenceMatches[activeReferenceIndex]?.key === column.key ? "bg-muted" : ""}`}
                        onClick={() => insertFormulaReference(column.key)}
                        onMouseEnter={() => setActiveReferenceIndex(referenceMatches.findIndex((item) => item.key === column.key))}
                      >
                        <span className="min-w-0 truncate font-medium">{column.displayName}</span>
                        <span className="ml-3 shrink-0 text-muted-foreground">{`[${column.key}]`}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No matching columns.</div>
                )}
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
              <div className="font-medium">Formula Diagnostics</div>
              <div className="text-xs text-muted-foreground">Target: {formulaDiagnostics.targetColumn || "(new column name required)"}</div>
              <div className="text-xs text-muted-foreground">Dependencies: {formulaDiagnostics.dependencies.length ? formulaDiagnostics.dependencies.join(", ") : "none"}</div>
              <div className={`text-xs ${formulaDiagnostics.syntaxValid ? "text-emerald-700" : "text-destructive"}`}>
                Syntax: {formulaDiagnostics.syntaxValid ? "valid" : "invalid"}
              </div>
              {!formulaDiagnostics.targetColumn && (
                <div className="text-xs text-destructive">
                  A valid target column is required. Enter a new column name or overwrite an existing target.
                </div>
              )}
              {formulaDiagnostics.unknownDependencies.length > 0 && (
                <div className="text-xs text-destructive">
                  Unknown columns: {formulaDiagnostics.unknownDependencies.join(", ")}
                </div>
              )}
              {formulaDiagnostics.cycleDetected && (
                <div className="text-xs text-destructive">
                  Dependency cycle detected. The target column depends on itself directly or through another derived column.
                </div>
              )}
              {formulaDiagnostics.cyclePath && (
                <div className="text-xs text-destructive">
                  Cycle path: {formulaDiagnostics.cyclePath.join(" -> ")}
                </div>
              )}
              {formulaDiagnostics.dependencies.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Dependency Graph</div>
                  <div className="rounded border bg-background p-2 text-xs">
                    {formulaDiagnostics.dependencies.map((dependency) => (
                      <div key={dependency} className="py-0.5">
                        <span className="font-medium">{dependency}</span>
                        {(derivedDependencyMap[dependency] || []).length > 0 && (
                          <span className="text-muted-foreground">{" -> "}{(derivedDependencyMap[dependency] || []).join(", ")}</span>
                        )}
                        {(derivedDependencyMap[dependency] || []).length === 0 && (
                          <span className="text-muted-foreground">{" -> "}source column</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {mode === "recode" && (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Source Column</Label>
                <Select value={recodeSourceColumn || "__none__"} onValueChange={(value) => value !== "__none__" && setRecodeSourceColumn(value)}>
                  <SelectTrigger><SelectValue placeholder="Select source column" /></SelectTrigger>
                  <SelectContent>
                    {sourceOptions.map((column) => (
                      <SelectItem key={column.key} value={column.key}>{column.displayName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>New Column Name</Label>
                <Input value={recodeColumnName} onChange={(event) => setRecodeColumnName(event.target.value)} placeholder="material_group" />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_auto_auto]">
              <Input value={recodeTemplateName} onChange={(event) => setRecodeTemplateName(event.target.value)} placeholder="Template name" />
              <Select value={selectedRecodeTemplate} onValueChange={setSelectedRecodeTemplate}>
                <SelectTrigger><SelectValue placeholder="Load template" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No template</SelectItem>
                  {recodeTemplates
                    .filter((template) => !recodeSourceColumn || template.sourceColumn === recodeSourceColumn)
                    .map((template) => (
                      <SelectItem key={template.key} value={template.key}>{template.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!recodeTemplateName.trim() || !recodeSourceColumn || typeof window === "undefined") return;
                  const nextTemplate = {
                    key: `${recodeSourceColumn}:${Date.now()}`,
                    name: recodeTemplateName.trim(),
                    sourceColumn: recodeSourceColumn,
                    mapping: recodeMappings,
                    keepUnmapped,
                  };
                  const nextTemplates = [...recodeTemplates.filter((template) => template.key !== nextTemplate.key), nextTemplate];
                  window.localStorage.setItem(recodeTemplateStorageKey, JSON.stringify(nextTemplates));
                  setSelectedRecodeTemplate(nextTemplate.key);
                }}
              >
                Save Template
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!selectedRecodeTemplate || selectedRecodeTemplate === "__none__" || typeof window === "undefined") return;
                  const template = recodeTemplates.find((entry) => entry.key === selectedRecodeTemplate);
                  if (!template) return;
                  setRecodeSourceColumn(template.sourceColumn);
                  setRecodeMappings(template.mapping || {});
                  setKeepUnmapped(Boolean(template.keepUnmapped));
                  setRecodeTemplateName(template.name);
                }}
              >
                Load
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!selectedRecodeTemplate || selectedRecodeTemplate === "__none__" || typeof window === "undefined") return;
                  const nextTemplates = recodeTemplates.filter((entry) => entry.key !== selectedRecodeTemplate);
                  window.localStorage.setItem(recodeTemplateStorageKey, JSON.stringify(nextTemplates));
                  setSelectedRecodeTemplate("__none__");
                }}
              >
                Delete
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox checked={keepUnmapped} onCheckedChange={(checked) => setKeepUnmapped(Boolean(checked))} />
              <Label>Keep unmapped values</Label>
            </div>
            <div className="rounded-md border overflow-auto max-h-[420px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source Value</TableHead>
                    <TableHead>Count</TableHead>
                    <TableHead>Mapped Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recodePreviewRows.map((row) => (
                    <TableRow key={row.source || "(blank)"}>
                      <TableCell className="font-medium">{row.source || "(blank)"}</TableCell>
                      <TableCell>{row.count}</TableCell>
                      <TableCell>
                        <Input
                          value={row.mapped}
                          onChange={(event) => {
                            const value = event.target.value;
                            setRecodeMappings((prev) => {
                              const next = { ...prev };
                              if (!value.trim()) delete next[row.source];
                              else next[row.source] = value;
                              return next;
                            });
                          }}
                          placeholder="Mapped value"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if (mode === "formula") {
                if (!formulaDiagnostics.isValid) {
                  setError("Resolve formula diagnostics before applying.");
                  return;
                }
                const result = onCreateFormula({
                  formula,
                  columnKey: overwriteTarget ? initialColumnKey : undefined,
                  newColumnName: overwriteTarget ? undefined : formulaColumnName,
                });
                if (!result.ok) {
                  setError(result.error || "Formula creation failed");
                  return;
                }
                onOpenChange(false);
                return;
              }

              const result = onRecode({
                sourceColumn: recodeSourceColumn,
                newColumnName: recodeColumnName,
                mapping: recodeMappings,
                keepUnmapped,
              });
              if (!result.ok) {
                setError(result.error || "Recode failed");
                return;
              }
              onOpenChange(false);
            }}
          >
            {mode === "formula" ? "Apply Formula" : "Create Recode Column"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
