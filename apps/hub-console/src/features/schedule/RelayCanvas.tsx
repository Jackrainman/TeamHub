import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { RelayStage } from '../../api/schemas/schedule';
import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';

// 接力交接画布（R1，D-029）：把某窗口已确认的占用窗口铺成「车列 × 接力先后」的可拖卡片，
// 队长拖卡片排先后（orderInWindow）、卡片间拉线表接力交接（fromSession→toSession，**非**任务依赖）、
// 每张卡可选填预估完成时间（eta）。所有人看同一块。独立依赖图页 DepGraphPage 不动。
//
// 反监视红线（结构性钉死）：节点 / 边 / 任何渲染**绝不**含 memberId / invitedMemberIds / 出勤计数。
// 主键只 session / 资源（车）/ 组 / 任务——RelayStage 来自后端，本身就无人维度。

const COL_W = 240; // 车列列宽（含间距）
const ROW_H = 150; // 接力行高
const NODE_W = 208;

type RelayNodeData = {
  stage: RelayStage;
  legIndex: number; // 同车内的第 N 棒（0-based，展示 +1）
  eta: string | null;
  etaEditing: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onStartEditEta: (sessionId: string) => void;
  onCommitEta: (sessionId: string, value: string) => void;
  onCancelEditEta: () => void;
  onMove: (sessionId: string, dir: -1 | 1) => void;
};
type RelayFlowNode = Node<RelayNodeData, 'relay'>;

function RelayStageCard({ data }: NodeProps<RelayFlowNode>) {
  const { t } = useI18n();
  const s = data.stage;
  const className = [
    'relay-card',
    s.boardable ? 'relay-card--boardable' : 'relay-card--closed',
  ].join(' ');
  return (
    <div className={className}>
      {/* 接力交接线：上=目标（接棒），下=源（交棒）。与依赖图同朝向（源底→目标顶）。 */}
      <Handle type="target" position={Position.Top} />
      <div className="relay-card__head">
        <span className="relay-card__code">{s.displayCode}</span>
        <span className="relay-card__leg">
          {t('schedule.relay.stageOrder', { n: data.legIndex + 1 })}
        </span>
      </div>
      <div className="relay-card__group">{s.groupName}</div>
      {s.taskLabel ? (
        <div className="relay-card__task">{s.taskLabel}</div>
      ) : null}
      {!s.boardable ? (
        <div className="relay-card__closed-note">
          {t('schedule.relay.boardingClosed', { reason: s.statusReason ?? '—' })}
        </div>
      ) : null}
      <div className="relay-card__eta">
        <span className="relay-card__eta-label">{t('schedule.relay.eta')}</span>
        {data.etaEditing ? (
          <EtaInput
            initial={data.eta ?? ''}
            placeholder={t('schedule.relay.etaPlaceholder')}
            onCommit={(value) => data.onCommitEta(s.sessionId, value)}
            onCancel={data.onCancelEditEta}
          />
        ) : (
          <button
            type="button"
            className="relay-card__eta-value"
            onClick={() => data.onStartEditEta(s.sessionId)}
            title={t('schedule.relay.etaEdit')}
          >
            {data.eta ?? t('schedule.relay.etaEmpty')}
          </button>
        )}
      </div>
      {/* 无障碍兜底：拖拽外另给 ▲▼，键盘 / 触屏用户也能排先后（也调 updateResourceSession）。 */}
      <div className="relay-card__reorder">
        <button
          type="button"
          className="relay-card__move"
          aria-label={t('schedule.relay.moveUp')}
          title={t('schedule.relay.moveUp')}
          disabled={!data.canMoveUp}
          onClick={() => data.onMove(s.sessionId, -1)}
        >
          <ChevronUp size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="relay-card__move"
          aria-label={t('schedule.relay.moveDown')}
          title={t('schedule.relay.moveDown')}
          disabled={!data.canMoveDown}
          onClick={() => data.onMove(s.sessionId, 1)}
        >
          <ChevronDown size={13} aria-hidden="true" />
        </button>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// ETA 内联输入：失焦 / 回车提交；Escape 取消。受控本地 state，避免每键 mutate。
function EtaInput({
  initial,
  placeholder,
  onCommit,
  onCancel,
}: {
  initial: string;
  placeholder: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="relay-card__eta-input"
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit(value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
    />
  );
}

const nodeTypes: NodeTypes = { relay: RelayStageCard };

// 把车列（resourceId）映射成列序，保持 stages 首次出现顺序（后端已按资源登记顺序排好）。
function columnOrder(stages: RelayStage[]): Map<string, number> {
  const order = new Map<string, number>();
  for (const s of stages) {
    if (!order.has(s.resourceId)) order.set(s.resourceId, order.size);
  }
  return order;
}

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
  // 接力线 POST 需 projectId；RelayStage 读视图不回 projectId（无需），故从车（SharedResource.projectId）
  // 按 resourceId 反查得到真实项目，而非占位。独立查询，失败不阻塞读视图（建线时回退首车）。
  const resourcesQuery = useQuery({
    queryKey: ['resources', 'relay'],
    queryFn: () => client.getResources(),
  });

  const [editingEtaId, setEditingEtaId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: 'err' | 'ok'; text: string } | null>(
    null,
  );

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  // 占用窗口受限编辑（拖卡排序 / ▲▼ / ETA）→ PATCH /api/resource-sessions/:id → refetch。
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

  // 拉线建接力交接（fromSession→toSession）→ POST /api/relay-handoffs → refetch。
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

  // 删交接线（点边选中 / Delete）→ DELETE /api/relay-handoffs/:id → refetch。
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

  const stages = query.data?.stages ?? null;

  // 横排序提交：把某车列按目标顺序重排 orderInWindow=0..n，仅对变化的 session 调 PATCH。
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

  // ▲▼ 无障碍兜底：同车列内与相邻棒交换。
  const handleMove = useCallback(
    (sessionId: string, dir: -1 | 1) => {
      if (!stages) return;
      const target = stages.find((s) => s.sessionId === sessionId);
      if (!target) return;
      const column = stages
        .filter((s) => s.resourceId === target.resourceId)
        .sort((a, b) => a.orderInWindow - b.orderInWindow);
      const idx = column.findIndex((s) => s.sessionId === sessionId);
      const swapIdx = idx + dir;
      if (idx < 0 || swapIdx < 0 || swapIdx >= column.length) return;
      const reordered = [...column];
      [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
      commitReorder(reordered.map((s) => s.sessionId));
    },
    [stages, commitReorder],
  );

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

  // 派生节点（车列 × 接力先后自动铺位）。stages 变 / ETA 编辑态变 → 重铺。
  const baseNodes = useMemo<RelayFlowNode[]>(() => {
    if (!stages) return [];
    const cols = columnOrder(stages);
    // 每车列内按 orderInWindow 排，得到 legIndex 与上下移可用性。
    const legByColumn = new Map<string, RelayStage[]>();
    for (const s of stages) {
      const arr = legByColumn.get(s.resourceId) ?? [];
      arr.push(s);
      legByColumn.set(s.resourceId, arr);
    }
    for (const arr of legByColumn.values()) {
      arr.sort((a, b) => a.orderInWindow - b.orderInWindow);
    }
    return stages.map((s) => {
      const column = legByColumn.get(s.resourceId) ?? [];
      const legIndex = column.findIndex((c) => c.sessionId === s.sessionId);
      const colIdx = cols.get(s.resourceId) ?? 0;
      return {
        id: s.sessionId,
        type: 'relay' as const,
        position: { x: colIdx * COL_W, y: legIndex * ROW_H },
        data: {
          stage: s,
          legIndex,
          eta: s.eta,
          etaEditing: editingEtaId === s.sessionId,
          canMoveUp: legIndex > 0,
          canMoveDown: legIndex < column.length - 1,
          onStartEditEta: handleStartEditEta,
          onCommitEta: handleCommitEta,
          onCancelEditEta: handleCancelEditEta,
          onMove: handleMove,
        },
      } satisfies RelayFlowNode;
    });
  }, [
    stages,
    editingEtaId,
    handleStartEditEta,
    handleCommitEta,
    handleCancelEditEta,
    handleMove,
  ]);

  // 本地节点 state：拖动时跟手（applyNodeChanges），松手后按 x 重排再 PATCH。
  // baseNodes 变（refetch / 编辑态）→ 同步覆盖本地位置（后端是单一真相）。
  const [nodes, setNodes] = useState<RelayFlowNode[]>(baseNodes);
  useEffect(() => {
    setNodes(baseNodes);
  }, [baseNodes]);

  const onNodesChange = useCallback((changes: NodeChange<RelayFlowNode>[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  // 拖卡片排先后：松手后对**同一 resourceId** 的节点按当前 x 升序重排 → orderInWindow=0..n。
  const onNodeDragStop = useCallback(
    (_evt: unknown, node: RelayFlowNode) => {
      const stage = node.data.stage;
      const sameColumn = nodes
        .filter((n) => n.data.stage.resourceId === stage.resourceId)
        .sort((a, b) => a.position.x - b.position.x);
      commitReorder(sameColumn.map((n) => n.id));
    },
    [nodes, commitReorder],
  );

  const edges = useMemo<Edge[]>(() => {
    const handoffs = query.data?.handoffs ?? [];
    return handoffs.map((h) => ({
      id: h.id,
      source: h.fromSessionId,
      target: h.toSessionId,
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--green)' },
      style: { stroke: 'var(--green)', strokeWidth: 2 },
      className: 'relay-edge',
    }));
  }, [query.data]);

  const onConnect = useCallback(
    (conn: Connection) => {
      const from = conn.source;
      const to = conn.target;
      if (!from || !to) return;
      if (from === to) {
        setBanner({ kind: 'err', text: t('schedule.relay.handoffSelf') });
        return;
      }
      // projectId 按源 stage 的车（SharedResource.projectId）反查；查不到时回退首车，
      // 仍无则用 windowLabel（schema 只要 min(1) 非空，后端按 session 归属为准）。
      const fromStage = stages?.find((s) => s.sessionId === from);
      const resources = resourcesQuery.data?.resources ?? [];
      const projectId =
        resources.find((r) => r.id === fromStage?.resourceId)?.projectId ??
        resources[0]?.projectId ??
        windowLabel;
      createHandoffMutation.mutate({
        fromSessionId: from,
        toSessionId: to,
        projectId,
      });
    },
    [createHandoffMutation, t, stages, resourcesQuery.data, windowLabel],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const e of deleted) deleteHandoffMutation.mutate(e.id);
    },
    [deleteHandoffMutation],
  );

  // 横幅几秒后自动消失（与依赖图同口径）；点击立即关闭。
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 4000);
    return () => clearTimeout(timer);
  }, [banner]);

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
      <div className="pm-coldstart">
        <h3>{t('schedule.relay.title')}</h3>
        <p>{t('schedule.relay.empty')}</p>
      </div>
    );
  }

  return (
    <div className="relay-canvas">
      <p className="relay-canvas__hint">{t('schedule.relay.canvasHint')}</p>
      <div className="relay-canvas__board">
        {banner ? (
          <div
            className={`form-banner ${
              banner.kind === 'err' ? 'form-banner--err' : 'form-banner--ok'
            } relay-canvas__banner`}
            role={banner.kind === 'err' ? 'alert' : 'status'}
            onClick={() => setBanner(null)}
          >
            {banner.text}
          </div>
        ) : null}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          nodesConnectable={true}
          nodesDraggable={true}
          fitView
          minZoom={0.4}
          defaultViewport={{ x: NODE_W / 4, y: 24, zoom: 1 }}
        >
          <Background gap={18} color="#d8e0d6" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
