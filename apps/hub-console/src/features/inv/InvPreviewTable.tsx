import { useState } from 'react';
import type {
  InventoryImportReport,
  InventoryImportRow,
  InventoryPreviewResponse,
} from '@teamhub/hub-contracts';
import { useI18n } from '../../i18n';

/**
 * 库存导入预览表（INV-BULK-IMPORT 刀⑪，结构照 RosterPreviewTable 刀⑦）：上传 → server 只解析
 * 不落库（preview）→ 本表行内编辑（件号只读 = 幂等匹配键；名称/类别/单位/总数/低储阈值文本编辑）
 * → 确认后才真正导入。坏行（解析失败）红标展示、**绝不参与提交**（failed 永不并入 rows）。
 * 库存页 InvPage 批量导入区与初始化向导 InventoryStep 两处共用。I0：库存事实回显，无人维度。
 */

/** 预览表编辑行：总数/低储阈值用 string 承接文本编辑（可留空中间态），确认时才 parse 成 number。 */
export interface InvEditRow {
  partNumber: string;
  name: string;
  category: string;
  unit: string;
  totalQuantity: string;
  lowStockThreshold: string; // '' = 未填（新建钉 0 / 更新保留既有）
  line?: number;
}

// ── 行编辑纯 helper（「测逻辑不测 DOM」：单测直接钉这几个）─────────────────────────────────────

/** server 解析行 → 编辑行（数值转字符串承接 input）。 */
export function toInvEditRows(rows: readonly InventoryImportRow[]): InvEditRow[] {
  return rows.map((r) => ({
    partNumber: r.partNumber,
    name: r.name,
    category: r.category,
    unit: r.unit,
    totalQuantity: String(r.totalQuantity),
    lowStockThreshold: r.lowStockThreshold === undefined ? '' : String(r.lowStockThreshold),
    line: r.line,
  }));
}

/** 改某行某字段（文本原样承接，校验留给 invEditRowsValid / 提交时 buildInvImportRows）。 */
export function setInvPreviewRowField(
  rows: readonly InvEditRow[],
  index: number,
  field: keyof InvEditRow,
  value: string,
): InvEditRow[] {
  return rows.map((row, i) => (i === index ? { ...row, [field]: value } : row));
}

/** 行尾删除：整行不参与导入（区别于坏行——这是操作者主动剔除）。 */
export function removeInvPreviewRow(
  rows: readonly InvEditRow[],
  index: number,
): InvEditRow[] {
  return rows.filter((_, i) => i !== index);
}

/** 非负整数字符串判定（'' 不算；前导 + / 小数 / 负数 / 非数全拒）。 */
function isCountText(raw: string): boolean {
  if (!/^\d+$/.test(raw.trim())) return false;
  return Number.isSafeInteger(Number(raw.trim()));
}

/** 可提交 = 至少一行，且每行：件号/名称/类别/单位非空、总数是非负整数、阈值留空或是非负整数。 */
export function invEditRowsValid(rows: readonly InvEditRow[]): boolean {
  if (rows.length === 0) return false;
  return rows.every(
    (r) =>
      r.partNumber.trim().length > 0 &&
      r.name.trim().length > 0 &&
      r.category.trim().length > 0 &&
      r.unit.trim().length > 0 &&
      isCountText(r.totalQuantity) &&
      (r.lowStockThreshold.trim() === '' || isCountText(r.lowStockThreshold)),
  );
}

/** 编辑行 → 提交行（仅 invEditRowsValid 通过时调用）：trim + 数值 parse；阈值 '' → undefined。 */
export function buildInvImportRows(rows: readonly InvEditRow[]): InventoryImportRow[] {
  return rows.map((r) => ({
    partNumber: r.partNumber.trim(),
    name: r.name.trim(),
    category: r.category.trim(),
    unit: r.unit.trim(),
    totalQuantity: Number(r.totalQuantity.trim()),
    lowStockThreshold:
      r.lowStockThreshold.trim() === '' ? undefined : Number(r.lowStockThreshold.trim()),
    line: r.line,
  }));
}

export function InvPreviewTable({
  preview,
  pending,
  onConfirm,
  onCancel,
}: {
  preview: InventoryPreviewResponse;
  pending: boolean;
  onConfirm: (rows: InventoryImportRow[]) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<InvEditRow[]>(() => toInvEditRows(preview.rows));
  // 再次上传换了新 preview → 重置编辑态（React 官方 derive-state-from-props 模式）。
  const [lastPreview, setLastPreview] = useState(preview);
  if (lastPreview !== preview) {
    setLastPreview(preview);
    setRows(toInvEditRows(preview.rows));
  }

  const submittable = invEditRowsValid(rows);

  return (
    <div className="roster-preview">
      <p className="settings-desc">{t('inv.import.preview.hint', { count: rows.length })}</p>
      {preview.failed.length > 0 ? (
        <div className="roster-report__fail">
          <strong>{t('inv.import.preview.failed', { count: preview.failed.length })}</strong>
          <ul>
            {preview.failed.map((f, i) => (
              <li key={i}>
                {t('inv.import.preview.failedRow', { line: f.line, reason: f.reason })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {rows.length > 0 ? (
        <table className="roster-preview__table">
          <thead>
            <tr>
              <th>{t('inv.import.preview.colPartNumber')}</th>
              <th>{t('inv.import.preview.colName')}</th>
              <th>{t('inv.import.preview.colCategory')}</th>
              <th>{t('inv.import.preview.colUnit')}</th>
              <th>{t('inv.import.preview.colTotal')}</th>
              <th>{t('inv.import.preview.colThreshold')}</th>
              <th aria-label={t('inv.import.preview.colActions')} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>{row.partNumber}</td>
                <td>
                  <input
                    value={row.name}
                    onChange={(e) =>
                      setRows(setInvPreviewRowField(rows, i, 'name', e.target.value))
                    }
                  />
                </td>
                <td>
                  <input
                    value={row.category}
                    onChange={(e) =>
                      setRows(setInvPreviewRowField(rows, i, 'category', e.target.value))
                    }
                  />
                </td>
                <td>
                  <input
                    value={row.unit}
                    size={4}
                    onChange={(e) =>
                      setRows(setInvPreviewRowField(rows, i, 'unit', e.target.value))
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    value={row.totalQuantity}
                    size={6}
                    onChange={(e) =>
                      setRows(setInvPreviewRowField(rows, i, 'totalQuantity', e.target.value))
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    value={row.lowStockThreshold}
                    size={6}
                    onChange={(e) =>
                      setRows(setInvPreviewRowField(rows, i, 'lowStockThreshold', e.target.value))
                    }
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    disabled={pending}
                    onClick={() => setRows(removeInvPreviewRow(rows, i))}
                  >
                    {t('inv.import.preview.removeRow')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="settings-desc">{t('inv.import.preview.empty')}</p>
      )}
      <div className="roster-import__actions">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={pending || !submittable}
          onClick={() => onConfirm(buildInvImportRows(rows))}
        >
          {pending ? t('inv.import.importing') : t('inv.import.preview.confirm')}
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          disabled={pending}
          onClick={onCancel}
        >
          {t('inv.import.preview.cancel')}
        </button>
      </div>
    </div>
  );
}

/**
 * 库存导入报告渲染（刀⑪ 三段，段从简不照搬名册六段）：failed（坏行=行号+原因，醒目告警底）+
 * created/updated（件号）。库里有但表里没有的零件不动（绝不删），故无 missingFromSheet 段。
 * I0：库存事实回显给操作者本人，无人维度。
 */
export function InvReportView({ report }: { report: InventoryImportReport }) {
  const { t } = useI18n();
  const segs = [
    { key: 'created', label: t('inv.import.report.created'), names: report.created },
    { key: 'updated', label: t('inv.import.report.updated'), names: report.updated },
  ];
  const anyContent = report.failed.length > 0 || segs.some((s) => s.names.length > 0);

  return (
    <div className="roster-report" role="status" aria-live="polite">
      <p className="roster-report__title">{t('inv.import.report.title')}</p>
      {report.failed.length > 0 ? (
        <div className="roster-report__fail">
          <strong>{t('inv.import.report.failed', { count: report.failed.length })}</strong>
          <ul>
            {report.failed.map((f, i) => (
              <li key={i}>
                {t('inv.import.preview.failedRow', { line: f.line, reason: f.reason })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {segs.map((s) =>
        s.names.length > 0 ? (
          <p className="settings-desc" key={s.key}>
            <strong>{s.label}：</strong>
            {s.names.join('、')}
          </p>
        ) : null,
      )}
      {!anyContent ? <p className="settings-desc">{t('inv.import.report.empty')}</p> : null}
    </div>
  );
}
