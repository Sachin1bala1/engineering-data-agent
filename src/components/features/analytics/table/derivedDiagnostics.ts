import type { ColumnMetadata } from "@/stores/dataWorkbenchStore";

const RESERVED = new Set(["Math", "true", "false", "null", "undefined", "NaN", "Infinity"]);

export const extractFormulaDependenciesFromColumns = (formulaText: string, columns: ColumnMetadata[]) => {
  const normalized = String(formulaText || "").trim().replace(/^=/, "");
  const dependencies = new Set<string>();
  const bracketMatches = normalized.match(/\[([^\]]+)\]/g) || [];
  for (const match of bracketMatches) {
    const column = match.slice(1, -1).trim();
    if (column) dependencies.add(column);
  }
  const bareMatches = normalized.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
  const knownColumns = new Set(columns.map((column) => column.key));
  for (const token of bareMatches) {
    if (RESERVED.has(token)) continue;
    if (knownColumns.has(token)) dependencies.add(token);
  }
  return Array.from(dependencies);
};

export type FormulaDiagnostics = {
  targetColumn: string;
  dependencies: string[];
  unknownDependencies: string[];
  syntaxValid: boolean;
  cycleDetected: boolean;
  cyclePath: string[] | null;
  isValid: boolean;
};

export const buildFormulaDiagnostics = ({
  formula,
  targetColumn,
  columns,
  derivedDependencyMap,
}: {
  formula: string;
  targetColumn: string;
  columns: ColumnMetadata[];
  derivedDependencyMap: Record<string, string[]>;
}): FormulaDiagnostics => {
  const dependencies = extractFormulaDependenciesFromColumns(formula, columns);
  const unknownDependencies = dependencies.filter((dependency) => !columns.some((column) => column.key === dependency));
  const normalized = String(formula || "").trim();
  let syntaxValid = Boolean(normalized);
  if (syntaxValid) {
    try {
      const probe = normalized.replace(/^=/, "").replace(/\[([^\]]+)\]/g, "1");
      // eslint-disable-next-line no-new-func
      new Function(`return (${probe});`);
    } catch {
      syntaxValid = false;
    }
  }

  const findPathToTarget = (column: string, seen = new Set<string>()): string[] | null => {
    if (!targetColumn) return null;
    if (column === targetColumn) return [column];
    if (seen.has(column)) return null;
    seen.add(column);
    for (const dependency of derivedDependencyMap[column] || []) {
      const path = findPathToTarget(dependency, new Set(seen));
      if (path) return [column, ...path];
    }
    return null;
  };

  const cyclePath =
    (Boolean(targetColumn) &&
      dependencies
        .map((dependency) => {
          if (dependency === targetColumn) return [targetColumn, targetColumn];
          const path = findPathToTarget(dependency);
          return path ? [targetColumn, ...path] : null;
        })
        .find(Boolean)) ||
    null;

  return {
    targetColumn,
    dependencies,
    unknownDependencies,
    syntaxValid,
    cycleDetected: Boolean(cyclePath?.length),
    cyclePath,
    isValid: syntaxValid && unknownDependencies.length === 0 && !Boolean(cyclePath?.length),
  };
};

export const buildDownstreamDependencyMap = (derivedDependencyMap: Record<string, string[]>) => {
  const downstream: Record<string, string[]> = {};
  for (const [column, dependencies] of Object.entries(derivedDependencyMap)) {
    for (const dependency of dependencies) {
      downstream[dependency] = [...(downstream[dependency] || []), column];
    }
  }
  return Object.fromEntries(
    Object.entries(downstream).map(([column, dependents]) => [column, Array.from(new Set(dependents)).sort((a, b) => a.localeCompare(b))])
  );
};
