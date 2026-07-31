import {
  useCallback,
  useMemo,
  useState,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { HubApiClient } from '../../api/client';
import { useResources } from '../../hooks/useSchedule';
import { useTasks } from '../../hooks/useTasks';
import { canBoardResource } from '@teamhub/hub-contracts';
import { useI18n } from '../../i18n';
import { FormBanner } from '../../components/FormBanner';
import { isoPrevDay } from './date-utils';
import { buildCarryOverDraft } from './carry-over';
import { buildLanes, type Lane } from './relay-lanes';
import { AddLegForm } from './relay-canvas/AddLegForm';
import { useRelayMutations } from './relay-canvas/useRelayMutations';
import { RelayToolbar } from './relay-canvas/RelayToolbar';
import { RelayEmptyState } from './relay-canvas/RelayEmptyState';
import { RelaySwimlane } from './relay-canvas/RelaySwimlane';
import { buildHandoffMaps } from './relay-canvas/handoff-index';

// 泳道板 v1（R1，D-029，取代旧 @xyflow 自由拖拽画布）：每台机器人一条横泳道，组级、不带人。
// 反监视红线（结构性钉死）：泳道 / 卡片 / 关系标签 / 任何渲染绝不含 memberId / invitedMemberIds / 出勤计数。

export function RelayCanvas({
  client,
  windowLabel,
}: {
  client: HubApiClient;
  windowLabel: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['relay', windowLabel] as const, [windowLabel]);

  const query = useQuery({
    queryKey,
    queryFn: () => client.getRelay(windowLabel),
  });
  const resourcesQuery = useResources(client, 'relay');

  const [editingEtaId, setEditingEtaId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  // 「沿用上一天计划」进行中开关（批量 POST 期间禁用按钮，防重复点叠加）。
  const [carrying, setCarrying] = useState(false);

  const tasksQuery = useTasks(client, 'relay');

  const {
    banner,
    setBanner,
    refetch,
    updateMutation,
    createHandoffMutation,
    deleteHandoffMutation,
    deleteSessionMutation,
    createSessionMutation,
  } = useRelayMutations({
    client,
    windowLabel,
    t,
    queryClient,
    onSessionCreated: () => setShowAddForm(false),
  });

  const stages = query.data?.stages ?? null;

  // 泳道内次序提交：把某机器人泳道按目标顺序重排 orderInWindow=0..n，仅对变化的 session 调 PATCH。
  const commitReorder = useCallback(
    (orderedSessionIds: string[]) => {
      if (!stages) return;
      const stageById = new Map(stages.map((s) => [s.sessionId, s]));
      orderedSessionIds.forEach((sessionId, idx) => {
        const stage = stageById.get(sessionId);
        if (stage && stage.orderInWindow !== idx) {
          updateMutation.mutate({ id: sessionId, patch: { orderInWindow: idx } });
        }
      });
    },
    [stages, updateMutation],
  );

  const handleMove = useCallback(
    (sessionId: string, dir: -1 | 1) => {
      if (!stages) return;
      const target = stages.find((s) => s.sessionId === sessionId);
      if (!target) return;
      const lane = stages
        .filter((s) => s.resourceId === target.resourceId)
        .sort((a, b) => a.orderInWindow - b.orderInWindow);
      const idx = lane.findIndex((s) => s.sessionId === sessionId);
      const swapIdx = idx + dir;
      if (idx < 0 || swapIdx < 0 || swapIdx >= lane.length) return;
      const reordered = [...lane];
      [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
      commitReorder(reordered.map((s) => s.sessionId));
    },
    [stages, commitReorder],
  );

  const handleDelete = useCallback(
    (sessionId: string) => {
      if (!window.confirm(t('schedule.relay.deleteConfirm'))) return;
      deleteSessionMutation.mutate(sessionId);
    },
    [deleteSessionMutation, t],
  );

  // 建接力关系：projectId 按源 stage 的机器人（SharedResource.projectId）反查；查不到时回退首台机器人，
  // 仍无则用 windowLabel（schema 只要 min(1) 非空，后端按 session 归属为准）。沿用旧 onConnect 的回退逻辑。
  const handleCreateHandoff = useCallback(
    (fromSessionId: string, toSessionId: string) => {
      if (fromSessionId === toSessionId) {
        setBanner({ kind: 'err', text: t('schedule.relay.handoffSelf') });
        return;
      }
      const fromStage = stages?.find((s) => s.sessionId === fromSessionId);
      const resources = resourcesQuery.data?.resources ?? [];
      const projectId =
        resources.find((r) => r.id === fromStage?.resourceId)?.projectId ??
        resources[0]?.projectId ??
        windowLabel;
      createHandoffMutation.mutate({ fromSessionId, toSessionId, projectId });
    },
    [stages, resourcesQuery.data, windowLabel, createHandoffMutation, t, setBanner],
  );

  const handleDeleteHandoff = useCallback(
    (id: string) => {
      deleteHandoffMutation.mutate(id);
    },
    [deleteHandoffMutation],
  );

  const handleAddLeg = useCallback(
    (vars: {
      resourceId: string;
      projectId: string;
      taskId: string;
      groupId: string;
    }) => {
      const existing = (stages ?? []).filter(
        (s) => s.resourceId === vars.resourceId,
      );
      const nextOrder =
        existing.length > 0
          ? Math.max(...existing.map((s) => s.orderInWindow)) + 1
          : 0;
      createSessionMutation.mutate({
        projectId: vars.projectId,
        resourceId: vars.resourceId,
        windowLabel,
        orderInWindow: nextOrder,
        holderGroupId: vars.groupId,
        holderTaskId: vars.taskId,
        invitedMemberIds: [],
        note: null,
        eta: null,
        confirmedBy: {
          id: 'console-relay',
          displayName: t('schedule.relay.actor'),
          source: 'console',
        },
      });
    },
    [stages, windowLabel, createSessionMutation, t],
  );

  // 沿用上一天计划（Q3，SCHEDULE-DESIGN-LOCK §3）：读上一天该 windowLabel 的占用窗口，结转到当前日期。
  // 改走 POST /api/resource-sessions/batch 原子端点（同 TodayPlanTable.handleConfirm 的落盘范例）：
  // 一次性提交整批，要么全部落盘要么全部不落盘，避免逐条顺序 POST 中途失败后既不能增量重试、
  // 整体重试又会把已成功的那些重复叠加一份。
  // I0：结转一律经 buildCarryOverDraft 派生——invitedMemberIds 恒 []、不带 eta/note（见 carry-over.ts）。
  const handleCarryOver = useCallback(async () => {
    if (
      (stages?.length ?? 0) > 0 &&
      !window.confirm(t('schedule.relay.carryConfirm'))
    ) {
      return;
    }
    const prevIso = isoPrevDay(windowLabel);
    setCarrying(true);
    try {
      const all = await client.getResourceSessions();
      const prev = all.sessions.filter((s) => s.windowLabel === prevIso);
      if (prev.length === 0) {
        setBanner({ kind: 'err', text: t('schedule.relay.carryEmpty') });
        return;
      }
      const actor = {
        id: 'console-relay',
        displayName: t('schedule.relay.actor'),
        source: 'console' as const,
      };
      // batch 端点的单条元素形状 = ResourceSession 去掉 id/source/createdAt/confirmedBy；
      // buildCarryOverDraft 产出的单条请求多带一个 confirmedBy（批量请求里 confirmedBy 只在整体一层给一次）。
      const sessions = prev.map((s) => {
        const { confirmedBy, ...rest } = buildCarryOverDraft(s, windowLabel, actor);
        return rest;
      });
      await client.createResourceSessionsBatch({ windowLabel, sessions, confirmedBy: actor });
      setBanner({
        kind: 'ok',
        text: t('schedule.relay.carryDone', { n: prev.length }),
      });
      refetch();
    } catch (e) {
      setBanner({
        kind: 'err',
        text: t('schedule.relay.carryError', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      });
    } finally {
      setCarrying(false);
    }
  }, [stages, windowLabel, client, t, refetch, setBanner]);

  const handleStartEditEta = useCallback((sessionId: string) => {
    setEditingEtaId(sessionId);
  }, []);
  const handleCancelEditEta = useCallback(() => setEditingEtaId(null), []);
  const handleCommitEta = useCallback(
    (sessionId: string, raw: string) => {
      setEditingEtaId(null);
      if (!stages) return;
      const stage = stages.find((s) => s.sessionId === sessionId);
      if (!stage) return;
      const trimmed = raw.trim();
      const next: string | null = trimmed === '' ? null : trimmed;
      if (next === stage.eta) return;
      updateMutation.mutate({ id: sessionId, patch: { eta: next } });
    },
    [stages, updateMutation],
  );

  const lanes = useMemo<Lane[]>(
    () => (stages ? buildLanes(stages) : []),
    [stages],
  );

  const { outgoingBySession, incomingBySession, labelBySession } = useMemo(
    () => buildHandoffMaps(query.data?.handoffs ?? [], stages),
    [query.data, stages],
  );

  const boardableResources = useMemo(
    () =>
      (resourcesQuery.data?.resources ?? []).filter((r) =>
        canBoardResource(r.status),
      ),
    [resourcesQuery.data],
  );
  const tasks = tasksQuery.data?.tasks ?? [];

  const toolbar = (
    <RelayToolbar
      showAddForm={showAddForm}
      onToggleAddForm={() => setShowAddForm((v) => !v)}
      onCarryOver={() => {
        void handleCarryOver();
      }}
      carrying={carrying}
    />
  );

  const addForm = showAddForm ? (
    <AddLegForm
      client={client}
      resources={boardableResources}
      tasks={tasks}
      pending={createSessionMutation.isPending}
      onSubmit={handleAddLeg}
      onCancel={() => setShowAddForm(false)}
    />
  ) : null;

  if (query.isLoading) {
    return (
      <div className="state-band" role="status" aria-live="polite">
        {t('schedule.relay.loading')}
      </div>
    );
  }
  if (query.error || !query.data) {
    return (
      <div className="state-band state-band-error" role="alert">
        {t('schedule.relay.unavailable')}
      </div>
    );
  }
  if (query.data.stages.length === 0) {
    return (
      <div className="relay-canvas">
        {toolbar}
        {addForm}
        {banner ? (
          <FormBanner
            kind={banner.kind}
            message={banner.text}
            role={banner.kind === 'err' ? 'alert' : 'status'}
            onClick={() => setBanner(null)}
          />
        ) : null}
        <RelayEmptyState
          onAddFirst={() => setShowAddForm(true)}
          onCarryOver={() => {
            void handleCarryOver();
          }}
          carrying={carrying}
        />
      </div>
    );
  }

  return (
    <div className="relay-canvas">
      {toolbar}
      {addForm}
      <p className="relay-canvas__hint">{t('schedule.relay.swimlaneHint')}</p>
      {banner ? (
        <FormBanner
          kind={banner.kind}
          message={banner.text}
          role={banner.kind === 'err' ? 'alert' : 'status'}
          onClick={() => setBanner(null)}
        />
      ) : null}
      <RelaySwimlane
        lanes={lanes}
        labelBySession={labelBySession}
        outgoingBySession={outgoingBySession}
        incomingBySession={incomingBySession}
        editingEtaId={editingEtaId}
        onStartEditEta={handleStartEditEta}
        onCommitEta={handleCommitEta}
        onCancelEditEta={handleCancelEditEta}
        onMove={handleMove}
        onDelete={handleDelete}
        onCreateHandoff={handleCreateHandoff}
        onDeleteHandoff={handleDeleteHandoff}
      />
    </div>
  );
}
