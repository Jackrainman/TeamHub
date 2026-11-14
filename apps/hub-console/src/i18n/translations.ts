// Team Hub Console 多语言文案。中文为默认，英文可切换。
// 只翻译「界面文案」（chrome）；任务名 / 负责人 / 资料标题等**用户数据**保持后端原样，不做机器翻译。
// 参数占位用 {name}，由 t(key, params) 插值。
//
// I18N-SPLIT：文案按域拆到 ./locales/<domain>.ts（base/settings/pm/schedule/inv/kb/
// overview/checklist/setup），本文件只做组合根 + translate()。新文案加到对应域文件。

// 租户词汇覆盖层（HUB-MODULARIZATION 第6步）：本文件与 vocabulary-overrides.ts 互相只做类型级
// 引用（该文件仅 import type 本文件的 Lang/TranslationKey），无运行期循环依赖。
import { resolveVocabularyOverride, type VocabularyKey } from './vocabulary-overrides';
import { zh, en } from './locales';

export type Lang = 'zh' | 'en';

export type TranslationKey = keyof typeof zh;

export const translations: Record<Lang, Record<TranslationKey, string>> = {
  zh,
  en,
};

// 开发期缺失 key 告警开关：只有控制台开发构建打开。生产构建里 Vite 把
// `import.meta.env.DEV` 常量折叠为 false，整段告警分支被 minifier DCE 掉——生产包不含
// 告警文案。`typeof import.meta` 只是防御式读取（先确认 import.meta 存在再取 env），
// 并不能让本文件在 CJS 里被解析。
const DEV_BUILD = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV;

// 同一 key 每个会话只警告一次：翻译缺失往往是同一 key 被反复渲染，刷屏没有额外信息。
const warnedMissingKeys = new Set<string>();

function warnMissingKey(lang: Lang, key: VocabularyKey): void {
  if (warnedMissingKeys.has(key)) return;
  warnedMissingKeys.add(key);
  console.warn(
    `[i18n] missing translation key "${key}" (lang: ${lang}); falling back to the key itself`,
  );
}

// key 放宽为 VocabularyKey（TranslationKey | 任意新字符串）：巨表外的新 key 走兜底——
// 有覆盖用覆盖，否则原样返回 key 本身（下方 `?? key`）。
export function translate(
  lang: Lang,
  key: VocabularyKey,
  params?: Record<string, string | number>,
): string {
  // 租户词汇覆盖层（HUB-MODULARIZATION 第6步 i18n 通道）优先于巨表——见 vocabulary-overrides.ts。
  // 覆盖表默认空，本行为与改动前逐字一致。
  const lookup: string | undefined =
    resolveVocabularyOverride(lang, key) ??
    translations[lang][key as TranslationKey] ??
    translations.zh[key as TranslationKey];
  // 只有最终落到 `?? key` 兜底才算缺失：覆盖命中或中文回退命中都不告警。
  if (lookup === undefined && DEV_BUILD) warnMissingKey(lang, key);
  const template = lookup ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
