import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../../theme';
import { useQuery } from '@tanstack/react-query';
import { useHubMutation } from '../../hooks/useHubMutation';
import { queryKeys } from '../../api/queryKeys';
import dagre from '@dagrejs/dagre';
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Connection,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, Trash2 } from 'lucide-react';
import {
  wouldCreateCycle,
  type DepEdge,
  type DepGraph,
  type TaskStatus,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useTasks } from '../../hooks/useTasks';
import type { CreateDependencyRequest } from '../../api/schemas/pm';
import { useI18n } from '../../i18n';
import { MetricTile } from '../../components/MetricTile';
import { NODE_W, NODE_H, EDGE_COLORS, type DepFlowNode } from './sub/constants';
import { nodeTypes } from './sub/DepNodeCard';
import { DetailPanel } from './sub/DetailPanel';

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
  onNewTask?: () => void;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const bgDotColor =
    theme === 'dark'
      ? '#33413a'
      : theme === 'tech'
        ? '#243b4d'
        : theme === 'warm'
          ? '#e6ddca'
          : '#d8e0d6';
  const query = useQuery({
    queryKey: ['dep-graph', source],
    queryFn: () => client.getDepGraph(),
  });
  const tasksQuery = useTasks(client, source);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const graph = query.data;
  const { nodes, edges } = useMemo(
    () => (graph ? layoutGraph(graph) : { nodes: [], edges: [] }),
    [graph],
  );
  const displayNodes = useMemo<DepFlowNode[]>(
    () => nodes.map((n) => ({ ...n, selected: n.id === selectedId })),
    [nodes, selectedId],
  );
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
  const tasksById = useMemo(
    () => new Map((tasksQuery.data?.tasks ?? []).map((tk) => [tk.id, tk] as const)),
    [tasksQuery.data],
  );

  const [rejectMsg, setRejectMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const connectMutation = useHubMutation({
    invalidateKeys: [queryKeys.depGraph(source)],
    mutationFn: (req: CreateDependencyRequest) => client.createDependency(req),
    onSuccess: () => {
      setRejectMsg(null);
      setSuccessMsg(t('depgraph.connect.success'));
    },
    onError: (e) =>
      setRejectMsg(
        t('depgraph.connect.error', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      ),
  });

  const statusMutation = useHubMutation({
    invalidateKeys: [queryKeys.depGraph(source), queryKeys.tasks(source)],
    mutationFn: (vars: { taskId: string; status: TaskStatus }) =>
      client.updateTaskStatus(vars.taskId, vars.status),
    onSuccess: () => {
      setRejectMsg(null);
      setSuccessMsg(t('depgraph.status.changeSuccess'));
    },
    onError: (e) =>
      setRejectMsg(
        t('depgraph.status.changeError', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      ),
  });

  const waiveMutation = useHubMutation({
    invalidateKeys: [queryKeys.depGraph(source)],
    mutationFn: (depId: string) => client.waiveDependency(depId),
    onSuccess: () => {
      setSelectedEdgeId(null);
      setRejectMsg(null);
      setSuccessMsg(t('depgraph.edge.deleteSuccess'));
    },
    onError: (e) =>
      setRejectMsg(
        t('depgraph.edge.deleteError', {
          detail: e instanceof Error ? e.message : String(e),
        }),
      ),
  });

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
        fromTaskId: from,
        toTaskId: to,
        type: 'blocks',
        source: 'human',
        confirmedBy: {
          id: 'console-drag',
          displayName: t('depgraph.connect.actor'),
          source: 'console',
        },
      });
    },
    [graph, t, connectMutation.mutate],
  );

  useEffect(() => {
    if (!successMsg && !rejectMsg) return;
    const timer = setTimeout(() => {
      setSuccessMsg(null);
      setRejectMsg(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [successMsg, rejectMsg]);

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
          <button type="button" className="btn btn--primary" onClick={onNewTask}>
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
                  className="btn btn--sm btn--danger"
                  disabled={waiveMutation.isPending}
                  onClick={() => waiveMutation.mutate(selectedEdgeId)}
                >
                  <Trash2 size={14} aria-hidden="true" /> {t('depgraph.edge.deleteConfirm')}
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
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
