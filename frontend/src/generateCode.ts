import toast from "react-hot-toast";
import { CODEX_GATEWAY_URL, WS_BACKEND_URL } from "./config";
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
  if (normalized.includes("daily_limit") || normalized.includes("quota")) {
    return "今日公开额度已用完，请明天再试。";
  }
  if (normalized.includes("worker_offline")) {
    return "生成服务暂时离线，请稍后重试。";
  }
  if (normalized.includes("queue_full") || normalized.includes("already_running")) {
    return "当前排队较满，请稍后再试。";
  }
  if (normalized.includes("usage_unknown")) {
    return "上一次生成的用量正在核对，暂时停止新请求。";
  }
  if (normalized.includes("video_unsupported")) {
    return "公开模式暂不支持视频生成，请使用截图。";
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
  onQuotaUpdate?: (quota: unknown) => void;
}

export type GenerationCancelHandle = { close: (code?: number) => void };
type GenerationRef = React.MutableRefObject<GenerationCancelHandle | null>;

async function gatewayRequest(path: string, init: RequestInit = {}) {
  const sessionKey = "wyf-codex-gateway-session";
  let token = sessionStorage.getItem(sessionKey);
  if (!token) {
    const response = await fetch(`${CODEX_GATEWAY_URL}/api/session`, { method: "POST" });
    if (!response.ok) throw new Error("session_invalid");
    token = (await response.json()).token;
    if (!token) throw new Error("session_invalid");
    sessionStorage.setItem(sessionKey, token);
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let response = await fetch(`${CODEX_GATEWAY_URL}/api/${path}`, { ...init, headers });
  if (response.status === 401) {
    sessionStorage.removeItem(sessionKey);
    const session = await fetch(`${CODEX_GATEWAY_URL}/api/session`, { method: "POST" });
    if (!session.ok) throw new Error("session_invalid");
    token = (await session.json()).token;
    if (!token) throw new Error("session_invalid");
    sessionStorage.setItem(sessionKey, token);
    headers.set("Authorization", `Bearer ${token}`);
    response = await fetch(`${CODEX_GATEWAY_URL}/api/${path}`, { ...init, headers });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "gateway_unavailable");
  return data;
}

function generateCodeViaGateway(
  cancelRef: GenerationRef,
  params: FullGenerationSettings,
  callbacks: CodeGenerationCallbacks
) {
  let cancelled = false;
  let jobId: string | null = null;
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    if (jobId) void gatewayRequest(`jobs/${jobId}`, { method: "DELETE" }).catch(() => undefined);
    toast.success(CANCEL_MESSAGE);
    callbacks.onCancel("user_cancelled");
  };
  cancelRef.current = { close: cancel };
  void (async () => {
    try {
      const payload = {
        generatedCodeConfig: params.generatedCodeConfig,
        inputMode: params.inputMode,
        prompt: {
          text: params.prompt.text,
          fullText: params.prompt.fullText,
          images: params.prompt.images?.slice(0, 2) || [],
        },
        fileState: params.fileState ? { path: "App.jsx", content: params.fileState.content } : undefined,
      };
      const created = await gatewayRequest("jobs", { method: "POST", body: JSON.stringify(payload) });
      jobId = created.job?.id;
      if (!jobId) throw new Error("gateway_unavailable");
      callbacks.onVariantCount(1);
      callbacks.onVariantModels([params.codeGenerationModel]);
      callbacks.onStatusUpdate("已进入公开队列", 0);
      while (!cancelled) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        if (cancelled) return;
        const current = await gatewayRequest(`jobs/${jobId}`);
        if (current.quota) callbacks.onQuotaUpdate?.(current.quota);
        if (current.job?.status === "queued") {
          callbacks.onStatusUpdate("等待 20 服务器处理", 0);
          continue;
        }
        if (current.job?.status === "running") {
          callbacks.onStatusUpdate("Codex 正在生成", 0);
          continue;
        }
        if (current.job?.status !== "completed") throw new Error(current.job?.error || "model_failed");
        if (typeof current.code !== "string" || !current.code.trim()) throw new Error("invalid_output");
        callbacks.onSetCode(current.code, 0);
        callbacks.onVariantComplete(0);
        callbacks.onComplete();
        cancelRef.current = null;
        return;
      }
    } catch (error) {
      if (cancelled) return;
      const message = toUserError(String(error));
      toast.error(message);
      callbacks.onCancel("request_failed", message);
      cancelRef.current = null;
    }
  })();
}

export function generateCode(
  wsRef: GenerationRef,
  params: FullGenerationSettings,
  callbacks: CodeGenerationCallbacks
) {
  if (CODEX_GATEWAY_URL) {
    generateCodeViaGateway(wsRef, params, callbacks);
    return;
  }
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
