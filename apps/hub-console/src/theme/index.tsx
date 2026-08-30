import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';

// 外观主题：纯 CSS-variable 换肤，不引 Tailwind/Radix（D-060 Phase 0 的「可切换」版）。
// 架构逐行镜像 i18n/index.tsx 的 LanguageProvider——localStorage 持久 + documentElement 属性 +
// 设置页 .seg 选择器。每套 token 挂在 :root[data-theme='<id>']，全站组件已消费 var(--*)，故零组件改动。
// 第 4 套 tech（遥测台，D1）为旗舰默认；warm/dark 仍 opt-in。
export type Theme = 'classic' | 'warm' | 'dark' | 'tech' | 'notion';

const STORAGE_KEY = 'teamhub.theme';
// Notion 风为 IA-RESTRUCTURE demo 默认；已存偏好的用户不被覆盖（readInitialTheme 读 localStorage 原样返回）。
const DEFAULT_THEME: Theme = 'notion';

/**
 * 把任意存储值收敛成合法 Theme（未知/缺失 → 默认）。纯函数，供单测——
 * 避免测 DOM/RTL，符合本仓「测逻辑不测 DOM」风格。
 */
export function normalizeTheme(value: string | null): Theme {
  return value === 'warm' ||
    value === 'classic' ||
    value === 'dark' ||
    value === 'tech' ||
    value === 'notion'
    ? value
    : DEFAULT_THEME;
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  return normalizeTheme(window.localStorage.getItem(STORAGE_KEY));
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === 'classic' ? 'warm' : 'classic')),
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
