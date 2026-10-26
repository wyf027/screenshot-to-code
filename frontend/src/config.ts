import { buildBackendUrls } from "./lib/backend-urls";

export const IS_RUNNING_ON_CLOUD = import.meta.env.PROD;

// When no explicit backend URLs are provided, default to the same origin the
// app is served from. Combined with the Vite dev-server proxy, this makes the
// app work behind tunnels/preview URLs where "localhost" would point at the
// viewer's machine instead of the sandbox.
const SAME_ORIGIN =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://127.0.0.1:5173";
const SAME_ORIGIN_BACKEND = buildBackendUrls(
  SAME_ORIGIN,
  import.meta.env.VITE_BACKEND_PATH_PREFIX
);

export const WS_BACKEND_URL =
  import.meta.env.VITE_WS_BACKEND_URL || SAME_ORIGIN_BACKEND.ws;

export const HTTP_BACKEND_URL =
  import.meta.env.VITE_HTTP_BACKEND_URL || SAME_ORIGIN_BACKEND.http;

// Public mode sends a constrained screenshot request to the user's private
// Codex worker through a queue gateway. An empty value preserves the normal
// BYOK WebSocket flow for local development and existing deployments.
export const CODEX_GATEWAY_URL = (import.meta.env.VITE_CODEX_GATEWAY_URL || "").replace(/\/$/, "");
export const IS_CODEX_GATEWAY_MODE = Boolean(CODEX_GATEWAY_URL);
