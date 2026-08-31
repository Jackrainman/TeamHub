import { describe, expect, test, afterAll } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  GOVERNANCE_SCENARIO_NOW,
  governanceScenarioFixture,
} from '@teamhub/hub-contracts';
import type { GovernanceSnapshot } from '@teamhub/hub-contracts';
import { InMemoryGovStore } from './support/inmemory-gov-store.js';
import { FixedClock } from '../src/clock.js';
import type { Clock } from '../src/clock.js';
import type { TaskDraft } from '../src/store/gov-store.js';

/**
 * K6（时钟与空板刀）回归门：坐实「演示态 = 冻结时钟 + 演示锚点，真实态 = 真实时钟 + 真空板」，
 * 二者由 demoSeed 一个开关派生，覆盖 InMemory / File / Sqlite 三实现。
 *  - bug1 时钟冻结：真实态 createTask 的 createdAt 来自注入 clock（非硬编码冻结锚点 2026-06-11）。
 *  - bug2 空板不彻底：真实态 resources/resourceSessions/relayHandoffs 恒空（不再见虚构车 + 演示排班）。
 */

// 空板冷启动的 gov 种子（镜像 main.ts emptyGovSnapshot：仅赛季 / 项目 / 阶段元信息，业务数组全空）。
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
};

// 可控「RealClock 替身」：注入一个**非 2026-06-11** 的确定时刻（等价 RealClock 但结果确定），
// 断言 createTask 的时间戳来自注入 clock、而非硬编码的冻结锚点 GOVERNANCE_SCENARIO_NOW（2026-06-11）。
const REAL_NOW_ISO = '2026-07-16T09:30:00.000Z';
const realStandInClock: Clock = new FixedClock(new Date(REAL_NOW_ISO));

function taskDraft(title: string): TaskDraft {
  return {
    projectId: governanceScenarioFixture.projectId,
    groupId: 'grp-ec',
    title,
    rawSummary: title,
    ownerId: null,
    collaboratorIds: [],
    intrinsicComplexity: 'normal',
  };
}

const tmpDirs: string[] = [];
async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'teamhub-k6-'));
  tmpDirs.push(dir);
  return dir;
}
afterAll(async () => {
  for (const d of tmpDirs) await rm(d, { recursive: true, force: true });
});

describe('K6 演示态：冻结时钟 + 演示锚点（默认，现状零变化）', () => {
  test('demoSeed 缺省 → resources/resourceSessions 非空（演示车 + 排班仍在）', async () => {
    const store = new InMemoryGovStore();
    expect((await store.listResources()).length).toBeGreaterThan(0);
    expect((await store.listResourceSessions()).length).toBeGreaterThan(0);
  });

  test('demoSeed 缺省 → createTask 的 createdAt 是冻结锚点 2026-06-11', async () => {
    const store = new InMemoryGovStore();
    const task = await store.createTask(taskDraft('演示态任务'));
    expect(task.createdAt).toBe(GOVERNANCE_SCENARIO_NOW);
  });
});

describe('K6 真实态：真实时钟 + 真空板（demoSeed=false）', () => {
  test('InMemory: schedule 三块恒空（bug2 空板彻底）', async () => {
    const store = new InMemoryGovStore(EMPTY_SEED, realStandInClock, false);
    expect(await store.listResources()).toEqual([]);
    expect(await store.listResourceSessions()).toEqual([]);
    expect(await store.listRelayHandoffs()).toEqual([]);
  });

  test('InMemory: createTask 的 createdAt 来自注入 clock、非冻结锚点（bug1 时钟不再冻结）', async () => {
    const store = new InMemoryGovStore(EMPTY_SEED, realStandInClock, false);
    const task = await store.createTask(taskDraft('真实态任务'));
    expect(task.createdAt).toBe(REAL_NOW_ISO);
    expect(task.createdAt).not.toBe(GOVERNANCE_SCENARIO_NOW);
    expect(task.createdAt.startsWith('2026-06-11')).toBe(false);
  });
});
