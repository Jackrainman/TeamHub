import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';

// 主题只改变语义 token；已有用户偏好保持不变。
export type Theme = 'classic' | 'warm' | 'dark' | 'tech' | 'notion' | 'notion-dark' | 'linear';

const STORAGE_KEY = 'teamhub.theme';
// E 预期版作为首次使用的默认外观。
const DEFAULT_THEME: Theme = 'dark';

/**
 * 把任意存储值收敛成合法 Theme（未知/缺失 → 默认）。纯函数，供单测——
 * 避免测 DOM/RTL，符合本仓「测逻辑不测 DOM」风格。
 */
export function normalizeTheme(value: string | null): Theme {
  return value === 'warm' ||
    value === 'classic' ||
    value === 'dark' ||
    value === 'tech' ||
    value === 'notion' ||
    value === 'notion-dark' ||
    value === 'linear'
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
  try { return normalizeTheme(window.localStorage.getItem(STORAGE_KEY)); } catch { return DEFAULT_THEME; }
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem(STORAGE_KEY, theme); } catch { /* 本次会话仍可换肤。 */ }
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
