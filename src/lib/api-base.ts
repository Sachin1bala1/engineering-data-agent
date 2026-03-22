const DEFAULT_WORKSPACE_API_ORIGIN = "http://127.0.0.1:5100";
const DEFAULT_ENGINEERING_API_ORIGIN = "http://127.0.0.1:8000";
const DEV_PROXY_PORTS = new Set(["3000", "5173", "8080"]);

function normalizeOrigin(candidate: string): string {
  return candidate.replace(/\/+$/, "");
}

function isDevProxyPort(port: string): boolean {
  return DEV_PROXY_PORTS.has(port);
}

export function getWorkspaceApiBase(): string {
  const configured = String(import.meta.env.VITE_WORKSPACE_API_BASE || import.meta.env.VITE_API_BASE || "").trim();
  if (configured) {
    return normalizeOrigin(configured);
  }

  if (typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    if (isDevProxyPort(port)) {
      return "";
    }
    if (protocol === "http:" || protocol === "https:") {
      return normalizeOrigin(`${protocol}//${hostname}:5100`);
    }
  }

  return DEFAULT_WORKSPACE_API_ORIGIN;
}

export function getEngineeringApiBase(): string {
  const configured = String(import.meta.env.VITE_ENGINEERING_API_BASE || "").trim();
  if (configured) {
    return normalizeOrigin(configured);
  }

  if (typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    if (isDevProxyPort(port)) {
      return "/engineering";
    }
    if (protocol === "http:" || protocol === "https:") {
      return normalizeOrigin(`${protocol}//${hostname}:8000`);
    }
  }

  return DEFAULT_ENGINEERING_API_ORIGIN;
}

function buildApiUrl(base: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function workspaceApiUrl(path: string): string {
  return buildApiUrl(getWorkspaceApiBase(), path);
}

export function engineeringApiUrl(path: string): string {
  return buildApiUrl(getEngineeringApiBase(), path);
}

// Backward-compatible aliases for the local workspace/session API.
export function getApiBase(): string {
  return getWorkspaceApiBase();
}

export function apiUrl(path: string): string {
  return workspaceApiUrl(path);
}
