import { useEffect, useState } from 'react';
import { currentShanghaiDate } from '../../../shared/lib/now';

export function useTodayKey(override?: string): string {
  const [key, setKey] = useState(() => override ?? currentShanghaiDate());
  useEffect(() => {
    if (override) { setKey(override); return; }
    setKey(currentShanghaiDate());
    const timer = window.setInterval(() => {
      const next = currentShanghaiDate();
      setKey(current => current === next ? current : next);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [override]);
  return key;
}
