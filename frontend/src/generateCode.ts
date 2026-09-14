import toast from "react-hot-toast";
import { WS_BACKEND_URL } from "./config";
import {
  APP_ERROR_WEB_SOCKET_CODE,
  USER_CLOSE_WEB_SOCKET_CODE,
} from "./constants";
import { FullGenerationSettings } from "./types";

const ERROR_MESSAGE = "生成失败，请稍后重试。";
const CANCEL_MESSAGE = "已取消生成";

function toUserError(message = "") {
  const normalized = message.toLowerCase();
  if (normalized.includes("no openai") || normalized.includes("no api key")) {
    return "请先在设置中填写 OpenAI、Gemini 或 Anthropic Key。";
  }
  if (normalized.includes("401") || normalized.includes("authentication")) {
    return "模型 Key 无效，请检查后重试。";
  }
  if (normalized.includes("quota") || normalized.includes("credit")) {
    return "模型额度不足，请检查服务商账户。";
  }
  if (normalized.includes("rate limit") || normalized.includes("429")) {
    return "模型请求过于频繁，请稍后重试。";
  }
  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return "生成请求超时，请缩小图片或稍后重试。";
  }
  return ERROR_MESSAGE;
}

type ToolEventData = {
  name?: string;
  input?: unknown;
  output?: unknown;
  ok?: boolean;
  models?: string[];
};

type WebSocketResponse = {
  type:
    | "chunk"
    | "status"
    | "setCode"
    | "error"
    | "variantComplete"
    | "variantError"
    | "variantCount"
    | "variantModels"
    | "thinking"
    | "assistant"
    | "toolStart"
    | "toolResult";
  value?: string;
  data?: ToolEventData;
  eventId?: string;
  variantIndex: number;
};

interface CodeGenerationCallbacks {
  onChange: (chunk: string, variantIndex: number) => void;
  onSetCode: (code: string, variantIndex: number) => void;
  onStatusUpdate: (status: string, variantIndex: number) => void;
  onVariantComplete: (variantIndex: number) => void;
  onVariantError: (variantIndex: number, error: string) => void;
  onVariantCount: (count: number) => void;
  onVariantModels: (models: string[]) => void;
  onThinking: (content: string, variantIndex: number, eventId?: string) => void;
  onAssistant: (content: string, variantIndex: number, eventId?: string) => void;
  onToolStart: (
    data: ToolEventData | undefined,
    variantIndex: number,
    eventId?: string
  ) => void;
  onToolResult: (
    data: ToolEventData | undefined,
    variantIndex: number,
    eventId?: string
  ) => void;
  onCancel: (
    reason: "user_cancelled" | "request_failed" | "connection_error",
    errorMessage?: string
  ) => void;
  onComplete: () => void;
}

export function generateCode(
  wsRef: React.MutableRefObject<WebSocket | null>,
  params: FullGenerationSettings,
  callbacks: CodeGenerationCallbacks
) {
  const wsUrl = `${WS_BACKEND_URL}/generate-code`;
  console.log("Connecting to backend @ ", wsUrl);

  const ws = new WebSocket(wsUrl);
  wsRef.current = ws;
  let serverErrorMessage: string | null = null;

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify(params));
  });

  ws.addEventListener("message", async (event: MessageEvent) => {
    const response = JSON.parse(event.data) as WebSocketResponse;
    if (response.type === "chunk") {
      callbacks.onChange(response.value || "", response.variantIndex);
    } else if (response.type === "status") {
      callbacks.onStatusUpdate(response.value || "", response.variantIndex);
    } else if (response.type === "setCode") {
      callbacks.onSetCode(response.value || "", response.variantIndex);
    } else if (response.type === "variantComplete") {
      callbacks.onVariantComplete(response.variantIndex);
    } else if (response.type === "variantError") {
      callbacks.onVariantError(
        response.variantIndex,
        toUserError(response.value)
      );
    } else if (response.type === "variantCount") {
      callbacks.onVariantCount(parseInt(response.value || "1"));
    } else if (response.type === "variantModels") {
      callbacks.onVariantModels(response.data?.models || []);
    } else if (response.type === "thinking") {
      callbacks.onThinking(response.value || "", response.variantIndex, response.eventId);
    } else if (response.type === "assistant") {
      callbacks.onAssistant(response.value || "", response.variantIndex, response.eventId);
    } else if (response.type === "toolStart") {
      callbacks.onToolStart(response.data, response.variantIndex, response.eventId);
    } else if (response.type === "toolResult") {
      callbacks.onToolResult(response.data, response.variantIndex, response.eventId);
    } else if (response.type === "error") {
      serverErrorMessage = toUserError(response.value);
      console.error("生成失败");
      toast.error(serverErrorMessage);
    }
  });

  ws.addEventListener("close", (event) => {
    console.log("Connection closed", event.code);
    if (event.code === USER_CLOSE_WEB_SOCKET_CODE) {
      toast.success(CANCEL_MESSAGE);
      callbacks.onCancel("user_cancelled");
    } else if (event.code === APP_ERROR_WEB_SOCKET_CODE) {
      console.error("Known server error", event.code);
      callbacks.onCancel(
        "request_failed",
        serverErrorMessage || toUserError(event.reason)
      );
    } else if (event.code !== 1000) {
      console.error("WebSocket connection failed", event.code);
      toast.error(ERROR_MESSAGE);
      callbacks.onCancel("connection_error", toUserError(event.reason));
    } else {
      callbacks.onComplete();
    }
  });

  ws.addEventListener("error", () => {
    console.error("WebSocket connection failed");
    toast.error(ERROR_MESSAGE);
  });
}
