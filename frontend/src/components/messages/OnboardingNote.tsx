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
