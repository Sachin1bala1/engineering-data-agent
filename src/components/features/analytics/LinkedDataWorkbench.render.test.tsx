// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-plotly.js", () => ({
  default: () => React.createElement("div", { "data-testid": "plotly-mock" }),
}));

vi.mock("ag-grid-community", () => ({
  AllCommunityModule: {},
  ModuleRegistry: { registerModules: vi.fn() },
}));

vi.mock("ag-grid-react", () => ({
  AgGridReact: (props: any) =>
    React.createElement("div", { "data-testid": "ag-grid-mock" }, props.rowData?.length ?? 0),
}));

import { LinkedDataWorkbench } from "./LinkedDataWorkbench";

describe("LinkedDataWorkbench render", () => {
  it("renders the data workspace shell without throwing", () => {
    const rows = [
      { __row_index__: 0, time: "2025-01-01", value: 10, status: "ok" },
      { __row_index__: 1, time: "2025-01-02", value: 12, status: "warn" },
      { __row_index__: 2, time: "2025-01-03", value: 15, status: "ok" },
    ];
    const columns = ["time", "value", "status"];

    expect(() => {
      render(<LinkedDataWorkbench rows={rows} columns={columns} height={640} />);
    }).not.toThrow();

    expect(screen.getByText(/Data 1 Data Workspace/i)).toBeTruthy();
    expect(screen.getByTestId("ag-grid-mock")).toBeTruthy();
  });
});
