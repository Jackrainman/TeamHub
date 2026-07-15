import { sparklinePath } from './viz-math';
import type { VizTone } from './StatusDot';

/**
 * Sparkline – SVG 迷你趋势线（VISUAL-VITALITY V0）。只画真实序列：不足 2 个点
 * path 为空 → 返回 null 不渲染（§0「仪表用真数据」，调用方无须自行判空）。
 * 入场走线用 pathLength=1 + vv-draw（dashoffset 1→0），reduced-motion 全局冻结。
 */
export function Sparkline({
  points,
  tone = 'blue',
  width = 72,
  height = 24,
  label,
}: {
  points: number[];
  tone?: VizTone;
  width?: number;
  height?: number;
  /** 无障碍名（如「近 14 天事件量」）。 */
  label: string;
}) {
  const d = sparklinePath(points, width, height);
  if (!d) return null;
  return (
    <svg
      className={`viz-spark viz-spark--${tone}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      <path d={d} pathLength={1} />
    </svg>
  );
}
