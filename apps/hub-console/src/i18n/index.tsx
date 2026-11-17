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
import type { VocabularyKey } from './translations';

export type { Lang, TranslationKey } from './translations';
export type { VocabularyKey } from './translations';

const STORAGE_KEY = 'teamhub.lang';
const DEFAULT_LANG: Lang = 'zh'; // 中文默认
let activeLang: Lang = readInitialLang();

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
  const [lang, setLangState] = useState<Lang>(() => {
    activeLang = readInitialLang();
    return activeLang;
  });

  useEffect(() => {
    activeLang = lang;
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

export function getActiveLang(): Lang {
  return activeLang;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within LanguageProvider');
  }
  return ctx;
}
