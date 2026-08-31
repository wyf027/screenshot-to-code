import { APP_ERROR_WEB_SOCKET_CODE } from "./constants";
import { generateCode } from "./generateCode";
import { FullGenerationSettings } from "./types";

jest.mock("./config", () => ({
  WS_BACKEND_URL: "wss://example.test/backend",
}));

jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));


test("preserves the server error message when the app closes the socket", () => {
  const listeners = new Map<string, (event: Event) => void>();
  const socket = {
    addEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject
    ) => {
      const callback =
        typeof listener === "function"
          ? listener
          : listener.handleEvent.bind(listener);
      listeners.set(type, callback);
    },
    send: jest.fn(),
  } as unknown as WebSocket;
  const originalWebSocket = globalThis.WebSocket;
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    value: jest.fn(() => socket),
  });

  const callbacks = {
    onChange: jest.fn(),
    onSetCode: jest.fn(),
    onStatusUpdate: jest.fn(),
    onVariantComplete: jest.fn(),
    onVariantError: jest.fn(),
    onVariantCount: jest.fn(),
    onVariantModels: jest.fn(),
    onThinking: jest.fn(),
    onAssistant: jest.fn(),
    onToolStart: jest.fn(),
    onToolResult: jest.fn(),
    onCancel: jest.fn(),
    onComplete: jest.fn(),
  };

  try {
    generateCode(
      { current: null },
      {} as FullGenerationSettings,
      callbacks
    );
    const serverMessage =
      "No OpenAI, Anthropic, or Gemini API key found. Add one in Settings.";
    listeners.get("message")?.({
      data: JSON.stringify({
        type: "error",
        value: serverMessage,
        variantIndex: 0,
      }),
    } as MessageEvent);
    listeners.get("close")?.({
      code: APP_ERROR_WEB_SOCKET_CODE,
      reason: "",
    } as CloseEvent);

    expect(callbacks.onCancel).toHaveBeenCalledWith(
      "request_failed",
      serverMessage
    );
  } finally {
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: originalWebSocket,
    });
  }
});
