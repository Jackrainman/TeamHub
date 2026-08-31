import { useMemo } from 'react';
import type { HubApiClient } from '../../api/client';
import { useResources, useResourceSessions } from '../schedule/hooks';
import { useTasks, useGroups } from '../../features/pm/hooks';
import { deriveLeafGroups } from '@teamhub/hub-contracts';
import { useI18n } from '../../i18n';
import { FormBanner } from '../../components/FormBanner';
import { isoPrevDay } from './date-utils';
import { PlanRow } from './sub/PlanRow';
import { useTodayPlanController } from './today-plan-controller';

/**
 * 今日计划表格（D-082 §5 空状态路由 + §6.D1 复用优先）：SchedulePage 在当日 session 数=0 时落到这页。
 * 三列录入（车固定 / 负责组下拉 / 今日任务组合框）+ 可选备注，右上「继续昨天」「使用预设」两键一铺，
 * 【确认】原子批量落盘（POST /api/resource-sessions/batch）后由父层切到泳道图。
 * 行编辑与确认编排已拆到 today-plan-controller.ts（SPLIT-1-TAIL），本文件是纯视图 + 查询装配。
 *
 * I0 反监视：整页只到组级——车 / 组 / 任务标题 / 备注，结构上不含 memberId；新建 session 恒
 * invitedMemberIds=[]（rowsToSessionDrafts 钉死）。
 */
export function TodayPlanTable({
  client,
  windowLabel,
  onConfirmed,
}: {
  client: HubApiClient;
  windowLabel: string;
  onConfirmed: () => void;
}) {
  const { t } = useI18n();

  const resourcesQuery = useResources(client, 'todayPlan');
  const tasksQuery = useTasks(client, 'todayPlan');
  const groupsQuery = useGroups(client, 'todayPlan');
  const sessionsQuery = useResourceSessions(client);

  const resources = useMemo(() => resourcesQuery.data?.resources ?? [], [resourcesQuery.data]);
  const tasks = useMemo(() => tasksQuery.data?.tasks ?? [], [tasksQuery.data]);
  const resourcesById = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);

  // 「负责组」下拉候选：组 id -> 组名，来源=GET /api/groups 全量组列表**仅叶子组**
  // （叶子组才可挂任务/进 lineup；父组是汇报视角、永远无成员，进下拉只会误导）
  // + 各车预设 lineup 里出现过的组（兜底：预设引用了被滤掉的组时，选中值仍要能显示）。
  const groupOptions = useMemo(() => {
    const groups = groupsQuery.data?.groups ?? [];
    const leaf = new Set(deriveLeafGroups([...groups]));
    const map = new Map<string, string>();
    for (const g of groups) if (leaf.has(g.id)) map.set(g.id, g.name);
    for (const r of resources) {
      for (const entry of r.defaultPreset?.lineup ?? []) {
        if (!map.has(entry.groupId)) map.set(entry.groupId, entry.groupId);
      }
    }
    return map;
  }, [groupsQuery.data, resources]);

  const prevIso = isoPrevDay(windowLabel);
  const prevCount = useMemo(
    () => (sessionsQuery.data?.sessions ?? []).filter((s) => s.windowLabel === prevIso).length,
    [sessionsQuery.data, prevIso],
  );

  const {
    rows,
    banner,
    setBanner,
    carrying,
    confirming,
    updateRow,
    handleAddRow,
    handleRemoveRow,
    handleUsePreset,
    handleCarryOver,
    handleConfirm,
  } = useTodayPlanController({
    client,
    windowLabel,
    resources,
    resourcesReady: resourcesQuery.data != null,
    tasks,
    prevSessionsCount: prevCount,
    onConfirmed,
  });

  const rowGroupOptions = useMemo(() => {
    const map = new Map(groupOptions);
    for (const row of rows) {
      if (row.groupId && !map.has(row.groupId)) map.set(row.groupId, row.groupId);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }, [groupOptions, rows]);

  if (resourcesQuery.isLoading) {
    return (
      <div className="state-band" role="status" aria-live="polite">
        {t('schedule.table.loading')}
      </div>
    );
  }
  if (resourcesQuery.error || !resourcesQuery.data) {
    return (
      <div className="state-band state-band-error" role="alert">
        {t('schedule.table.unavailable')}
      </div>
    );
  }

  return (
    <div className="today-plan-table-wrap">
      <div className="today-plan-table__toolbar">
        <p className="today-plan-table__hint">{t('schedule.table.hint')}</p>
        <div className="today-plan-table__actions">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={prevCount === 0 || carrying}
            title={prevCount === 0 ? t('schedule.table.carryDisabledHint') : undefined}
            onClick={() => {
              void handleCarryOver();
            }}
          >
            {carrying ? t('schedule.relay.addSubmitting') : t('schedule.table.carryOver')}
          </button>
          <button type="button" className="btn btn--secondary" onClick={handleUsePreset}>
            {t('schedule.table.usePreset')}
          </button>
        </div>
      </div>

      {banner ? (
        <FormBanner
          kind={banner.kind}
          message={banner.text}
          role={banner.kind === 'err' ? 'alert' : 'status'}
          onClick={() => setBanner(null)}
        />
      ) : null}

      {resources.length === 0 ? (
        <p className="form-hint">{t('schedule.table.noResources')}</p>
      ) : (
        <div className="today-plan-table-scroll">
          <table className="today-plan-table">
            <thead>
              <tr>
                <th>{t('schedule.table.colResource')}</th>
                <th>{t('schedule.table.colGroup')}</th>
                <th>{t('schedule.table.colTask')}</th>
                <th>{t('schedule.table.colNote')}</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <PlanRow
                  key={row.key}
                  row={row}
                  resource={resourcesById.get(row.resourceId)}
                  tasks={tasks}
                  rowGroupOptions={rowGroupOptions}
                  onUpdate={updateRow}
                  onAdd={handleAddRow}
                  onRemove={handleRemoveRow}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="today-plan-table__footer">
        <button
          type="button"
          className="btn btn--primary"
          disabled={confirming || resources.length === 0}
          onClick={() => {
            void handleConfirm();
          }}
        >
          {confirming ? t('schedule.table.confirming') : t('schedule.table.confirm')}
        </button>
      </div>
    </div>
  );
}
