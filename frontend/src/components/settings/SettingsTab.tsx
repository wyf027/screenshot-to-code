import React, { useEffect, useState } from "react";
import { BsCheckCircleFill, BsExclamationTriangleFill } from "react-icons/bs";
import { AppTheme, EditorTheme, Settings } from "../../types";
import { capitalize } from "../../lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../ui/select";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { HTTP_BACKEND_URL, IS_RUNNING_ON_CLOUD } from "../../config";

interface Props {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  appTheme: AppTheme;
  setAppTheme: React.Dispatch<React.SetStateAction<AppTheme>>;
}

const APP_THEME_LABELS: Record<AppTheme, string> = {
  [AppTheme.SYSTEM]: "跟随系统",
  [AppTheme.LIGHT]: "浅色",
  [AppTheme.DARK]: "深色",
};

function SettingsTab({ settings, setSettings, appTheme, setAppTheme }: Props) {
  // null = not yet known (loading / unreachable); otherwise the backend's answer.
  const [screenshotPreviewAvailable, setScreenshotPreviewAvailable] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${HTTP_BACKEND_URL}/api/capabilities`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.screenshot_preview === "boolean") {
          setScreenshotPreviewAvailable(data.screenshot_preview);
        }
      })
      .catch(() => {
        /* leave as null — don't show a false alarm if the backend is unreachable */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleThemeChange = (theme: EditorTheme) => {
    setSettings((s) => ({
      ...s,
      editorTheme: theme,
    }));
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 py-4 lg:px-6 lg:py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            设置
          </h1>
        </div>

        <div className="mx-auto max-w-lg space-y-6">
          {/* Theme */}
          <div className="rounded-lg border border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/60">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-zinc-700">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">
                主题
              </h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-zinc-700">
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="text-sm text-gray-700 dark:text-zinc-300">
                    应用主题
                  </span>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">
                    默认跟随系统，也可手动选择浅色或深色
                  </p>
                </div>
                <Select
                  name="app-theme"
                  value={appTheme}
                  onValueChange={(value) => setAppTheme(value as AppTheme)}
                >
                  <SelectTrigger className="w-[140px]">
                    {APP_THEME_LABELS[appTheme]}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AppTheme.SYSTEM}>跟随系统</SelectItem>
                    <SelectItem value={AppTheme.LIGHT}>浅色</SelectItem>
                    <SelectItem value={AppTheme.DARK}>深色</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="text-sm text-gray-700 dark:text-zinc-300">
                    代码编辑器主题
                  </span>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">
                    刷新页面后生效
                  </p>
                </div>
                <Select
                  name="editor-theme"
                  value={settings.editorTheme}
                  onValueChange={(value) =>
                    handleThemeChange(value as EditorTheme)
                  }
                >
                  <SelectTrigger className="w-[140px]">
                    <span className="notranslate" translate="no">
                      {capitalize(settings.editorTheme)}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cobalt">
                      <span className="notranslate" translate="no">Cobalt</span>
                    </SelectItem>
                    <SelectItem value="espresso">
                      <span className="notranslate" translate="no">Espresso</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* API Keys */}
          <div className="rounded-lg border border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/60">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-zinc-700">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">
                模型 Key
              </h2>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                  OpenAI API Key
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  只在当前页面中使用，不会保存到浏览器或服务器；刷新页面后需要重新填写。
                </p>
                <Input
                  id="openai-api-key"
                  className="mt-2"
                  placeholder="OpenAI API key"
                  value={settings.openAiApiKey || ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      openAiApiKey: e.target.value,
                    }))
                  }
                />
              </div>

              {!IS_RUNNING_ON_CLOUD && (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                    OpenAI Base URL（可选）
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                    本地运行时可指定兼容 OpenAI 的服务地址。
                  </p>
                  <Input
                    id="openai-base-url"
                    className="mt-2"
                    placeholder="OpenAI Base URL"
                    value={settings.openAiBaseURL || ""}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        openAiBaseURL: e.target.value,
                      }))
                    }
                  />
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Anthropic API Key
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  只在当前页面中使用，不会保存到浏览器或服务器；刷新页面后需要重新填写。
                </p>
                <Input
                  id="anthropic-api-key"
                  className="mt-2"
                  placeholder="Anthropic API key"
                  value={settings.anthropicApiKey || ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      anthropicApiKey: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Gemini API Key
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  只在当前页面中使用，不会保存到浏览器或服务器；刷新页面后需要重新填写。
                </p>
                <Input
                  id="gemini-api-key"
                  className="mt-2"
                  placeholder="Gemini API key"
                  value={settings.geminiApiKey || ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      geminiApiKey: e.target.value,
                    }))
                  }
                />
              </div>

              {!IS_RUNNING_ON_CLOUD && (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                    Replicate API Key
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                    只在当前页面中使用，不会保存到浏览器或服务器。
                  </p>
                  <Input
                    id="replicate-api-key"
                    className="mt-2"
                    placeholder="Replicate API key"
                    value={settings.replicateApiKey || ""}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        replicateApiKey: e.target.value,
                      }))
                    }
                  />
                </div>
              )}
            </div>
          </div>

          {/* Image Generation */}
          <div className="rounded-lg border border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/60">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-zinc-700">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">
                占位图生成
              </h2>
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-700 dark:text-zinc-300">
                    生成占位图片
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                    关闭后可减少模型调用费用。
                  </p>
                </div>
                <Switch
                  id="image-generation"
                  checked={settings.isImageGenerationEnabled}
                  onCheckedChange={(checked) =>
                    setSettings((s) => ({
                      ...s,
                      isImageGenerationEnabled: checked,
                    }))
                  }
                />
              </div>
            </div>
          </div>

          {/* Screenshot Preview (agent self-verification) */}
          <div className="rounded-lg border border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/60">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-zinc-700">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">
                自动预览验证
              </h2>
            </div>
            <div className="p-4">
              {screenshotPreviewAvailable === false ? (
                <div className="flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/60 dark:bg-amber-900/20">
                  <BsExclamationTriangleFill className="mt-0.5 shrink-0 text-amber-500" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      当前无法自动预览
                    </p>
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                      后端未安装 Chromium，因此无法自动渲染并检查生成结果。可运行{" "}
                      <code className="rounded bg-amber-100 px-1 py-0.5 font-mono dark:bg-amber-900/40">
                        playwright install chromium
                      </code>{" "}
                      后重启后端。
                    </p>
                  </div>
                </div>
              ) : screenshotPreviewAvailable === true ? (
                <div className="flex items-start gap-2.5">
                  <BsCheckCircleFill className="mt-0.5 shrink-0 text-emerald-500" />
                  <div>
                    <p className="text-sm text-gray-700 dark:text-zinc-300">
                      可用
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                      系统会自动渲染生成页面并检查布局。
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  正在检查后端能力…
                </p>
              )}
            </div>
          </div>

          {/* Screenshot by URL */}
          <div className="rounded-lg border border-gray-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/60">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-zinc-700">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">
                网页截图
              </h2>
            </div>
            <div className="p-4">
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                如需直接输入网址，请填写 ScreenshotOne API Key。该 Key
                同样只在当前页面中使用。{" "}
                <a
                  href="https://screenshotone.com/"
                  className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
                  target="_blank"
                >
                  打开 ScreenshotOne
                </a>
              </p>
              <Input
                id="screenshot-one-api-key"
                className="mt-3"
                placeholder="ScreenshotOne API key"
                value={settings.screenshotOneApiKey || ""}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    screenshotOneApiKey: e.target.value,
                  }))
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsTab;
