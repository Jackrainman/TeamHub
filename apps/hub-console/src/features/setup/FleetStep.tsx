import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  RESOURCE_INIT_STATUSES,
  type FleetImportRow,
  type FleetPreviewResponse,
  type RobotTarget,
  type SharedResource,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useResources } from '../../hooks/useSchedule';
import { useI18n } from '../../i18n';
import { humanizeFormError, seasonYearOptions } from '../../utils';
import { FleetPreviewTable } from '../fleet/FleetPreviewTable';
import {
  buildFleetBatchRequest,
  FLEET_ROBOT_TARGETS,
  FLEET_STATUS_KEY,
  fleetImportRowsToBatch,
  fleetRowsSubmittable,
  newFleetRow,
  suggestFleetSeasonCode,
  type FleetInitStatus,
  type FleetRow,
} from './setup-utils';

// ⑤ 录入车队（FLEET-BATCH-INIT 刀⑩）：一次录全部车——表格行（名称 / 编号位 R1·R2·共用 /
// 赛季（默认按 suggestSeason 派生两位赛季码预填、可改可留空）/ 第几代（默认 1）/ 状态四档
// 能用·在修·退役·停用），行可增删；空表直接「跳过」；提交走 POST /api/resources/batch
// （zod 全量先验、任一坏整批不落）→ 回显创建结果（displayCode 列表）→「下一步」。
// 已有车（resources 非空）时显示「已有 N 台车」可直接下一步（照 RosterStep 名册已就绪先例）。
export function FleetStep({
  client,
  onNext,
}: {
  client: HubApiClient;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resourcesQuery = useResources(client, 'bootstrap-gate');
  const existingCount = resourcesQuery.data?.resources.length ?? 0;
  const [rows, setRows] = useState<FleetRow[]>(() => [
    newFleetRow(suggestFleetSeasonCode(new Date())),
  ]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [preview, setPreview] = useState<FleetPreviewResponse | null>(null);
  const [created, setCreated] = useState<readonly SharedResource[] | null>(null);

  const submittable = fleetRowsSubmittable(rows);

  function patchRow(idx: number, patch: Partial<FleetRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  // CSV 主路径①：上传 → preview 只解析不落库 → FleetPreviewTable 行内编辑。
  async function upload(file: File) {
    setPending(true);
    setError(null);
    try {
      setPreview(await client.previewFleet(file));
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  // CSV 主路径②：确认预览行 → 拼批量请求体走既有 POST /api/resources/batch（不新增落库端点）。
  async function confirmImport(importRows: FleetImportRow[]) {
    setPending(true);
    setError(null);
    try {
      const res = await client.createResourcesBatch(fleetImportRowsToBatch(importRows));
      setCreated(res.resources);
      setPreview(null);
      void queryClient.invalidateQueries({ queryKey: ['resources'] });
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  // 手动兜底：逐台表格行 → 同一批量端点。
  async function submit() {
    if (!submittable) return;
    setPending(true);
    setError(null);
    try {
      const res = await client.createResourcesBatch(buildFleetBatchRequest(rows));
      setCreated(res.resources);
      void queryClient.invalidateQueries({ queryKey: ['resources'] });
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="setup-card setup-card--primary">
      <h2 className="setup-card__title">{t('gate.step.fleet')}</h2>
      <p className="setup-card__desc">{t('gate.fleet.desc')}</p>
      {existingCount > 0 ? (
        <p className="settings-desc">{t('gate.fleet.hasFleet', { count: existingCount })}</p>
      ) : null}
      {created ? (
        <>
          <p className="settings-desc">{t('gate.fleet.created')}</p>
          <ul className="settings-desc">
            {created.map((r) => (
              <li key={r.id}>{r.displayCode ?? r.name}</li>
            ))}
          </ul>
          <button type="button" className="btn btn--primary" onClick={onNext}>
            {t('gate.fleet.next')}
          </button>
        </>
      ) : (
        <>
          {/* CSV 导入（主路径，照库存步范式）：模板下载 + 上传 → 预览表行内编辑 → 确认创建。 */}
          <p className="settings-desc">{t('gate.fleet.import.desc')}</p>
          <div className="roster-import__actions">
            <a className="btn btn--secondary btn--sm" href={client.fleetTemplateUrl()} download>
              {t('gate.fleet.import.downloadTemplate')}
            </a>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
            >
              {pending && !preview
                ? t('gate.fleet.import.importing')
                : t('gate.fleet.import.upload')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = '';
              }}
            />
          </div>
          {error ? (
            <p className="form-hint form-hint--warn">
              {humanizeFormError(error, t, 'gate.fleet.import.error')}
            </p>
          ) : null}
          {preview ? (
            <FleetPreviewTable
              preview={preview}
              pending={pending}
              onConfirm={(importRows) => void confirmImport(importRows)}
              onCancel={() => setPreview(null)}
            />
          ) : null}
          {/* 手动录入（兜底）：折叠区，逐台表格行，走同一批量端点。 */}
          <details className="setup-card__advanced">
            <summary>{t('gate.fleet.manual.title')}</summary>
            <table className="resources-table">
              <thead>
                <tr>
                  <th>{t('gate.fleet.colName')}</th>
                  <th>{t('gate.fleet.colTarget')}</th>
                  <th>{t('gate.fleet.colSeason')}</th>
                  <th>{t('gate.fleet.colVersion')}</th>
                  <th>{t('gate.fleet.colStatus')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx}>
                    <td>
                      <input
                        value={row.name}
                        onChange={(e) => patchRow(idx, { name: e.target.value })}
                        placeholder={t('gate.fleet.namePlaceholder')}
                      />
                    </td>
                    <td>
                      <select
                        value={row.robotTarget}
                        onChange={(e) =>
                          patchRow(idx, { robotTarget: e.target.value as RobotTarget })
                        }
                      >
                        {FLEET_ROBOT_TARGETS.map((rt) => (
                          <option value={rt} key={rt}>
                            {rt === 'shared' ? t('resources.robot.shared') : rt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={row.season}
                        onChange={(e) => patchRow(idx, { season: e.target.value })}
                      >
                        <option value="">{t('gate.fleet.seasonNone')}</option>
                        {seasonYearOptions(new Date()).years.map((y) => {
                          const code = String(y).slice(-2);
                          return (
                            <option value={code} key={code}>
                              {code}
                            </option>
                          );
                        })}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={row.version}
                        onChange={(e) => patchRow(idx, { version: e.target.value })}
                        size={3}
                      />
                    </td>
                    <td>
                      <select
                        value={row.status}
                        onChange={(e) =>
                          patchRow(idx, { status: e.target.value as FleetInitStatus })
                        }
                      >
                        {RESOURCE_INIT_STATUSES.map((s) => (
                          <option value={s} key={s}>
                            {t(FLEET_STATUS_KEY[s])}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label={t('gate.fleet.removeRow')}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="roster-import__actions">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() =>
                  setRows((prev) => [...prev, newFleetRow(suggestFleetSeasonCode(new Date()))])
                }
              >
                {t('gate.fleet.addRow')}
              </button>
            </div>
            {submittable ? (
              <button
                type="button"
                className="btn btn--primary"
                disabled={pending}
                onClick={() => void submit()}
              >
                {pending ? t('gate.fleet.submitting') : t('gate.fleet.submit')}
              </button>
            ) : null}
          </details>
          <button type="button" className="btn btn--primary" onClick={onNext}>
            {t('gate.fleet.skip')}
          </button>
        </>
      )}
    </section>
  );
}
