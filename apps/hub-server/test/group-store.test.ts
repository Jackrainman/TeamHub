import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryGovStore } from './support/inmemory-gov-store.js';

/**
 * GovStore 组管理最小版（PROGRAM-GROUP-ABSTRACT，公测补强刀④）：三实现（mock/file/sqlite）同语义——
 * createGroup（同名 name-exists）/ renameGroup（仅叶子；not-found/not-leaf/name-exists）/
 * deleteGroup（仅叶子 + 防孤儿 has-members/has-tasks；哨兵与非叶子 not-leaf）；groups 是
 * GovernanceSnapshot 字段 → file/sqlite 落盘、重启不丢。
 */

describe('GovStore 组管理 — InMemory 守卫', () => {
  test('createGroup：新建叶子组（id/seasonId/parentGroupId=null/kind 钉法同 importRoster）；同名 → name-exists', async () => {
    const store = new InMemoryGovStore();
    const created = await store.createGroup({ name: '运营' });
    expect(created.ok).toBe(true);
    if (created.ok) {
      expect(created.group.id).toMatch(/^grp-new-/);
      expect(created.group.parentGroupId).toBeNull();
      expect(created.group.kind).toBe('custom');
    }
    expect((await store.createGroup({ name: '运营' })).ok).toBe(false);
    // 与非叶子组撞名也拒（组名是 importRoster 匹配键）。
    const dupAbstract = await store.createGroup({ name: '程序' });
    expect(dupAbstract).toEqual({ ok: false, reason: 'name-exists' });
  });

  test('renameGroup：叶子组可改；非叶子/哨兵 → not-leaf；撞名 → name-exists；不存在 → not-found', async () => {
    const store = new InMemoryGovStore();
    const ok = await store.renameGroup('grp-mech', '机械结构');
    expect(ok.ok).toBe(true);
    expect(await store.renameGroup('grp-program', '新名')).toEqual({
      ok: false,
      reason: 'not-leaf',
    });
    expect(await store.renameGroup('grp-convergence', '新名')).toEqual({
      ok: false,
      reason: 'not-leaf',
    });
    expect(await store.renameGroup('grp-ec', '视觉')).toEqual({
      ok: false,
      reason: 'name-exists',
    });
    expect(await store.renameGroup('grp-nope', '谁')).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });

  test('deleteGroup：空叶子组可删（回带被删组）；有成员/有任务 → 对应 reason；非叶子/哨兵 → not-leaf', async () => {
    const store = new InMemoryGovStore();
    const created = await store.createGroup({ name: '临时组' });
    if (!created.ok) throw new Error('unreachable');
    // 有任务引用 → has-tasks。
    await store.createTask({
      projectId: 'prj-robots',
      groupId: created.group.id,
      title: '占位',
      rawSummary: '占位',
      ownerId: null,
      collaboratorIds: [],
      robotTarget: 'shared',
      intrinsicComplexity: 'trivial',
    });
    expect(await store.deleteGroup(created.group.id)).toEqual({
      ok: false,
      reason: 'has-tasks',
    });
    // fixture 叶子组 grp-mech 有成员 → has-members；非叶子/哨兵 → not-leaf；不存在 → not-found。
    expect(await store.deleteGroup('grp-mech')).toEqual({ ok: false, reason: 'has-members' });
    expect(await store.deleteGroup('grp-program')).toEqual({ ok: false, reason: 'not-leaf' });
    expect(await store.deleteGroup('grp-convergence')).toEqual({
      ok: false,
      reason: 'not-leaf',
    });
    expect(await store.deleteGroup('grp-nope')).toEqual({ ok: false, reason: 'not-found' });
    // 无引用的叶子组可删。
    const empty = await store.createGroup({ name: '空组' });
    if (!empty.ok) throw new Error('unreachable');
    const removed = await store.deleteGroup(empty.group.id);
    expect(removed.ok).toBe(true);
    const snap = await store.getSnapshot();
    expect(snap.groups.some((g) => g.id === empty.group.id)).toBe(false);
  });
});
