import { CheckCircle2, Clock, TriangleAlert } from 'lucide-react';
import { deriveReimburseStatus, type ReimburseEntry } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { formatAmountFen } from '../reimburse-utils';

export function ReimburseTable({ entries, selected, onSelect, onOpen }: {
  entries: ReimburseEntry[]; selected: string[]; onSelect: (ids: string[]) => void; onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const all = entries.length > 0 && entries.every(entry => selected.includes(entry.id));
  return <div className="card domain-table-wrap"><table className="domain-table reimb-table">
    <thead><tr><th><input type="checkbox" aria-label={t('expected.selectAll')} checked={all} disabled={!entries.length} onChange={event => onSelect(event.target.checked ? [...new Set([...selected, ...entries.map(entry => entry.id)])] : selected.filter(id => !entries.some(entry => entry.id === id)))} /></th><th>{t('reimb.create.field.actualItemName')}</th><th>{t('expected.reimburseMaterials')}</th><th>{t('reimb.export.col.totalYuan')}</th><th>{t('reimb.export.col.status')}</th><th>{t('expected.reimburseOpen')}</th></tr></thead>
    <tbody>{entries.map(entry => {
      const title = entry.actualItemName || entry.items[0]?.name || entry.seller || entry.invoiceNo || entry.id;
      const status = deriveReimburseStatus(entry);
      const Icon = status === 'complete' ? CheckCircle2 : status === 'partial' ? TriangleAlert : Clock;
      return <tr key={entry.id}>
        <td><input type="checkbox" aria-label={t('expected.reimburseSelect', { title })} checked={selected.includes(entry.id)} onChange={event => onSelect(event.target.checked ? [...selected, entry.id] : selected.filter(id => id !== entry.id))} /></td>
        <td><strong>{title}</strong><small>{t(`reimb.kind.${entry.kind}`)} · {entry.invoiceDate ?? '—'}</small></td>
        <td><span className={`reimb-material ${entry.materials.paymentShot ? 'is-ready' : 'is-missing'}`}>{entry.materials.paymentShot ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}{t(entry.materials.paymentShot ? 'reimb.entry.materials.paymentShot' : 'expected.paymentMissing')}</span><span className={`reimb-material ${entry.materials.inspection ? 'is-ready' : 'is-missing'}`}>{entry.materials.inspection ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}{t(entry.materials.inspection ? 'reimb.entry.materials.inspection' : 'expected.inspectionMissing')}</span></td>
        <td className="reimb-table-amount">{formatAmountFen(entry.totalAmountFen)}</td>
        <td><span className={`reimb-material reimb-status--${status}`}><Icon size={14} />{t(`reimb.status.${status}`)}</span></td>
        <td><button className="btn btn--secondary btn--sm" onClick={() => onOpen(entry.id)}>{t('expected.reimburseOpen')}</button></td>
      </tr>;
    })}</tbody>
  </table></div>;
}
