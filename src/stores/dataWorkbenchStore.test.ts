import { beforeEach, describe, expect, it } from "vitest";

import {
  useDataWorkbenchStore,
  wouldIntroduceDerivedCycle,
  type DerivedColumnDefinition,
} from "./dataWorkbenchStore";

describe("dataWorkbenchStore", () => {
  beforeEach(() => {
    useDataWorkbenchStore.setState(useDataWorkbenchStore.getInitialState(), true);
  });

  it("supports insert, duplicate, and delete row operations", () => {
    const store = useDataWorkbenchStore.getState();
    store.setDataset(
      [
        { __row_index__: 0, A: 1, B: 10 },
        { __row_index__: 1, A: 2, B: 20 },
      ],
      ["A", "B"]
    );

    const insertResult = useDataWorkbenchStore.getState().insertRow({
      anchorRowId: 0,
      position: "below",
      template: { A: 99, B: 42 },
    });
    expect(insertResult.ok).toBe(true);
    expect(insertResult.rowId).toBe(1);
    expect(useDataWorkbenchStore.getState().sourceDataset[1].A).toBe(99);

    const duplicateResult = useDataWorkbenchStore.getState().duplicateRows([0]);
    expect(duplicateResult.ok).toBe(true);
    expect(duplicateResult.rowIds.length).toBe(1);
    expect(useDataWorkbenchStore.getState().sourceDataset).toHaveLength(4);

    const deleteResult = useDataWorkbenchStore.getState().deleteRows([1]);
    expect(deleteResult.ok).toBe(true);
    expect(deleteResult.deletedCount).toBe(1);
    expect(useDataWorkbenchStore.getState().sourceDataset).toHaveLength(3);
  });

  it("rejects circular derived-column formulas at the store layer", () => {
    const store = useDataWorkbenchStore.getState();
    store.setDataset([{ __row_index__: 0, A: 1, B: 2 }], ["A", "B"]);

    const first = useDataWorkbenchStore.getState().createFormulaColumn({
      columnKey: "C",
      formula: "A + B",
    });
    expect(first.ok).toBe(true);

    const second = useDataWorkbenchStore.getState().createFormulaColumn({
      columnKey: "A",
      formula: "C + 1",
    });
    expect(second.ok).toBe(false);
    expect(second.error).toContain("circular dependency");
  });

  it("detects nested cycles in derived dependency graphs", () => {
    const definitions: Record<string, DerivedColumnDefinition> = {
      B: {
        kind: "formula",
        columnKey: "B",
        formula: "A + 1",
        dependencies: ["A"],
        order: 1,
      },
      C: {
        kind: "formula",
        columnKey: "C",
        formula: "B + 1",
        dependencies: ["B"],
        order: 2,
      },
    };

    expect(wouldIntroduceDerivedCycle(definitions, "A", ["C"])).toBe(true);
    expect(wouldIntroduceDerivedCycle(definitions, "D", ["C"])).toBe(false);
  });
});
