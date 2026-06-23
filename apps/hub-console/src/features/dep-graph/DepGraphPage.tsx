import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../../theme';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dagre from '@dagrejs/dagre';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Activity,
  AlertCircle,
  BookOpen,
  CheckCircle2,
  CircleDashed,
  Lock,
  MapPin,
  Plus,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import {
  wouldCreateCycle,
  type DepEdge,
  type DepGraph,
  type DepNode,
  type TaskStatus,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { CreateDependencyRequest } from '../../api/schemas/pm';
import { useI18n, type TranslationKey } from '../../i18n';
import { MetricTile } from '../../components/MetricTile';

const NODE_W = 212;
const NODE_H = 96;

type DepNodeData = { depNode: DepNode };
type DepFlowNode = Node<DepNodeData, 'dep'>;

const STATUS_META: Record<
  DepNode['status'],
  { labelKey: TranslationKey; pill: string; modifier: string; Icon: typeof Activity }
> = {
  working: { labelKey: 'depgraph.status.working', pill: 'status-working', modifier: 'dag-node--working', Icon: Activity },
  blockedIdle: { labelKey: 'depgraph.status.blockedIdle', pill: 'status-blocked-idle', modifier: 'dag-node--blocked-idle', Icon: Lock },
  freeIdle: { labelKey: 'depgraph.status.freeIdle', pill: 'status-free-idle', modifier: 'dag-node--free-idle', Icon: CircleDashed },
  done: { labelKey: 'depgraph.status.done', pill: 'status-done', modifier: 'dag-node--done', Icon: CheckCircle2 },
  gap: { labelKey: 'depgraph.status.gap', pill: 'status-gap', modifier: 'dag-node--gap', Icon: AlertCircle },
};

// 连线色走 CSS 变量随主题（DEP-GRAPH-EDGE-COLOR-THEME）：normal=--border-strong 在 warm 主题被覆盖
// （#b8c6b4→#cdc6b6），写死 hex 则换肤后连线不变；accent（红/蓝/琥珀）当前跨主题通用，var() 让其将来一并随动。
const EDGE_COLORS: Record<DepEdge['kind'], string> = {
  blocking: 'var(--red)',
  critical: 'var(--blue)',
  need: 'var(--amber)',
  normal: 'var(--border-strong)',
};

// 原始 Task 状态机的五态（详情面板状态下拉）。注意：这是 Task.status 原始值，
// 与 DepNode.status（working/blockedIdle/freeIdle/done/gap 派生显示态）不是 1:1，故下拉当前值
// 必须查原始 task 回填、不能从 DepNode 推。
const TASK_STATUS_ORDER: TaskStatus[] = [
  'pending',
  'inProgress',
  'blocked',
  'done',
  'shelved',
];
const TASK_STATUS_LABEL: Record<TaskStatus, TranslationKey> = {
  pending: 'depgraph.status.raw.pending',
  inProgress: 'depgraph.status.raw.inProgress',
  blocked: 'depgraph.status.raw.blocked',
  done: 'depgraph.status.raw.done',
  shelved: 'depgraph.status.raw.shelved',
};

function complexityKey(c: DepNode['intrinsicComplexity']): TranslationKey {
  if (c === 'trivial') return 'depgraph.complexity.trivial';
  if (c === 'normal') return 'depgraph.complexity.normal';
  return 'depgraph.complexity.hard';
}

function DepNodeCard({ data, selected }: NodeProps<DepFlowNode>) {
  const { t } = useI18n();
  const n = data.depNode;
  const meta = STATUS_META[n.status];
  const Icon = meta.Icon;
  const className = [
    'dag-node',
    meta.modifier,
    n.isCritical ? 'dag-node--critical' : '',
    selected ? 'dag-node--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className}>
      <Handle type="target" position={Position.Top} />
      <div className="dag-node__head">
        <Icon size={14} aria-hidden="true" />
        <span className="dag-node__title">{n.label}</span>
      </div>
      {/* I0：负责人(ownerLabel)降级到 DetailPanel，不在节点上常显——节点只显结构键(组·机器人)。 */}
      <div className="dag-node__owner">
        {n.groupName} · {n.robotTarget}
      </div>
      {n.status === 'blockedIdle' && n.blockedByLabel ? (
        <div className="dag-node__blocked">
          {t('depgraph.node.blockedBy', { label: n.blockedByLabel })}
        </div>
      ) : null}
      <div className="dag-node__badges">
        <span className={`dag-node__tag ${meta.pill}`}>{t(meta.labelKey)}</span>
        {n.isCritical ? (
          <span className="dag-node__tag dag-node__tag--critical">
            <Zap size={10} aria-hidden="true" /> {t('depgraph.node.criticalChain')}
          </span>
        ) : null}
        {/* 收敛任务（总联调）：全组各一人在场，非个人指派 → 显「全组」徽章。 */}
        {n.isConvergenceTask ? (
          <span className="dag-node__tag dag-node__tag--convergence">
            <Users size={10} aria-hidden="true" /> {t('depgraph.node.convergence')}
          </span>
        ) : null}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes: NodeTypes = { dep: DepNodeCard };

function layoutGraph(graph: DepGraph): { nodes: DepFlowNode[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 70, marginx: 18, marginy: 18 });
  for (const node of graph.nodes) g.setNode(node.id, { width: NODE_W, height: NODE_H });
  for (const edge of graph.edges) g.setEdge(edge.source, edge.target);
  dagre.layout(g);

  const nodes: DepFlowNode[] = graph.nodes.map((node) => {
    const p = g.node(node.id) as { x: number; y: number };
    return {
      id: node.id,
      type: 'dep',
      position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 },
      data: { depNode: node },
    };
  });

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: edge.kind === 'blocking',
    style: {
      stroke: EDGE_COLORS[edge.kind],
      strokeWidth: edge.kind === 'normal' ? 1.5 : 2.2,
    },
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLORS[edge.kind] },
  }));

  return { nodes, edges };
}

// 把图边 {source,target} 映射成 hub-contracts.wouldCreateCycle 期望的 {fromTaskId,toTaskId}。
// 边方向 = source 阻塞 target，与依赖的 fromTaskId 阻塞 toTaskId 同向。
function toCycleDeps(
  edges: ReadonlyArray<Pick<DepEdge, 'source' | 'target'>>,
): { fromTaskId: string; toTaskId: string }[] {
  return edges.map((e) => ({ fromTaskId: e.source, toTaskId: e.target }));
}

export function DepGraphPage({
  client,
  source,
  focusTaskId,
  onConsumeFocus,
  onNewTask,
}: {
  client: HubApiClient;
  source: string;
  focusTaskId?: string | null;
  onConsumeFocus?: () => void;
  // 「新建任务」直接弹出共享的右侧抽屉就地建任务（由 ProjectPage 接 setCreateOpen(true)），不再切视图。
  onNewTask?: () => void;
}) {
  const { t } = useI18n();
  // ReactFlow <Background> 的点阵色经 SVG fill 属性传入、不吃 CSS var，故按主题取具体值（批次H 暗色暗坑）。
  const { theme } = useTheme();
  const bgDotColor = theme === 'dark' ? '#33413a' : theme === 'warm' ? '#e6ddca' : '#d8e0d6';
  const query = useQuery({
    queryKey: ['dep-graph', source],
    queryFn: () => client.getDepGraph(),
  });
  // 原始任务表（详情面板状态下拉回填当前值）；与看板同 queryKey，缓存共享。
  const tasksQuery = useQuery({
    queryKey: ['tasks', source],
    queryFn: () => client.getTasks(),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 选中的连线（与节点选中互斥）：用于「点选连线 → 确认删除」。
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const graph = query.data;
  const { nodes, edges } = useMemo(
    () => (graph ? layoutGraph(graph) : { nodes: [], edges: [] }),
    [graph],
  );
  // M14：节点选中态由 selectedId 单一来源驱动（受控）。此前节点对象不带 selected，
  // 视觉高亮（dag-node--selected）只在用户点节点时由 ReactFlow 内部选中态触发；而 focusTaskId
  // 跳转走 setSelectedId 程序化选中，ReactFlow 内部并不知情 → 详情面板已切到该节点、卡片却不高亮（分叉）。
  // 改为在 memo 里按 selectedId 给节点打 selected，使「卡片高亮」与「详情面板」恒一致（点选/程序化跳转皆然）。
  const displayNodes = useMemo<DepFlowNode[]>(
    () => nodes.map((n) => ({ ...n, selected: n.id === selectedId })),
    [nodes, selectedId],
  );
  // 选中连线高亮（仅在已 memo 的 edges 上做轻量映射，不重跑 dagre 布局）。
  const displayEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) =>
        e.id === selectedEdgeId
          ? {
              ...e,
              selected: true,
              className: 'dag-edge--selected',
              style: { ...e.style, stroke: 'var(--blue)', strokeWidth: 4 },
              markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--blue)' },
            }
          : e,
      ),
    [edges, selectedEdgeId],
  );
  // 原始任务表索引：详情面板状态下拉回填当前值（DepNode.status 是派生态、非原始 Task.status）。
  const tasksById = useMemo(
    () => new Map((tasksQuery.data?.tasks ?? []).map((tk) => [tk.id, tk] as const)),
    [tasksQuery.data],
  );

  const queryClient = useQueryClient();
  const [rejectMsg, setRejectMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const connectMutation = useMutation({
    mutationFn: (req: CreateDependencyRequest) => client.createDependency(req),
    onSuccess: () => {
      setRejectMsg(null);
      setSuccessMsg(t('depgraph.connect.success'));
      void queryClient.invalidateQueries({ queryKey: ['dep-graph', source] });
    },
    onError: (e) =>
      setRejectMsg(
        t('depgraph.connect.error', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      ),
  });

  // 任务状态流转（详情面板）。状态变会连带改边 kind / 关键链 / 汇总条，太纠缠不宜乐观更新——
  // 成功后失效 dep-graph + tasks 两个查询、让图重算重绘（与录入同口径）。复用 reject/success 横幅。
  const statusMutation = useMutation({
    mutationFn: (vars: { taskId: string; status: TaskStatus }) =>
      client.updateTaskStatus(vars.taskId, vars.status),
    onSuccess: () => {
      setRejectMsg(null);
      setSuccessMsg(t('depgraph.status.changeSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['dep-graph', source] });
      void queryClient.invalidateQueries({ queryKey: ['tasks', source] });
    },
    onError: (e) =>
      setRejectMsg(
        t('depgraph.status.changeError', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      ),
  });

  // 删除连线（软删除转 waived）。成功后边在 refetch 消失——先清 selectedEdgeId 防悬空。
  const waiveMutation = useMutation({
    mutationFn: (depId: string) => client.waiveDependency(depId),
    onSuccess: () => {
      setSelectedEdgeId(null);
      setRejectMsg(null);
      setSuccessMsg(t('depgraph.edge.deleteSuccess'));
      void queryClient.invalidateQueries({ queryKey: ['dep-graph', source] });
    },
    onError: (e) =>
      setRejectMsg(
        t('depgraph.edge.deleteError', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      ),
  });

  // 拖拽连线：源 handle(底) → 目标 handle(顶) = 源阻塞目标。Option A（用户拍板）：
  // 固定 type='blocks' + 非 null console confirmedBy（使边显红）→ mutate → invalidate 重取重绘，
  // 后端为单一真相、不在前端复刻 kind 派生。三条语义守卫在 POST 前完成（后端零校验，AUDIT H1）。
  const onConnect = useCallback(
    (conn: Connection) => {
      const from = conn.source;
      const to = conn.target;
      if (!from || !to || !graph) return;
      if (from === to) {
        setSuccessMsg(null);
        setRejectMsg(t('depgraph.connect.selfEdge'));
        return;
      }
      if (graph.edges.some((e) => e.source === from && e.target === to)) {
        setSuccessMsg(null);
        setRejectMsg(t('depgraph.connect.duplicate'));
        return;
      }
      if (wouldCreateCycle(toCycleDeps(graph.edges), from, to)) {
        setSuccessMsg(null);
        setRejectMsg(t('depgraph.connect.cycle'));
        return;
      }
      setRejectMsg(null);
      connectMutation.mutate({
        projectId: graph.projectId,
        fromTaskId: from, // 源 = 阻塞方（上游）
        toTaskId: to, // 目标 = 被阻（下游）
        type: 'blocks', // 保留拖拽语义：源阻塞目标
        source: 'human',
        confirmedBy: {
          id: 'console-drag',
          displayName: t('depgraph.connect.actor'),
          source: 'console',
        },
      });
    },
    [graph, t, connectMutation],
  );

  // 成功/错误横幅几秒后自动消失：否则它一直占着画布顶部、挡住删除条等后续操作。
  // 手动点横幅仍可立即关闭；新消息进来会重置计时（依赖数组含两条 msg）。
  useEffect(() => {
    if (!successMsg && !rejectMsg) return;
    const timer = setTimeout(() => {
      setSuccessMsg(null);
      setRejectMsg(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [successMsg, rejectMsg]);

  // 从看板「在依赖图查看此节点」跳转过来：图加载后选中该节点，再消费掉 focus（防重复触发）。
  useEffect(() => {
    if (!focusTaskId || !graph) return;
    if (graph.nodes.some((n) => n.id === focusTaskId)) {
      setSelectedId(focusTaskId);
    }
    onConsumeFocus?.();
  }, [focusTaskId, graph, onConsumeFocus]);

  if (query.isLoading) {
    return <div className="state-band" role="status" aria-live="polite">{t('depgraph.loading')}</div>;
  }
  if (query.error || !graph) {
    return (
      <div className="state-band state-band-error" role="alert">{t('depgraph.unavailable')}</div>
    );
  }

  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="dep-graph-page">
      <div className="dep-graph-topbar">
        <span className="dep-graph-topbar__note">{t('depgraph.entry.note')}</span>
        {onNewTask ? (
          <button type="button" className="kb-submit" onClick={onNewTask}>
            <Plus size={14} aria-hidden="true" /> {t('depgraph.toolbar.newTask')}
          </button>
        ) : null}
      </div>
      <section className="dep-graph-summary" aria-label={t('depgraph.summary.aria')}>
        <MetricTile label={t('depgraph.summary.critical')} value={String(graph.summary.criticalCount)} />
        <MetricTile label={t('depgraph.summary.blocked')} value={String(graph.summary.blockedCount)} />
        <MetricTile label={t('depgraph.summary.blockedIdle')} value={String(graph.summary.blockedIdleCount)} accent="red" />
        <MetricTile label={t('depgraph.summary.freeIdle')} value={String(graph.summary.freeIdleCount)} accent="amber" />
      </section>
      <div className="dep-graph-shell">
        <div className="dep-graph-canvas">
          {/* 选中连线时，删除确认条优先于任何残留的成功/错误横幅显示（否则建依赖后的
              success 横幅会一直挡住删除条 → 看起来「删不掉」）。 */}
          {selectedEdgeId && edges.some((e) => e.id === selectedEdgeId) ? (
            <div
              className="form-banner dep-graph-banner dep-graph-edge-action"
              role="dialog"
              aria-label={t('depgraph.edge.deletePrompt')}
            >
              <span>{t('depgraph.edge.deletePrompt')}</span>
              <div className="dep-graph-edge-action__btns">
                <button
                  type="button"
                  className="detail-action-btn detail-action-btn--danger"
                  disabled={waiveMutation.isPending}
                  onClick={() => waiveMutation.mutate(selectedEdgeId)}
                >
                  <Trash2 size={13} aria-hidden="true" /> {t('depgraph.edge.deleteConfirm')}
                </button>
                <button
                  type="button"
                  className="detail-action-btn detail-action-btn--ghost"
                  onClick={() => setSelectedEdgeId(null)}
                >
                  {t('depgraph.edge.deleteCancel')}
                </button>
              </div>
            </div>
          ) : rejectMsg ? (
            <div
              className="form-banner form-banner--err dep-graph-banner"
              role="alert"
              onClick={() => setRejectMsg(null)}
            >
              {rejectMsg}
            </div>
          ) : successMsg ? (
            <div
              className="form-banner form-banner--ok dep-graph-banner"
              role="status"
              onClick={() => setSuccessMsg(null)}
            >
              {successMsg}
            </div>
          ) : null}
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => {
              setSelectedId(node.id);
              setSelectedEdgeId(null);
            }}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedId(null);
            }}
            onPaneClick={() => {
              setSelectedId(null);
              setSelectedEdgeId(null);
            }}
            onConnect={onConnect}
            deleteKeyCode={null}
            fitView
            minZoom={0.4}
            nodesConnectable={true}
            nodesDraggable={false}
          >
            <Background gap={18} color={bgDotColor} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <DetailPanel
          node={selected}
          currentStatus={selected ? tasksById.get(selected.id)?.status : undefined}
          statusPending={statusMutation.isPending}
          onChangeStatus={(status) => {
            if (!selected) return;
            statusMutation.mutate({ taskId: selected.id, status });
          }}
        />
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DetailPanel({
  node,
  currentStatus,
  onChangeStatus,
  statusPending,
}: {
  node: DepNode | null;
  currentStatus?: TaskStatus;
  onChangeStatus: (status: TaskStatus) => void;
  statusPending: boolean;
}) {
  const { t } = useI18n();
  // 选「搁置」走内联二次确认（搁置=移出活跃流程，唯一值得确认的流转）；其余即时提交。
  const [pendingShelve, setPendingShelve] = useState(false);
  // 切换节点时清除未完成的搁置确认，防止在 B 上意外触发在 A 上发起的确认。
  useEffect(() => {
    setPendingShelve(false);
  }, [node?.id ?? null]);
  if (!node) {
    return (
      <aside className="panel dep-graph-detail">
        <div className="panel-header">
          <h2>{t('depgraph.detail.title')}</h2>
          <span>{t('depgraph.detail.clickAny')}</span>
        </div>
        <div className="detail-empty">{t('depgraph.detail.empty')}</div>
      </aside>
    );
  }
  const meta = STATUS_META[node.status];
  const onSelectStatus = (next: TaskStatus) => {
    if (next === 'shelved') {
      setPendingShelve(true);
      return;
    }
    setPendingShelve(false);
    onChangeStatus(next);
  };
  const showLearn = node.status === 'blockedIdle' && node.relatedKnowledge.length > 0;
  const showMyMap = node.status === 'blockedIdle' || node.status === 'freeIdle';
  return (
    <aside className="panel dep-graph-detail">
      <div className="panel-header">
        <h2>{node.label}</h2>
        <span className={`status-pill ${meta.pill}`}>{t(meta.labelKey)}</span>
      </div>
      <div className="detail-list">
        <DetailRow
          label={t('depgraph.detail.ownerGroup')}
          value={`${node.ownerLabel ?? t('depgraph.node.unassigned')} · ${node.groupName}`}
        />
        {/* I0：负责人只表分工，明确不暗示进度快慢。 */}
        <p className="detail-note">{t('depgraph.detail.ownerNote')}</p>
        <DetailRow
          label={t('depgraph.detail.robotComplexity')}
          value={`${node.robotTarget} · ${t(complexityKey(node.intrinsicComplexity))}`}
        />
        {node.status === 'blockedIdle' && node.blockedByLabel ? (
          <DetailRow
            label={t('depgraph.detail.blockedBy')}
            value={t('depgraph.detail.blockedByValue', { label: node.blockedByLabel })}
          />
        ) : null}
        {node.unmetNeedLabels.length > 0 ? (
          <DetailRow
            label={t('depgraph.detail.unmetNeeds')}
            value={node.unmetNeedLabels.join('；')}
          />
        ) : null}
        {node.isCritical ? (
          <DetailRow
            label={t('depgraph.detail.criticalChain')}
            value={t('depgraph.detail.criticalChainValue')}
          />
        ) : null}
      </div>
      <div className="detail-actions">
        {/* 二态快捷按钮（标记完成/重新开启）已与下方五态状态下拉职责重叠，统一收敛到单一下拉控件。 */}
        <label className="detail-status-select">
          <span>{t('depgraph.status.changeLabel')}</span>
          <select
            value={currentStatus ?? ''}
            disabled={statusPending}
            onChange={(e) => onSelectStatus(e.target.value as TaskStatus)}
          >
            {currentStatus ? null : (
              <option value="" disabled>
                {t('depgraph.status.changePlaceholder')}
              </option>
            )}
            {TASK_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {t(TASK_STATUS_LABEL[s])}
              </option>
            ))}
          </select>
        </label>
        {pendingShelve ? (
          <div className="detail-confirm">
            <span>{t('depgraph.status.shelveConfirmPrompt')}</span>
            <div className="detail-confirm__btns">
              <button
                type="button"
                className="detail-action-btn detail-action-btn--danger"
                disabled={statusPending}
                onClick={() => {
                  setPendingShelve(false);
                  onChangeStatus('shelved');
                }}
              >
                {t('depgraph.status.shelveConfirm')}
              </button>
              <button
                type="button"
                className="detail-action-btn detail-action-btn--ghost"
                onClick={() => setPendingShelve(false)}
              >
                {t('depgraph.status.shelveCancel')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {showLearn ? (
        <div className="learn-block">
          <h4>
            <BookOpen size={13} aria-hidden="true" /> {t('depgraph.detail.learnTitle')}
          </h4>
          {/* TODO(backend): relatedKnowledge.uri 当前无真实可达资源（原为 preventDefault 死链）。
              暂降级为纯文本 + 即将上线小角标，去掉可点外观，避免「点了没反应」的死胡同；
              后端把 KB 条目链接接通后，恢复为真实 <a href>。 */}
          <ul>
            {node.relatedKnowledge.map((k) => (
              <li key={k.uri ?? k.title} className="learn-block__pending">
                <span>{k.title}</span>
                <span className="soon-badge">{t('nav.soon')}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {showMyMap ? (
        <span
          className="my-map-link my-map-link--disabled"
          aria-disabled="true"
          title={t('nav.soon')}
        >
          {/* 「我的地图」后端未就绪：内联显示即将上线角标，不再只靠 hover title 暗示。 */}
          <MapPin size={13} aria-hidden="true" /> {t('depgraph.detail.myMap')}
          <span className="soon-badge">{t('nav.soon')}</span>
        </span>
      ) : null}
    </aside>
  );
}
