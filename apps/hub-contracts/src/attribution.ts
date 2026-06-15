import type {
  BlockAttribution,
  BlockAttributionReason,
  DepEdge,
  DepEdgeKind,
  DepGraph,
  DepNode,
  DepNodeKnowledge,
  DepNodeStatus,
  Dependency,
  Group,
  Member,
  Need,
  Task,
  TaskComplexity,
} from './governance.js';
import type { KnowledgeNode, TaskKnowledgeTag } from './growth.js';
import type { ArtifactRef } from './schemas.js';

/**
 * 治理真相快照 → 阻塞归因 / DepGraph 视图的纯派生函数（无 IO、可单测）。
 *
 * 反排名结构保证：BlockAttribution 与 DepGraph 视图的输出主键全是
 * task/group/dependency/need，没有 memberId 维度；区分"被卡 vs 摸鱼"的依据是
 * "有没有一条 active 确认依赖边指向未完成上游"这个布尔事实——没有这条边，
 * 不产生归因（沉默，A4）。
 */
export interface GovernanceSnapshot {
  seasonId: string;
  projectId: string;
  stage: string;
  groups: Group[];
  members: Member[];
  tasks: Task[];
  dependencies: Dependency[];
  needs: Need[];
  knowledgeNodes: KnowledgeNode[];
  taskKnowledgeTags: TaskKnowledgeTag[];
  // 图纸提交日志/时间线（v1）：每条 = 某机构某版的归档物（图纸 / 固件 / 报告）。
  // 多条/机构、按 createdAt 倒序即时间线。无人维度——记录主键是机构 + 版本 + 归档物，
  // 不存"谁提交"作排名依据（I0/A4）。GET /api/artifacts 读这个数组。
  artifacts: ArtifactRef[];
}

const COMPLEXITY_CN: Record<TaskComplexity, string> = {
  trivial: '简单',
  normal: '常规',
  hard: '复杂',
};

function indexBy<T>(items: T[], key: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) map.set(key(item), item);
  return map;
}

/** 只走 active + 已确认（confirmedBy 非空）的边，aiSuggested 未确认不参与归因（C4）。 */
function isLiveEdge(dep: Dependency): boolean {
  return dep.status === 'active' && dep.confirmedBy !== null;
}

function unmetNeedsOf(taskId: string, needs: Need[]): Need[] {
  return needs.filter(
    (n) =>
      n.onTaskId === taskId &&
      (n.status === 'open' || n.status === 'escalated'),
  );
}

function ownerIsIdle(task: Task, membersById: Map<string, Member>): boolean {
  if (!task.ownerId) return false;
  return membersById.get(task.ownerId)?.status === 'idle';
}

/**
 * 沿 DAG 反向（指向上游）找根因瓶颈：
 * 优先停在"挂着未满足 Need"的上游；否则一路走到没有 active 未完成上游为止。
 */
function findRoot(
  start: Task,
  tasksById: Map<string, Task>,
  liveDeps: Dependency[],
  needs: Need[],
): { root: Task; pathEdges: Dependency[] } {
  const pathEdges: Dependency[] = [];
  const visited = new Set<string>([start.id]);
  let current = start;

  for (;;) {
    const incoming = liveDeps.filter((d) => {
      if (d.toTaskId !== current.id) return false;
      const from = tasksById.get(d.fromTaskId);
      return from !== undefined && from.status !== 'done' && !visited.has(from.id);
    });
    if (incoming.length === 0) break;

    // 优先选挂着未满足 Need 的上游，否则取第一条（确定性）。
    const chosen =
      incoming.find((d) => unmetNeedsOf(d.fromTaskId, needs).length > 0) ??
      incoming[0];
    const next = tasksById.get(chosen.fromTaskId);
    if (!next) break;

    pathEdges.push(chosen);
    visited.add(next.id);
    current = next;

    // 停在第一个挂着未满足 Need 的瓶颈。
    if (unmetNeedsOf(current.id, needs).length > 0) break;
  }

  return { root: current, pathEdges };
}

function classifyReason(
  rootUnmetNeeds: Need[],
  pathEdges: Dependency[],
  root: Task,
): BlockAttributionReason {
  if (rootUnmetNeeds.length > 0) return 'unmetNeed';
  if (pathEdges.some((e) => e.type === 'sharesResource'))
    return 'sharedResourceBusy';
  if (root.status === 'blocked') return 'upstreamBlocked';
  return 'upstreamInProgress';
}

function renderFact(idle: Task, root: Task, rootUnmetNeeds: Need[]): string {
  const head = `${idle.title}（本身为${COMPLEXITY_CN[idle.intrinsicComplexity]}任务）处于结构性空闲：其上游「${root.title}」未完成`;
  if (rootUnmetNeeds.length === 0) return `${head}。`;
  const needText = rootUnmetNeeds.map((n) => n.description).join('；');
  return `${head}，且存在未满足需求「${needText}」。`;
}

/**
 * 派生阻塞归因。只对"owner 空闲 + 有 active 上游卡住"的任务产出归因；
 * 自由空闲（无 active 上游边）的任务**不产生**任何归因（沉默）。
 */
export function deriveBlockAttributions(
  snapshot: GovernanceSnapshot,
  now: string,
): BlockAttribution[] {
  const tasksById = indexBy(snapshot.tasks, (t) => t.id);
  const membersById = indexBy(snapshot.members, (m) => m.id);
  const liveDeps = snapshot.dependencies.filter(isLiveEdge);

  const attributions: BlockAttribution[] = [];

  for (const task of snapshot.tasks) {
    const candidate =
      (task.status === 'pending' || task.status === 'inProgress') &&
      ownerIsIdle(task, membersById);
    if (!candidate) continue;

    const incoming = liveDeps.filter((d) => {
      if (d.toTaskId !== task.id) return false;
      const from = tasksById.get(d.fromTaskId);
      return from !== undefined && from.status !== 'done';
    });
    if (incoming.length === 0) continue; // 无 active 上游卡 → 沉默（A4）

    const { root, pathEdges } = findRoot(
      task,
      tasksById,
      liveDeps,
      snapshot.needs,
    );
    const rootUnmetNeeds = unmetNeedsOf(root.id, snapshot.needs);
    const reason = classifyReason(rootUnmetNeeds, pathEdges, root);

    attributions.push({
      id: `attr-${task.id}`,
      idleTaskId: task.id,
      idleGroupId: task.groupId,
      rootBlockerTaskId: root.id,
      rootBlockerGroupId: root.groupId,
      blockingDependencyIds: pathEdges.map((e) => e.id),
      unmetNeedIds: rootUnmetNeeds.map((n) => n.id),
      reason,
      factStatement: renderFact(task, root, rootUnmetNeeds),
      detectedBy: 'derived',
      detectedAt: now,
    });
  }

  return attributions;
}

/** 结构关键链 = DAG 中最长路径（按节点数）上的节点集合，不算精确工期（CPM 远期）。 */
function computeCriticalSet(tasks: Task[], deps: Dependency[]): Set<string> {
  const ids = new Set(tasks.map((t) => t.id));
  const preds = new Map<string, string[]>(); // toTaskId -> fromTaskId[]
  for (const t of tasks) preds.set(t.id, []);
  for (const d of deps) {
    if (ids.has(d.fromTaskId) && ids.has(d.toTaskId)) {
      preds.get(d.toTaskId)!.push(d.fromTaskId);
    }
  }

  const length = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const computing = new Set<string>();

  const longestTo = (id: string): number => {
    const cached = length.get(id);
    if (cached !== undefined) return cached;
    if (computing.has(id)) return 1; // cycle guard
    computing.add(id);
    let best = 1;
    let bestParent: string | null = null;
    for (const p of preds.get(id) ?? []) {
      const cand = longestTo(p) + 1;
      if (cand > best) {
        best = cand;
        bestParent = p;
      }
    }
    computing.delete(id);
    length.set(id, best);
    parent.set(id, bestParent);
    return best;
  };

  let endId: string | null = null;
  let endLen = 0;
  for (const t of tasks) {
    const l = longestTo(t.id);
    if (l > endLen) {
      endLen = l;
      endId = t.id;
    }
  }

  const critical = new Set<string>();
  let cursor = endId;
  // H1（AUDIT-FIXES 部署前必修）：回溯防环守卫。longestTo 的 cycle-guard 占位可能让 parent 链含环，
  // 无 visited 会在有环依赖图上死循环、卡死整个 server 事件循环（单请求 DoS）。
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    critical.add(cursor);
    cursor = parent.get(cursor) ?? null;
  }
  return critical;
}

/**
 * H1（AUDIT-FIXES 部署前必修）：判断新增依赖边 `fromTaskId → toTaskId` 是否会在依赖图里成环。
 * 后端 `POST /api/dependencies` 落库前必须调用——一条成环边会让 `computeCriticalSet` / `toDepGraphView`
 * 的派生卡死（任意未鉴权请求即可造环 → DoS）。边方向 = fromTaskId 阻塞 toTaskId；成环 iff 图里已存在
 * `toTaskId → … → fromTaskId` 的有向路径（或自环 from===to）。纯函数、可单测。
 */
export function wouldCreateCycle(
  dependencies: ReadonlyArray<Pick<Dependency, 'fromTaskId' | 'toTaskId'>>,
  fromTaskId: string,
  toTaskId: string,
): boolean {
  if (fromTaskId === toTaskId) return true; // 自环
  const adj = new Map<string, string[]>();
  for (const d of dependencies) {
    const list = adj.get(d.fromTaskId);
    if (list) list.push(d.toTaskId);
    else adj.set(d.fromTaskId, [d.toTaskId]);
  }
  // 从 toTaskId 出发能否经现有边回到 fromTaskId（DFS）；能 → 加 from→to 会闭环。
  const stack: string[] = [toTaskId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === fromTaskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of adj.get(cur) ?? []) stack.push(next);
  }
  return false;
}

function inferKnowledgeKind(uri: string): DepNodeKnowledge['kind'] {
  if (uri.startsWith('repo://') || uri.startsWith('git')) return 'code';
  return 'doc';
}

function relatedKnowledgeFor(
  taskIds: string[],
  tags: TaskKnowledgeTag[],
  nodesById: Map<string, KnowledgeNode>,
): DepNodeKnowledge[] {
  const out: DepNodeKnowledge[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    if (!taskIds.includes(tag.taskId)) continue;
    // C4：未确认的 AI 标注（confirmedBy=null）不参与派生，与 isLiveEdge 对称。
    if (tag.confirmedBy === null) continue;
    const node = nodesById.get(tag.knowledgeNodeId);
    if (!node) continue;
    for (const link of node.resourceLinks) {
      const key = link.uri;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        title: link.label,
        kind: inferKnowledgeKind(link.uri),
        uri: link.uri,
      });
    }
  }
  return out;
}

/** 把治理快照投影成前端 DepGraph 视图（节点状态 + 阻塞归因 + 关键链 + 被卡去学资料）。 */
export function toDepGraphView(
  snapshot: GovernanceSnapshot,
  now: string,
): DepGraph {
  const tasksById = indexBy(snapshot.tasks, (t) => t.id);
  const groupsById = indexBy(snapshot.groups, (g) => g.id);
  const membersById = indexBy(snapshot.members, (m) => m.id);
  const knowledgeById = indexBy(snapshot.knowledgeNodes, (n) => n.id);

  const attributions = deriveBlockAttributions(snapshot, now);
  const attrByIdle = indexBy(attributions, (a) => a.idleTaskId);
  // 关键链只走 live 边（active + 已确认），与 deriveBlockAttributions / 阻塞边渲染同口径；
  // satisfied / 未确认 AI 边不得延伸关键链或点亮 isCritical（C4）。
  const criticalSet = computeCriticalSet(
    snapshot.tasks,
    snapshot.dependencies.filter(isLiveEdge),
  );

  const nodes: DepNode[] = snapshot.tasks.map((task) => {
    const unmet = unmetNeedsOf(task.id, snapshot.needs);
    const attr = attrByIdle.get(task.id);

    let status: DepNodeStatus;
    if (task.status === 'done') status = 'done';
    else if (unmet.length > 0) status = 'gap';
    else if (attr) status = 'blockedIdle';
    else if (ownerIsIdle(task, membersById)) status = 'freeIdle';
    else status = 'working';

    const root = attr ? tasksById.get(attr.rootBlockerTaskId) : undefined;
    const knowledgeTaskIds = attr
      ? [task.id, attr.rootBlockerTaskId]
      : [task.id];

    return {
      id: task.id,
      label: task.title,
      groupId: task.groupId,
      groupName: groupsById.get(task.groupId)?.name ?? task.groupId,
      robotTarget: task.robotTarget,
      ownerLabel: task.ownerId
        ? (membersById.get(task.ownerId)?.displayName ?? null)
        : null,
      status,
      blockedByTaskId: status === 'blockedIdle' && root ? root.id : null,
      blockedByLabel: status === 'blockedIdle' && root ? root.title : null,
      isCritical: criticalSet.has(task.id),
      intrinsicComplexity: task.intrinsicComplexity,
      unmetNeedLabels: unmet.map((n) => n.description),
      relatedKnowledge: relatedKnowledgeFor(
        knowledgeTaskIds,
        snapshot.taskKnowledgeTags,
        knowledgeById,
      ),
    };
  });

  const statusById = indexBy(nodes, (n) => n.id);
  const edges: DepEdge[] = [];
  for (const dep of snapshot.dependencies) {
    const from = tasksById.get(dep.fromTaskId);
    const to = tasksById.get(dep.toTaskId);
    if (!from || !to) continue;

    let kind: DepEdgeKind;
    if (dep.status === 'active' && dep.confirmedBy !== null && from.status !== 'done') {
      kind = 'blocking';
    } else if (
      statusById.get(dep.fromTaskId)?.isCritical &&
      statusById.get(dep.toTaskId)?.isCritical
    ) {
      kind = 'critical';
    } else {
      kind = 'normal';
    }
    edges.push({ id: dep.id, source: dep.fromTaskId, target: dep.toTaskId, kind });
  }

  const summary = {
    criticalCount: nodes.filter((n) => n.isCritical).length,
    blockedCount: nodes.filter((n) => n.status === 'gap').length,
    blockedIdleCount: nodes.filter((n) => n.status === 'blockedIdle').length,
    freeIdleCount: nodes.filter((n) => n.status === 'freeIdle').length,
  };

  return {
    seasonId: snapshot.seasonId,
    projectId: snapshot.projectId,
    stage: snapshot.stage,
    nodes,
    edges,
    summary,
    generatedAt: now,
  };
}
