import {
  canBoardResource,
  type SharedResource,
  type Task,
  type TodayPlanSessionDraft,
} from '@teamhub/hub-contracts';

// 今日计划表格（D-082 §5）纯函数层：草稿行 <-> TodayPlanSessionDraft[] <-> 落盘 batch body 的三段映射。
// 全部零副作用（不发请求、不摸时钟），配单测；表格组件只负责编排 IO（拉数据 / 调 mutation）。
//
// I0 红线：草稿行结构上只到「车 + 组 + 任务标题 + 备注」，不含 memberId / invitedMemberIds——
// 任何一步都推不出成员维度。

/** 一行表格草稿：车固定（resourceId），组/任务/备注可编辑。 */
export interface DraftRow {
  key: string; // 稳定 key（React list key，非落盘字段），格式 `${resourceId}#${slot}`
  resourceId: string;
  groupId: string; // 下拉选中的组 id，未选 = ''
  taskTitle: string; // 组合框自由文本（今日任务标题），未填 = ''
  // 该行任务标题在候选里找不到匹配时，是否已显式确认「建新任务」（§6 D1 优化：非静默暴增）。
  // 标题一改就应失效，由调用方在 onChange 时一并清掉，避免误把「新文本」当「已确认旧文本」。
  confirmNewTask: boolean;
  note: string; // 备注，未填 = ''
}

export function makeRowKey(resourceId: string, slot: number): string {
  return `${resourceId}#${slot}`;
}

function blankRow(resourceId: string, slot = 0): DraftRow {
  return {
    key: makeRowKey(resourceId, slot),
    resourceId,
    groupId: '',
    taskTitle: '',
    confirmNewTask: false,
    note: '',
  };
}

/** 表格基线：每台可上场车一条空行（车列固定，其余待填）。不可上场（维修/退役/拆解）车不进表格。 */
export function buildBaselineRows(resources: SharedResource[]): DraftRow[] {
  return resources.filter((r) => canBoardResource(r.status)).map((r) => blankRow(r.id));
}

/** 该车候选任务：robotTarget 对齐（未填 robotTarget 的任务 = 泛化租户任务，也算候选）+ shared 通用任务。 */
export function candidateTasksForResource(tasks: Task[], resource: SharedResource): Task[] {
  return tasks.filter(
    (t) =>
      t.robotTarget == null || t.robotTarget === resource.robotTarget || t.robotTarget === 'shared',
  );
}

/** 按标题在该车候选任务里找精确匹配（trim + 大小写不敏感）；找不到返回 undefined。 */
export function matchTaskByTitle(
  tasks: Task[],
  resource: SharedResource,
  title: string,
): Task | undefined {
  const trimmed = title.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  return candidateTasksForResource(tasks, resource).find(
    (t) => t.title.trim().toLowerCase() === lower,
  );
}

/**
 * 把「使用预设」/「继续昨天」产出的 TodayPlanSessionDraft[] 铺成整张表格（整表替换，非合并）：
 * 每台可上场车若在 drafts 里有条目 → 按 orderInWindow 铺成对应多行；没有 → 回落单条空行（可手填）。
 * taskTitle 由 holderTaskId 反查 tasksById 得任务标题；查不到（脏引用）也回落空串，不让表格崩。
 */
export function draftsToRows(
  resources: SharedResource[],
  drafts: TodayPlanSessionDraft[],
  tasksById: Map<string, Task>,
): DraftRow[] {
  const byResource = new Map<string, TodayPlanSessionDraft[]>();
  for (const d of drafts) {
    const arr = byResource.get(d.resourceId) ?? [];
    arr.push(d);
    byResource.set(d.resourceId, arr);
  }
  const rows: DraftRow[] = [];
  for (const resource of resources) {
    if (!canBoardResource(resource.status)) continue;
    const list = (byResource.get(resource.id) ?? [])
      .slice()
      .sort((a, b) => a.orderInWindow - b.orderInWindow);
    if (list.length === 0) {
      rows.push(blankRow(resource.id));
      continue;
    }
    list.forEach((d, i) => {
      rows.push({
        key: makeRowKey(resource.id, i),
        resourceId: resource.id,
        groupId: d.holderGroupId,
        taskTitle: d.holderTaskId ? tasksById.get(d.holderTaskId)?.title ?? '' : '',
        confirmNewTask: false,
        note: d.note ?? '',
      });
    });
  }
  return rows;
}

/** 落盘用的单条 session 草稿形状（对齐 CreateResourceSessionsBatchRequestSchema.sessions 的元素）。 */
export type BatchSessionDraft = {
  projectId: string;
  resourceId: string;
  windowLabel: string;
  orderInWindow: number;
  holderGroupId: string;
  holderTaskId: string | null;
  invitedMemberIds: [];
  note: string | null;
  eta: null;
};

/** 一行是否「空行」（车列以外全空）——空行提交时静默跳过，视为「今天这车不用排」。 */
export function isBlankRow(row: DraftRow): boolean {
  return row.groupId.trim() === '' && row.taskTitle.trim() === '' && row.note.trim() === '';
}

/**
 * 表格草稿行 -> 落盘草稿（不含 confirmedBy，由调用方在批量请求整体一层补上）。
 * `resolvedTaskIdByKey`：已由调用方把「匹配到的既有任务 / 新建任务」都解析成 taskId（或 null）后传入
 * （新建任务是 IO，不能在这个纯函数里做）；本函数只管纯映射 + orderInWindow 按车重新编号 + 空行跳过。
 * 跳过：车列查不到对应 SharedResource（防御）、组未选（防御，调用方应已校验拦在前面）。
 */
export function rowsToSessionDrafts(
  rows: DraftRow[],
  resources: SharedResource[],
  windowLabel: string,
  resolvedTaskIdByKey: Map<string, string | null>,
): BatchSessionDraft[] {
  const resourcesById = new Map(resources.map((r) => [r.id, r]));
  const orderByResource = new Map<string, number>();
  const out: BatchSessionDraft[] = [];
  for (const row of rows) {
    if (isBlankRow(row)) continue;
    const groupId = row.groupId.trim();
    if (!groupId) continue;
    const resource = resourcesById.get(row.resourceId);
    if (!resource) continue;
    const order = orderByResource.get(row.resourceId) ?? 0;
    orderByResource.set(row.resourceId, order + 1);
    out.push({
      projectId: resource.projectId,
      resourceId: row.resourceId,
      windowLabel,
      orderInWindow: order,
      holderGroupId: groupId,
      holderTaskId: resolvedTaskIdByKey.get(row.key) ?? null,
      invitedMemberIds: [],
      note: row.note.trim() || null,
      eta: null,
    });
  }
  return out;
}
