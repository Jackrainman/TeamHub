import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import { translate, type Lang } from './translations';
import type { VocabularyKey } from './vocabulary-overrides';

export type { Lang, TranslationKey } from './translations';
// 租户词汇覆盖层（HUB-MODULARIZATION 第6步）：装配层/垂直包据此在不改巨表的前提下覆盖个别文案。
// AUDIT-DEBT-2026-07 §9-④ 审计债⑥：VocabularyKey 一并导出——垂直包新增巨表没有的 key 时，
// 覆盖表与下面 `t()` 的 key 参数用同一个开放类型，两处不漂移。
export {
  setVocabularyOverrides,
  resetVocabularyOverrides,
  type VocabularyOverrides,
  type VocabularyOverrideEntry,
  type VocabularyKey,
} from './vocabulary-overrides';

const STORAGE_KEY = 'teamhub.lang';
const DEFAULT_LANG: Lang = 'zh'; // 中文默认

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  // 放宽为 VocabularyKey（TranslationKey | 任意新字符串）：已知 key 调用点行为不变，
  // 垂直包新增的巨表外 key 现在也能合法传给 t()（见 vocabulary-overrides.ts 头部注释）。
  t: (key: VocabularyKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readInitialLang(): Lang {
  if (typeof window === 'undefined') return DEFAULT_LANG;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'en' || stored === 'zh' ? stored : DEFAULT_LANG;
}

export function LanguageProvider({ children }: PropsWithChildren) {
  const [lang, setLangState] = useState<Lang>(readInitialLang);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const setLang = useCallback((next: Lang) => setLangState(next), []);
  const toggleLang = useCallback(
    () => setLangState((prev) => (prev === 'zh' ? 'en' : 'zh')),
    [],
  );
  const t = useCallback(
    (key: VocabularyKey, params?: Record<string, string | number>) =>
      translate(lang, key, params),
    [lang],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ lang, setLang, toggleLang, t }),
    [lang, setLang, toggleLang, t],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within LanguageProvider');
  }
  return ctx;
}
