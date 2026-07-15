import { afterEach, describe, expect, test } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ActorRef, GateChecklistItem } from '@teamhub/hub-contracts';
import { InMemoryChecklistStore } from '../src/store/mock-checklist-store.js';
import { FileChecklistStore } from '../src/store/file-checklist-store.js';

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

describe('FileChecklistStore 落盘', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test('文件不存在 → seed 起头（默认空）并落一次盘（{items,templates} 两键）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'checklist-'));
    const file = join(dir, 'seed.json');

    const store = await FileChecklistStore.create(file);
    expect(await store.listItems(seasonBaselineId)).toEqual([]);

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(onDisk).toEqual({ items: [], templates: [] });
  });

  test('createItem/clearItem 落盘 + 新实例从同文件加载（重启不丢）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'checklist-'));
    const file = join(dir, 'checklist.json');

    const store = await FileChecklistStore.create(file, [seedItem], []);
    const created = await store.createItem({
      seasonBaselineId,
      title: '现场快记欠条',
      anchorDueAt: '2026-07-01T00:00:00.000Z',
      origin: 'iou',
      createdAt: '2026-06-20T00:00:00.000Z',
    });
    await store.clearItem('chk-demo-1', reviewer);

    // 模拟重启：新实例从同一文件加载，写入的欠条 + 清偿留痕仍在
    const reloaded = await FileChecklistStore.create(file);
    const items = await reloaded.listItems(seasonBaselineId);
    const demo1 = items.find((i) => i.id === 'chk-demo-1');
    expect(demo1?.status).toBe('passed');
    expect(demo1?.clearedBy).toEqual(reviewer); // 事实卡留名落盘可读回（不剥离）
    expect(items.some((i) => i.id === created.id)).toBe(true);
  });

  test('文件存在但损坏 → 抛（fail-closed，不静默用 seed 覆盖团队欠条数据）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'checklist-corrupt-'));
    const file = join(dir, 'checklist.json');
    // 缺 origin/status 必填字段的非法 GateChecklistItem
    await writeFile(
      file,
      JSON.stringify({
        items: [{ id: 'x', seasonBaselineId, title: 't', anchorDueAt: '2026-07-01T00:00:00.000Z', createdAt: '2026-06-20T00:00:00.000Z' }],
        templates: [],
      }),
    );
    await expect(FileChecklistStore.create(file)).rejects.toThrow();
  });

  test('缺顶层键（非 {items,templates}）→ 抛（fail-closed）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'checklist-shape-'));
    const file = join(dir, 'checklist.json');
    await writeFile(file, JSON.stringify([])); // 旧格式裸数组，非两键对象
    await expect(FileChecklistStore.create(file)).rejects.toThrow();
  });

  // 同 FileBaselineStore 修复 #3 纪律：persist 失败 → 内存精确回滚（撤销刚新建），不留幽灵欠条。
  test('createItem persist 失败 → 内存回滚（不留幽灵欠条）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'checklist-rollback-'));
    const sub = join(dir, 'basedir');
    await mkdir(sub);
    const file = join(sub, 'checklist.json');
    const store = await FileChecklistStore.create(file);
    expect(await store.listItems(seasonBaselineId)).toEqual([]);

    await rm(sub, { recursive: true, force: true });
    await writeFile(sub, 'blocker'); // 让下次 persist 的 mkdir(sub) 失败

    await expect(
      store.createItem({
        seasonBaselineId,
        title: '写失败应回滚',
        anchorDueAt: '2026-07-01T00:00:00.000Z',
        origin: 'iou',
        createdAt: '2026-06-20T00:00:00.000Z',
      }),
    ).rejects.toThrow();

    // 写前无欠条，失败后必须回到"空"（不留没落盘的幽灵记录）
    expect(await store.listItems(seasonBaselineId)).toEqual([]);
  });

  // H2 同纪律：一次写失败不能永久毒化写链，修复目录后下一次写仍需真正落盘。
  test('写失败后写链不中毒：恢复后下一次 createItem 仍能落盘', async () => {
    dir = await mkdtemp(join(tmpdir(), 'checklist-h2-'));
    const sub = join(dir, 'basedir');
    await mkdir(sub);
    const file = join(sub, 'checklist.json');
    const store = await FileChecklistStore.create(file);

    await rm(sub, { recursive: true, force: true });
    await writeFile(sub, 'blocker');
    await expect(
      store.createItem({
        seasonBaselineId,
        title: '第一次写失败',
        anchorDueAt: '2026-07-01T00:00:00.000Z',
        origin: 'iou',
        createdAt: '2026-06-20T00:00:00.000Z',
      }),
    ).rejects.toThrow();

    await rm(sub);
    await mkdir(sub);
    await store.createItem({
      seasonBaselineId,
      title: '恢复后再写',
      anchorDueAt: '2026-07-02T00:00:00.000Z',
      origin: 'iou',
      createdAt: '2026-06-21T00:00:00.000Z',
    });

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(onDisk.items.some((i: { title: string }) => i.title === '恢复后再写')).toBe(true);
  });
});
