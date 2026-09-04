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

// key 放宽为 VocabularyKey（TranslationKey | 任意新字符串）：巨表外的新 key 走兜底——
// 有覆盖用覆盖，否则原样返回 key 本身（下方 `?? key`）。
export function translate(
  lang: Lang,
  key: VocabularyKey,
  params?: Record<string, string | number>,
): string {
  // 租户词汇覆盖层（HUB-MODULARIZATION 第6步 i18n 通道）优先于巨表——见 vocabulary-overrides.ts。
  // 覆盖表默认空，本行为与改动前逐字一致。
  const template =
    resolveVocabularyOverride(lang, key) ??
    translations[lang][key as TranslationKey] ??
    translations.zh[key as TranslationKey] ??
    key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
