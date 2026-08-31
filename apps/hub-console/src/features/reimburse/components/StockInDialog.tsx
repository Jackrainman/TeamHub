import { useState } from 'react';
import type { ReimburseSegment } from '../api';
import type {
  ReimburseEntry,
  StockInLine,
  StockInPartTypeCandidate,
} from '@teamhub/hub-contracts';
import {
  ROBOTICS_PART_CATEGORY_VALUES,
} from '@teamhub/hub-contracts';
import { useStockInEntry } from '../hooks';
import { useI18n, type TranslationKey } from '../../../i18n';
import { SideDrawer } from '../../../components/SideDrawer';
import { Select } from '../../../components/Select';
import { suggestPartTypeMatch } from '../../../shared/lib/part-match';

/** 目标下拉里「新建件」的哨兵值（partTypeId 不可能撞：store 钉 parttype-*）。 */
const NEW_PART = '__new__';

/** 新建件的类目下拉：机器人租户已知值走 inv.catopt.* 文案，未知值原样显示（开放词汇，见 contracts）。 */
const CATEGORY_OPTION_KEY: Record<string, TranslationKey> = {
  motor: 'inv.catopt.motor',
  esc: 'inv.catopt.esc',
  controller: 'inv.catopt.controller',
  mechanical: 'inv.catopt.mechanical',
  electronic: 'inv.catopt.electronic',
  other: 'inv.catopt.other',
};

interface StockInLineDraft {
  quantity: string; // 输入框字符串，默认=剩余可入量；空串/0=本行不入库
  target: string; // PartType.id 或 NEW_PART
  partNumber: string;
  name: string;
  category: string;
  unit: string;
}

function initialLines(entry: ReimburseEntry, partTypes: StockInPartTypeCandidate[], stocked: Map<number, number>): StockInLineDraft[] {
  return entry.items.map((item, index) => {
    const remaining = item.quantity - (stocked.get(index) ?? 0);
    const suggestions = suggestPartTypeMatch(item.name, partTypes);
    return {
      quantity: String(Math.max(remaining, 0)),
      target: suggestions[0]?.id ?? NEW_PART,
      // 新建件预填：件号/名称=品名，单位=明细行单位（缺省「个」，照 CreatePartTypeForm 现状）。
      partNumber: item.name,
      name: item.name,
      category: 'mechanical',
      unit: item.unit ?? '个',
    };
  });
}

/**
 * 入库确认抽屉（REIMBURSE-PROC 阶段 5）：逐明细行确认数量与去向——入既有件
 * （suggestPartTypeMatch 建议默认候选，可改选任何件）或新建件（预填件号/名称=品名）。
 * 剩余可入量 = 条目行 quantity − 服务端窄入库上下文给出的 stockedLines；
 * 剩余量=0 的行禁选。先全量本地校验再提交；服务端超量整批 400 托底（防重复入库双保险）。
 * 提交错误交全局 MutationCache.onError toast；成功后由父组件关抽屉 + 内联提示。
 */
export function StockInDialog({
  client,
  source,
  entry,
  partTypes,
  stocked,
  onClose,
  onStockedIn,
}: {
  client: ReimburseSegment;
  source: string;
  entry: ReimburseEntry;
  partTypes: StockInPartTypeCandidate[];
  stocked: Map<number, number>;
  onClose: () => void;
  onStockedIn: () => void;
}) {
  const { t } = useI18n();
  const [lines, setLines] = useState<StockInLineDraft[]>(() =>
    initialLines(entry, partTypes, stocked),
  );
  const mutation = useStockInEntry(client, source, { onSuccess: onStockedIn });

  const patchLine = (index: number, patch: Partial<StockInLineDraft>) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  /** 行 → 提交行 | 'skip'（不入库）| 'invalid'（填了但非法，挡提交）。 */
  function resolveLine(index: number): StockInLine | 'skip' | 'invalid' {
    const item = entry.items[index];
    const draft = lines[index];
    const remaining = item.quantity - (stocked.get(index) ?? 0);
    if (remaining <= 0 || draft.quantity.trim() === '') {
      return 'skip';
    }
    const quantity = Number(draft.quantity.trim());
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > remaining) {
      return 'invalid';
    }
    if (quantity === 0) {
      return 'skip';
    }
    if (draft.target === NEW_PART) {
      const newPart = {
        partNumber: draft.partNumber.trim(),
        name: draft.name.trim(),
        category: draft.category,
        unit: draft.unit.trim(),
      };
      if (!newPart.partNumber || !newPart.name || !newPart.category || !newPart.unit) {
        return 'invalid';
      }
      return { itemIndex: index, quantity, target: { newPart } };
    }
    return { itemIndex: index, quantity, target: { partTypeId: draft.target } };
  }

  const resolved = entry.items.map((_, index) => resolveLine(index));
  const submitLines = resolved.filter((r): r is StockInLine => typeof r === 'object');
  const canSubmit =
    !mutation.isPending && submitLines.length > 0 && !resolved.includes('invalid');

  function submit() {
    if (!canSubmit) return;
    mutation.mutate({ id: entry.id, req: { lines: submitLines } });
  }

  return (
    <SideDrawer open onClose={onClose} title={t('reimb.stockIn.title')}>
      <p className="reimb-stockin__hint">{t('reimb.stockIn.hint')}</p>
      <div className="reimb-stockin">
        {entry.items.map((item, index) => {
          const done = stocked.get(index) ?? 0;
          const remaining = item.quantity - done;
          const draft = lines[index];
          // 目标下拉：匹配候选置顶，其余件跟后，「新建件」兜底——建议只是默认值，可改选任何件。
          const suggestions = suggestPartTypeMatch(item.name, partTypes);
          const suggestedIds = new Set(suggestions.map((p) => p.id));
          const targetOptions = [
            ...suggestions.map((p) => p.id),
            ...partTypes.filter((p) => !suggestedIds.has(p.id)).map((p) => p.id),
            NEW_PART,
          ];
          const partLabel = (id: string) => {
            const p = partTypes.find((pt) => pt.id === id);
            return p ? `${p.partNumber} · ${p.name}` : id;
          };
          return (
            <div
              key={index}
              className={
                remaining <= 0 ? 'reimb-stockin__row reimb-stockin__row--full' : 'reimb-stockin__row'
              }
            >
              <header className="reimb-stockin__row-head">
                <strong>{item.name}</strong>
                <span className="reimb-stockin__meta">
                  {t('reimb.stockIn.stocked', { stocked: done, total: item.quantity })}
                </span>
              </header>
              {remaining <= 0 ? (
                <span className="badge badge--dense badge--green">{t('reimb.stockIn.full')}</span>
              ) : (
                <>
                  <div className="reimb-stockin__fields">
                    <label>
                      <span>{t('reimb.stockIn.field.quantity')}</span>
                      <input
                        type="number"
                        min={0}
                        max={remaining}
                        value={draft.quantity}
                        onChange={(e) => patchLine(index, { quantity: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>{t('reimb.stockIn.field.target')}</span>
                      <Select
                        value={draft.target}
                        onChange={(v) => patchLine(index, { target: v })}
                        options={targetOptions}
                        renderOption={(id) =>
                          id === NEW_PART ? t('reimb.stockIn.target.new') : partLabel(id)
                        }
                      />
                    </label>
                  </div>
                  {draft.target === NEW_PART ? (
                    <div className="reimb-stockin__fields">
                      <label>
                        <span>{t('inv.create.field.partNumber')}</span>
                        <input
                          value={draft.partNumber}
                          onChange={(e) => patchLine(index, { partNumber: e.target.value })}
                        />
                      </label>
                      <label>
                        <span>{t('inv.create.field.name')}</span>
                        <input
                          value={draft.name}
                          onChange={(e) => patchLine(index, { name: e.target.value })}
                        />
                      </label>
                      <label>
                        <span>{t('inv.create.field.category')}</span>
                        <Select
                          value={draft.category}
                          onChange={(v) => patchLine(index, { category: v })}
                          options={ROBOTICS_PART_CATEGORY_VALUES}
                          renderOption={(c) =>
                            CATEGORY_OPTION_KEY[c] ? t(CATEGORY_OPTION_KEY[c]) : c
                          }
                        />
                      </label>
                      <label>
                        <span>{t('inv.create.field.unit')}</span>
                        <input
                          value={draft.unit}
                          onChange={(e) => patchLine(index, { unit: e.target.value })}
                        />
                      </label>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="reimb-stockin__actions">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={!canSubmit}
          onClick={submit}
        >
          {mutation.isPending ? t('reimb.stockIn.submitting') : t('reimb.stockIn.submit')}
        </button>
      </div>
    </SideDrawer>
  );
}
