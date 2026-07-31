import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { CreateResourceSessionRequest } from '../../api/schemas/schedule';
import type { HubApiClient } from '../../api/client';
import { useResources } from '../../hooks/useSchedule';
import { useTasks } from '../../hooks/useTasks';
import { canBoardResource } from '@teamhub/hub-contracts';
import { useI18n } from '../../i18n';
import { FormBanner } from '../../components/FormBanner';
import { isoPrevDay } from './date-utils';
import { buildCarryOverDraft } from './carry-over';
import { buildLanes, type Lane } from './relay-lanes';
import { WorkCard, type Handoff } from './relay-canvas/WorkCard';
import { AddLegForm } from './relay-canvas/AddLegForm';

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
  const [banner, setBanner] = useState<{ kind: 'err' | 'ok'; text: string } | null>(
    null,
  );
  // 加一项工作浮层开关：顶部按钮打开，选机器人 + 任务后提交。
  const [showAddForm, setShowAddForm] = useState(false);
  // 「沿用上一天计划」进行中开关（批量 POST 期间禁用按钮，防重复点叠加）。
  const [carrying, setCarrying] = useState(false);

  const tasksQuery = useTasks(client, 'relay');

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  // 占用窗口受限编辑（泳道内次序 ◄► / ETA）→ PATCH /api/resource-sessions/:id → refetch。
  const updateMutation = useMutation({
    mutationFn: (vars: {
      id: string;
      patch: { orderInWindow?: number; eta?: string | null };
    }) => client.updateResourceSession(vars.id, vars.patch),
    onSuccess: () => {
      setBanner(null);
      refetch();
    },
    onError: (e) =>
      setBanner({
        kind: 'err',
        text: t('schedule.relay.saveError', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      }),
  });

  // 建接力交接（fromSession→toSession）→ POST /api/relay-handoffs → refetch。
  const createHandoffMutation = useMutation({
    mutationFn: (vars: {
      fromSessionId: string;
      toSessionId: string;
      projectId: string;
    }) =>
      client.createRelayHandoff({
        projectId: vars.projectId,
        windowLabel,
        fromSessionId: vars.fromSessionId,
        toSessionId: vars.toSessionId,
        confirmedBy: {
          id: 'console-relay',
          displayName: t('schedule.relay.actor'),
          source: 'console',
        },
      }),
    onSuccess: () => {
      setBanner(null);
      refetch();
    },
    onError: (e) =>
      setBanner({
        kind: 'err',
        text: t('schedule.relay.handoffError', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      }),
  });

  // 删交接线（关系标签上的 ×）→ DELETE /api/relay-handoffs/:id → refetch。
  const deleteHandoffMutation = useMutation({
    mutationFn: (id: string) => client.deleteRelayHandoff(id),
    onSuccess: () => {
      setBanner(null);
      refetch();
    },
    onError: (e) =>
      setBanner({
        kind: 'err',
        text: t('schedule.relay.handoffDeleteError', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      }),
  });

  // 删一项（A2）：每张卡「删除」按钮确认后 → DELETE /api/resource-sessions/:id → refetch。
  // 后端级联删引用它的接力交接线（前端只需 refetch，关系标签不悬空）。
  const deleteSessionMutation = useMutation({
    mutationFn: (id: string) => client.deleteResourceSession(id),
    onSuccess: () => {
      setBanner(null);
      refetch();
    },
    onError: (e) =>
      setBanner({
        kind: 'err',
        text: t('schedule.relay.deleteError', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      }),
  });

  // 加一项（A2）：POST /api/resource-sessions（windowLabel=当前选中日期、orderInWindow=该机器人末位 +1）→ refetch。
  // confirmedBy 随请求传入（录入即拍板）；I0：invitedMemberIds 传空、不收任何成员维度。
  const createSessionMutation = useMutation({
    mutationFn: (req: CreateResourceSessionRequest) =>
      client.createResourceSession(req),
    onSuccess: () => {
      setShowAddForm(false);
      setBanner(null);
      refetch();
    },
    onError: (e) =>
      setBanner({
        kind: 'err',
        text: t('schedule.relay.addError', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      }),
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

  // ◄► 次序：同机器人泳道内与相邻卡交换。
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

  // 删一项：先二次确认（删卡 + 级联删交接线，不可撤销）→ mutate。原生 confirm 够用（C3 小作坊）。
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
    [stages, resourcesQuery.data, windowLabel, createHandoffMutation, t],
  );

  const handleDeleteHandoff = useCallback(
    (id: string) => {
      deleteHandoffMutation.mutate(id);
    },
    [deleteHandoffMutation],
  );

  // 加一项提交：orderInWindow = 该机器人当前最大位次 +1（没排过则 0）；holderGroupId 由任务派生。
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
    // 当天已有项 → 二次确认，避免重复叠加（C3 小作坊原生 confirm 够用）。
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
        // eslint/TS 对「解构剩余元素前置字段未用」的 rest-sibling 场景不报 unused（同 eslint
        // ignoreRestSiblings 口径），此处剥掉 confirmedBy 就是要它不进 batch 单条元素。
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
  }, [stages, windowLabel, client, t, refetch]);

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
      // 空串=清空（null）；与既有值相同则不打扰后端。
      const next: string | null = trimmed === '' ? null : trimmed;
      if (next === stage.eta) return;
      updateMutation.mutate({ id: sessionId, patch: { eta: next } });
    },
    [stages, updateMutation],
  );

  // 派生泳道（每台机器人一条）。stages 变 → 重建。
  const lanes = useMemo<Lane[]>(
    () => (stages ? buildLanes(stages) : []),
    [stages],
  );

  // 接力交接关系：按源/目标分别索引，给每张卡挂出/入标签；sessionId→展示标签（任务名回退组名）。
  const handoffs = useMemo<Handoff[]>(
    () =>
      (query.data?.handoffs ?? []).map((h) => ({
        id: h.id,
        fromSessionId: h.fromSessionId,
        toSessionId: h.toSessionId,
      })),
    [query.data],
  );
  const outgoingBySession = useMemo(() => {
    const map = new Map<string, Handoff[]>();
    for (const h of handoffs) {
      const arr = map.get(h.fromSessionId) ?? [];
      arr.push(h);
      map.set(h.fromSessionId, arr);
    }
    return map;
  }, [handoffs]);
  const incomingBySession = useMemo(() => {
    const map = new Map<string, Handoff[]>();
    for (const h of handoffs) {
      const arr = map.get(h.toSessionId) ?? [];
      arr.push(h);
      map.set(h.toSessionId, arr);
    }
    return map;
  }, [handoffs]);
  const labelBySession = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stages ?? []) {
      map.set(s.sessionId, s.taskLabel ?? s.groupName);
    }
    return map;
  }, [stages]);

  // 横幅几秒后自动消失（与依赖图同口径）；点击立即关闭。
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 4000);
    return () => clearTimeout(timer);
  }, [banner]);

  // 加一项数据源：机器人只列「能上场」的（canBoardResource，停用/退役不入选）；任务全列（自带 groupId）。
  const boardableResources = useMemo(
    () =>
      (resourcesQuery.data?.resources ?? []).filter((r) =>
        canBoardResource(r.status),
      ),
    [resourcesQuery.data],
  );
  const tasks = tasksQuery.data?.tasks ?? [];

  // 顶部工具条「+ 加一项工作」+「沿用上一天计划」（空板 / 已有卡片都显示，否则空板无入口）。
  const toolbar = (
    <div className="relay-canvas__toolbar">
      <button
        type="button"
        className="btn btn--primary"
        onClick={() => setShowAddForm((v) => !v)}
        aria-expanded={showAddForm}
      >
        <Plus size={14} aria-hidden="true" />
        {t('schedule.relay.addLeg')}
      </button>
      <button
        type="button"
        className="btn btn--secondary relay-canvas__carry"
        onClick={() => {
          void handleCarryOver();
        }}
        disabled={carrying}
      >
        {t('schedule.relay.carryOver')}
      </button>
    </div>
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
        {/* 空态也要能显示 carryEmpty / carryError / carryDone 反馈（此处非绝对定位，跟随冷卡上方）。 */}
        {banner ? (
          <FormBanner
            kind={banner.kind}
            message={banner.text}
            role={banner.kind === 'err' ? 'alert' : 'status'}
            onClick={() => setBanner(null)}
          />
        ) : null}
        {/* 空态 = 带 CTA 的引导卡（不是静态告示）：直接给「加第一项」「沿用上一天」两个入口
            （SCHEDULE-DESIGN-LOCK §1：空板本身就是录入口，发现性问题一并解决）。 */}
        <div className="pm-coldstart">
          <h3>{t('schedule.relay.empty.title')}</h3>
          <p>{t('schedule.relay.empty.body')}</p>
          <div className="relay-coldstart__cta">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setShowAddForm(true)}
            >
              <Plus size={14} aria-hidden="true" />
              {t('schedule.relay.empty.addFirst')}
            </button>
            <button
              type="button"
              className="btn btn--secondary relay-canvas__carry"
              onClick={() => {
                void handleCarryOver();
              }}
              disabled={carrying}
            >
              {t('schedule.relay.carryOver')}
            </button>
          </div>
        </div>
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
      <div
        className="relay-swimlane"
        role="region"
        aria-label={t('schedule.relay.swimlaneLabel')}
      >
        {lanes.map((lane) => (
          <section
            className="relay-lane"
            key={lane.resourceId}
            aria-label={t('schedule.relay.laneLabel', { code: lane.displayCode })}
          >
            <div className="relay-lane__head">
              <span className="relay-lane__code">{lane.displayCode}</span>
              <span className="relay-lane__count">
                {t('schedule.relay.laneCount', { n: lane.stages.length })}
              </span>
            </div>
            <ul className="relay-lane__cards">
              {lane.stages.map((stage, idx) => (
                <WorkCard
                  key={stage.sessionId}
                  stage={stage}
                  labelBySession={labelBySession}
                  outgoing={outgoingBySession.get(stage.sessionId) ?? []}
                  incoming={incomingBySession.get(stage.sessionId) ?? []}
                  laneStages={lane.stages}
                  etaEditing={editingEtaId === stage.sessionId}
                  canMoveLeft={idx > 0}
                  canMoveRight={idx < lane.stages.length - 1}
                  onStartEditEta={handleStartEditEta}
                  onCommitEta={handleCommitEta}
                  onCancelEditEta={handleCancelEditEta}
                  onMove={handleMove}
                  onDelete={handleDelete}
                  onCreateHandoff={handleCreateHandoff}
                  onDeleteHandoff={handleDeleteHandoff}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
