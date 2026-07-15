import type { CSSProperties } from 'react';
import { ringArc } from './viz-math';
import type { VizTone } from './StatusDot';

/**
 * ProgressRing – SVG 进度环（VISUAL-VITALITY V0）。只画真实比值（value/max），
 * 颜色走语义 var 四主题自动适配；入场走线动画由 CSS `vv-ring-in` 承担
 * （from = 满偏移变量，to = 内联最终偏移），reduced-motion 由全局规则冻结。
 */
export function ProgressRing({
  value,
  max,
  tone = 'blue',
  size = 44,
  strokeWidth = 4,
  label,
}: {
  value: number;
  max: number;
  tone?: VizTone;
  size?: number;
  strokeWidth?: number;
  /** 无障碍名（如「Agent 后端 0/3」）；环本身是图形，文字由调用方另行展示。 */
  label: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const arc = ringArc(value, max, radius);
  const center = size / 2;
  return (
    <svg
      className={`viz-ring viz-ring--${tone}`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
    >
      <circle
        className="viz-ring__track"
        cx={center}
        cy={center}
        r={radius}
        strokeWidth={strokeWidth}
      />
      <circle
        className="viz-ring__arc"
        cx={center}
        cy={center}
        r={radius}
        strokeWidth={strokeWidth}
        strokeDasharray={arc.circumference}
        strokeDashoffset={arc.dashOffset}
        style={{ '--vv-ring-c': arc.circumference } as CSSProperties}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </svg>
  );
}
