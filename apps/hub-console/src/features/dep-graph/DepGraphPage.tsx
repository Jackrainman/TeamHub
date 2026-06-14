import { useCallback, useMemo, useState } from 'react';
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
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  CircleDashed,
  Lock,
  MapPin,
  Zap,
} from 'lucide-react';
import type { DepEdge, DepGraph, DepNode } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { CreateDependencyRequest } from '../../api/schemas/pm';
import { useI18n, type TranslationKey } from '../../i18n';

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

const EDGE_COLORS: Record<DepEdge['kind'], string> = {
  blocking: '#b33434',
  critical: '#2f6f9f',
  need: '#a26a16',
  normal: '#b8c6b4',
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
      <div className="dag-node__owner">
        {n.ownerLabel ?? t('depgraph.node.unassigned')} · {n.groupName} · {n.robotTarget}
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

// 从 `to` 出发能否经现有边回到 `from`：若能，则新加的 `from→to` 会成环。
// 后端 POST /api/dependencies 不做环校验（AUDIT H1 未修），故前端必须守，
// 否则一条成环边会让下次 getDepGraph 的派生死循环、卡死服务端事件循环。
function wouldCreateCycle(edges: DepEdge[], from: string, to: string): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.source);
    if (list) list.push(e.target);
    else adj.set(e.source, [e.target]);
  }
  const stack: string[] = [to];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (cur === from) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const n of adj.get(cur) ?? []) stack.push(n);
  }
  return false;
}

export function DepGraphPage({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ['dep-graph', source],
    queryFn: () => client.getDepGraph(),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const graph = query.data;
  const { nodes, edges } = useMemo(
    () => (graph ? layoutGraph(graph) : { nodes: [], edges: [] }),
    [graph],
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
      if (wouldCreateCycle(graph.edges, from, to)) {
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
    [graph, source, t, connectMutation],
  );

  if (query.isLoading) {
    return <div className="state-band">{t('depgraph.loading')}</div>;
  }
  if (query.error || !graph) {
    return (
      <div className="state-band state-band-error">{t('depgraph.unavailable')}</div>
    );
  }

  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="dep-graph-page">
      <section className="dep-graph-summary" aria-label={t('depgraph.summary.aria')}>
        <Metric label={t('depgraph.summary.critical')} value={String(graph.summary.criticalCount)} />
        <Metric label={t('depgraph.summary.blocked')} value={String(graph.summary.blockedCount)} />
        <Metric label={t('depgraph.summary.blockedIdle')} value={String(graph.summary.blockedIdleCount)} accent="red" />
        <Metric label={t('depgraph.summary.freeIdle')} value={String(graph.summary.freeIdleCount)} accent="amber" />
      </section>
      <div className="dep-graph-shell">
        <div className="dep-graph-canvas">
          {rejectMsg ? (
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
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            onConnect={onConnect}
            fitView
            minZoom={0.4}
            nodesConnectable={true}
          >
            <Background gap={18} color="#d8e0d6" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <DetailPanel node={selected} />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'red' | 'amber';
}) {
  return (
    <div className={`metric-tile${accent ? ` metric-tile--${accent}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
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

function DetailPanel({ node }: { node: DepNode | null }) {
  const { t } = useI18n();
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
      {showLearn ? (
        <div className="learn-block">
          <h4>
            <BookOpen size={13} aria-hidden="true" /> {t('depgraph.detail.learnTitle')}
          </h4>
          <ul>
            {node.relatedKnowledge.map((k) => (
              <li key={k.uri ?? k.title}>
                <a href={k.uri ?? '#'} onClick={(e) => e.preventDefault()}>
                  <ArrowUpRight size={12} aria-hidden="true" /> {k.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {showMyMap ? (
        <a className="my-map-link" href="#" onClick={(e) => e.preventDefault()}>
          <MapPin size={13} aria-hidden="true" /> {t('depgraph.detail.myMap')}
        </a>
      ) : null}
    </aside>
  );
}
