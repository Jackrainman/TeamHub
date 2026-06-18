/**
 * MetaRow – shared dt/dd row used by KbMeta, Meta (KbCloseoutForm), AboutRow
 * (SettingsPage), and ArchiveMeta (ArchivePage).
 *
 * rowClass lets callers pass their own container class name when the outer
 * element drives grid/spacing (e.g. 'archive-meta__row' vs 'kb-meta__row').
 * Defaults to 'kb-meta__row'.
 */
export function MetaRow({
  label,
  value,
  mono,
  rowClass,
}: {
  label: string;
  value: string;
  mono?: boolean;
  rowClass?: string;
}) {
  return (
    <div className={rowClass ?? 'kb-meta__row'}>
      <dt>{label}</dt>
      <dd className={mono ? 'kb-mono' : undefined}>{value}</dd>
    </div>
  );
}
