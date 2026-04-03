import { useCallback, useMemo, useState } from "react";

export type PersistedPanelLayoutOptions = {
  storageKey: string;
  defaultSizes: number[];
  minSizes?: number[];
  version?: string;
};

export type PersistedPanelLayoutResult = {
  sizes: number[];
  setSizes: (next: number[]) => void;
  resetSizes: () => void;
};

type PersistedPanelLayoutRecord = {
  version: string;
  sizes: number[];
};

const DEFAULT_VERSION = "v1";

const normalizeSizes = (sizes: number[], defaults: number[], minSizes?: number[]): number[] => {
  if (sizes.length !== defaults.length) return defaults;
  if (!sizes.every((value) => Number.isFinite(value) && value > 0)) return defaults;

  const mins = defaults.map((_, index) => Math.max(1, minSizes?.[index] ?? 1));
  const total = sizes.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return defaults;

  const normalized = sizes.map((value, index) => Math.max(mins[index], value));
  const normalizedTotal = normalized.reduce((sum, value) => sum + value, 0);
  if (normalizedTotal <= 0) return defaults;

  return normalized.map((value) => Number(((value / normalizedTotal) * 100).toFixed(3)));
};

const readStoredSizes = (
  storageKey: string,
  version: string,
  defaults: number[],
  minSizes?: number[]
): number[] => {
  if (typeof window === "undefined") return defaults;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as PersistedPanelLayoutRecord;
    if (!parsed || parsed.version !== version || !Array.isArray(parsed.sizes)) return defaults;
    return normalizeSizes(parsed.sizes, defaults, minSizes);
  } catch {
    return defaults;
  }
};

export function usePersistedPanelLayout({
  storageKey,
  defaultSizes,
  minSizes,
  version = DEFAULT_VERSION,
}: PersistedPanelLayoutOptions): PersistedPanelLayoutResult {
  const safeDefaults = useMemo(
    () => normalizeSizes(defaultSizes, defaultSizes, minSizes),
    [defaultSizes, minSizes]
  );

  const [sizes, setSizesState] = useState<number[]>(() =>
    readStoredSizes(storageKey, version, safeDefaults, minSizes)
  );

  const setSizes = useCallback(
    (next: number[]) => {
      const normalized = normalizeSizes(next, safeDefaults, minSizes);
      setSizesState(normalized);
      if (typeof window !== "undefined") {
        const payload: PersistedPanelLayoutRecord = {
          version,
          sizes: normalized,
        };
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
      }
    },
    [minSizes, safeDefaults, storageKey, version]
  );

  const resetSizes = useCallback(() => {
    setSizesState(safeDefaults);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(storageKey);
    }
  }, [safeDefaults, storageKey]);

  return { sizes, setSizes, resetSizes };
}
