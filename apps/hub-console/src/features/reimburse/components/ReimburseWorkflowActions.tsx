import { useState } from 'react';
import type { ReimburseEntry, ReimburseEntryAction } from '@teamhub/hub-contracts';
import { deriveReimburseCompleteness } from '@teamhub/hub-contracts';
import type { ReimburseSegment } from '../api';
import { useReimburseEntryAction } from '../hooks';
import { useI18n } from '../../../i18n';
import { yuanTextToFen } from '../reimburse-utils';

export function ReimburseWorkflowActions({ client, source, entry, isOwner, isFinance, canWrite }: {
  client: ReimburseSegment;
  source: string;
  entry: ReimburseEntry;
  isOwner: boolean;
  isFinance: boolean;
  canWrite: boolean;
}) {
  const { t } = useI18n();
  const mutation = useReimburseEntryAction(client, source);
  const [reason, setReason] = useState('');
  const [approvedYuan, setApprovedYuan] = useState(entry.totalAmountFen === null ? '' : (entry.totalAmountFen / 100).toFixed(2));
  const run = (action: ReimburseEntryAction, approvedAmountFen?: number) => mutation.mutate({
    id: entry.id, action,
    request: { expectedRevision: entry.revision, ...(reason.trim() ? { reason: reason.trim() } : {}), ...(approvedAmountFen !== undefined ? { approvedAmountFen } : {}) },
  });
  const status = entry.workflowStatus;
  const needsNote = deriveReimburseCompleteness(entry) !== 'complete' || yuanTextToFen(approvedYuan) !== entry.totalAmountFen;
  return <section className="reimb-workflow" aria-label={t('reimb.workflow.title')}>
    <div className="domain-actions">
      {isOwner && (status === 'draft' || status === 'returned') && <button className="btn btn--primary btn--sm" disabled={!canWrite || mutation.isPending} onClick={() => run('submit')}>{t('reimb.workflow.submit')}</button>}
      {isOwner && ['draft', 'submitted', 'returned'].includes(status) && <button className="btn btn--ghost btn--sm" disabled={!canWrite || mutation.isPending} onClick={() => run('cancel')}>{t('reimb.workflow.cancel')}</button>}
      {isFinance && status === 'submitted' && <button className="btn btn--primary btn--sm" disabled={!canWrite || mutation.isPending} onClick={() => run('accept')}>{t('reimb.workflow.accept')}</button>}
      {isFinance && status === 'reviewing' && <>
        <button className="btn btn--secondary btn--sm" disabled={!canWrite || mutation.isPending} onClick={() => run('check')}>{t('reimb.workflow.check')}</button>
        <button className="btn btn--secondary btn--sm" disabled={!canWrite || mutation.isPending || !reason.trim()} onClick={() => run('return')}>{t('reimb.workflow.return')}</button>
      </>}
      {isFinance && status === 'pendingPayment' && <button className="btn btn--secondary btn--sm" disabled={!canWrite || mutation.isPending || !reason.trim()} onClick={() => run('revokeApproval')}>{t('reimb.workflow.revoke')}</button>}
    </div>
    {isFinance && ['reviewing', 'pendingPayment'].includes(status) && <label className="gate-field">{t('reimb.workflow.reason')}<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>}
    {isFinance && status === 'reviewing' && <div className="reimb-approve">
      <label className="gate-field">{t('reimb.workflow.approvedAmount')}<input inputMode="decimal" value={approvedYuan} onChange={(event) => setApprovedYuan(event.target.value)} /></label>
      <button className="btn btn--primary btn--sm" disabled={!canWrite || mutation.isPending || yuanTextToFen(approvedYuan) === null || (needsNote && !reason.trim())}
        onClick={() => { const amount = yuanTextToFen(approvedYuan); if (amount !== null) run('approve', amount); }}>{t('reimb.workflow.approve')}</button>
    </div>}
    {entry.returnReason && <p className="form-hint form-hint--warn">{t('reimb.workflow.returnedReason', { reason: entry.returnReason })}</p>}
    {entry.reviewNote && <p className="form-hint">{t('reimb.workflow.reviewNote', { reason: entry.reviewNote })}</p>}
    <details className="reimb-history"><summary>{t('reimb.workflow.history', { count: entry.history.length })}</summary>
      <ol>{entry.history.map((event, index) => <li key={`${event.at}-${index}`}>
        {t(`reimb.history.${event.action}`)} · {event.at} · v{event.revision}{event.reason ? ` · ${event.reason}` : ''}
      </li>)}</ol>
    </details>
  </section>;
}
