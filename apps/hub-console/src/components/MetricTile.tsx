import type { ReactNode } from 'react';

/**
 * MetricTile – shared label + value metric display used across OverviewPage,
 * PmBoardPage, and DepGraphPage. The optional `accent` prop is forwarded as a
 * CSS modifier class (`metric-tile--<accent>`), restricted to the values
 * already defined in styles.css. Add a literal here (and the matching CSS rule)
 * before using a new accent.
 *
 * VISUAL-VITALITY V1（visual-vitality.md §3.3）：accent 除染数字外新增顶部 2px tone 条
 * （blue/neutral 只染条不染数字——计数非警示）；`viz` 槽挂微仪表（ProgressRing/StatusDot），
 * `value` 放宽 ReactNode 以承载 CountUpNumber 数字滚动。
 */
type MetricAccent = 'red' | 'green' | 'amber' | 'blue' | 'neutral';

export function MetricTile({
  label,
  value,
  accent,
  viz,
}: {
  label: string;
  value: ReactNode;
  accent?: MetricAccent;
  viz?: ReactNode;
}) {
  return (
    <div className={`metric-tile${accent ? ` metric-tile--${accent}` : ''}`}>
      <span>{label}</span>
      <div className="metric-tile__row">
        <strong>{value}</strong>
        {viz ?? null}
      </div>
    </div>
  );
}
