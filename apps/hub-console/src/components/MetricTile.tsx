/**
 * MetricTile – shared label + value metric display used across OverviewPage,
 * PmBoardPage, and DepGraphPage. The optional `accent` prop is forwarded as a
 * CSS modifier class (`metric-tile--<accent>`), supporting any value already
 * defined in styles.css (currently 'red', 'green', 'amber').
 */
export function MetricTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className={`metric-tile${accent ? ` metric-tile--${accent}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
