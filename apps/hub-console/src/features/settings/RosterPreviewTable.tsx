import { useState } from 'react';
import {
  GATE_REVIEWER_DEFAULT_GRADES,
  type MemberGrade,
  type RosterImportRow,
  type RosterPreviewResponse,
} from '@teamhub/hub-contracts';
import { useI18n } from '../../i18n';
import { GRADE_KEY } from '../../shared/roster';

/**
 * 名册导入预览表（ROSTER-IMPORT-PREVIEW 刀⑦，onboarding-init-wizard-2026-07-25 §2 决策2）：
 * CSV 纯文本做不了下拉——上传 → server 只解析不落库（preview）→ 本表行内编辑（年级下拉七档 /
 * 组 input+datalist 预填现有叶子组名，可手打新组名 = 导入时自动建组）→ 确认后才真正导入。
 * 坏行（解析失败）红标展示、**绝不参与提交**（failed 永不并入 rows）。设置页名册区与初始化向导
 * RosterStep 两处共用。I0：全是回显给操作者本人的名单事实，无聚合统计。
 */

/** 年级下拉选项（七档有序，与刀⑥ WHO_GRADE_OPTIONS 同序；不含 legacy graduate——编辑不产生旧档）。 */
export const ROSTER_PREVIEW_GRADE_OPTIONS: readonly MemberGrade[] = [
  'freshman',
  'sophomore',
  'junior',
  'senior',
  'grad1',
  'grad2',
  'grad3',
];

// ── 行编辑纯 helper（「测逻辑不测 DOM」：单测直接钉这三个）─────────────────────────────────────

/** 改年级 → 验收人标记按年级规则重派生（与 server 解析同源消费 GATE_REVIEWER_DEFAULT_GRADES）。 */
export function setPreviewRowGrade(
  rows: readonly RosterImportRow[],
  index: number,
  grade: MemberGrade,
): RosterImportRow[] {
  const reviewer = GATE_REVIEWER_DEFAULT_GRADES.has(grade);
  return rows.map((row, i) =>
    i === index ? { ...row, grade, gateReviewer: reviewer, gateReviewerAuto: reviewer } : row,
  );
}

/** 改组名（datalist 预填叶子组；手打新名 = 导入时自动建组，语义与 CSV 路径一致）。 */
export function setPreviewRowGroup(
  rows: readonly RosterImportRow[],
  index: number,
  groupName: string,
): RosterImportRow[] {
  return rows.map((row, i) => (i === index ? { ...row, groupName } : row));
}

/** 行尾删除：整行不参与导入（区别于坏行——这是操作者主动剔除）。 */
export function removePreviewRow(
  rows: readonly RosterImportRow[],
  index: number,
): RosterImportRow[] {
  return rows.filter((_, i) => i !== index);
}

export function RosterPreviewTable({
  preview,
  groupNames,
  pending,
  onConfirm,
  onCancel,
}: {
  preview: RosterPreviewResponse;
  /** 组候选 = 现有叶子组名（datalist 预填；可手打新组名）。 */
  groupNames: readonly string[];
  pending: boolean;
  onConfirm: (rows: RosterImportRow[]) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<RosterImportRow[]>(preview.rows);
  // 再次上传换了新 preview → 重置编辑态（React 官方 derive-state-from-props 模式）。
  const [lastPreview, setLastPreview] = useState(preview);
  if (lastPreview !== preview) {
    setLastPreview(preview);
    setRows(preview.rows);
  }

  return (
    <div className="roster-preview">
      <p className="settings-desc">
        {t('settings.roster.preview.hint', { count: rows.length })}
      </p>
      {preview.failed.length > 0 ? (
        <div className="roster-report__fail">
          <strong>
            {t('settings.roster.preview.failed', { count: preview.failed.length })}
          </strong>
          <ul>
            {preview.failed.map((f, i) => (
              <li key={i}>
                {t('settings.roster.report.failedRow', { line: f.line, reason: f.reason })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {rows.length > 0 ? (
        <table className="roster-preview__table">
          <thead>
            <tr>
              <th>{t('settings.roster.preview.colName')}</th>
              <th>{t('settings.roster.preview.colGrade')}</th>
              <th>{t('settings.roster.preview.colGroup')}</th>
              <th aria-label={t('settings.roster.preview.colActions')} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              // legacy 档（旧 CSV 写「研究生」→ graduate）不在七档选项内：为该行补一个只读可选项，
              // 不触碰即原样提交（schema 仍兼容），触碰即换七档之一。
              const options = (ROSTER_PREVIEW_GRADE_OPTIONS as readonly string[]).includes(
                row.grade,
              )
                ? ROSTER_PREVIEW_GRADE_OPTIONS
                : [...ROSTER_PREVIEW_GRADE_OPTIONS, row.grade];
              return (
                <tr key={i}>
                  <td>{row.displayName}</td>
                  <td>
                    <select
                      value={row.grade}
                      onChange={(e) =>
                        setRows(setPreviewRowGrade(rows, i, e.target.value as MemberGrade))
                      }
                    >
                      {options.map((g) => (
                        <option value={g} key={g}>
                          {t(GRADE_KEY[g])}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      list="roster-preview-groups"
                      value={row.groupName}
                      onChange={(e) => setRows(setPreviewRowGroup(rows, i, e.target.value))}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      disabled={pending}
                      onClick={() => setRows(removePreviewRow(rows, i))}
                    >
                      {t('settings.roster.preview.removeRow')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="settings-desc">{t('settings.roster.preview.empty')}</p>
      )}
      <datalist id="roster-preview-groups">
        {groupNames.map((name) => (
          <option value={name} key={name} />
        ))}
      </datalist>
      <div className="roster-import__actions">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={pending || rows.length === 0}
          onClick={() => onConfirm(rows)}
        >
          {pending ? t('settings.roster.importing') : t('settings.roster.preview.confirm')}
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          disabled={pending}
          onClick={onCancel}
        >
          {t('settings.roster.preview.cancel')}
        </button>
      </div>
    </div>
  );
}
