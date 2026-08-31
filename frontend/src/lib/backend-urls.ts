export function normalizeBackendPathPrefix(value?: string): string {
  const cleaned = (value || "").trim();
  if (!cleaned || cleaned === "/") return "";
  return `/${cleaned.replace(/^\/+|\/+$/g, "")}`;
}

export function buildBackendUrls(origin: string, rawPrefix?: string) {
  const prefix = normalizeBackendPathPrefix(rawPrefix);
  const http = `${origin.replace(/\/$/, "")}${prefix}`;
  return { http, ws: http.replace(/^http/, "ws") };
}
