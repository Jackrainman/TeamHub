import { zh, en } from './locales';

export type Lang = 'zh' | 'en';
export type TranslationKey = keyof typeof zh;
export type VocabularyKey = TranslationKey | (string & {});
export const translations: Record<Lang, Record<TranslationKey, string>> = { zh, en };
const DEV_BUILD = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV;
const warnedMissingKeys = new Set<string>();
function warnMissingKey(key: VocabularyKey): void {
  if (warnedMissingKeys.has(key)) return;
  warnedMissingKeys.add(key);
  console.warn(`[i18n] missing translation key "${key}"; falling back to the key itself`);
}
export function translate(lang: Lang, key: VocabularyKey, params?: Record<string, string | number>): string {
  const lookup: string | undefined = translations[lang][key as TranslationKey] ?? translations.zh[key as TranslationKey];
  if (lookup === undefined && DEV_BUILD) warnMissingKey(key);
  const template = lookup ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match);
}
