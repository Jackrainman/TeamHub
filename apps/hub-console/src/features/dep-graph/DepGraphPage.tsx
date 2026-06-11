import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dagre from '@dagrejs/dagre';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
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

const NODE_W = 212;
const NODE_H = 96;

type DepNodeData = { depNode: DepNode };
type DepFlowNode = Node<DepNodeData, 'dep'>;

const STATUS_META: Record<
  DepNode['status'],
  { label: string; pill: string; modifier: string; Icon: typeof Activity }
> = {
  working: { label: '进行中', pill: 'status-working', modifier: 'dag-node--working', Icon: Activity },
  blockedIdle: { label: '被卡 · 等待', pill: 'status-blocked-idle', modifier: 'dag-node--blocked-idle', Icon: Lock },
  freeIdle: { label: '可接任务', pill: 'status-free-idle', modifier: 'dag-node--free-idle', Icon: CircleDashed },
  done: { label: '完成', pill: 'status-done', modifier: 'dag-node--done', Icon: CheckCircle2 },
  gap: { label: '缺口', pill: 'status-gap', modifier: 'dag-node--gap', Icon: AlertCircle },
};

const EDGE_COLORS: Record<DepEdge['kind'], string> = {
  blocking: '#b33434',
  critical: '#2f6f9f',
  need: '#a26a16',
  normal: '#b8c6b4',
};

function complexityCn(c: DepNode['intrinsicComplexity']): string {
  if (c === 'trivial') return '简单';
  if (c === 'normal') return '常规';
  return '复杂';
}

function DepNodeCard({ data, selected }: NodeProps<DepFlowNode>) {
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
        {n.ownerLabel ?? '未指派'} · {n.groupName} · {n.robotTarget}
      </div>
      {n.status === 'blockedIdle' && n.blockedByLabel ? (
        <div className="dag-node__blocked">被「{n.blockedByLabel}」卡住</div>
      ) : null}
      <div className="dag-node__badges">
        <span className={`dag-node__tag ${meta.pill}`}>{meta.label}</span>
        {n.isCritical ? (
          <span className="dag-node__tag dag-node__tag--critical">
            <Zap size={10} aria-hidden="true" /> 关键链
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

export function DepGraphPage({ client }: { client: HubApiClient }) {
  const query = useQuery({
    queryKey: ['dep-graph'],
    queryFn: () => client.getDepGraph(),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const graph = query.data;
  const { nodes, edges } = useMemo(
    () => (graph ? layoutGraph(graph) : { nodes: [], edges: [] }),
    [graph],
  );

  if (query.isLoading) {
    return <div className="state-band">Loading dependency graph</div>;
  }
  if (query.error || !graph) {
    return (
      <div className="state-band state-band-error">Dependency graph unavailable</div>
    );
  }

  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="dep-graph-page">
      <section className="dep-graph-summary" aria-label="依赖链汇总">
        <Metric label="关键链" value={String(graph.summary.criticalCount)} />
        <Metric label="缺口 / 卡点" value={String(graph.summary.blockedCount)} />
        <Metric label="空闲 · 被卡" value={String(graph.summary.blockedIdleCount)} accent="red" />
        <Metric label="空闲 · 自由" value={String(graph.summary.freeIdleCount)} accent="amber" />
      </section>
      <div className="dep-graph-shell">
        <div className="dep-graph-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            minZoom={0.4}
            nodesConnectable={false}
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
  if (!node) {
    return (
      <aside className="panel dep-graph-detail">
        <div className="panel-header">
          <h2>节点详情</h2>
          <span>点击任意任务</span>
        </div>
        <div className="detail-empty">
          点击图中的任务节点，查看 owner、状态、被谁卡住，以及被卡时这段时间可以看的资料。
        </div>
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
        <span className={`status-pill ${meta.pill}`}>{meta.label}</span>
      </div>
      <div className="detail-list">
        <DetailRow label="负责人 · 组" value={`${node.ownerLabel ?? '未指派'} · ${node.groupName}`} />
        <DetailRow
          label="机器人 · 难度"
          value={`${node.robotTarget} · ${complexityCn(node.intrinsicComplexity)}`}
        />
        {node.status === 'blockedIdle' && node.blockedByLabel ? (
          <DetailRow label="被什么卡住" value={`「${node.blockedByLabel}」未完成（卡的是任务，不是人）`} />
        ) : null}
        {node.unmetNeedLabels.length > 0 ? (
          <DetailRow label="未满足的需求" value={node.unmetNeedLabels.join('；')} />
        ) : null}
        {node.isCritical ? (
          <DetailRow label="关键链" value="在收敛到总联调的主链上" />
        ) : null}
      </div>
      {showLearn ? (
        <div className="learn-block">
          <h4>
            <BookOpen size={13} aria-hidden="true" /> 这段时间可以看的资料
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
          <MapPin size={13} aria-hidden="true" /> 查看我的知识地图
        </a>
      ) : null}
    </aside>
  );
}
