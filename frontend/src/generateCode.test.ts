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

const SERVER_MESSAGE =
  "No OpenAI, Anthropic, or Gemini API key found. Add one in Settings.";

test.each([
  ["", SERVER_MESSAGE],
  ["Deployment timed out.", "Deployment timed out."],
])(
  "resolves an app close reason %p to %p",
  (closeReason, expectedMessage) => {
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
      listeners.get("message")?.({
        data: JSON.stringify({
          type: "error",
          value: SERVER_MESSAGE,
          variantIndex: 0,
        }),
      } as MessageEvent);
      listeners.get("close")?.({
        code: APP_ERROR_WEB_SOCKET_CODE,
        reason: closeReason,
      } as CloseEvent);

      expect(callbacks.onCancel).toHaveBeenCalledWith(
        "request_failed",
        expectedMessage
      );
    } finally {
      Object.defineProperty(globalThis, "WebSocket", {
        configurable: true,
        value: originalWebSocket,
      });
    }
  }
);
