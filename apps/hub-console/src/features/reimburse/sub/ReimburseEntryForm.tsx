import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { HubApiClient } from '../../../api/client';
import type { ReimburseEntryKind } from '../../../api/schemas/reimburse';
import { useCreateReimburseEntry } from '../../../hooks/useReimburse';
import { useI18n, type TranslationKey } from '../../../i18n';
import { humanizeFormError } from '../../../utils';
import { Field } from '../../../components/Field';
import { FormActions } from '../../../components/FormActions';
import { FormGrid } from '../../../components/FormGrid';
import { SegToggle } from '../../../components/SegToggle';
import {
  buildCreateEntryRequest,
  emptyEntryDraft,
  emptyItemDraft,
  type EntryDraft,
} from '../reimburse-utils';
import { FormBanner } from '../../../components/FormBanner';

const KIND_OPTIONS: { value: ReimburseEntryKind; labelKey: TranslationKey }[] = [
  { value: 'goods', labelKey: 'reimb.kind.goods' },
  { value: 'expense', labelKey: 'reimb.kind.expense' },
];

/**
 * 发票导入预填（阶段 4）：父组件按当前队列项重挂本表单（key=job id），
 * 草稿初值 = 识别出的发票要素；用户改完提交或点「跳过这张」→ onDone 推进队列。
 */
export interface ReimburseFormInitial {
  draft: EntryDraft;
  fileName: string;
  notice: 'recognized' | 'unrecognized';
}

/**
 * 新建条目表单（阶段 3 手动录入；阶段 4 接 initial 预填——识别值只进草稿，用户确认才 POST）。
 * 金额一律元输入、装配时转分（buildCreateEntryRequest 纯函数，校验逻辑有单测）。
 * 错误内联渲染（声明 onError 跳过全局 toast，照 MutationCache 兜底注释的既有分工）。
 */
export function ReimburseEntryForm({
  client,
  source,
  defaultProjectId,
  canWrite,
  writeLockedHint,
  initial,
  onDone,
}: {
  client: HubApiClient;
  source: string;
  defaultProjectId: string;
  canWrite: boolean;
  writeLockedHint: string | null;
  /** 导入预填：变化时父组件用 key 重挂本表单；null/缺省 = 手动录入。 */
  initial?: ReimburseFormInitial | null;
  /** 预填模式下提交成功/跳过后回调（父组件推进导入队列）。 */
  onDone?: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<EntryDraft>(() => initial?.draft ?? emptyEntryDraft());

  const mutation = useCreateReimburseEntry(client, source, {
    onSuccess: () => {
      if (initial && onDone) {
        onDone(); // 队列还有下一张时父组件换 key 重挂，草稿随预填重置
      } else {
        setDraft(emptyEntryDraft());
      }
    },
    onError: () => {}, // 内联错误条已渲染 mutation.error，跳过全局 toast（免重复提示）
  });

  const patch = (partial: Partial<EntryDraft>) =>
    setDraft((d) => ({ ...d, ...partial }));
  const patchItem = (index: number, partial: Partial<EntryDraft['items'][number]>) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((row, i) => (i === index ? { ...row, ...partial } : row)),
    }));

  const request = buildCreateEntryRequest(draft, defaultProjectId);
  const valid = request !== null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!request || !canWrite) return;
    mutation.mutate(request);
  }

  return (
    <section className="panel" aria-label={t('reimb.create.title')}>
      <header className="pm-create__head">
        <div>
          <h2>{t('reimb.create.title')}</h2>
          <p className="pm-create__note">
            {initial ? t('reimb.create.subtitle.prefilled') : t('reimb.create.subtitle')}
          </p>
        </div>
      </header>
      {initial ? (
        <FormBanner
          kind={initial.notice === 'recognized' ? 'ok' : 'err'}
          role="status"
          message={
            initial.notice === 'recognized'
              ? t('reimb.import.prefilled', { file: initial.fileName })
              : t('reimb.import.unrecognized', { file: initial.fileName })
          }
        />
      ) : null}
      <form className="pm-form" onSubmit={submit}>
        <FormGrid>
          <Field label={t('reimb.create.field.kind')} className="span-all">
            <SegToggle<ReimburseEntryKind>
              value={draft.kind}
              onChange={(kind) => patch({ kind })}
              ariaLabel={t('reimb.create.field.kind')}
              options={KIND_OPTIONS.map((o) => ({
                value: o.value,
                label: t(o.labelKey),
              }))}
            />
          </Field>
        </FormGrid>
        <FormGrid>
          <Field label={t('reimb.create.field.invoiceNo')}>
            <input
              value={draft.invoiceNo}
              placeholder={t('reimb.create.field.invoiceNo.placeholder')}
              onChange={(e) => patch({ invoiceNo: e.target.value })}
            />
          </Field>
          <Field label={t('reimb.create.field.invoiceDate')}>
            <input
              type="date"
              value={draft.invoiceDate}
              onChange={(e) => patch({ invoiceDate: e.target.value })}
            />
          </Field>
        </FormGrid>
        <FormGrid>
          <Field label={t('reimb.create.field.seller')}>
            <input
              value={draft.seller}
              placeholder={t('reimb.create.field.seller.placeholder')}
              onChange={(e) => patch({ seller: e.target.value })}
            />
          </Field>
          <Field label={t('reimb.create.field.total')} required>
            <input
              value={draft.totalYuan}
              placeholder={t('reimb.create.field.total.placeholder')}
              inputMode="decimal"
              onChange={(e) => patch({ totalYuan: e.target.value })}
            />
          </Field>
        </FormGrid>
        <FormGrid>
          <Field label={t('reimb.create.field.actualItemName')}>
            <input
              value={draft.actualItemName}
              placeholder={t('reimb.create.field.actualItemName.placeholder')}
              onChange={(e) => patch({ actualItemName: e.target.value })}
            />
          </Field>
          <Field label={t('reimb.create.field.note')}>
            <input
              value={draft.note}
              placeholder={t('reimb.create.field.note.placeholder')}
              onChange={(e) => patch({ note: e.target.value })}
            />
          </Field>
        </FormGrid>

        {draft.kind === 'goods' ? (
          <div className="reimb-items-editor">
            <p className="reimb-items-editor__title">{t('reimb.create.items.title')}</p>
            {draft.items.map((row, index) => (
              <div className="reimb-items-editor__row" key={index}>
                <input
                  value={row.name}
                  placeholder={t('reimb.create.items.name')}
                  onChange={(e) => patchItem(index, { name: e.target.value })}
                />
                <input
                  value={row.unit}
                  placeholder={t('reimb.create.items.unit')}
                  className="reimb-items-editor__cell--narrow"
                  onChange={(e) => patchItem(index, { unit: e.target.value })}
                />
                <input
                  value={row.quantity}
                  placeholder={t('reimb.create.items.quantity')}
                  className="reimb-items-editor__cell--narrow"
                  inputMode="decimal"
                  onChange={(e) => patchItem(index, { quantity: e.target.value })}
                />
                <input
                  value={row.unitPriceYuan}
                  placeholder={t('reimb.create.items.unitPrice')}
                  className="reimb-items-editor__cell--narrow"
                  inputMode="decimal"
                  onChange={(e) => patchItem(index, { unitPriceYuan: e.target.value })}
                />
                <input
                  value={row.amountYuan}
                  placeholder={t('reimb.create.items.amount')}
                  className="reimb-items-editor__cell--narrow"
                  inputMode="decimal"
                  onChange={(e) => patchItem(index, { amountYuan: e.target.value })}
                />
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  aria-label={t('reimb.create.items.remove')}
                  onClick={() =>
                    setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== index) }))
                  }
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn--sm btn--dashed"
              onClick={() => setDraft((d) => ({ ...d, items: [...d.items, emptyItemDraft()] }))}
            >
              <Plus size={14} strokeWidth={1.5} />
              {t('reimb.create.items.add')}
            </button>
          </div>
        ) : null}

        {initial && onDone ? (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={onDone}
            disabled={mutation.isPending}
          >
            {t('reimb.import.skip')}
          </button>
        ) : null}
        <FormActions
          submitLabel={t('reimb.create.submit')}
          submittingLabel={t('reimb.create.submitting')}
          submitting={mutation.isPending}
          disabled={!valid || !canWrite}
          lockedHint={writeLockedHint}
          error={
            mutation.error
              ? humanizeFormError(mutation.error, t, 'reimb.create.error')
              : null
          }
          success={mutation.isSuccess ? t('reimb.create.success') : null}
        />
      </form>
    </section>
  );
}
