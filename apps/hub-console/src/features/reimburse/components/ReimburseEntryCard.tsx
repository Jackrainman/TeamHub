import { useState } from 'react';
import type { ReimburseSegment } from '../api';
import {
  derivePurchaserCheckStatus,
  deriveReimburseReviewReasons,
  deriveReimburseCompleteness,
  suggestReimburseFilename,
  type ReimburseBatch,
  type ReimburseEntry,
  type ReimburseCompleteness,
  type ReimbursePayout,
  type ReimburseProfile,
  type ReimburseReviewReason,
} from '@teamhub/hub-contracts';
import { useUpdateReimburseEntry } from '../hooks';
import { useI18n, type TranslationKey } from '../../../i18n';
import { formatAmountFen } from '../reimburse-utils';
import { ReimburseEvidenceSection } from './ReimburseEvidenceSection';

import { ReimburseEntryForm } from './ReimburseEntryForm';
import { ReimburseWorkflowActions } from './ReimburseWorkflowActions';

const STATUS_BADGE: Record<ReimburseCompleteness, { tone: string; key: TranslationKey }> = {
  draft: { tone: 'badge--outline', key: 'reimb.status.draft' },
  partial: { tone: 'badge--amber', key: 'reimb.status.partial' },
  complete: { tone: 'badge--green', key: 'reimb.status.complete' },
};

const REVIEW_REASON_KEY: Record<ReimburseReviewReason, TranslationKey> = {
  'invoice-no-missing': 'reimb.review.invoiceNoMissing',
  'invoice-date-missing': 'reimb.review.invoiceDateMissing',
  'seller-missing': 'reimb.review.sellerMissing',
  'amount-missing': 'reimb.review.amountMissing',
  'items-missing': 'reimb.review.itemsMissing',
  'purchaser-mismatch': 'reimb.review.purchaserMismatch',
  'purchaser-missing': 'reimb.review.purchaserMissing',
  'unit-price-imprecise': 'reimb.review.unitPriceImprecise',
  'ocr-recognition': 'reimb.review.ocrRecognition',
  'manual-entry': 'reimb.review.manualEntry',
};

/**
 * 单条报销条目卡片：发票要素 + 完整度派生徽标（无手工状态机）+
 * 材料核对（点了即 PATCH）+ 凭证留档区 + actualItemName/note 就地编辑 + 管理员装批/移出。
 * 错误一律交全局 MutationCache.onError toast。
 */
export function ReimburseEntryCard({
  client,
  source,
  entry,
  batches,
  isSuperAdmin,
  canWrite,
  profile,
  canViewEvidence,
  isOwner,
  payout = null,
  evidenceDefaultOpen = false,
}: {
  client: ReimburseSegment;
  source: string;
  entry: ReimburseEntry;
  batches: ReimburseBatch[];
  isSuperAdmin: boolean;
  canWrite: boolean;
  profile: ReimburseProfile;
  /** 凭证读者门：未登录 / 匿名模式下服务端不认人，整区隐藏（不发请求）。 */
  canViewEvidence: boolean;
  /** 本条目是否当前登录人自己的（凭证上传/删除只对本人开放）。 */
  isOwner: boolean;
  payout?: ReimbursePayout | null;
  evidenceDefaultOpen?: boolean;
}) {
  const { t } = useI18n();
  const updateMutation = useUpdateReimburseEntry(client, source);

  const [editing, setEditing] = useState(false);

  const status = deriveReimburseCompleteness(entry);
  const purchaserStatus = derivePurchaserCheckStatus(entry, profile);
  const reviewReasons = deriveReimburseReviewReasons(entry, profile);
  const nonMismatchReasons = reviewReasons.filter((reason) => reason !== 'purchaser-mismatch');
  const badge = STATUS_BADGE[status];
  const ownerEditable = isOwner && (entry.workflowStatus === 'draft' || entry.workflowStatus === 'returned');
  const financeEditable = isSuperAdmin && entry.workflowStatus === 'reviewing';
  const contentLocked = !ownerEditable && !financeEditable;
  const writeDisabled = !canWrite || contentLocked || updateMutation.isPending;


  return (
    <article className="card reimb-entry">
      <header className="reimb-entry__head">
        <span className={`badge badge--dense ${badge.tone}`.trim()}>{t(badge.key)}</span>
        <span className="badge badge--dense badge--blue">
          {t(entry.expenseType ? `reimb.expenseType.${entry.expenseType}` : 'reimb.expenseType.unconfirmed')}
        </span>
        <span className="badge badge--dense badge--outline">{t(`reimb.workflow.status.${entry.workflowStatus}`)}</span>
        <strong className="reimb-entry__amount">{formatAmountFen(entry.totalAmountFen)}</strong>
      </header>
      <p>{t('reimb.package.type')}: {t(`reimb.invoiceType.${entry.invoiceType ?? 'unknown'}`)}</p>
      {(isOwner || isSuperAdmin) && <button className="btn btn--secondary btn--sm" disabled={writeDisabled}
        onClick={() => setEditing(value => !value)}>{t('reimb.entry.editFields')}</button>}
      {editing && <ReimburseEntryForm client={client} source={source}
        canWrite={!writeDisabled} writeLockedHint={null} profile={profile} editingEntry={entry} onDone={() => setEditing(false)} />}
      <ReimburseWorkflowActions client={client} source={source} entry={entry} isOwner={isOwner} isFinance={isSuperAdmin} canWrite={canWrite} />
      {entry.approvedAmountFen !== null && <p>{t('reimb.workflow.approvedAmount')}: <strong>{formatAmountFen(entry.approvedAmountFen)}</strong></p>}
      {payout && <p role="status">{t('reimb.payout.result', { at: payout.paidAt, method: t(`reimb.payout.method.${payout.method}`), ref: payout.transactionRef ?? '—' })}</p>}

      {purchaserStatus === 'mismatch' ? (
        <p role="alert"><span className="badge badge--dense badge--red">{t('reimb.review.changePurchaser')}</span></p>
      ) : null}
      {nonMismatchReasons.length > 0 ? (
        <p role="status">
          <span className="badge badge--dense badge--amber">{t('reimb.review.check')}</span>{' '}
          {nonMismatchReasons.map((reason) => t(REVIEW_REASON_KEY[reason])).join('、')}
        </p>
      ) : null}

      <dl className="reimb-entry__meta">
        <div>
          <dt>{t('reimb.entry.invoiceNo')}</dt>
          <dd>{entry.invoiceNo ?? t('reimb.entry.unfilled')}</dd>
        </div>
        <div>
          <dt>{t('reimb.entry.seller')}</dt>
          <dd>{entry.seller ?? t('reimb.entry.unfilled')}</dd>
        </div>
        <div>
          <dt>{t('reimb.entry.invoiceDate')}</dt>
          <dd>{entry.invoiceDate ?? t('reimb.entry.unfilled')}</dd>
        </div>
        <div>
          <dt>{t('reimb.entry.purchaserName')}</dt>
          <dd>{entry.purchaserName ?? t('reimb.entry.unfilled')}</dd>
        </div>
        <div>
          <dt>{t('reimb.entry.purchaserTaxNo')}</dt>
          <dd>{entry.purchaserTaxNo ?? t('reimb.entry.unfilled')}</dd>
        </div>
        <div>
          <dt>{t('reimb.entry.filename')}</dt>
          <dd>{suggestReimburseFilename(entry)}</dd>
        </div>
      </dl>

      {entry.kind === 'goods' && entry.items.length > 0 ? (
        <table className="reimb-entry__items">
          <thead>
            <tr>
              <th>{t('reimb.create.items.name')}</th>
              <th>{t('reimb.create.items.unit')}</th>
              <th>{t('reimb.create.items.quantity')}</th>
              <th>{t('reimb.create.items.unitPrice')}</th>
              <th>{t('reimb.create.items.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {entry.items.map((item, index) => (
              <tr key={index}>
                <td>{item.name}</td>
                <td>{item.unit ?? '—'}</td>
                <td>
                  {item.quantity}
                </td>
                <td>{item.unitPriceFen === null ? '—' : formatAmountFen(item.unitPriceFen)}</td>
                <td>{formatAmountFen(item.amountFen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}


      <div className="reimb-entry__materials" role="group" aria-label={t('reimb.entry.materials')}>
        <span className="reimb-entry__materials-title">{t('reimb.entry.materials')}</span>
        <label>
          <input
            type="checkbox"
            checked={entry.materials.paymentShot}
            disabled={writeDisabled}
            onChange={(e) =>
              updateMutation.mutate({
                id: entry.id,
                patch: { expectedRevision: entry.revision,
                  materials: { ...entry.materials, paymentShot: e.target.checked },
                },
              })
            }
          />
          {t('reimb.entry.materials.paymentShot')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={entry.materials.inspection}
            disabled={writeDisabled}
            onChange={(e) =>
              updateMutation.mutate({
                id: entry.id,
                patch: { expectedRevision: entry.revision,
                  materials: { ...entry.materials, inspection: e.target.checked },
                },
              })
            }
          />
          {t('reimb.entry.materials.inspection')}
        </label>
      </div>

      {canViewEvidence ? (
        <ReimburseEvidenceSection
          client={client}
          source={source}
          entry={entry}
          isOwner={isOwner}
          locked={writeDisabled}
          defaultOpen={evidenceDefaultOpen}
        />
      ) : null}

      {isSuperAdmin ? (
        <div className="reimb-entry__batch">
          <label htmlFor={`reimb-batch-${entry.id}`}>{t('reimb.entry.batch')}</label>
          <select
            id={`reimb-batch-${entry.id}`}
            value={entry.batchId ?? ''}
            disabled={updateMutation.isPending}
            onChange={(e) =>
              updateMutation.mutate({
                id: entry.id,
                patch: { expectedRevision: entry.revision, batchId: e.target.value === '' ? null : e.target.value },
              })
            }
          >
            <option value="">{t('reimb.entry.batch.none')}</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </article>
  );
}
