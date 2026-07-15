/**
 * viz 原语的纯位置/插值计算（VISUAL-VITALITY V0，visual-vitality.md §2.3）。
 * 不碰 DOM，照 overview-timeline.ts 先例可单测；组件文件只做「拿数 → 摆 SVG」。
 */

export interface RingArc {
  circumference: number;
  dashOffset: number;
  pct: number;
}

/** 进度环弧长：value/max 归一后夹到 0–1（max<=0 视为空环，不产出 NaN/Infinity）。 */
export function ringArc(value: number, max: number, radius: number): RingArc {
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return {
    circumference,
    dashOffset: circumference * (1 - ratio),
    pct: ratio * 100,
  };
}

/**
 * 折线 path（M/L 串）：points 均匀铺满宽度，y 轴翻转（SVG 向下为正）；全等值序列画水平中线。
 * 少于 2 个点无从连线 → 空串（调用方以此判「不渲染」）。
 */
export function sparklinePath(
  points: number[],
  width: number,
  height: number,
  pad = 2,
): string {
  if (points.length < 2) return '';
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const step = innerW / (points.length - 1);
  return points
    .map((p, i) => {
      const x = pad + step * i;
      const yRatio = span > 0 ? (p - min) / span : 0.5;
      const y = pad + innerH * (1 - yRatio);
      return `${i === 0 ? 'M' : 'L'}${round2(x)} ${round2(y)}`;
    })
    .join(' ');
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** 数字滚动插值：ease-out cubic，progress 夹 0–1，输出取整（消费方都是计数）。 */
export function countUpValue(target: number, progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  const eased = 1 - Math.pow(1 - t, 3);
  return Math.round(target * eased);
}
