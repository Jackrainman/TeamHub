import { useState, type FormEvent } from 'react';
import { PackagePlus } from 'lucide-react';
import type { ReimburseSegment } from '../api';
import {
  deriveReimburseFinancialSummary,
  type ReimburseBatch,
  type ReimburseBatchStatus,
  type ReimburseEntry,
  type ReimburseProfile,
} from '@teamhub/hub-contracts';
import { useCreateReimburseBatch, useUpdateReimburseBatch } from '../hooks';
import { useI18n, type TranslationKey } from '../../../i18n';
import { humanizeFormError } from '../../../utils';
import { EmptyState } from '../../../shared/EmptyState';
import { FormActions } from '../../../components/FormActions';
import { formatAmountFen } from '../reimburse-utils';

const BATCH_STATUS: { value: ReimburseBatchStatus; tone: string; key: TranslationKey }[] = [
  { value: 'collecting', tone: 'badge--amber', key: 'reimb.batch.status.collecting' },
  { value: 'submitted', tone: 'badge--blue', key: 'reimb.batch.status.submitted' },
  { value: 'reimbursed', tone: 'badge--green', key: 'reimb.batch.status.reimbursed' },
];

const FINANCIAL_BUCKETS: {
  value: 'gross' | 'eligible' | 'blocked' | 'review';
  key: TranslationKey;
}[] = [
  { value: 'gross', key: 'reimb.batch.summary.gross' },
  { value: 'eligible', key: 'reimb.batch.summary.eligible' },
  { value: 'blocked', key: 'reimb.batch.summary.blocked' },
  { value: 'review', key: 'reimb.batch.summary.review' },
];

/**
 * 超管批次区：批次列表展示票面/可报/阻塞/需核对四种口径，新建批次、三档状态流转。
 * 聚合从当前超管可见条目与共享 contracts 规则派生，无按人明细、无排行（I0）。
 */
export function ReimburseBatchSection({
  client,
  source,
  projectId,
  batches,
  entries,
  profile,
}: {
  client: ReimburseSegment;
  source: string;
  projectId: string;
  batches: ReimburseBatch[];
  entries: ReimburseEntry[];
  profile: ReimburseProfile;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');

  const createMutation = useCreateReimburseBatch(client, source, {
    onSuccess: () => setName(''),
    onError: () => {}, // 内联错误条已渲染 createMutation.error，跳过全局 toast（免重复提示）
  });
  const updateMutation = useUpdateReimburseBatch(client, source);

  const valid = projectId.trim().length > 0 && name.trim().length > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    createMutation.mutate({ projectId: projectId.trim(), name: name.trim() });
  }

  return (
    <section className="panel" aria-label={t('reimb.batch.title')}>
      <header className="pm-create__head">
        <div>
          <h2>{t('reimb.batch.title')}</h2>
          <p className="pm-create__note">{t('reimb.batch.subtitle')}</p>
        </div>
      </header>

      <form className="pm-form" onSubmit={submit}>
        <div className="reimb-batch-create">
          <input
            value={name}
            placeholder={t('reimb.batch.name.placeholder')}
            aria-label={t('reimb.batch.name')}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <FormActions
          submitLabel={t('reimb.batch.create.submit')}
          submittingLabel={t('reimb.batch.create.submitting')}
          submitting={createMutation.isPending}
          disabled={!valid}
          error={
            createMutation.error
              ? humanizeFormError(createMutation.error, t, 'reimb.batch.create.error')
              : null
          }
        />
      </form>

      {batches.length === 0 ? (
        <EmptyState
          icon={PackagePlus}
          title={t('reimb.batch.empty.title')}
          desc={t('reimb.batch.empty.desc')}
        />
      ) : (
        <div className="reimb-batches">
          {batches.map((batch) => {
            const summary = deriveReimburseFinancialSummary(
              entries.filter((entry) => entry.batchId === batch.id),
              profile,
            );
            const current = BATCH_STATUS.find((s) => s.value === batch.status);
            return (
              <article className="card reimb-batch" key={batch.id}>
                <header className="reimb-batch__head">
                  <strong>{batch.name}</strong>
                  {current ? (
                    <span className={`badge badge--dense ${current.tone}`.trim()}>
                      {t(current.key)}
                    </span>
                  ) : null}
                </header>
                <div className="reimb-batch__summary">
                  {FINANCIAL_BUCKETS.map((bucket, index) => (
                    <span key={bucket.value}>
                      {index > 0 ? ' · ' : ''}
                      {t(bucket.key)}：{summary[bucket.value].count} ·{' '}
                      {formatAmountFen(summary[bucket.value].amountFen)}
                    </span>
                  ))}
                </div>
                <div className="reimb-batch__flow" role="group" aria-label={t('reimb.batch.flow')}>
                  {BATCH_STATUS.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      className="btn btn--sm btn--secondary"
                      disabled={
                        batch.status === s.value ||
                        updateMutation.isPending ||
                        (s.value === 'submitted' && summary.blocked.count > 0)
                      }
                      title={
                        s.value === 'submitted' && summary.blocked.count > 0
                          ? t('reimb.batch.submitBlocked')
                          : undefined
                      }
                      onClick={() =>
                        updateMutation.mutate({ id: batch.id, patch: { status: s.value } })
                      }
                    >
                      {t(s.key)}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
