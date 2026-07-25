import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileGovStore } from '../src/store/file-gov-store.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';
import { SqliteGovStore } from '../src/store/sqlite-gov-store.js';

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

describe('GovStore 组管理 — 落盘（file / sqlite）', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = '';
  });

  test('File：建组/改名/删组落 governance.json，重启（新实例）仍在', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-groups-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);
    const created = await store.createGroup({ name: '运营' });
    if (!created.ok) throw new Error('unreachable');
    await store.renameGroup(created.group.id, '运营宣传');
    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(
      onDisk.groups.find((g: { id: string }) => g.id === created.group.id)?.name,
    ).toBe('运营宣传');

    const reloaded = await FileGovStore.create(file);
    const snap = await reloaded.getSnapshot();
    expect(snap.groups.find((g) => g.id === created.group.id)?.name).toBe('运营宣传');
    // 重开后删组也落盘；id 序列从磁盘续接不撞（再建组不复用已删 id）。
    const removed = await reloaded.deleteGroup(created.group.id);
    expect(removed.ok).toBe(true);
    const again = await reloaded.createGroup({ name: '二组' });
    if (!again.ok) throw new Error('unreachable');
    expect(again.group.id).not.toBe(created.group.id);
    const onDisk2 = JSON.parse(await readFile(file, 'utf8'));
    expect(onDisk2.groups.some((g: { id: string }) => g.id === created.group.id)).toBe(false);
  });

  test('Sqlite：建组/改名/删组落库，重开仍在；守卫镜像（非叶子 not-leaf）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-groups-sqlite-'));
    const file = join(dir, 'gov.sqlite');
    const store = await SqliteGovStore.create(file);
    const created = await store.createGroup({ name: '运营' });
    if (!created.ok) throw new Error('unreachable');
    await store.renameGroup(created.group.id, '运营宣传');
    expect(await store.renameGroup('grp-program', '新名')).toEqual({
      ok: false,
      reason: 'not-leaf',
    });
    store.close();

    const reopened = await SqliteGovStore.create(file);
    const snap = await reopened.getSnapshot();
    expect(snap.groups.find((g) => g.id === created.group.id)?.name).toBe('运营宣传');
    const removed = await reopened.deleteGroup(created.group.id);
    expect(removed.ok).toBe(true);
    reopened.close();

    const again = await SqliteGovStore.create(file);
    expect((await again.getSnapshot()).groups.some((g) => g.id === created.group.id)).toBe(false);
    again.close();
  });
});
