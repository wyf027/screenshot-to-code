import {
  buildBackendUrls,
  normalizeBackendPathPrefix,
} from "./backend-urls";

describe("backend URL construction", () => {
  test.each([
    [undefined, ""],
    ["", ""],
    ["/", ""],
    ["backend", "/backend"],
    ["/backend/", "/backend"],
  ])("normalizes %p to %p", (raw, expected) => {
    expect(normalizeBackendPathPrefix(raw)).toBe(expected);
  });

  test("keeps current same-origin behavior with no prefix", () => {
    expect(buildBackendUrls("https://example.vercel.app")).toEqual({
      http: "https://example.vercel.app",
      ws: "wss://example.vercel.app",
    });
  });

  test("adds the production prefix to HTTP and WebSocket origins", () => {
    expect(buildBackendUrls("https://example.vercel.app", "/backend")).toEqual({
      http: "https://example.vercel.app/backend",
      ws: "wss://example.vercel.app/backend",
    });
  });
});
