import { parse } from "csv-parse/sync";

export interface GroupedCompareConfig {
  groupColumn: string;
  baselineValue: string;
  experimentValue: string;
}

export interface GroupedCompareSplitResult {
  baselineFile: File;
  experimentFile: File;
  baselineRows: number;
  experimentRows: number;
  columns: string[];
}

const GROUP_COLUMN_CANDIDATES = ["scenario", "group", "cohort", "arm", "variant", "condition", "batch_type"];
const BASELINE_VALUE_CANDIDATES = ["baseline", "control", "current", "as_is", "as-is", "existing", "reference"];
const EXPERIMENT_VALUE_CANDIDATES = ["experiment", "test", "treatment", "candidate", "variant", "new", "proposed"];

function normalizeLabel(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowsToCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(csvEscape).join(",");
  const body = rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","));
  return [header, ...body].join("\n");
}

export async function inspectGroupedCompareFile(file: File): Promise<{ columns: string[]; records: Array<Record<string, unknown>> }> {
  const text = await file.text();
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Array<Record<string, unknown>>;
  const columns = Object.keys(records[0] || {});
  return { columns, records };
}

export function inferGroupedCompareConfig(columns: string[], records: Array<Record<string, unknown>>): GroupedCompareConfig | null {
  const lowerToColumn = new Map(columns.map((column) => [column.toLowerCase(), column]));
  const groupColumn =
    GROUP_COLUMN_CANDIDATES.map((candidate) => lowerToColumn.get(candidate)).find(Boolean) ||
    columns.find((column) => {
      const values = new Set(records.slice(0, 50).map((row) => normalizeLabel(row[column])).filter(Boolean));
      return values.has("baseline") && (values.has("experiment") || values.has("test") || values.has("control") || values.has("treatment"));
    }) ||
    "";

  if (!groupColumn) {
    return null;
  }

  const values = Array.from(
    new Set(records.map((row) => normalizeLabel(row[groupColumn])).filter(Boolean))
  );
  const baselineValue =
    BASELINE_VALUE_CANDIDATES.find((candidate) => values.includes(candidate)) ||
    values.find((value) => value !== "") ||
    "";
  const experimentValue =
    EXPERIMENT_VALUE_CANDIDATES.find((candidate) => values.includes(candidate) && candidate !== baselineValue) ||
    values.find((value) => value !== baselineValue) ||
    "";

  if (!baselineValue || !experimentValue) {
    return null;
  }

  return { groupColumn, baselineValue, experimentValue };
}

export async function splitGroupedCompareFile(
  file: File,
  config: GroupedCompareConfig
): Promise<GroupedCompareSplitResult> {
  const { columns, records } = await inspectGroupedCompareFile(file);
  if (!columns.length) {
    throw new Error("The grouped compare file does not contain any columns.");
  }
  if (!config.groupColumn.trim()) {
    throw new Error("Choose a grouping column before running the comparison.");
  }
  const normalizedGroupColumn = columns.find((column) => column === config.groupColumn || column.toLowerCase() === config.groupColumn.toLowerCase());
  if (!normalizedGroupColumn) {
    throw new Error(`Grouping column "${config.groupColumn}" was not found in the uploaded file.`);
  }

  const baselineRows = records.filter((row) => normalizeLabel(row[normalizedGroupColumn]) === normalizeLabel(config.baselineValue));
  const experimentRows = records.filter((row) => normalizeLabel(row[normalizedGroupColumn]) === normalizeLabel(config.experimentValue));

  if (!baselineRows.length || !experimentRows.length) {
    throw new Error(`Could not split the grouped file into baseline (${baselineRows.length}) and experiment (${experimentRows.length}) rows.`);
  }

  const baseName = file.name.replace(/\.(csv|xls|xlsx)$/i, "");
  const baselineCsv = rowsToCsv(baselineRows, columns);
  const experimentCsv = rowsToCsv(experimentRows, columns);

  return {
    baselineFile: new File([baselineCsv], `${baseName}_baseline.csv`, { type: "text/csv" }),
    experimentFile: new File([experimentCsv], `${baseName}_experiment.csv`, { type: "text/csv" }),
    baselineRows: baselineRows.length,
    experimentRows: experimentRows.length,
    columns,
  };
}
