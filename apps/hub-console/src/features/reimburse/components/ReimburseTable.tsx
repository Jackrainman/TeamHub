import { CheckCircle2, Clock, TriangleAlert } from 'lucide-react';
import { deriveReimburseCompleteness, type ReimburseEntry } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { formatAmountFen } from '../reimburse-utils';

export function ReimburseTable({ entries, selected, onSelect, onOpen, finance = false }: {
  entries: ReimburseEntry[];
  selected: string[];
  onSelect: (ids: string[]) => void;
  onOpen: (id: string) => void;
  finance?: boolean;
}) {
  const { t } = useI18n();
  const all = entries.length > 0 && entries.every(entry => selected.includes(entry.id));
  return <div className="card domain-table-wrap"><table className="domain-table reimb-table">
    <thead><tr><th><input type="checkbox" aria-label={t('expected.selectAll')} checked={all} disabled={!entries.length} onChange={event => onSelect(event.target.checked ? [...new Set([...selected, ...entries.map(entry => entry.id)])] : selected.filter(id => !entries.some(entry => entry.id === id)))} /></th><th>{t('reimb.create.field.summary')}</th><th>{t('reimb.create.field.expenseType')}</th><th>{t('reimb.export.col.totalYuan')}</th><th>{t('reimb.export.col.status')}</th><th>{t('reimb.workflow.title')}</th><th>{t('reimb.payout.resultShort')}</th><th>{t('expected.reimburseOpen')}</th></tr></thead>
    <tbody>{entries.map(entry => {
      const title = entry.summary || entry.actualItemName || entry.items[0]?.name || entry.seller || entry.invoiceNo || entry.id;
      const completeness = deriveReimburseCompleteness(entry);
      const Icon = completeness === 'complete' ? CheckCircle2 : completeness === 'partial' ? TriangleAlert : Clock;
      return <tr key={entry.id}>
        <td><input type="checkbox" aria-label={t('expected.reimburseSelect', { title })} checked={selected.includes(entry.id)} onChange={event => onSelect(event.target.checked ? [...selected, entry.id] : selected.filter(id => id !== entry.id))} /></td>
        <td><strong>{title}</strong><small>{entry.seasonId} · {entry.invoiceDate ?? '—'}{finance ? ` · ${entry.memberId}` : ''}</small></td>
        <td>{t(entry.expenseType ? `reimb.expenseType.${entry.expenseType}` : 'reimb.expenseType.unconfirmed')}</td>
        <td className="reimb-table-amount">{formatAmountFen(entry.totalAmountFen)}</td>
        <td><span className={`reimb-material reimb-status--${completeness}`}><Icon size={14} />{t(`reimb.status.${completeness}`)}</span></td>
        <td><span className="badge badge--dense badge--outline">{t(`reimb.workflow.status.${entry.workflowStatus}`)}</span>{entry.returnReason && <small title={entry.returnReason}>{t('reimb.workflow.returnedShort')}</small>}</td>
        <td>{entry.workflowStatus === 'completed' ? t('reimb.workflow.status.completed') : entry.approvedAmountFen !== null ? formatAmountFen(entry.approvedAmountFen) : '—'}</td>
        <td><button className="btn btn--secondary btn--sm" onClick={() => onOpen(entry.id)}>{t('expected.reimburseOpen')}</button></td>
      </tr>;
    })}</tbody>
  </table></div>;
}
