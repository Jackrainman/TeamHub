import { useRef, useState, type FormEvent } from 'react';
import type { ReimburseEntry } from '@teamhub/hub-contracts';
import type { ReimburseSegment } from '../api';
import { useCreateReimbursePayout } from '../hooks';
import { useI18n } from '../../../i18n';
import { formatAmountFen } from '../reimburse-utils';
import { Field } from '../../../components/Field';
import { FormActions } from '../../../components/FormActions';
import { humanizeFormError } from '../../../utils';

export function ReimbursePayoutForm({ client, source, entries, onDone }: {
  client: ReimburseSegment;
  source: string;
  entries: ReimburseEntry[];
  onDone: () => void;
}) {
  const { t } = useI18n();
  const mutation = useCreateReimbursePayout(client, source);
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [method, setMethod] = useState<'bank' | 'wechat' | 'alipay' | 'cash' | 'other'>('bank');
  const [transactionRef, setTransactionRef] = useState('');
  const [note, setNote] = useState('');
  const clientRequestId = useRef(crypto.randomUUID());
  const recipientIds = new Set(entries.map((entry) => entry.memberId));
  const total = entries.reduce((sum, entry) => sum + (entry.approvedAmountFen ?? 0), 0);
  const valid = entries.length > 0 && recipientIds.size === 1 && total > 0 && entries.every((entry) => entry.workflowStatus === 'pendingPayment');
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    mutation.mutate({
      entries: entries.map((entry) => ({ id: entry.id, expectedRevision: entry.revision })),
      amountFen: total, paidAt: new Date(paidAt).toISOString(), method,
      transactionRef: transactionRef.trim() || null, note: note.trim() || null, clientRequestId: clientRequestId.current,
    }, { onSuccess: onDone });
  }
  return <form className="pm-form" onSubmit={submit}>
    <p className="form-hint">{t('reimb.payout.hint')}</p>
    <ul>{entries.map((entry) => <li key={entry.id}>{entry.summary ?? entry.id} · {formatAmountFen(entry.approvedAmountFen)}</li>)}</ul>
    <p><strong>{t('reimb.payout.total')}: {formatAmountFen(total)}</strong></p>
    {recipientIds.size > 1 && <p role="alert">{t('reimb.payout.sameRecipient')}</p>}
    <Field label={t('reimb.payout.paidAt')}><input type="datetime-local" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} /></Field>
    <Field label={t('reimb.payout.method')}><select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
      {(['bank', 'wechat', 'alipay', 'cash', 'other'] as const).map((value) => <option key={value} value={value}>{t(`reimb.payout.method.${value}`)}</option>)}
    </select></Field>
    <Field label={t('reimb.payout.transactionRef')}><input value={transactionRef} onChange={(event) => setTransactionRef(event.target.value)} /></Field>
    <Field label={t('reimb.payout.note')}><textarea value={note} onChange={(event) => setNote(event.target.value)} /></Field>
    <FormActions submitLabel={t('reimb.payout.submit')} submittingLabel={t('reimb.payout.submitting')} submitting={mutation.isPending}
      disabled={!valid || !paidAt} error={mutation.error ? humanizeFormError(mutation.error, t, 'reimb.payout.error') : null} />
  </form>;
}
