import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { createSidebarIdle } from './lib/sidebar-idle';

export type FontSize = 'normal' | 'large' | 'xlarge';
export function normalizeFontSize(value: string | null): FontSize {
  return value === 'large' || value === 'xlarge' ? value : 'normal';
}
function read(name: string) {
  try { return window.localStorage.getItem(name); } catch { return null; }
}
function save(name: string, value: string) {
  try { window.localStorage.setItem(name, value); } catch { /* 禁用存储时仍允许本次会话调整外观。 */ }
}
function usePreferencesState() {
  const [fontSize, setFontSize] = useState<FontSize>(() => normalizeFontSize(read('teamhub.fontSize')));
  const [autoCollapse, setAuto] = useState(() => read('teamhub.sidebarAutoCollapse') !== 'false');
  const [expanded, setExpanded] = useState(true);
  const [manual, setManual] = useState(false);
  const idle = useMemo(() => createSidebarIdle(() => setExpanded(false)), []);
  const automatic = autoCollapse && expanded && !manual;
  useEffect(() => {
    if (automatic) idle.arm(); else idle.cancel();
    return idle.cancel;
  }, [idle, automatic]);
  useEffect(() => {
    document.documentElement.style.setProperty('--fs-scale', String({ normal: 1, large: 1.12, xlarge: 1.24 }[fontSize]));
    document.documentElement.dataset.fontSize = fontSize;
    save('teamhub.fontSize', fontSize);
  }, [fontSize]);
  useEffect(() => save('teamhub.sidebarAutoCollapse', String(autoCollapse)), [autoCollapse]);
  return {
    fontSize, setFontSize, autoCollapse, expanded,
    setAutoCollapse(value: boolean) { setAuto(value); setManual(false); },
    toggleSidebar() { idle.cancel(); setManual(true); setExpanded(value => !value); },
    touchSidebar() { if (automatic) idle.arm(); },
  };
}
const Context = createContext<ReturnType<typeof usePreferencesState> | null>(null);
export function ConsolePreferencesProvider({ children }: PropsWithChildren) {
  return <Context.Provider value={usePreferencesState()}>{children}</Context.Provider>;
}
export function useConsolePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error('ConsolePreferencesProvider is required');
  return value;
}
