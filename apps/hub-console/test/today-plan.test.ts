import { describe, expect, test } from 'vitest';
import type {
  ResourceSession,
  SharedResource,
  Task,
  TodayPlanSessionDraft,
} from '@teamhub/hub-contracts';
import {
  buildBaselineRows,
  draftsToRows,
  isBlankRow,
  makeRowKey,
  matchTaskByTitle,
  rowsToSessionDrafts,
  type DraftRow,
} from '../src/features/schedule/today-plan';
import { candidateTasksForResource } from '../src/shared/lib/resource-tasks';
import { buildCarryOverPlan } from '../src/features/schedule/carry-over';

function resource(over: Partial<SharedResource> & Pick<SharedResource, 'id'>): SharedResource {
  return {
    projectId: 'prj-robots',
    name: over.id,
    kind: 'robot',
    robotTarget: 'R1',
    status: 'available',
    statusReason: null,
    statusSource: 'console',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

function task(over: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    projectId: 'prj-robots',
    groupId: 'grp-ec',
    rawSummary: over.title,
    status: 'inProgress',
    statusSource: 'console',
    ownerId: null,
    collaboratorIds: [],
    robotTarget: 'R1',
    intrinsicComplexity: 'normal',
    lastProgressAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

describe('buildBaselineRows（表格基线：每台可上场车一条空行）', () => {
  test('只列可上场车（跳过 repair/retired/disassembling）', () => {
    const rows = buildBaselineRows([
      resource({ id: 'res-r1', status: 'available' }),
      resource({ id: 'res-r2', status: 'repair' }),
      resource({ id: 'res-r3', status: 'inUse' }),
    ]);
    expect(rows.map((r) => r.resourceId)).toEqual(['res-r1', 'res-r3']);
  });

  test('空行车列以外全空、key 稳定', () => {
    const [row] = buildBaselineRows([resource({ id: 'res-r1' })]);
    expect(row.key).toBe(makeRowKey('res-r1', 0));
    expect(row.groupId).toBe('');
    expect(row.taskTitle).toBe('');
    expect(row.note).toBe('');
    expect(row.confirmNewTask).toBe(false);
  });
});

describe('candidateTasksForResource / matchTaskByTitle（该车现有任务·复用优先）', () => {
  const tasks = [
    task({ id: 't-r1', title: 'R1 系统调试', robotTarget: 'R1' }),
    task({ id: 't-r2', title: 'R2 底盘', robotTarget: 'R2' }),
    task({ id: 't-shared', title: '通用视觉标定', robotTarget: 'shared' }),
  ];
  const r1 = resource({ id: 'res-r1', robotTarget: 'R1' });

  test('候选 = 同车 robotTarget + shared 通用任务，不含别的车', () => {
    const candidates = candidateTasksForResource(tasks, r1);
    expect(candidates.map((t) => t.id).sort()).toEqual(['t-r1', 't-shared']);
  });

  test('精确匹配（trim + 大小写不敏感）复用既有任务，不建新', () => {
    // 前后空白 + 大小写变体都应命中同一条既有任务（复用优先，不因输入形式差异误判为「新任务」）。
    expect(matchTaskByTitle(tasks, r1, '  R1 系统调试  ')?.id).toBe('t-r1');
    expect(matchTaskByTitle(tasks, r1, 'r1 系统调试')?.id).toBe('t-r1');
  });

  test('无匹配（含空串）返回 undefined，交由调用方走「建新任务」确认流程', () => {
    expect(matchTaskByTitle(tasks, r1, '')).toBeUndefined();
    expect(matchTaskByTitle(tasks, r1, '   ')).toBeUndefined();
    expect(matchTaskByTitle(tasks, r1, 'R1 全新任务')).toBeUndefined();
  });
});

describe('draftsToRows（「使用预设」/「继续昨天」铺整张表格，整表替换）', () => {
  const resources = [resource({ id: 'res-r1' }), resource({ id: 'res-r2' })];
  const tasksById = new Map<string, Task>([
    ['t-r1', task({ id: 't-r1', title: 'R1 系统调试' })],
  ]);

  test('有 drafts 的车按 orderInWindow 铺多行，taskTitle 反查任务标题', () => {
    const drafts: TodayPlanSessionDraft[] = [
      {
        projectId: 'prj-robots',
        resourceId: 'res-r1',
        windowLabel: '2026-07-02',
        orderInWindow: 0,
        holderGroupId: 'grp-ec',
        holderTaskId: 't-r1',
        invitedMemberIds: [],
        note: null,
        source: 'human',
        eta: null,
      },
    ];
    const rows = draftsToRows(resources, drafts, tasksById);
    const r1Row = rows.find((r) => r.resourceId === 'res-r1')!;
    expect(r1Row.groupId).toBe('grp-ec');
    expect(r1Row.taskTitle).toBe('R1 系统调试');
  });

  test('没 drafts 的车回落一条空行（可手填），不整表清空', () => {
    const rows = draftsToRows(resources, [], tasksById);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.groupId === '' && r.taskTitle === '')).toBe(true);
  });

  test('holderTaskId 查不到任务（脏引用）回落空串，不崩', () => {
    const drafts: TodayPlanSessionDraft[] = [
      {
        projectId: 'prj-robots',
        resourceId: 'res-r1',
        windowLabel: '2026-07-02',
        orderInWindow: 0,
        holderGroupId: 'grp-ec',
        holderTaskId: 't-missing',
        invitedMemberIds: [],
        note: null,
        source: 'human',
        eta: null,
      },
    ];
    const rows = draftsToRows(resources, drafts, tasksById);
    expect(rows.find((r) => r.resourceId === 'res-r1')!.taskTitle).toBe('');
  });
});

describe('buildCarryOverPlan（继续昨天·表格版，I0 guard 与 buildCarryOverDraft 同源）', () => {
  const prev: ResourceSession = {
    id: 'sess-1',
    projectId: 'prj-robots',
    resourceId: 'res-r1',
    windowLabel: '2026-07-01',
    orderInWindow: 1,
    holderGroupId: 'grp-ec',
    holderTaskId: 't-r1',
    invitedMemberIds: ['m-a', 'm-b'],
    note: '昨天备注',
    source: 'human',
    confirmedBy: { id: 'x', displayName: 'X', source: 'console' },
    eta: '约 22:00',
    createdAt: '2026-07-01T10:00:00.000Z',
  };

  test('换日、保留组/任务/接力序，绝不跨日带成员维度 / eta / note', () => {
    const [draft] = buildCarryOverPlan([prev], '2026-07-02');
    expect(draft.windowLabel).toBe('2026-07-02');
    expect(draft.resourceId).toBe('res-r1');
    expect(draft.holderGroupId).toBe('grp-ec');
    expect(draft.holderTaskId).toBe('t-r1');
    expect(draft.orderInWindow).toBe(1);
    expect(draft.invitedMemberIds).toEqual([]);
    expect(draft.eta).toBeNull();
    expect(draft.note).toBeNull();
  });
});

describe('isBlankRow / rowsToSessionDrafts（表格 -> batch body 映射）', () => {
  const resources = [resource({ id: 'res-r1' }), resource({ id: 'res-r2' })];

  function row(over: Partial<DraftRow> & Pick<DraftRow, 'resourceId'>): DraftRow {
    return {
      key: makeRowKey(over.resourceId, 0),
      groupId: '',
      taskTitle: '',
      confirmNewTask: false,
      note: '',
      ...over,
    };
  }

  test('全空行判定为空、参与提交时静默跳过', () => {
    const blank = row({ resourceId: 'res-r1' });
    expect(isBlankRow(blank)).toBe(true);
    const drafts = rowsToSessionDrafts([blank], resources, '2026-07-02', new Map());
    expect(drafts).toHaveLength(0);
  });

  test('未选组的非空行防御性跳过（调用方应已校验拦在前面，这里是兜底不落脏数据）', () => {
    const noGroup = row({ resourceId: 'res-r1', taskTitle: '有任务名但没选组' });
    const drafts = rowsToSessionDrafts([noGroup], resources, '2026-07-02', new Map());
    expect(drafts).toHaveLength(0);
  });

  test('同车多行按出现顺序重编 orderInWindow=0,1,2…，与原 key 无关', () => {
    const rows: DraftRow[] = [
      row({ resourceId: 'res-r1', key: 'r1-a', groupId: 'grp-ec' }),
      row({ resourceId: 'res-r2', key: 'r2-a', groupId: 'grp-mech' }),
      row({ resourceId: 'res-r1', key: 'r1-b', groupId: 'grp-vision' }),
    ];
    const drafts = rowsToSessionDrafts(rows, resources, '2026-07-02', new Map());
    const r1Orders = drafts.filter((d) => d.resourceId === 'res-r1').map((d) => d.orderInWindow);
    expect(r1Orders).toEqual([0, 1]);
    expect(drafts.find((d) => d.resourceId === 'res-r2')!.orderInWindow).toBe(0);
  });

  test('holderTaskId 取 resolvedTaskIdByKey；note 空串归一为 null；I0：invitedMemberIds 恒 []', () => {
    const r = row({ resourceId: 'res-r1', key: 'k1', groupId: 'grp-ec', note: '  临时备注  ' });
    const resolved = new Map<string, string | null>([['k1', 't-new-123']]);
    const [draft] = rowsToSessionDrafts([r], resources, '2026-07-02', resolved);
    expect(draft.holderTaskId).toBe('t-new-123');
    expect(draft.note).toBe('临时备注');
    expect(draft.invitedMemberIds).toEqual([]);
    expect(draft.eta).toBeNull();
  });

  test('未落在 resolvedTaskIdByKey 里的行 holderTaskId 回落 null', () => {
    const r = row({ resourceId: 'res-r1', key: 'k1', groupId: 'grp-ec' });
    const [draft] = rowsToSessionDrafts([r], resources, '2026-07-02', new Map());
    expect(draft.holderTaskId).toBeNull();
  });

  test('引用不存在的 resourceId（防御）跳过', () => {
    const r = row({ resourceId: 'res-ghost', groupId: 'grp-ec' });
    const drafts = rowsToSessionDrafts([r], resources, '2026-07-02', new Map());
    expect(drafts).toHaveLength(0);
  });
});
