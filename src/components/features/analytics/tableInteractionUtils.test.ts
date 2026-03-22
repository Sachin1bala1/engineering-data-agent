import { describe, expect, it } from "vitest";

import type { ColumnMetadata, WorkbenchRow } from "@/stores/dataWorkbenchStore";
import { buildFillPreviewPlan, resolvePastePlan } from "./tableInteractionUtils";

const makeRows = (values: Array<Record<string, unknown>>): WorkbenchRow[] =>
  values.map((row, index) => ({ __row_index__: index, ...row })) as WorkbenchRow[];

const metadata: Record<string, ColumnMetadata> = {
  id: { key: "id", name: "id", displayName: "ID", modelingType: "continuous" },
  value: { key: "value", name: "value", displayName: "Value", modelingType: "continuous" },
  date: { key: "date", name: "date", displayName: "Event Date", modelingType: "datetime" },
  material: { key: "material", name: "material", displayName: "Material", modelingType: "nominal" },
};

describe("buildFillPreviewPlan", () => {
  it("extrapolates numeric sequences", () => {
    const plan = buildFillPreviewPlan({
      rows: makeRows([{ value: 1 }, { value: 2 }, { value: null }, { value: null }]),
      columnKey: "value",
      startRowId: 1,
      endRowId: 3,
      seedRowIds: [0, 1],
    });
    expect(plan.values[2]).toBe(3);
    expect(plan.values[3]).toBe(4);
  });

  it("increments dates", () => {
    const plan = buildFillPreviewPlan({
      rows: makeRows([{ date: "2025-01-01" }, { date: "2025-01-02" }, { date: null }]),
      columnKey: "date",
      startRowId: 1,
      endRowId: 2,
      seedRowIds: [0, 1],
    });
    expect(String(plan.values[2])).toContain("2025-01-03");
  });

  it("repeats categorical patterns", () => {
    const plan = buildFillPreviewPlan({
      rows: makeRows([{ material: "Steel" }, { material: "Plastic" }, { material: null }, { material: null }]),
      columnKey: "material",
      startRowId: 1,
      endRowId: 3,
      seedRowIds: [0, 1],
    });
    expect(plan.values[2]).toBe("Steel");
    expect(plan.values[3]).toBe("Plastic");
  });
});

describe("resolvePastePlan", () => {
  it("uses positional alignment when pasted data has no header row", () => {
    const plan = resolvePastePlan(
      [["1", "2"]],
      ["id", "value", "date"],
      metadata,
      "value"
    );
    expect(plan.mode).toBe("position");
    expect(plan.columnOrder).toEqual(["value", "date"]);
  });

  it("uses header matching when first pasted row matches column names", () => {
    const plan = resolvePastePlan(
      [
        ["ID", "Value"],
        ["1", "10"],
      ],
      ["id", "value", "date"],
      metadata,
      "date"
    );
    expect(plan.mode).toBe("header-match");
    expect(plan.rowOffset).toBe(1);
    expect(plan.columnOrder.slice(0, 2)).toEqual(["id", "value"]);
  });
});
