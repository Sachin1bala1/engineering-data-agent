// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

function setLocation(url: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(url),
  });
}

describe("api-base", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    setLocation("http://localhost:3000/");
  });

  it("uses configured VITE_API_BASE when provided", async () => {
    vi.stubEnv("VITE_WORKSPACE_API_BASE", "");
    vi.stubEnv("VITE_ENGINEERING_API_BASE", "");
    vi.stubEnv("VITE_API_BASE", "http://localhost:5100/");
    const mod = await import("./api-base");
    expect(mod.getWorkspaceApiBase()).toBe("http://localhost:5100");
    expect(mod.getApiBase()).toBe("http://localhost:5100");
    expect(mod.workspaceApiUrl("/api/upload")).toBe("http://localhost:5100/api/upload");
    expect(mod.apiUrl("/api/upload")).toBe("http://localhost:5100/api/upload");
  });

  it("uses relative API paths on known dev-server ports", async () => {
    vi.stubEnv("VITE_WORKSPACE_API_BASE", "");
    vi.stubEnv("VITE_ENGINEERING_API_BASE", "");
    vi.stubEnv("VITE_API_BASE", "");
    setLocation("http://localhost:8080/upload");
    const mod = await import("./api-base");
    expect(mod.getWorkspaceApiBase()).toBe("");
    expect(mod.workspaceApiUrl("/api/upload")).toBe("/api/upload");
    expect(mod.getEngineeringApiBase()).toBe("/engineering");
    expect(mod.engineeringApiUrl("/analysis/plan")).toBe("/engineering/analysis/plan");
  });

  it("falls back to matching host on port 5100 outside dev-server ports", async () => {
    vi.stubEnv("VITE_WORKSPACE_API_BASE", "");
    vi.stubEnv("VITE_ENGINEERING_API_BASE", "");
    vi.stubEnv("VITE_API_BASE", "");
    setLocation("http://demo-host:9000/analytics");
    const mod = await import("./api-base");
    expect(mod.getWorkspaceApiBase()).toBe("http://demo-host:5100");
    expect(mod.workspaceApiUrl("/api/exec-python")).toBe("http://demo-host:5100/api/exec-python");
    expect(mod.getEngineeringApiBase()).toBe("http://demo-host:8000");
    expect(mod.engineeringApiUrl("/knowledge/query")).toBe("http://demo-host:8000/knowledge/query");
  });

  it("uses explicit engineering backend origin when provided", async () => {
    vi.stubEnv("VITE_WORKSPACE_API_BASE", "");
    vi.stubEnv("VITE_API_BASE", "");
    vi.stubEnv("VITE_ENGINEERING_API_BASE", "http://localhost:8000/");
    const mod = await import("./api-base");
    expect(mod.getEngineeringApiBase()).toBe("http://localhost:8000");
    expect(mod.engineeringApiUrl("/compare/report/test")).toBe("http://localhost:8000/compare/report/test");
  });
});
