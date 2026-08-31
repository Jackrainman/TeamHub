import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CreateTaskRequest } from '@teamhub/hub-contracts';
import { deriveTodayPlanFromPresets } from '@teamhub/hub-contracts';
import type { SharedResource, Task } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { errorDetail } from '../../utils';
import { isoPrevDay } from './date-utils';
import { buildCarryOverPlan } from './carry-over';
import {
  buildBaselineRows,
  draftsToRows,
  isBlankRow,
  matchTaskByTitle,
  rowsToSessionDrafts,
  type DraftRow,
} from './today-plan';
import { invalidateScheduleFamily } from './schedule-invalidation';

export type PlanBanner = { kind: 'ok' | 'err'; text: string } | null;

/**
 * 今日计划表格的本地状态控制器（SPLIT-1-TAIL 自 TodayPlanTable.tsx 拆出）：
 * 行编辑（增/删/改）、「使用预设」「继续昨天」铺底、【确认】三步（建新任务→解析 holderTaskId→原子批量落盘）。
 * 纯本地状态 + 命令式 client 调用，无 react-query 直连（远端状态仍在 ../hooks.ts）。
 */
export function useTodayPlanController({
  client,
  windowLabel,
  resources,
  resourcesReady,
  tasks,
  prevSessionsCount,
  onConfirmed,
}: {
  client: HubApiClient;
  windowLabel: string;
  resources: SharedResource[];
  /** 资源列表已拿到（含空列表）才铺基线；否则等首数据。 */
  resourcesReady: boolean;
  tasks: Task[];
  /** 昨天（prevIso）的 session 数——「继续昨天」可用性判定。 */
  prevSessionsCount: number;
  onConfirmed: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const resourcesById = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);
  const tasksById = useMemo(() => new Map(tasks.map((tk) => [tk.id, tk])), [tasks]);

  const [rows, setRows] = useState<DraftRow[]>([]);
  // 只在换日（或首次拿到资源列表）时铺一遍空基线，避免每次 refetch 打断正在编辑的表格。
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  useEffect(() => {
    if (resourcesReady && initializedFor !== windowLabel) {
      setRows(buildBaselineRows(resources));
      setInitializedFor(windowLabel);
    }
  }, [resources, windowLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const [banner, setBanner] = useState<PlanBanner>(null);
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
    const drafts = deriveTodayPlanFromPresets(resources, windowLabel);
    if (drafts.length === 0) {
      setBanner({ kind: 'err', text: t('schedule.table.presetEmpty') });
      return;
    }
    setRows(draftsToRows(resources, drafts, tasksById));
    setBanner(null);
  }

  const prevIso = isoPrevDay(windowLabel);

  async function handleCarryOver() {
    if (prevSessionsCount === 0 || carrying) return;
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

      // 4) 组批量落盘请求，一次性原子提交（全部校验通过才落盘，见 modules/schedule /api/resource-sessions/batch）。
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
      // 整族失效（与 RelayCanvas 共用 schedule-invalidation，前缀匹配打掉各命名空间同族 query）。
      invalidateScheduleFamily(queryClient);
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

  return {
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
  };
}
