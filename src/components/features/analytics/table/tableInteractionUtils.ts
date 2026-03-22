import type { ColumnMetadata, WorkbenchRow } from "@/stores/dataWorkbenchStore";

const isMissing = (value: unknown) =>
  value === null || value === undefined || (typeof value === "string" && value.trim() === "");

const normalizeKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");

const toFiniteNumber = (value: unknown): number | null => {
  if (isMissing(value)) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const toDateMs = (value: unknown): number | null => {
  if (isMissing(value)) return null;
  const next = new Date(String(value)).getTime();
  return Number.isFinite(next) ? next : null;
};

const formatDateLike = (source: unknown, nextMs: number) => {
  const nextDate = new Date(nextMs);
  const sourceText = String(source ?? "");
  if (sourceText.includes("T") || sourceText.includes(":")) {
    return nextDate.toISOString();
  }
  return nextDate.toISOString().slice(0, 10);
};

export interface FillPreviewPlan {
  rowIds: number[];
  values: Record<number, unknown>;
}

export interface FillPreviewInput {
  rows: WorkbenchRow[];
  columnKey: string;
  startRowId: number;
  endRowId: number;
  seedRowIds?: number[];
}

export const buildFillPreviewPlan = ({
  rows,
  columnKey,
  startRowId,
  endRowId,
  seedRowIds = [],
}: FillPreviewInput): FillPreviewPlan => {
  const sortedRows = [...rows].sort((a, b) => Number(a.__row_index__) - Number(b.__row_index__));
  const rowIds = sortedRows.map((row) => Number(row.__row_index__));
  const startIndex = rowIds.indexOf(Number(startRowId));
  const endIndex = rowIds.indexOf(Number(endRowId));
  if (startIndex < 0 || endIndex < 0 || startIndex === endIndex) return { rowIds: [], values: {} };

  const direction = endIndex > startIndex ? 1 : -1;
  const previewIds = rowIds.slice(
    Math.min(startIndex, endIndex),
    Math.max(startIndex, endIndex) + 1
  ).filter((rowId) => rowId !== Number(startRowId));

  const fallbackSeedIds = seedRowIds.length
    ? seedRowIds
    : direction > 0
      ? [Math.max(0, startIndex - 1), startIndex].map((idx) => rowIds[idx]).filter((value, idx, arr) => value !== undefined && arr.indexOf(value) === idx)
      : [startIndex, Math.min(rowIds.length - 1, startIndex + 1)].map((idx) => rowIds[idx]).filter((value, idx, arr) => value !== undefined && arr.indexOf(value) === idx);

  const seedValues = fallbackSeedIds
    .map((rowId) => sortedRows.find((row) => Number(row.__row_index__) === Number(rowId))?.[columnKey])
    .filter((value) => value !== undefined);

  if (!seedValues.length) return { rowIds: previewIds, values: {} };

  const numericSeed = seedValues.map(toFiniteNumber);
  const isNumericSequence = numericSeed.every((value) => value !== null);
  const dateSeed = seedValues.map(toDateMs);
  const isDateSequence = !isNumericSequence && dateSeed.every((value) => value !== null);
  const previewValues: Record<number, unknown> = {};

  previewIds.forEach((rowId, index) => {
    if (isNumericSequence) {
      const nums = numericSeed as number[];
      const delta = nums.length >= 2 ? nums[nums.length - 1] - nums[nums.length - 2] : 0;
      previewValues[rowId] = nums[nums.length - 1] + delta * (index + 1) * direction;
      return;
    }
    if (isDateSequence) {
      const dates = dateSeed as number[];
      const delta = dates.length >= 2 ? dates[dates.length - 1] - dates[dates.length - 2] : 24 * 60 * 60 * 1000;
      previewValues[rowId] = formatDateLike(seedValues[seedValues.length - 1], dates[dates.length - 1] + delta * (index + 1) * direction);
      return;
    }
    previewValues[rowId] = seedValues[index % seedValues.length];
  });

  return { rowIds: previewIds, values: previewValues };
};

export interface PastePlan {
  rowOffset: number;
  columnOrder: string[];
  mode: "position" | "header-match";
}

export const resolvePastePlan = (
  matrix: string[][],
  visibleColumns: string[],
  columnMetadata: Record<string, ColumnMetadata>,
  startColumnKey: string
): PastePlan => {
  const startColumnIndex = visibleColumns.indexOf(startColumnKey);
  if (startColumnIndex < 0) {
    return { rowOffset: 0, columnOrder: [], mode: "position" };
  }
  const headerRow = matrix[0] || [];
  const normalizedToColumn = new Map<string, string>();
  visibleColumns.forEach((columnKey) => {
    normalizedToColumn.set(normalizeKey(columnKey), columnKey);
    normalizedToColumn.set(normalizeKey(columnMetadata[columnKey]?.displayName || columnKey), columnKey);
  });
  const matchedColumns = headerRow.map((cell) => normalizedToColumn.get(normalizeKey(String(cell))) || "");
  const matchCount = matchedColumns.filter(Boolean).length;
  if (matchCount >= 2 && matchCount >= Math.ceil(headerRow.length / 2)) {
    return {
      rowOffset: 1,
      columnOrder: matchedColumns,
      mode: "header-match",
    };
  }
  return {
    rowOffset: 0,
    columnOrder: visibleColumns.slice(startColumnIndex, startColumnIndex + Math.max(...matrix.map((row) => row.length), 0)),
    mode: "position",
  };
};
