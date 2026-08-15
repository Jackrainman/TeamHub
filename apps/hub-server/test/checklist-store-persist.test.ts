import { describe, expect, test } from 'vitest';
import type { ActorRef, GateChecklistItem } from '@teamhub/hub-contracts';
import { InMemoryChecklistStore } from './support/inmemory-checklist-store.js';

const seasonBaselineId = 'baseline-season-test-1';
const otherBaselineId = 'baseline-season-test-2';
const reviewer: ActorRef = { id: 'm-senior-1', displayName: '大三验收', source: 'console' };

const seedItem: GateChecklistItem = {
  id: 'chk-demo-1',
  seasonBaselineId,
  title: '24V→5V 模块无溯源，先用着',
  anchorMilestoneId: 'm-g4',
  origin: 'iou',
  status: 'pending',
  createdAt: '2026-06-11T02:00:00.000Z',
};

describe('InMemoryChecklistStore', () => {
  test('listItems：按 seasonBaselineId 过滤，无命中 → 空数组', async () => {
    const store = new InMemoryChecklistStore([seedItem], []);
    const items = await store.listItems(seasonBaselineId);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('chk-demo-1');
    // 读侧克隆隔离（不是同一引用）
    expect(items[0]).not.toBe(seedItem);
    expect(await store.listItems(otherBaselineId)).toEqual([]);
  });

  test('createItem：store 生成 id（chk-new-N）+ 钉 status=pending，createdAt 由调用方传入', async () => {
    const store = new InMemoryChecklistStore([seedItem], []);
    const created = await store.createItem({
      seasonBaselineId,
      title: '备用电池组没做过流保护测试，先用着',
      anchorDueAt: '2026-07-01T00:00:00.000Z',
      origin: 'iou',
      createdAt: '2026-06-20T00:00:00.000Z',
    });
    expect(created.id).toBe('chk-new-2'); // seed 1 条 → 首条生成为 -2
    expect(created.status).toBe('pending');
    expect(created.createdAt).toBe('2026-06-20T00:00:00.000Z');
    expect(created.clearedBy).toBeUndefined();

    const items = await store.listItems(seasonBaselineId);
    expect(items).toHaveLength(2);
  });

  test('createItem：挂接二选一违规（两个都填）→ fail-closed 抛（superRefine），不落库', async () => {
    const store = new InMemoryChecklistStore([], []);
    await expect(
      store.createItem({
        seasonBaselineId,
        title: '非法挂接',
        anchorMilestoneId: 'm-g4',
        anchorDueAt: '2026-07-01T00:00:00.000Z', // 与 milestoneId 同时填 → 违规
        origin: 'iou',
        createdAt: '2026-06-20T00:00:00.000Z',
      }),
    ).rejects.toThrow();
    expect(await store.listItems(seasonBaselineId)).toEqual([]);
  });

  test('createItem：挂接二选一违规（两个都不填）→ fail-closed 抛', async () => {
    const store = new InMemoryChecklistStore([], []);
    await expect(
      store.createItem({
        seasonBaselineId,
        title: '缺挂接',
        origin: 'iou',
        createdAt: '2026-06-20T00:00:00.000Z',
      }),
    ).rejects.toThrow();
  });

  test('clearItem：pending→passed 留名 clearedBy；再清（非 pending）→ null；未知 id → null', async () => {
    const store = new InMemoryChecklistStore([seedItem], []);
    const cleared = await store.clearItem('chk-demo-1', reviewer);
    expect(cleared).not.toBeNull();
    expect(cleared?.status).toBe('passed');
    expect(cleared?.clearedBy).toEqual(reviewer); // 事实卡留名（不剥离）

    // 状态机只许 pending 出发：已 passed 再清 → null
    expect(await store.clearItem('chk-demo-1', reviewer)).toBeNull();
    // 未知 id → null
    expect(await store.clearItem('chk-nope', reviewer)).toBeNull();

    // 原 seed 不被污染（构造期克隆隔离）
    expect(seedItem.status).toBe('pending');
  });

  test('waiveItem：pending→waived 强制留名+理由；已 passed 的项不可豁免 → null', async () => {
    const store = new InMemoryChecklistStore([seedItem], []);
    const waived = await store.waiveItem('chk-demo-1', reviewer, '实验车临时用，赛前必换正式件');
    expect(waived?.status).toBe('waived');
    expect(waived?.waivedBy).toEqual(reviewer);
    expect(waived?.waiveReason).toBe('实验车临时用，赛前必换正式件');

    // 已 waived 再豁免 → null（只许 pending 出发）
    expect(await store.waiveItem('chk-demo-1', reviewer, '再豁免')).toBeNull();

    // clear 后不可再 waive（跨迁移也只许 pending 出发）
    const store2 = new InMemoryChecklistStore([seedItem], []);
    await store2.clearItem('chk-demo-1', reviewer);
    expect(await store2.waiveItem('chk-demo-1', reviewer, '已清偿不可豁免')).toBeNull();
  });

  test('listTemplates：seed 空 → 空数组（等复盘导入）', async () => {
    const store = new InMemoryChecklistStore([seedItem], []);
    expect(await store.listTemplates()).toEqual([]);
  });
});
