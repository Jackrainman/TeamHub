import { afterEach, describe, expect, test } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SeasonBaseline } from '@teamhub/hub-contracts';
import { InMemoryBaselineStore } from '../src/store/mock-baseline-store.js';
import { FileBaselineStore } from '../src/store/file-baseline-store.js';

const seasonId = 'season-test-1';

const seedBaseline: SeasonBaseline = {
  id: 'baseline-season-test-1',
  seasonId,
  anchors: { semesterStart: '2026-09-01T00:00:00.000Z' },
  segments: [],
  phases: [],
  milestones: [
    {
      id: 'm-g1',
      title: '门 G1：问题清单收敛',
      kind: 'gate',
      plannedAt: '2026-11-01T00:00:00.000Z',
      status: 'pending',
    },
  ],
};

describe('InMemoryBaselineStore', () => {
  test('getBaseline：无基准线 → null（不是 404，GET 语义上"还没有"是合法状态）', async () => {
    const store = new InMemoryBaselineStore();
    expect(await store.getBaseline(seasonId)).toBeNull();
  });

  test('upsertBaseline：不存在则创建，id 由 seasonId 派生', async () => {
    const store = new InMemoryBaselineStore();
    const created = await store.upsertBaseline(seasonId, {
      anchors: { semesterStart: '2026-09-01T00:00:00.000Z' },
      milestones: [seedBaseline.milestones[0]],
    });
    expect(created.id).toBe('baseline-season-test-1');
    expect(created.seasonId).toBe(seasonId);
    expect(created.milestones).toHaveLength(1);

    // 再次读回与写入一致（读侧克隆隔离：不是同一引用）
    const reread = await store.getBaseline(seasonId);
    expect(reread).not.toBeNull();
    expect(reread).not.toBe(created);
    expect(reread?.milestones[0].id).toBe('m-g1');
  });

  test('upsertBaseline：已存在则整段覆盖式合并，id/seasonId 不可经 patch 改写', async () => {
    const store = new InMemoryBaselineStore([seedBaseline]);
    const updated = await store.upsertBaseline(seasonId, {
      anchors: { semesterStart: '2026-09-08T00:00:00.000Z' },
    });
    expect(updated.id).toBe(seedBaseline.id);
    expect(updated.seasonId).toBe(seasonId);
    expect(updated.anchors.semesterStart).toBe('2026-09-08T00:00:00.000Z');
    // patch 未提供 milestones → 沿用既有（整段覆盖只覆盖 patch 里出现的字段）
    expect(updated.milestones).toHaveLength(1);
  });

  test('passMilestone：命中里程碑 → 更新 status/passedBy/evidenceRefs，未提供字段维持原值', async () => {
    const store = new InMemoryBaselineStore([seedBaseline]);
    const passed = await store.passMilestone(seasonId, 'm-g1', {
      status: 'passed',
      passedBy: { id: 'm-senior-1', displayName: '大三验收人', source: 'human' },
      evidenceRefs: ['artifact-1'],
    });
    expect(passed).not.toBeNull();
    expect(passed?.milestones[0].status).toBe('passed');
    expect(passed?.milestones[0].passedBy).toEqual({
      id: 'm-senior-1',
      displayName: '大三验收人',
      source: 'human',
    });
    expect(passed?.milestones[0].evidenceRefs).toEqual(['artifact-1']);
    expect(passed?.milestones[0].title).toBe('门 G1：问题清单收敛'); // 未提供字段不被覆空

    // 原 seed 不被污染（构造期克隆隔离）
    expect(seedBaseline.milestones[0].status).toBe('pending');
  });

  test('passMilestone：赛季无基准线 / milestoneId 未命中 → null', async () => {
    const store = new InMemoryBaselineStore([seedBaseline]);
    expect(
      await store.passMilestone('season-nope', 'm-g1', { status: 'passed' }),
    ).toBeNull();
    expect(
      await store.passMilestone(seasonId, 'm-nope', { status: 'passed' }),
    ).toBeNull();
  });
});

describe('FileBaselineStore 落盘', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test('文件不存在 → seed 起头（本步默认空数组）并落一次盘', async () => {
    dir = await mkdtemp(join(tmpdir(), 'baseline-'));
    const file = join(dir, 'seed.json');

    const store = await FileBaselineStore.create(file);
    expect(await store.getBaseline(seasonId)).toBeNull();

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(onDisk).toEqual([]);
  });

  test('upsertBaseline 落盘 + 新实例从同文件加载（重启不丢）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'baseline-'));
    const file = join(dir, 'baseline.json');

    const store = await FileBaselineStore.create(file);
    await store.upsertBaseline(seasonId, {
      anchors: seedBaseline.anchors,
      milestones: seedBaseline.milestones,
    });

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(
      onDisk.some((b: { seasonId: string }) => b.seasonId === seasonId),
    ).toBe(true);

    // 模拟重启：新实例从同一文件加载，写入的基准线仍在
    const reloaded = await FileBaselineStore.create(file);
    const reread = await reloaded.getBaseline(seasonId);
    expect(reread?.milestones).toHaveLength(1);

    // 验证门过门同样落盘可读回
    await store.passMilestone(seasonId, 'm-g1', { status: 'missed' });
    const reloaded2 = await FileBaselineStore.create(file);
    expect((await reloaded2.getBaseline(seasonId))?.milestones[0].status).toBe(
      'missed',
    );
  });

  test('文件存在但损坏 → 抛（fail-closed，不静默用 seed 覆盖团队数据）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'baseline-corrupt-'));
    const file = join(dir, 'baseline.json');
    // 缺 milestones 必填字段的非法 SeasonBaseline
    await writeFile(
      file,
      JSON.stringify([{ id: 'b-1', seasonId, anchors: {}, segments: [], phases: [] }]),
    );
    await expect(FileBaselineStore.create(file)).rejects.toThrow();
  });

  // 同 FileKbStore/FileInvStore 修复 #3 纪律：persist 失败 → 内存精确回滚到写前状态
  // （含"写前本不存在、写后需撤销新建"的情形），避免「内存已变更 + 客户端 500 重试」产生幽灵基准线。
  test('upsertBaseline persist 失败 → 内存回滚（不留幽灵基准线）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'baseline-rollback-'));
    const sub = join(dir, 'basedir');
    await mkdir(sub);
    const file = join(sub, 'baseline.json');
    const store = await FileBaselineStore.create(file);
    expect(await store.getBaseline(seasonId)).toBeNull();

    await rm(sub, { recursive: true, force: true });
    await writeFile(sub, 'blocker'); // 让下次 persist 的 mkdir(sub) 失败

    await expect(
      store.upsertBaseline(seasonId, { milestones: seedBaseline.milestones }),
    ).rejects.toThrow();

    // 写前该赛季无基准线，失败后必须回到"不存在"（不是留一条没落盘的幽灵记录）
    expect(await store.getBaseline(seasonId)).toBeNull();
  });

  // H2 同纪律：一次写失败不能永久毒化写链，修复目录后下一次写仍需真正落盘。
  test('写失败后写链不中毒：恢复后下一次 upsertBaseline 仍能落盘', async () => {
    dir = await mkdtemp(join(tmpdir(), 'baseline-h2-'));
    const sub = join(dir, 'basedir');
    await mkdir(sub);
    const file = join(sub, 'baseline.json');
    const store = await FileBaselineStore.create(file);

    await rm(sub, { recursive: true, force: true });
    await writeFile(sub, 'blocker');
    await expect(
      store.upsertBaseline(seasonId, { milestones: seedBaseline.milestones }),
    ).rejects.toThrow();

    await rm(sub);
    await mkdir(sub);
    await store.upsertBaseline(seasonId, { milestones: seedBaseline.milestones });

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(
      onDisk.some((b: { seasonId: string }) => b.seasonId === seasonId),
    ).toBe(true);
  });
});
