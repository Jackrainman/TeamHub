/**
 * MetricTile – shared label + value metric display used across OverviewPage,
 * PmBoardPage, and DepGraphPage. The optional `accent` prop is forwarded as a
 * CSS modifier class (`metric-tile--<accent>`), restricted to the values
 * already defined in styles.css. Add a literal here (and the matching CSS rule)
 * before using a new accent.
 */
type MetricAccent = 'red' | 'green' | 'amber';

export function MetricTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: MetricAccent;
}) {
  return (
    <div className={`metric-tile${accent ? ` metric-tile--${accent}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
