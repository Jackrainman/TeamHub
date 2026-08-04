import { useMemo, useState } from 'react';
import type { HubApiClient } from '../../../api/client';
import {
  deriveReimburseStatus,
  type ReimburseBatch,
  type ReimburseEntry,
  type ReimburseEntryStatus,
} from '../../../api/schemas/reimburse';
import type { PartAction, PartType } from '../../../api/schemas/inv';
import { useUpdateReimburseEntry } from '../../../hooks/useReimburse';
import { useI18n, type TranslationKey } from '../../../i18n';
import { deriveStockedQuantities, formatAmountFen } from '../reimburse-utils';
import { StockInDialog } from './StockInDialog';

const STATUS_BADGE: Record<ReimburseEntryStatus, { tone: string; key: TranslationKey }> = {
  draft: { tone: 'badge--outline', key: 'reimb.status.draft' },
  partial: { tone: 'badge--amber', key: 'reimb.status.partial' },
  complete: { tone: 'badge--green', key: 'reimb.status.complete' },
};

/**
 * 单条报账条目卡片：发票要素 + deriveReimburseStatus 派生徽标（无手工状态机）+
 * 材料 checklist 两勾（点了即 PATCH）+ actualItemName/note 就地编辑 + 超管装批/移出。
 * 错误一律交全局 MutationCache.onError toast（checklist/装批无内联错误位，不标 silent）。
 */
export function ReimburseEntryCard({
  client,
  source,
  entry,
  batches,
  isSuperAdmin,
  canWrite,
  inventory,
}: {
  client: HubApiClient;
  source: string;
  entry: ReimburseEntry;
  batches: ReimburseBatch[];
  isSuperAdmin: boolean;
  canWrite: boolean;
  /** 库存快照（partTypes+actions）；null=库存查询未就绪 → 入库确认区整体隐藏（不显示误导性的 已入 0/Y）。 */
  inventory: { partTypes: PartType[]; actions: PartAction[] } | null;
}) {
  const { t } = useI18n();
  const updateMutation = useUpdateReimburseEntry(client, source);

  const [actualItemName, setActualItemName] = useState(entry.actualItemName ?? '');
  const [note, setNote] = useState(entry.note ?? '');
  const [stockInOpen, setStockInOpen] = useState(false);
  const [stockInDone, setStockInDone] = useState(false);

  const status = deriveReimburseStatus(entry);
  const badge = STATUS_BADGE[status];
  const writeDisabled = !canWrite || updateMutation.isPending;

  // 已入库量：唯一真相=库存动作日志（restock + reimburseEntryId + note 前缀钉行号）。
  const stocked = useMemo(
    () => (inventory ? deriveStockedQuantities(entry.id, inventory.actions) : new Map<number, number>()),
    [inventory, entry.id],
  );
  const canStockIn =
    entry.kind === 'goods' && entry.items.length > 0 && inventory !== null && canWrite;

  const metaDirty =
    actualItemName.trim() !== (entry.actualItemName ?? '') ||
    note.trim() !== (entry.note ?? '');

  function saveMeta() {
    updateMutation.mutate({
      id: entry.id,
      patch: {
        actualItemName: actualItemName.trim() === '' ? null : actualItemName.trim(),
        note: note.trim() === '' ? null : note.trim(),
      },
    });
  }

  return (
    <article className="card reimb-entry">
      <header className="reimb-entry__head">
        <span className={`badge badge--dense ${badge.tone}`.trim()}>{t(badge.key)}</span>
        <span className="badge badge--dense badge--blue">
          {t(entry.kind === 'goods' ? 'reimb.kind.goods' : 'reimb.kind.expense')}
        </span>
        <strong className="reimb-entry__amount">{formatAmountFen(entry.totalAmountFen)}</strong>
      </header>

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
                  {inventory ? (
                    <span className="reimb-entry__stocked">
                      {t('reimb.stockIn.stocked', {
                        stocked: stocked.get(index) ?? 0,
                        total: item.quantity,
                      })}
                    </span>
                  ) : null}
                </td>
                <td>{item.unitPriceFen === null ? '—' : formatAmountFen(item.unitPriceFen)}</td>
                <td>{formatAmountFen(item.amountFen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {canStockIn ? (
        <div className="reimb-entry__stockin">
          <button
            type="button"
            className="btn btn--sm btn--secondary"
            onClick={() => setStockInOpen(true)}
          >
            {t('reimb.stockIn.button')}
          </button>
          {stockInDone ? (
            <span className="form-hint" role="status">
              {t('reimb.stockIn.done')}
            </span>
          ) : null}
        </div>
      ) : null}
      {stockInOpen && inventory ? (
        <StockInDialog
          client={client}
          source={source}
          entry={entry}
          partTypes={inventory.partTypes}
          stocked={stocked}
          onClose={() => setStockInOpen(false)}
          onStockedIn={() => {
            setStockInOpen(false);
            setStockInDone(true);
          }}
        />
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
                patch: {
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
                patch: {
                  materials: { ...entry.materials, inspection: e.target.checked },
                },
              })
            }
          />
          {t('reimb.entry.materials.inspection')}
        </label>
      </div>

      <div className="reimb-entry__edit">
        <input
          value={actualItemName}
          placeholder={t('reimb.create.field.actualItemName.placeholder')}
          aria-label={t('reimb.create.field.actualItemName')}
          disabled={!canWrite}
          onChange={(e) => setActualItemName(e.target.value)}
        />
        <input
          value={note}
          placeholder={t('reimb.create.field.note.placeholder')}
          aria-label={t('reimb.create.field.note')}
          disabled={!canWrite}
          onChange={(e) => setNote(e.target.value)}
        />
        {metaDirty ? (
          <button
            type="button"
            className="btn btn--sm btn--secondary"
            disabled={updateMutation.isPending}
            onClick={saveMeta}
          >
            {t('reimb.entry.saveMeta')}
          </button>
        ) : null}
      </div>

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
                patch: { batchId: e.target.value === '' ? null : e.target.value },
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
