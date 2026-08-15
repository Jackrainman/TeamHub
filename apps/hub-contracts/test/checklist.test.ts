import { describe, expect, test } from 'vitest';
import {
  CHECKLIST_DRIFT_LOOKAHEAD_WEEKS,
  ChecklistDriftLevelSchema,
  CreateChecklistItemRequestSchema,
  GateChecklistItemSchema,
  deriveChecklistDrift,
  listBlockingChecklistItems,
} from '../src/index.js';
import type { ActorRef, GateChecklistItem } from '../src/index.js';

/**
 * GATE-CHECKLIST-IOU 契约单测（gate-checklist-iou.md §2/§3，D-087）：
 * anchor 互斥 / waived 强制留名+理由 / passed 强制清偿留名 / drift 三档边界 / 过门拦截过滤。
 */

const NOW = new Date('2026-07-15T00:00:00.000Z');
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

const actor: ActorRef = { id: 'm-1', displayName: '张三', source: 'console' };

/** 基础合法 item：挂日期、pending。覆盖字段用 overrides 覆写。 */
function itemInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'chk-1',
    seasonBaselineId: 'baseline-2026',
    title: '24V→5V 模块无溯源，先用着',
    anchorDueAt: '2026-08-01T00:00:00.000Z',
    origin: 'iou',
    status: 'pending',
    createdAt: '2026-07-15T00:00:00.000Z',
    ...overrides,
  };
}

/** 解析成功后的强类型 item（供派生函数测试用），跳过 anchor 之外的分支。 */
function parsedItem(overrides: Partial<GateChecklistItem> = {}): GateChecklistItem {
  const base = GateChecklistItemSchema.parse(itemInput());
  return { ...base, ...overrides };
}

describe('GateChecklistItemSchema — anchor 挂接二选一互斥', () => {
  test('恰好填 anchorMilestoneId：通过', () => {
    const res = GateChecklistItemSchema.safeParse(
      itemInput({ anchorDueAt: undefined, anchorMilestoneId: 'm-g4' }),
    );
    expect(res.success).toBe(true);
  });

  test('恰好填 anchorDueAt：通过', () => {
    const res = GateChecklistItemSchema.safeParse(itemInput());
    expect(res.success).toBe(true);
  });

  test('两个都填：拒绝，issue 落在 anchorMilestoneId', () => {
    const res = GateChecklistItemSchema.safeParse(
      itemInput({ anchorMilestoneId: 'm-g4', anchorDueAt: '2026-08-01T00:00:00.000Z' }),
    );
    expect(res.success).toBe(false);
    if (res.success) throw new Error('应拒绝');
    expect(res.error.issues.some((i) => i.path[0] === 'anchorMilestoneId')).toBe(true);
  });

  test('两个都不填：拒绝', () => {
    const res = GateChecklistItemSchema.safeParse(
      itemInput({ anchorDueAt: undefined, anchorMilestoneId: undefined }),
    );
    expect(res.success).toBe(false);
    if (res.success) throw new Error('应拒绝');
    expect(res.error.issues.some((i) => i.path[0] === 'anchorMilestoneId')).toBe(true);
  });
});

describe('GateChecklistItemSchema — waived 强制留名 + 理由（红线3）', () => {
  test('waived 但缺 waivedBy 与 waiveReason：拒绝，两条 issue 各就位', () => {
    const res = GateChecklistItemSchema.safeParse(itemInput({ status: 'waived' }));
    expect(res.success).toBe(false);
    if (res.success) throw new Error('应拒绝');
    const paths = res.error.issues.map((i) => i.path[0]);
    expect(paths).toContain('waivedBy');
    expect(paths).toContain('waiveReason');
  });

  test('waived 只给 waivedBy、缺 waiveReason：仍拒绝（理由强制非空）', () => {
    const res = GateChecklistItemSchema.safeParse(
      itemInput({ status: 'waived', waivedBy: actor }),
    );
    expect(res.success).toBe(false);
    if (res.success) throw new Error('应拒绝');
    expect(res.error.issues.some((i) => i.path[0] === 'waiveReason')).toBe(true);
  });

  test('waived 给全 waivedBy + waiveReason：通过', () => {
    const res = GateChecklistItemSchema.safeParse(
      itemInput({ status: 'waived', waivedBy: actor, waiveReason: '实验车临时用，赛前必换' }),
    );
    expect(res.success).toBe(true);
  });

  test('waiveReason 空串：被 min(1) 拒绝', () => {
    const res = GateChecklistItemSchema.safeParse(
      itemInput({ status: 'waived', waivedBy: actor, waiveReason: '' }),
    );
    expect(res.success).toBe(false);
  });
});

describe('GateChecklistItemSchema — passed 强制清偿留名（红线4）', () => {
  test('passed 缺 clearedBy：拒绝', () => {
    const res = GateChecklistItemSchema.safeParse(itemInput({ status: 'passed' }));
    expect(res.success).toBe(false);
    if (res.success) throw new Error('应拒绝');
    expect(res.error.issues.some((i) => i.path[0] === 'clearedBy')).toBe(true);
  });

  test('passed 给 clearedBy：通过，且读契约不剥名（事实层带名 D-085）', () => {
    const res = GateChecklistItemSchema.safeParse(itemInput({ status: 'passed', clearedBy: actor }));
    expect(res.success).toBe(true);
    if (!res.success) throw new Error('应通过');
    // D-085 事实层带名：clearedBy 保留在事实卡上，不做剥名 Public 变体。
    expect(res.data.clearedBy).toEqual(actor);
  });
});

describe('CreateChecklistItemRequestSchema — origin 缺省 + anchor 互斥', () => {
  test('省略 origin：缺省为 iou', () => {
    const res = CreateChecklistItemRequestSchema.safeParse({
      title: '快记一条欠条',
      anchorMilestoneId: 'm-g4',
    });
    expect(res.success).toBe(true);
    if (!res.success) throw new Error('应通过');
    expect(res.data.origin).toBe('iou');
  });

  test('两个 anchor 都填：拒绝', () => {
    const res = CreateChecklistItemRequestSchema.safeParse({
      title: '快记',
      anchorMilestoneId: 'm-g4',
      anchorDueAt: '2026-08-01T00:00:00.000Z',
    });
    expect(res.success).toBe(false);
    if (res.success) throw new Error('应拒绝');
    expect(res.error.issues.some((i) => i.path[0] === 'anchorMilestoneId')).toBe(true);
  });

  test('两个 anchor 都不填：拒绝', () => {
    const res = CreateChecklistItemRequestSchema.safeParse({ title: '快记' });
    expect(res.success).toBe(false);
  });
});

describe('deriveChecklistDrift — 自选日期欠条周粒度红黄绿', () => {
  test('红：anchorDueAt 已过', () => {
    const item = parsedItem({
      id: 'chk-red',
      anchorDueAt: '2026-07-01T00:00:00.000Z',
      status: 'pending',
    });
    const drift = deriveChecklistDrift([item], NOW);
    expect(drift).toEqual([{ itemId: 'chk-red', level: 'red' }]);
  });

  test('黄：距 anchorDueAt ≤ N 周（含边界）', () => {
    const withinDueAt = new Date(
      NOW.getTime() + (CHECKLIST_DRIFT_LOOKAHEAD_WEEKS - 1) * MS_PER_WEEK,
    ).toISOString();
    const boundaryDueAt = new Date(
      NOW.getTime() + CHECKLIST_DRIFT_LOOKAHEAD_WEEKS * MS_PER_WEEK,
    ).toISOString();
    const within = parsedItem({ id: 'chk-y1', anchorDueAt: withinDueAt });
    const boundary = parsedItem({ id: 'chk-y2', anchorDueAt: boundaryDueAt });
    const drift = deriveChecklistDrift([within, boundary], NOW);
    expect(drift).toEqual([
      { itemId: 'chk-y1', level: 'yellow' },
      { itemId: 'chk-y2', level: 'yellow' }, // 恰好 N 周 = 黄（≤ 边界含）
    ]);
  });

  test('绿：远期（> N 周）', () => {
    const farDueAt = new Date(
      NOW.getTime() + (CHECKLIST_DRIFT_LOOKAHEAD_WEEKS + 3) * MS_PER_WEEK,
    ).toISOString();
    const drift = deriveChecklistDrift([parsedItem({ id: 'chk-g', anchorDueAt: farDueAt })], NOW);
    expect(drift).toEqual([{ itemId: 'chk-g', level: 'green' }]);
  });

  test('挂门欠条（anchorMilestoneId）不出条目——时间压力由里程碑 drift + 过门硬闸表达', () => {
    const onGate = parsedItem({
      id: 'chk-gate',
      anchorMilestoneId: 'm-g4',
      anchorDueAt: undefined,
      status: 'pending',
    });
    expect(deriveChecklistDrift([onGate], NOW)).toEqual([]);
  });

  test('已清 / 已豁免的日期欠条不出条目（无时间压力）', () => {
    const passed = parsedItem({
      id: 'chk-p',
      anchorDueAt: '2026-07-01T00:00:00.000Z',
      status: 'passed',
      clearedBy: actor,
    });
    const waived = parsedItem({
      id: 'chk-w',
      anchorDueAt: '2026-07-01T00:00:00.000Z',
      status: 'waived',
      waivedBy: actor,
      waiveReason: '认账',
    });
    expect(deriveChecklistDrift([passed, waived], NOW)).toEqual([]);
  });

  test('空数组：输出空数组，不抛异常', () => {
    expect(deriveChecklistDrift([], NOW)).toEqual([]);
  });

  test('drift 档位是 checklist 自有窄值对象，不依赖 baseline 类型', () => {
    expect(ChecklistDriftLevelSchema.options).toEqual(['red', 'yellow', 'green']);
    expect(CHECKLIST_DRIFT_LOOKAHEAD_WEEKS).toBe(2);
  });
});

describe('listBlockingChecklistItems — 过门拦截过滤', () => {
  const onG4Pending = parsedItem({
    id: 'chk-a',
    anchorMilestoneId: 'm-g4',
    anchorDueAt: undefined,
    status: 'pending',
  });
  const onG4Passed = parsedItem({
    id: 'chk-b',
    anchorMilestoneId: 'm-g4',
    anchorDueAt: undefined,
    status: 'passed',
    clearedBy: actor,
  });
  const onG3Pending = parsedItem({
    id: 'chk-c',
    anchorMilestoneId: 'm-g3',
    anchorDueAt: undefined,
    status: 'pending',
  });
  const dateItemPending = parsedItem({ id: 'chk-d', anchorDueAt: '2026-08-01T00:00:00.000Z' });

  test('只返回挂该门且仍 pending 的项', () => {
    const blocking = listBlockingChecklistItems(
      [onG4Pending, onG4Passed, onG3Pending, dateItemPending],
      'm-g4',
    );
    expect(blocking.map((i) => i.id)).toEqual(['chk-a']); // passed 的 chk-b、他门的 chk-c、日期欠条 chk-d 全排除
  });

  test('无挂该门的 pending 项：空数组（门可过）', () => {
    expect(listBlockingChecklistItems([onG4Passed, onG3Pending], 'm-g4')).toEqual([]);
  });
});
