import { describe, expect, test } from 'vitest';
import type { SeasonBaseline } from '@teamhub/hub-contracts';
import { InMemoryBaselineStore } from './support/inmemory-baseline-store.js';

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
