import { useRef, useState } from 'react';
import { REIMBURSE_EVIDENCE_ACCEPT, ReimburseEvidenceKindSchema, type ReimburseEntry, type ReimburseEvidenceKind } from '@teamhub/hub-contracts';
import type { ReimburseSegment } from '../api';
import { useUploadReimburseSupplement } from '../hooks';
import { prepareSupplement, type SupplementRow } from '../lib/evidence-supplement';
import { useI18n } from '../../../i18n';
import { Field } from '../../../components/Field';
import { formatAmountFen } from '../reimburse-utils';
import { humanizeFormError } from '../../../utils';

export function ReimburseSupplementForm({ client, source, entries }: {
  client: ReimburseSegment; source: string; entries: ReimburseEntry[];
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<SupplementRow[]>([]);
  const [reading, setReading] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const ids = entries.map(entry => entry.id);
  const upload = useUploadReimburseSupplement(client, source, entries);
  const busy = reading || upload.isPending;
  const pending = rows.filter(row => row.status !== 'done');
  const patch = (id: string, values: Partial<SupplementRow>) => setRows(current => current.map(row => row.id === id ? { ...row, ...values } : row));

  async function addFiles(files: File[]) {
    setReading(true);
    try {
      const result = await prepareSupplement(files, ids);
      setRows(current => [...current, ...result.rows]);
      setRejected(result.rejected);
      setFailed(result.failed);
    } finally { setReading(false); }
  }

  return <div className="reimb-supplement">
    <p className="form-hint">{t('reimb.supplement.hint')}</p>
    <div className="domain-actions"><button className="btn btn--secondary btn--sm" disabled={busy} onClick={() => input.current?.click()}>{t('reimb.supplement.pick')}</button></div>
    <input ref={input} type="file" multiple accept={`${REIMBURSE_EVIDENCE_ACCEPT},.zip`} hidden
      onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; void addFiles(files); }} />
    {rejected.length > 0 && <p role="alert">{t('reimb.supplement.rejected', { files: rejected.join('、') })}</p>}
    {failed.length > 0 && <p role="alert">{failed.join('、')}：{t('reimb.supplement.readFailed')}</p>}
    {rows.map(row => <div className="card" key={row.id}>
      <strong>{row.path}</strong>
      <Field label={t('reimb.supplement.target')}>
        <select value={row.entryId} disabled={busy || row.status === 'done'} onChange={event => patch(row.id, { entryId: event.target.value })}>
          <option value="">{t('reimb.supplement.choose')}</option>
          {entries.map(entry => <option key={entry.id} value={entry.id}>{entry.invoiceDate ?? ''} · {entry.actualItemName || entry.seller || entry.invoiceNo || entry.id} · {formatAmountFen(entry.totalAmountFen)} · {entry.invoiceNo ?? entry.id}</option>)}
        </select>
      </Field>
      <Field label={t('reimb.package.role')}>
        <select value={row.kind} disabled={busy || row.status === 'done'} onChange={event => patch(row.id, { kind: event.target.value as ReimburseEvidenceKind })}>
          {ReimburseEvidenceKindSchema.options.map(kind => <option key={kind} value={kind}>{t(`reimb.evidence.kind.${kind}`)}</option>)}
        </select>
      </Field>
      {row.status !== 'pending' && <span role="status">{t(row.status === 'done' ? 'reimb.supplement.done' : 'reimb.supplement.failed')}</span>}
      {row.error && <p className="form-hint form-hint--warn">{humanizeFormError(row.error, t, 'reimb.create.error')}</p>}
      {row.status !== 'done' && <div className="domain-actions"><button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setRows(current => current.filter(item => item.id !== row.id))}>{t('reimb.supplement.remove')}</button></div>}
    </div>)}
    <div className="domain-actions"><button className="btn btn--primary btn--sm" disabled={busy || !pending.length || pending.some(row => !ids.includes(row.entryId))}
      onClick={() => upload.mutate(rows, { onSuccess: setRows })}>{t(upload.isPending ? 'reimb.evidence.uploading' : 'reimb.supplement.submit')}</button></div>
  </div>;
}
