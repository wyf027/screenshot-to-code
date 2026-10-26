export function OnboardingNote() {
  return (
    <div className="flex flex-col space-y-2 rounded bg-violet-700 p-3 text-sm text-white">
      <strong>开始前请先配置模型 Key</strong>
      <span>
        点击上方设置按钮，填写 OpenAI、Gemini 或 Anthropic Key。Key
        只在当前页面中使用，刷新或关闭页面后即清除。
      </span>
    </div>
  );
}

type PublicQuota = {
  used?: number;
  remaining?: number;
  online?: boolean;
};

export function PublicQuotaNote({ quota }: { quota: PublicQuota | null }) {
  const used = Math.max(0, Math.round(quota?.used ?? 0));
  const remaining = Math.max(0, Math.round(quota?.remaining ?? 20000));
  const online = quota?.online !== false;

  return (
    <div className="flex flex-col space-y-1 rounded border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-950 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-100">
      <strong>公开试用 · 每位访客每日 20,000 token</strong>
      <span>
        今日已用 {used.toLocaleString()}，剩余 {remaining.toLocaleString()}；全站每日上限 200,000 token。
      </span>
      {!online && <span className="text-amber-700 dark:text-amber-300">生成服务暂时离线，请稍后再试。</span>}
    </div>
  );
}
