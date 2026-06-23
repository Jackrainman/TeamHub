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
// 设置页 .seg 选择器。第二套 token 挂在 :root[data-theme='warm']，全站组件已消费 var(--*)，故零组件改动。
export type Theme = 'classic' | 'warm' | 'dark';

const STORAGE_KEY = 'teamhub.theme';
const DEFAULT_THEME: Theme = 'classic'; // 默认现行绿，暖纸 opt-in（不惊扰现有用户）

/**
 * 把任意存储值收敛成合法 Theme（未知/缺失 → 默认）。纯函数，供单测——
 * 避免测 DOM/RTL，符合本仓「测逻辑不测 DOM」风格。
 */
export function normalizeTheme(value: string | null): Theme {
  return value === 'warm' || value === 'classic' || value === 'dark'
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
