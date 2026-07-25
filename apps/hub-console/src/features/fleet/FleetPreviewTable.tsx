import { useState } from 'react';
import {
  RESOURCE_INIT_STATUSES,
  type FleetImportRow,
  type FleetPreviewResponse,
  type RobotTarget,
} from '@teamhub/hub-contracts';
import { useI18n, type TranslationKey } from '../../i18n';

/**
 * 车队导入预览表（FLEET-CSV-IMPORT，结构照 InvPreviewTable 刀⑪）：上传 → server 只解析不落库（preview）
 * → 本表行内编辑（名称文本 / 编号位下拉 / 赛季码文本 / 第几代数字 / 状态下拉）→ 确认后才真正创建
 * （FleetStep 把编辑行拼成 CreateResourcesBatchRequest 走既有 POST /api/resources/batch）。坏行（解析失败）
 * 红标展示、**绝不参与提交**（failed 永不并入 rows）。I0：车队事实回显，无人维度。
 *
 * 自包含（照 InvPreviewTable）：状态/编号位标签映射本地持有，不 import BootstrapGate 运行时值（避免循环依赖）；
 * 状态四档与 BootstrapGate FLEET_STATUS_KEY 同源 contracts RESOURCE_INIT_STATUSES，i18n 键复用 gate.fleet.status.*。
 */

/** 预览表编辑行：第几代用 string 承接 number input（'' = 默认 1），确认时才 parse。 */
export interface FleetEditRow {
  name: string;
  robotTarget: RobotTarget;
  season: string; // '' = 不给赛季码（displayCode 不派生赛季位）
  version: string; // '' = 默认第 1 代
  status: (typeof RESOURCE_INIT_STATUSES)[number];
}

/** 编号位三选（与 BootstrapGate FLEET_ROBOT_TARGETS 同形；本地持有免循环依赖）。 */
export const FLEET_PREVIEW_TARGETS: readonly RobotTarget[] = ['R1', 'R2', 'shared'];

/** 状态四档 i18n 键映射（与 BootstrapGate FLEET_STATUS_KEY 同键复用 gate.fleet.status.*；Record 穷举指路）。 */
export const FLEET_PREVIEW_STATUS_KEY: Record<
  (typeof RESOURCE_INIT_STATUSES)[number],
  TranslationKey
> = {
  available: 'gate.fleet.status.available',
  repair: 'gate.fleet.status.repair',
  retired: 'gate.fleet.status.retired',
  down: 'gate.fleet.status.down',
};

// ── 行编辑纯 helper（「测逻辑不测 DOM」：单测直接钉这几个）─────────────────────────────────────

/** server 解析行 → 编辑行（可空列补默认：version 缺省 '1'、status 缺省 available、season 缺省 ''）。 */
export function toFleetEditRows(rows: readonly FleetImportRow[]): FleetEditRow[] {
  return rows.map((r) => ({
    name: r.name,
    robotTarget: r.robotTarget,
    season: r.season ?? '',
    version: r.version === undefined ? '1' : String(r.version),
    status: r.status ?? 'available',
  }));
}

/** 改某行某字段（文本原样承接，校验留给 fleetEditRowsValid / 提交时 buildFleetImportRows）。 */
export function setFleetPreviewRowField<K extends keyof FleetEditRow>(
  rows: readonly FleetEditRow[],
  index: number,
  field: K,
  value: FleetEditRow[K],
): FleetEditRow[] {
  return rows.map((row, i) => (i === index ? { ...row, [field]: value } : row));
}

/** 行尾删除：整行不参与创建（区别于坏行——这是操作者主动剔除）。 */
export function removeFleetPreviewRow(rows: readonly FleetEditRow[], index: number): FleetEditRow[] {
  return rows.filter((_, i) => i !== index);
}

/** 正整数字符串判定（'' 视为合法 = 默认第 1 代；前导 + / 小数 / 负数 / 非数全拒）。 */
function isVersionText(raw: string): boolean {
  const t = raw.trim();
  if (t === '') return true; // 空 = 默认 1（buildFleetImportRows 转 undefined）
  return /^\d+$/.test(t) && Number.isSafeInteger(Number(t)) && Number(t) >= 1;
}

/** 可提交 = 至少一行，且每行：名称非空、第几代留空或正整数（编号位/状态走下拉恒合法）。 */
export function fleetEditRowsValid(rows: readonly FleetEditRow[]): boolean {
  if (rows.length === 0) return false;
  return rows.every((r) => r.name.trim().length > 0 && isVersionText(r.version));
}

/** 编辑行 → 提交行（仅 fleetEditRowsValid 通过时调用）：trim + 数值 parse；赛季/第几代 '' → undefined。 */
export function buildFleetImportRows(rows: readonly FleetEditRow[]): FleetImportRow[] {
  return rows.map((r) => ({
    name: r.name.trim(),
    robotTarget: r.robotTarget,
    season: r.season.trim() === '' ? undefined : r.season.trim(),
    version: r.version.trim() === '' ? undefined : Number(r.version.trim()),
    status: r.status,
  }));
}

export function FleetPreviewTable({
  preview,
  pending,
  onConfirm,
  onCancel,
}: {
  preview: FleetPreviewResponse;
  pending: boolean;
  onConfirm: (rows: FleetImportRow[]) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<FleetEditRow[]>(() => toFleetEditRows(preview.rows));
  // 再次上传换了新 preview → 重置编辑态（React 官方 derive-state-from-props 模式）。
  const [lastPreview, setLastPreview] = useState(preview);
  if (lastPreview !== preview) {
    setLastPreview(preview);
    setRows(toFleetEditRows(preview.rows));
  }

  const submittable = fleetEditRowsValid(rows);

  return (
    <div className="roster-preview">
      <p className="settings-desc">{t('gate.fleet.preview.hint', { count: rows.length })}</p>
      {preview.failed.length > 0 ? (
        <div className="roster-report__fail">
          <strong>{t('gate.fleet.preview.failed', { count: preview.failed.length })}</strong>
          <ul>
            {preview.failed.map((f, i) => (
              <li key={i}>
                {t('gate.fleet.preview.failedRow', { line: f.line, reason: f.reason })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {rows.length > 0 ? (
        <table className="roster-preview__table">
          <thead>
            <tr>
              <th>{t('gate.fleet.colName')}</th>
              <th>{t('gate.fleet.colTarget')}</th>
              <th>{t('gate.fleet.colSeason')}</th>
              <th>{t('gate.fleet.colVersion')}</th>
              <th>{t('gate.fleet.colStatus')}</th>
              <th aria-label={t('gate.fleet.preview.colActions')} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>
                  <input
                    value={row.name}
                    onChange={(e) =>
                      setRows(setFleetPreviewRowField(rows, i, 'name', e.target.value))
                    }
                  />
                </td>
                <td>
                  <select
                    value={row.robotTarget}
                    onChange={(e) =>
                      setRows(
                        setFleetPreviewRowField(rows, i, 'robotTarget', e.target.value as RobotTarget),
                      )
                    }
                  >
                    {FLEET_PREVIEW_TARGETS.map((rt) => (
                      <option value={rt} key={rt}>
                        {rt === 'shared' ? t('resources.robot.shared') : rt}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    value={row.season}
                    size={4}
                    onChange={(e) =>
                      setRows(setFleetPreviewRowField(rows, i, 'season', e.target.value))
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    value={row.version}
                    size={3}
                    onChange={(e) =>
                      setRows(setFleetPreviewRowField(rows, i, 'version', e.target.value))
                    }
                  />
                </td>
                <td>
                  <select
                    value={row.status}
                    onChange={(e) =>
                      setRows(
                        setFleetPreviewRowField(
                          rows,
                          i,
                          'status',
                          e.target.value as (typeof RESOURCE_INIT_STATUSES)[number],
                        ),
                      )
                    }
                  >
                    {RESOURCE_INIT_STATUSES.map((s) => (
                      <option value={s} key={s}>
                        {t(FLEET_PREVIEW_STATUS_KEY[s])}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    disabled={pending}
                    onClick={() => setRows(removeFleetPreviewRow(rows, i))}
                  >
                    {t('gate.fleet.preview.removeRow')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="settings-desc">{t('gate.fleet.preview.empty')}</p>
      )}
      <div className="roster-import__actions">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={pending || !submittable}
          onClick={() => onConfirm(buildFleetImportRows(rows))}
        >
          {pending ? t('gate.fleet.import.importing') : t('gate.fleet.preview.confirm')}
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          disabled={pending}
          onClick={onCancel}
        >
          {t('gate.fleet.preview.cancel')}
        </button>
      </div>
    </div>
  );
}
