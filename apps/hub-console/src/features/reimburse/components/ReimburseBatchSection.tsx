import { useState, type FormEvent } from 'react';
import { PackagePlus } from 'lucide-react';
import type { ReimburseSegment } from '../api';
import type { ReimburseBatch, ReimburseBatchStatus, ReimburseBatchSummary } from '@teamhub/hub-contracts';
import { useCreateReimburseBatch, useUpdateReimburseBatch } from '../hooks';
import { useI18n, type TranslationKey } from '../../../i18n';
import { humanizeFormError } from '../../../utils';
import { EmptyState } from '../../../shared/EmptyState';
import { FormActions } from '../../../components/FormActions';
import { formatAmountFen } from '../reimburse-utils';

const BATCH_STATUS: { value: ReimburseBatchStatus; tone: string; key: TranslationKey }[] = [
  { value: 'collecting', tone: 'badge--amber', key: 'reimb.batch.status.collecting' },
  { value: 'submitted', tone: 'badge--blue', key: 'reimb.batch.status.submitted' },
];

/** 批次只归集与交付；汇总来自服务端 summaries，完成进度由条目 payout 派生。 */
export function ReimburseBatchSection({ client, source, projectId, seasonId, batches, summaries }: {
  client: ReimburseSegment;
  source: string;
  projectId: string;
  seasonId: string;
  batches: ReimburseBatch[];
  summaries: ReimburseBatchSummary[];
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const createMutation = useCreateReimburseBatch(client, source, { onSuccess: () => setName(''), onError: () => {} });
  const updateMutation = useUpdateReimburseBatch(client, source);
  const valid = projectId.trim().length > 0 && seasonId !== 'unassigned' && name.trim().length > 0;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) createMutation.mutate({ projectId: projectId.trim(), seasonId, name: name.trim() });
  }
  return <section className="panel" aria-label={t('reimb.batch.title')}>
    <header className="pm-create__head"><div><h3>{t('reimb.batch.title')}</h3><p className="pm-create__note">{t('reimb.batch.subtitle')}</p></div></header>
    <form className="pm-form" onSubmit={submit}>
      <div className="reimb-batch-create"><input value={name} placeholder={t('reimb.batch.name.placeholder')} aria-label={t('reimb.batch.name')} onChange={(event) => setName(event.target.value)} /></div>
      <FormActions submitLabel={t('reimb.batch.create.submit')} submittingLabel={t('reimb.batch.create.submitting')} submitting={createMutation.isPending}
        disabled={!valid} error={createMutation.error ? humanizeFormError(createMutation.error, t, 'reimb.batch.create.error') : null} />
    </form>
    {batches.length === 0 ? <EmptyState icon={PackagePlus} title={t('reimb.batch.empty.title')} desc={t('reimb.batch.empty.desc')} /> :
      <div className="reimb-batches">{batches.map((batch) => {
        const summary = summaries.find((item) => item.batchId === batch.id);
        const current = BATCH_STATUS.find((item) => item.value === batch.status);
        return <article className="card reimb-batch" key={batch.id}>
          <header className="reimb-batch__head"><strong>{batch.name}</strong>{current && <span className={`badge badge--dense ${current.tone}`}>{t(current.key)}</span>}</header>
          <div className="reimb-batch__summary">
            {t('reimb.batch.progress.' + (summary?.progress ?? 'empty'))} · {summary?.count ?? 0} · {formatAmountFen(summary?.totalAmountFen ?? 0)} · {t('reimb.summary.unknown')}: {summary?.unknownAmountCount ?? 0}
          </div>
          <div className="reimb-batch__flow" role="group" aria-label={t('reimb.batch.flow')}>{BATCH_STATUS.map((status) => <button key={status.value} type="button" className="btn btn--sm btn--secondary"
            disabled={batch.status === status.value || updateMutation.isPending} onClick={() => updateMutation.mutate({ id: batch.id, patch: { status: status.value } })}>{t(status.key)}</button>)}</div>
        </article>;
      })}</div>}
  </section>;
}
