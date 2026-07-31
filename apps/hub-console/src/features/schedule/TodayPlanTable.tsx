import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import type { HubApiClient } from '../../api/client';
import { useResources, useResourceSessions } from '../../hooks/useSchedule';
import { useTasks } from '../../hooks/useTasks';
import { useGroups } from '../../hooks/useRoster';
import type { CreateTaskRequest } from '../../api/schemas/pm';
import { deriveTodayPlanFromPresets } from '../../api/schemas/schedule';
import { useI18n } from '../../i18n';
import { errorDetail } from '../../utils';
import { FormBanner } from '../../components/FormBanner';
import { Combobox } from '../../components/Combobox';
import { isoPrevDay } from './date-utils';
import { buildCarryOverPlan } from './carry-over';
import {
  buildBaselineRows,
  candidateTasksForResource,
  draftsToRows,
  isBlankRow,
  matchTaskByTitle,
  rowsToSessionDrafts,
  type DraftRow,
} from './today-plan';

/**
 * 今日计划表格（D-082 §5 空状态路由 + §6.D1 复用优先）：SchedulePage 在当日 session 数=0 时落到这页。
 * 三列录入（车固定 / 负责组下拉 / 今日任务组合框）+ 可选备注，右上「继续昨天」「使用预设」两键一铺，
 * 【确认】原子批量落盘（POST /api/resource-sessions/batch）后由父层切到泳道图。
 *
 * 复用优先（§6.D1 优化）：今日任务组合框候选=该车现有任务（robotTarget 对齐 + shared 通用任务）按标题
 * 过滤；输入无匹配时须显式勾「建新任务」才在【确认】时新建，绝不静默暴增任务。
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
  const queryClient = useQueryClient();

  const resourcesQuery = useResources(client, 'todayPlan');
  const tasksQuery = useTasks(client, 'todayPlan');
  const groupsQuery = useGroups(client, 'todayPlan');
  const sessionsQuery = useResourceSessions(client);

  const resources = useMemo(() => resourcesQuery.data?.resources ?? [], [resourcesQuery.data]);
  const tasks = useMemo(() => tasksQuery.data?.tasks ?? [], [tasksQuery.data]);
  const resourcesById = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);
  const tasksById = useMemo(() => new Map(tasks.map((tk) => [tk.id, tk])), [tasks]);

  // 「负责组」下拉候选：组 id -> 组名，来源=GET /api/groups 全量组列表 + 各车预设 lineup 里出现过的组
  // （兜底：万一某组的 seed 漏了但预设引用了它，选中值仍要能显示，不留空白 option）。
  const groupOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groupsQuery.data?.groups ?? []) map.set(g.id, g.name);
    for (const r of resources) {
      for (const entry of r.defaultPreset?.lineup ?? []) {
        if (!map.has(entry.groupId)) map.set(entry.groupId, entry.groupId);
      }
    }
    return map;
  }, [groupsQuery.data, resources]);

  const [rows, setRows] = useState<DraftRow[]>([]);
  // 只在换日（或首次拿到资源列表）时铺一遍空基线，避免每次 refetch 打断正在编辑的表格。
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  useEffect(() => {
    if (resourcesQuery.data && initializedFor !== windowLabel) {
      setRows(buildBaselineRows(resources));
      setInitializedFor(windowLabel);
    }
  }, [resourcesQuery.data, windowLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const rowGroupOptions = useMemo(() => {
    const map = new Map(groupOptions);
    for (const row of rows) {
      if (row.groupId && !map.has(row.groupId)) map.set(row.groupId, row.groupId);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }, [groupOptions, rows]);

  const prevIso = isoPrevDay(windowLabel);
  const prevCount = useMemo(
    () => (sessionsQuery.data?.sessions ?? []).filter((s) => s.windowLabel === prevIso).length,
    [sessionsQuery.data, prevIso],
  );

  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [carrying, setCarrying] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // 横幅几秒后自动消失（同 RelayCanvas 口径）。
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 4000);
    return () => clearTimeout(timer);
  }, [banner]);

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function handleAddRow(resourceId: string) {
    setRows((rs) => {
      let insertAt = rs.length;
      for (let i = rs.length - 1; i >= 0; i -= 1) {
        if (rs[i].resourceId === resourceId) {
          insertAt = i + 1;
          break;
        }
      }
      const newRow: DraftRow = {
        key: `${resourceId}#extra-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        resourceId,
        groupId: '',
        taskTitle: '',
        confirmNewTask: false,
        note: '',
      };
      const copy = rs.slice();
      copy.splice(insertAt, 0, newRow);
      return copy;
    });
  }

  // 删一行：若是该车唯一一行，软清空（车恒留一行可填，不整车消失、日后还能手动补）；
  // 否则真删（同车还有别的组在排）。
  function handleRemoveRow(key: string) {
    setRows((rs) => {
      const row = rs.find((r) => r.key === key);
      if (!row) return rs;
      const siblings = rs.filter((r) => r.resourceId === row.resourceId);
      if (siblings.length <= 1) {
        return rs.map((r) =>
          r.key === key ? { ...r, groupId: '', taskTitle: '', note: '', confirmNewTask: false } : r,
        );
      }
      return rs.filter((r) => r.key !== key);
    });
  }

  function handleUsePreset() {
    if (!resourcesQuery.data) return;
    const drafts = deriveTodayPlanFromPresets(resources, windowLabel);
    if (drafts.length === 0) {
      setBanner({ kind: 'err', text: t('schedule.table.presetEmpty') });
      return;
    }
    setRows(draftsToRows(resources, drafts, tasksById));
    setBanner(null);
  }

  async function handleCarryOver() {
    if (prevCount === 0 || carrying) return;
    setCarrying(true);
    try {
      const all = await client.getResourceSessions();
      const prevSessions = all.sessions.filter((s) => s.windowLabel === prevIso);
      if (prevSessions.length === 0) {
        setBanner({ kind: 'err', text: t('schedule.relay.carryEmpty') });
        return;
      }
      const drafts = buildCarryOverPlan(prevSessions, windowLabel);
      setRows(draftsToRows(resources, drafts, tasksById));
      setBanner(null);
    } catch (e) {
      setBanner({ kind: 'err', text: t('schedule.table.carryError', { detail: errorDetail(e) }) });
    } finally {
      setCarrying(false);
    }
  }

  function displayCodeOf(resourceId: string): string {
    const r = resourcesById.get(resourceId);
    return r?.displayCode ?? r?.name ?? resourceId;
  }

  async function handleConfirm() {
    setBanner(null);
    // 1) 逐行分类：existing=直接复用既有任务 id；new=已勾「建新任务」待建（同车同名去重）；none=不挂任务。
    type RowPlan =
      | { kind: 'existing'; taskId: string }
      | { kind: 'new'; dedupeKey: string }
      | { kind: 'none' };
    const pendingNew = new Map<string, { resourceId: string; groupId: string; title: string }>();
    const rowPlan = new Map<string, RowPlan>();
    for (const row of rows) {
      if (isBlankRow(row)) continue;
      if (!row.groupId.trim()) {
        setBanner({
          kind: 'err',
          text: t('schedule.table.errGroupRequired', { code: displayCodeOf(row.resourceId) }),
        });
        return;
      }
      const resource = resourcesById.get(row.resourceId);
      if (!resource) continue;
      const title = row.taskTitle.trim();
      if (!title) {
        rowPlan.set(row.key, { kind: 'none' });
        continue;
      }
      const matched = matchTaskByTitle(tasks, resource, title);
      if (matched) {
        rowPlan.set(row.key, { kind: 'existing', taskId: matched.id });
        continue;
      }
      if (!row.confirmNewTask) {
        setBanner({ kind: 'err', text: t('schedule.table.errConfirmNeeded', { title }) });
        return;
      }
      const dedupeKey = `${row.resourceId}|${title.toLowerCase()}`;
      pendingNew.set(dedupeKey, { resourceId: row.resourceId, groupId: row.groupId.trim(), title });
      rowPlan.set(row.key, { kind: 'new', dedupeKey });
    }

    if (rowPlan.size === 0) {
      setBanner({ kind: 'err', text: t('schedule.table.errNothing') });
      return;
    }

    setConfirming(true);
    try {
      // 2) 建新任务（先于批量落盘；同车同名只建一次）。
      const dedupeIdMap = new Map<string, string>();
      for (const [dedupeKey, info] of pendingNew) {
        const resource = resourcesById.get(info.resourceId);
        if (!resource) continue;
        const req: CreateTaskRequest = {
          projectId: resource.projectId,
          groupId: info.groupId,
          title: info.title,
          rawSummary: info.title,
          robotTarget: resource.robotTarget,
          intrinsicComplexity: 'normal',
          ownerId: null,
          collaboratorIds: [],
        };
        const res = await client.createTask(req);
        dedupeIdMap.set(dedupeKey, res.task.id);
      }

      // 3) 解析每行 holderTaskId。
      const resolved = new Map<string, string | null>();
      for (const [key, plan] of rowPlan) {
        if (plan.kind === 'existing') resolved.set(key, plan.taskId);
        else if (plan.kind === 'new') resolved.set(key, dedupeIdMap.get(plan.dedupeKey) ?? null);
        else resolved.set(key, null);
      }

      // 4) 组批量落盘请求，一次性原子提交（全部校验通过才落盘，见 server.ts /api/resource-sessions/batch）。
      const sessions = rowsToSessionDrafts(rows, resources, windowLabel, resolved);
      if (sessions.length === 0) {
        setBanner({ kind: 'err', text: t('schedule.table.errNothing') });
        return;
      }
      await client.createResourceSessionsBatch({
        windowLabel,
        sessions,
        confirmedBy: {
          id: 'console-schedule-table',
          displayName: t('schedule.table.actor'),
          source: 'console',
        },
      });

      // 新建的任务 / 新落的 session 影响面：任务列表、这天的排班读视图、接力画布、原始 session 列表。
      // 单元素 queryKey 前缀匹配（同 ResourcesPage 的 invalidateQueries(['resources']) 写法）——
      // 一并打掉本组件 / RelayCanvas / SchedulePage 各自命名空间下的同族 query。
      void queryClient.invalidateQueries({ queryKey: ['schedule'] });
      void queryClient.invalidateQueries({ queryKey: ['relay'] });
      void queryClient.invalidateQueries({ queryKey: ['resource-sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['dep-graph'] });
      onConfirmed();
    } catch (e) {
      // 走到这里时「建新任务」那步（2）可能已经成功——batch（4）才失败。不 invalidate 的话
      // tasksQuery 缓存还是旧数据，用户直接重试会因为 matchTaskByTitle 找不到刚建的任务而
      // 把同名任务再建一次。这里 invalidate 后组件重渲染会拿到最新 tasks，下次 handleConfirm
      // 开头的分类循环会自动把这些行匹配成既有任务（kind: 'existing'），不再重新 createTask。
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setBanner({ kind: 'err', text: t('schedule.table.confirmError', { detail: errorDetail(e) }) });
    } finally {
      setConfirming(false);
    }
  }

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
            className="relay-canvas__carry"
            disabled={prevCount === 0 || carrying}
            title={prevCount === 0 ? t('schedule.table.carryDisabledHint') : undefined}
            onClick={() => {
              void handleCarryOver();
            }}
          >
            {carrying ? t('schedule.relay.addSubmitting') : t('schedule.table.carryOver')}
          </button>
          <button type="button" className="relay-canvas__add" onClick={handleUsePreset}>
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
              {rows.map((row) => {
                const resource = resourcesById.get(row.resourceId);
                const candidates = resource ? candidateTasksForResource(tasks, resource) : [];
                const matched = resource ? matchTaskByTitle(tasks, resource, row.taskTitle) : undefined;
                const trimmedTitle = row.taskTitle.trim();
                const needsConfirm = trimmedTitle !== '' && !matched;
                return (
                  <tr key={row.key}>
                    <td className="today-plan-table__resource">
                      {resource?.displayCode ?? resource?.name ?? row.resourceId}
                    </td>
                    <td>
                      <select
                        value={row.groupId}
                        aria-label={t('schedule.table.colGroup')}
                        onChange={(e) => updateRow(row.key, { groupId: e.target.value })}
                      >
                        <option value="">{t('schedule.table.groupPlaceholder')}</option>
                        {rowGroupOptions.map((g) => (
                          <option value={g.id} key={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="today-plan-table__taskCell">
                      <Combobox
                        value={row.taskTitle}
                        onChange={(v) => updateRow(row.key, { taskTitle: v, confirmNewTask: false })}
                        options={candidates.map((c) => c.title)}
                        ariaLabel={t('schedule.table.colTask')}
                        placeholder={t('schedule.table.taskPlaceholder')}
                      />
                      {needsConfirm ? (
                        <label className="today-plan-table__confirmNew">
                          <input
                            type="checkbox"
                            checked={row.confirmNewTask}
                            onChange={(e) =>
                              updateRow(row.key, { confirmNewTask: e.target.checked })
                            }
                          />
                          {t('schedule.table.confirmNewTask', { title: trimmedTitle })}
                        </label>
                      ) : null}
                    </td>
                    <td>
                      <input
                        value={row.note}
                        aria-label={t('schedule.table.colNote')}
                        placeholder={t('schedule.table.notePlaceholder')}
                        onChange={(e) => updateRow(row.key, { note: e.target.value })}
                      />
                    </td>
                    <td className="today-plan-table__rowActions">
                      <button
                        type="button"
                        className="today-plan-table__rowBtn"
                        title={t('schedule.table.addRow')}
                        aria-label={t('schedule.table.addRow')}
                        onClick={() => handleAddRow(row.resourceId)}
                      >
                        <Plus size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="today-plan-table__rowBtn today-plan-table__rowBtn--danger"
                        title={t('schedule.table.removeRow')}
                        aria-label={t('schedule.table.removeRow')}
                        onClick={() => handleRemoveRow(row.key)}
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="today-plan-table__footer">
        <button
          type="button"
          className="relay-canvas__add"
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
