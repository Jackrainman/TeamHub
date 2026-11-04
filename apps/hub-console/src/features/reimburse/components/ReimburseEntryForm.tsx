import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ReimburseSegment } from '../api';
import { derivePackageReview, DEFAULT_REIMBURSE_PROFILE, type InvoiceType, type ReimburseEntry, type ReimburseEntryKind, type ReimburseProfile } from '@teamhub/hub-contracts';
import {
  useSaveReimbursePackage,
  useUpdateReimburseEntry,
  type ReimburseFormInitial,
} from '../hooks';
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
import { ReimbursePackageReview } from './ReimbursePackageReview';
import { draftFromParsedInvoice } from '../reimburse-import';
import type { PackageSaveState } from '../lib/package-save';

const KIND_OPTIONS: { value: ReimburseEntryKind; labelKey: TranslationKey }[] = [
  { value: 'goods', labelKey: 'reimb.kind.goods' },
  { value: 'expense', labelKey: 'reimb.kind.expense' },
];

/**
 * 新建条目表单（阶段 3 手动录入；阶段 4 接 initial 预填——识别值只进草稿，用户确认才 POST）。
 * 金额一律元输入、装配时转分（buildCreateEntryRequest 纯函数，校验逻辑有单测）。
 * 错误内联渲染（声明 onError 跳过全局 toast，照 MutationCache 兜底注释的既有分工）。
 */
export function ReimburseEntryForm({
  client,
  source,
  projectId,
  canWrite,
  writeLockedHint,
  initial,
  onDone,
  onDraftChange,
  profile = DEFAULT_REIMBURSE_PROFILE,
  editingEntry,
}: {
  client: ReimburseSegment;
  source: string;
  projectId: string;
  canWrite: boolean;
  writeLockedHint: string | null;
  /** 导入预填：变化时父组件用 key 重挂本表单；null/缺省 = 手动录入。 */
  initial?: ReimburseFormInitial | null;
  /** 预填模式下提交成功/跳过后回调（父组件推进导入队列）。 */
  onDone?: () => void;
  onDraftChange?: (draft: EntryDraft) => void;
  profile?: ReimburseProfile;
  editingEntry?: ReimburseEntry;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<EntryDraft>(() => editingEntry ? {
    ...draftFromParsedInvoice({ ...editingEntry, invoiceNo: editingEntry.invoiceNo ?? '' }),
    kind: editingEntry.kind, invoiceType: editingEntry.invoiceType ?? 'unknown',
    actualItemName: editingEntry.actualItemName ?? '', note: editingEntry.note ?? '',
  } : initial?.draft ?? emptyEntryDraft());
  const [attachments, setAttachments] = useState(() => initial?.package?.attachments ?? []);
  const [saveState] = useState<PackageSaveState>(() => initial?.saveState ?? { clientRequestId: crypto.randomUUID() });
  useEffect(() => onDraftChange?.(draft), [draft, onDraftChange]);

  const saveMutation = useSaveReimbursePackage(client, source, () => {
      if (onDone) {
        onDone(); // 队列还有下一张时父组件换 key 重挂，草稿随预填重置
      } else {
        setDraft(emptyEntryDraft());
      }
  });
  const updateMutation = useUpdateReimburseEntry(client, source);
  const mutation = editingEntry ? updateMutation : saveMutation;
  const frozen = mutation.isPending || !!saveState.request;
  const review = derivePackageReview(attachments.filter(a => a.included), profile);
  const packageValid = attachments.filter(a => a.included).length <= 12 &&
    !review.reviewReasons.some(reason => reason === 'multiple-invoices' || reason === 'ambiguous-invoices');

  const patch = (partial: Partial<EntryDraft>) =>
    setDraft((d) => ({ ...d, ...partial }));
  const patchItem = (index: number, partial: Partial<EntryDraft['items'][number]>) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((row, i) => (i === index ? { ...row, ...partial } : row)),
    }));

  const request = buildCreateEntryRequest(draft, projectId);
  const valid = request !== null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!request || !canWrite) return;
    if (editingEntry) {
      const { projectId: _projectId, materials: _materials, recognitionSource: _recognition, ...patch } = request;
      updateMutation.mutate({ id: editingEntry.id, patch }, { onSuccess: () => onDone?.() });
    } else if (packageValid) saveMutation.mutate({ request, attachments, state: saveState });
  }

  return (
    <section className="panel" aria-label={t('reimb.create.title')}>
      {!initial && <header className="pm-create__head">
        <div>
          <h2>{t(editingEntry ? 'reimb.entry.editFields' : 'reimb.create.title')}</h2>
        </div>
      </header>}
      {initial?.package && <ReimbursePackageReview data={initial.package} attachments={attachments}
        request={request} profile={profile} locked={frozen} onChange={next => { setAttachments(next); initial.package!.attachments = next; }} />}
      {!!saveState.request && <p role="status">{t('reimb.package.retryHint')}</p>}
      {saveState.entryId && <p role="status">{t('reimb.package.saved', { done: saveState.completed ?? 0, total: attachments.filter(a => a.included).length })}</p>}
      <form className="pm-form" onSubmit={submit}>
        <fieldset disabled={frozen} className="reimb-form-fields">
        <Field label={t('reimb.package.type')}>
          <select value={draft.invoiceType ?? 'unknown'} onChange={e => patch({ invoiceType: e.target.value as InvoiceType })}>
            {(['unknown', 'vatOrdinary', 'vatSpecial', 'railway', 'other'] as const).map(type =>
              <option key={type} value={type}>{t(`reimb.invoiceType.${type}`)}</option>)}
          </select>
        </Field>
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
          <Field label={t('reimb.create.field.purchaserName')}>
            <input
              value={draft.purchaserName}
              placeholder={t('reimb.create.field.purchaserName.placeholder')}
              onChange={(e) => patch({ purchaserName: e.target.value })}
            />
          </Field>
          <Field label={t('reimb.create.field.purchaserTaxNo')}>
            <input
              value={draft.purchaserTaxNo}
              placeholder={t('reimb.create.field.purchaserTaxNo.placeholder')}
              onChange={(e) => patch({ purchaserTaxNo: e.target.value })}
            />
          </Field>
        </FormGrid>
        <FormGrid>
          <Field label={t('reimb.create.field.total')}>
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

        </fieldset>
        {initial && onDone && !saveState.request ? (
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
          submitLabel={t(editingEntry ? 'reimb.entry.saveMeta' : saveState.request ? 'reimb.package.retry' : 'reimb.create.submit')}
          submittingLabel={t('reimb.create.submitting')}
          submitting={mutation.isPending}
          disabled={!valid || !canWrite || !packageValid}
          lockedHint={writeLockedHint}
          error={
            mutation.error
              ? humanizeFormError(mutation.error, t, 'reimb.create.error')
              : !valid ? t('reimb.create.invalid') : null
          }
          success={mutation.isSuccess ? t('reimb.create.success') : null}
        />
      </form>
    </section>
  );
}
