import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  governanceScenarioFixture,
  scheduleScenarioFixture,
} from '@teamhub/hub-contracts';
import {
  SQLITE_GOV_SCHEMA_VERSION,
  SqliteGovStore,
} from '../src/store/sqlite-gov-store.js';

// node:sqlite 经 createRequire 运行时加载（同 sqlite-gov-store.ts：绕开 vite 对 `node:sqlite` 的静态解析坑）。
const nodeRequire = createRequire(import.meta.url);

// SS3 SQLite（product-redefine-2026-07 §4.4 / §9-③ + D-083 刀④）：SqliteGovStore 真实现的行为参数化复跑
// （与 InMemoryGovStore/FileGovStore 同一域接口、同 clamp/来源 seam）+ 重启不丢 + PRAGMA user_version
// fail-closed。迁移脚本往返比对见 sqlite-migrate.test.ts。

describe('SqliteGovStore 行为参数化复跑（与 InMemory/File 同域语义）', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = '';
  });

  async function freshStore(): Promise<SqliteGovStore> {
    dir = await mkdtemp(join(tmpdir(), 'sqlite-gov-'));
    return SqliteGovStore.create(join(dir, 'gov.sqlite'));
  }

  test('getSnapshot 读种子场景（含图纸版本日志）', async () => {
    const store = await freshStore();
    const snap = await store.getSnapshot();
    expect(snap.tasks.length).toBe(governanceScenarioFixture.tasks.length);
    expect(snap.artifacts.length).toBe(governanceScenarioFixture.artifacts.length);
    expect(snap.artifacts.length).toBeGreaterThan(0);
    // 数组保插入序（ORDER BY rowid）：与 fixture 逐条同序
    expect(snap.tasks.map((t) => t.id)).toEqual(
      governanceScenarioFixture.tasks.map((t) => t.id),
    );
    store.close();
  });

  test('createTask：clamp status=pending / statusSource=console / lastProgressAt=null，无 dueDate（G4）', async () => {
    const store = await freshStore();
    const task = await store.createTask({
      projectId: 'prj-robots',
      groupId: 'grp-mech',
      title: '新任务',
      rawSummary: '随手建一条',
      ownerId: null,
      collaboratorIds: [],
      robotTarget: 'R1',
      intrinsicComplexity: 'normal',
    });
    expect(task.id).toMatch(/^task-new-/);
    expect(task.status).toBe('pending');
    expect(task.statusSource).toBe('console');
    expect(task.lastProgressAt).toBeNull();
    expect(task).not.toHaveProperty('dueDate');
    expect((await store.getSnapshot()).tasks.some((t) => t.id === task.id)).toBe(true);
    store.close();
  });

  test('createDependency clamp active / createNeed clamp open+未认领', async () => {
    const store = await freshStore();
    const dep = await store.createDependency({
      projectId: 'prj-robots',
      fromTaskId: 't-r1-newboard',
      toTaskId: 't-r1-chassis',
      type: 'blocks',
      source: 'human',
      confirmedBy: { id: 'm-ecB', displayName: '电控B', source: 'console' },
    });
    expect(dep.id).toMatch(/^dep-new-/);
    expect(dep.status).toBe('active');

    const need = await store.createNeed({
      projectId: 'prj-robots',
      onTaskId: 't-r1-chassis',
      description: '需要懂 CAN 的人',
      providerGroupId: 'grp-program',
      neededSkills: ['CAN'],
      source: 'human',
      confirmedBy: { id: 'm-ecB', displayName: '电控B', source: 'console' },
    });
    expect(need.id).toMatch(/^need-new-/);
    expect(need.status).toBe('open');
    expect(need.claimedByMemberId).toBeNull();
    expect(need.escalatedAt).toBeNull();
    store.close();
  });

  test('closeoutKbNode 按 name upsert：同 name 覆盖保留 id、I0 无人维度', async () => {
    const store = await freshStore();
    const node = await store.closeoutKbNode({
      name: '踩过的坑：测试',
      groupId: null,
      parentNodeId: null,
      resourceLinks: [],
    });
    expect(node.id).toMatch(/^kn-cl-/);
    expect(node).not.toHaveProperty('memberId');

    // 同 name 复结案 → 覆盖、id 不变、不新增
    const before = (await store.getSnapshot()).knowledgeNodes.length;
    const again = await store.closeoutKbNode({
      name: '踩过的坑：测试',
      groupId: 'grp-ec',
      parentNodeId: null,
      resourceLinks: [{ label: '覆盖', uri: 'archive://x' }],
    });
    expect(again.id).toBe(node.id);
    expect((await store.getSnapshot()).knowledgeNodes.length).toBe(before);
    store.close();
  });

  test('updateTaskStatus / waiveDependency 受限迁移；未命中 id → null', async () => {
    const store = await freshStore();
    const updated = await store.updateTaskStatus('t-r1-dataset', 'done');
    expect(updated?.status).toBe('done');
    expect(updated?.statusSource).toBe('console');

    const waived = await store.waiveDependency('dep-002');
    expect(waived?.status).toBe('waived');
    expect(waived?.confirmedBy).not.toBeNull(); // 软删除保留内部凭证

    expect(await store.updateTaskStatus('t-nope', 'done')).toBeNull();
    expect(await store.waiveDependency('dep-nope')).toBeNull();
    store.close();
  });

  test('schedule 域：车/占用窗口/接力线 CRUD + deleteResourceSession 级联删接力线', async () => {
    const store = await freshStore();
    // 种子：resources/sessions 来自 scheduleScenarioFixture（与 InMemory 同源）
    expect((await store.listResources()).length).toBe(
      scheduleScenarioFixture.resources.length,
    );
    const sessions = await store.listResourceSessions();
    expect(sessions.length).toBe(scheduleScenarioFixture.resourceSessions.length);

    const res = await store.createResource({
      projectId: 'prj-robots',
      name: '测试台A',
      kind: 'testRig',
      robotTarget: 'R1',
    });
    expect(res.id).toMatch(/^res-new-/);
    expect(res.status).toBe('available');
    expect(res.statusSource).toBe('console');

    const retired = await store.updateResourceStatus(res.id, {
      status: 'retired',
      statusReason: '退役归档',
    });
    expect(retired?.status).toBe('retired');
    expect(retired?.statusReason).toBe('退役归档');

    // 建两条窗口 + 一条接力线，删上游窗口应级联删线
    const s1 = await store.createResourceSession({
      projectId: 'prj-robots',
      resourceId: res.id,
      windowLabel: '今晚',
      orderInWindow: 1,
      holderGroupId: 'grp-mech',
      holderTaskId: null,
      invitedMemberIds: [],
      note: null,
      eta: null,
      confirmedBy: { id: 'm-mechA', displayName: '机械A', source: 'console' },
    });
    const s2 = await store.createResourceSession({
      projectId: 'prj-robots',
      resourceId: res.id,
      windowLabel: '今晚',
      orderInWindow: 2,
      holderGroupId: 'grp-ec',
      holderTaskId: null,
      invitedMemberIds: [],
      note: null,
      eta: null,
      confirmedBy: { id: 'm-ecA', displayName: '电控A', source: 'console' },
    });
    const handoff = await store.createRelayHandoff({
      projectId: 'prj-robots',
      windowLabel: '今晚',
      fromSessionId: s1.id,
      toSessionId: s2.id,
      confirmedBy: { id: 'm-mechA', displayName: '机械A', source: 'console' },
    });
    expect(handoff.source).toBe('console');
    expect((await store.listRelayHandoffs()).some((h) => h.id === handoff.id)).toBe(
      true,
    );

    expect(await store.deleteResourceSession(s1.id)).toBe(true);
    // 级联：引用 s1 的接力线随之消失
    expect((await store.listRelayHandoffs()).some((h) => h.id === handoff.id)).toBe(
      false,
    );
    expect(await store.deleteResourceSession('sess-nope')).toBe(false);
    store.close();
  });

  test('setMemberPin：pinHash 落库、updatedBy=console；未命中 → null', async () => {
    const store = await freshStore();
    const members = (await store.getSnapshot()).members;
    expect(members.length).toBeGreaterThan(0);
    const target = members[0];
    const updated = await store.setMemberPin(target.id, 'scrypt:aa:bb');
    expect(updated?.pinHash).toBe('scrypt:aa:bb');
    expect(updated?.updatedBy).toBe('console');
    expect(await store.setMemberPin('m-nope', 'scrypt:aa:bb')).toBeNull();
    store.close();
  });

  test('setMemberGateReviewer：gateReviewer 落库、updatedBy=console；未命中 → null', async () => {
    const store = await freshStore();
    const members = (await store.getSnapshot()).members;
    expect(members.length).toBeGreaterThan(0);
    const target = members[0];
    const updated = await store.setMemberGateReviewer(target.id, true);
    expect(updated?.gateReviewer).toBe(true);
    expect(updated?.updatedBy).toBe('console');
    // 重开库读回（落盘持久）
    const snap = await store.getSnapshot();
    expect(snap.members.find((m) => m.id === target.id)?.gateReviewer).toBe(true);
    expect(await store.setMemberGateReviewer('m-nope', true)).toBeNull();
    store.close();
  });
});

describe('SqliteGovStore 重启不丢 + fail-closed', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = '';
  });

  test('createTask 后关库 + 从同文件重开（模拟重启），新任务仍在', async () => {
    dir = await mkdtemp(join(tmpdir(), 'sqlite-gov-restart-'));
    const file = join(dir, 'gov.sqlite');
    const store = await SqliteGovStore.create(file);
    const task = await store.createTask({
      projectId: 'prj-robots',
      groupId: 'grp-mech',
      title: '落库测试任务',
      rawSummary: '要持久化',
      ownerId: null,
      collaboratorIds: [],
      robotTarget: 'R1',
      intrinsicComplexity: 'normal',
    });
    store.close();

    const reopened = await SqliteGovStore.create(file);
    expect(
      (await reopened.getSnapshot()).tasks.some((t) => t.id === task.id),
    ).toBe(true);
    // 重开后再建任务 id 不撞（序列从最大后缀重建）
    const next = await reopened.createTask({
      projectId: 'prj-robots',
      groupId: 'grp-mech',
      title: '重启后再建',
      rawSummary: 'x',
      ownerId: null,
      collaboratorIds: [],
      robotTarget: 'R1',
      intrinsicComplexity: 'normal',
    });
    expect(next.id).not.toBe(task.id);
    reopened.close();
  });

  test('PRAGMA user_version 高于本代码支持版本 → fail-closed 抛（拒绝降级读写）', async () => {
    const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite');
    dir = await mkdtemp(join(tmpdir(), 'sqlite-gov-ver-'));
    const file = join(dir, 'gov.sqlite');
    const db = new DatabaseSync(file);
    db.exec(`PRAGMA user_version = ${SQLITE_GOV_SCHEMA_VERSION + 1}`);
    db.close();
    await expect(SqliteGovStore.create(file)).rejects.toThrow(/schema 版本/);
  });
});
