import { useState, type FormEvent } from 'react';
import { PackagePlus } from 'lucide-react';
import type { HubApiClient } from '../../../api/client';
import type {
  ReimburseBatch,
  ReimburseBatchStatus,
  ReimburseBatchSummary,
} from '../../../api/schemas/reimburse';
import { useCreateReimburseBatch, useUpdateReimburseBatch } from '../../../hooks/useReimburse';
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

/**
 * 超管批次区（一期财务视角=超管）：批次列表（名称+状态徽标+服务端聚合 count/总额/未齐计数）、
 * 新建批次、三档状态流转。聚合只用 GET batches 的 summaries——无按人明细、无排行（I0）。
 */
export function ReimburseBatchSection({
  client,
  source,
  defaultProjectId,
  batches,
  summaries,
}: {
  client: HubApiClient;
  source: string;
  defaultProjectId: string;
  batches: ReimburseBatch[];
  summaries: ReimburseBatchSummary[];
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');

  const createMutation = useCreateReimburseBatch(client, source, {
    onSuccess: () => setName(''),
    onError: () => {}, // 内联错误条已渲染 createMutation.error，跳过全局 toast（免重复提示）
  });
  const updateMutation = useUpdateReimburseBatch(client, source);

  const summaryByBatchId = new Map(summaries.map((s) => [s.batchId, s]));
  const valid = name.trim().length > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    createMutation.mutate({ projectId: defaultProjectId, name: name.trim() });
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
            const summary = summaryByBatchId.get(batch.id);
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
                {summary ? (
                  <p className="reimb-batch__summary">
                    {t('reimb.batch.summary', {
                      count: summary.count,
                      total: formatAmountFen(summary.totalAmountFen),
                      incomplete: summary.incompleteCount,
                    })}
                  </p>
                ) : null}
                <div className="reimb-batch__flow" role="group" aria-label={t('reimb.batch.flow')}>
                  {BATCH_STATUS.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      className="btn btn--sm btn--secondary"
                      disabled={batch.status === s.value || updateMutation.isPending}
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
