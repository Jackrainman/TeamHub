import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { governanceScenarioFixture } from '@teamhub/hub-contracts';
import type { GovernanceSnapshot } from '@teamhub/hub-contracts';
import { FileGovStore } from '../src/store/file-gov-store.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';
import { SqliteGovStore } from '../src/store/sqlite-gov-store.js';

/**
 * 空板默认组树（打磨轮刀⑤，onboarding-init-wizard-2026-07-25 §4）：real 真空板（groups 空）→
 * ensureDefaultGroups 预建 fixtures 同构默认树（四组 + 程序母组，parentGroupId 链对齐，
 * **不含 grp-convergence 哨兵组**）；临界区判空幂等（二次调用数量不变）；非空 store 不动。
 * groups 是 GovernanceSnapshot 字段 → file/sqlite 落盘、重启（新实例）仍在。
 */

// 空板冷启动的 gov 种子（镜像 main.ts emptyGovSnapshot / demo-seed-clock.test.ts EMPTY_SEED）。
const EMPTY_SEED: GovernanceSnapshot = {
  seasonId: governanceScenarioFixture.seasonId,
  seasons: governanceScenarioFixture.seasons,
  projectId: governanceScenarioFixture.projectId,
  stage: governanceScenarioFixture.stage,
  groups: [],
  members: [],
  tasks: [],
  dependencies: [],
  needs: [],
  knowledgeNodes: [],
  taskKnowledgeTags: [],
  artifacts: [],
};

const DEFAULT_GROUP_IDS = ['grp-mech', 'grp-circuit', 'grp-program', 'grp-ec', 'grp-vision'];

function expectDefaultTree(groups: GovernanceSnapshot['groups']): void {
  expect(groups.map((g) => g.id).sort()).toEqual([...DEFAULT_GROUP_IDS].sort());
  // parentGroupId 链：程序母组挂电控/视觉；机械/电路/程序顶层。
  const byId = new Map(groups.map((g) => [g.id, g]));
  expect(byId.get('grp-ec')?.parentGroupId).toBe('grp-program');
  expect(byId.get('grp-vision')?.parentGroupId).toBe('grp-program');
  expect(byId.get('grp-program')?.parentGroupId).toBeNull();
  expect(byId.get('grp-mech')?.parentGroupId).toBeNull();
  expect(byId.get('grp-circuit')?.parentGroupId).toBeNull();
  // 名字/kind 逐字对齐 fixtures 组树。
  expect(byId.get('grp-mech')).toMatchObject({ name: '机械', kind: 'mechanical' });
  expect(byId.get('grp-circuit')).toMatchObject({ name: '电路', kind: 'electrical' });
  expect(byId.get('grp-program')).toMatchObject({ name: '程序', kind: 'program' });
  expect(byId.get('grp-ec')).toMatchObject({ name: '电控', kind: 'electrical' });
  expect(byId.get('grp-vision')).toMatchObject({ name: '视觉', kind: 'custom' });
  // 不预建 grp-convergence 哨兵组。
  expect(groups.some((g) => g.id === 'grp-convergence')).toBe(false);
}

describe('ensureDefaultGroups — InMemory', () => {
  test('空板 → 预建四组 + 程序母组（id/链/kind 对齐 fixtures，无哨兵组，seasonId=当前赛季）', async () => {
    const store = new InMemoryGovStore(EMPTY_SEED);
    expect((await store.getSnapshot()).groups).toEqual([]);
    await store.ensureDefaultGroups();
    const groups = (await store.getSnapshot()).groups;
    expectDefaultTree(groups);
    // seasonId 钉法同 createGroup：当前 active 赛季 ?? 顶层。
    expect(groups.every((g) => g.seasonId === EMPTY_SEED.seasonId)).toBe(true);
  });

  test('幂等：二次调用组数不变', async () => {
    const store = new InMemoryGovStore(EMPTY_SEED);
    await store.ensureDefaultGroups();
    await store.ensureDefaultGroups();
    expect((await store.getSnapshot()).groups).toHaveLength(DEFAULT_GROUP_IDS.length);
  });

  test('非空 store（默认 fixtures）→ 不动', async () => {
    const store = new InMemoryGovStore();
    const before = (await store.getSnapshot()).groups;
    await store.ensureDefaultGroups();
    expect((await store.getSnapshot()).groups).toEqual(before);
  });
});

describe('ensureDefaultGroups — 落盘（file / sqlite）', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = '';
  });

  test('File：空板首启动建默认树落 governance.json，重启（新实例）仍在；二次调用不落重复', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-default-groups-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file, EMPTY_SEED);
    await store.ensureDefaultGroups();
    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expectDefaultTree(onDisk.groups);

    // 跨真实 reload：既有文件按原样加载 → 默认树仍在；再调 ensureDefaultGroups 幂等（数量不变）。
    const reloaded = await FileGovStore.create(file, EMPTY_SEED);
    await reloaded.ensureDefaultGroups();
    const groups = (await reloaded.getSnapshot()).groups;
    expectDefaultTree(groups);
    expect(groups).toHaveLength(DEFAULT_GROUP_IDS.length);
  });

  test('Sqlite：空板 fresh 库建默认树落库，重开仍在；幂等', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-default-groups-sqlite-'));
    const file = join(dir, 'gov.sqlite');
    const store = await SqliteGovStore.create(file, EMPTY_SEED);
    await store.ensureDefaultGroups();
    store.close();

    const reopened = await SqliteGovStore.create(file, EMPTY_SEED);
    await reopened.ensureDefaultGroups();
    const groups = (await reopened.getSnapshot()).groups;
    expectDefaultTree(groups);
    expect(groups).toHaveLength(DEFAULT_GROUP_IDS.length);
    reopened.close();
  });
});
