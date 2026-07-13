import { useEffect, useState } from 'react';
import { countUpValue } from './viz-math';

const DURATION_MS = 720; // visual-vitality.md §2.2 数字滚动时长

/**
 * useCountUp – 数字滚动进场（VISUAL-VITALITY V0，动效三件套之「数字滚动」）。
 * target 变化时从 0 rAF 滚到位（ease-out cubic，取整）；prefers-reduced-motion /
 * 非有限值直接返回目标值（CSS 全局冻结管不到 JS 动画，故此处自查）。
 */
export function useCountUp(target: number): number {
  const [display, setDisplay] = useState(() => (reducedMotion() ? target : 0));

  useEffect(() => {
    if (!Number.isFinite(target) || reducedMotion()) {
      setDisplay(target);
      return;
    }
    let raf = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = (now - startedAt) / DURATION_MS;
      setDisplay(countUpValue(target, progress));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return display;
}

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
