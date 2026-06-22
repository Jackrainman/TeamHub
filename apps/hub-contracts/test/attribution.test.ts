import { describe, expect, test } from 'vitest';
import {
  BlockAttributionSchema,
  GOVERNANCE_SCENARIO_NOW,
  GOVERNANCE_SCENARIO_TIME,
  GOVERNANCE_SNAPSHOT_ARRAY_KEYS,
  GovernanceSnapshotSchema,
  deriveBlockAttributions,
  governanceScenarioFixture,
} from '../src/index.js';
import type {
  Dependency,
  GovernanceSnapshot,
  Group,
  Member,
  Task,
} from '../src/index.js';

/**
 * N3（AUDIT-FIXES）：补 classifyReason 的 `sharedResourceBusy` 分支覆盖。
 *
 * 此前 attribution.ts:125 的 `pathEdges.some((e) => e.type === 'sharesResource')` 分支无任何 fixture 触达——
 * governance fixture 的归因链全经 `unmetNeed`/`upstream*` 分支。这里造一条最小自包含场景：owner idle 的下游
 * 任务，经一条 `type:'sharesResource'` 的 active+confirmed 边连到一个**未完成且无 unmetNeed**的上游
 * （故 classifyReason 跳过 unmetNeed 分支、命中 sharesResource 分支），断言 reason==='sharedResourceBusy'。
 * 纯测试新增、不改任何产品代码。
 */

const NOW = GOVERNANCE_SCENARIO_NOW;
const TIME = GOVERNANCE_SCENARIO_TIME;

const group: Group = {
  id: 'grp-res',
  seasonId: 'season-res',
  parentGroupId: null,
  name: '共享资源组',
  kind: 'custom',
};

function member(id: string, status: Member['status']): Member {
  return {
    id,
    displayName: id,
    role: 'member',
    grade: 'sophomore',
    groupId: group.id,
    status,
    currentTaskId: null,
    updatedBy: 'console',
    updatedAt: NOW,
  };
}

function task(id: string, status: Task['status'], ownerId: string | null): Task {
  return {
    id,
    projectId: 'prj-res',
    groupId: group.id,
    title: id,
    rawSummary: id,
    status,
    statusSource: 'console',
    ownerId,
    collaboratorIds: [],
    robotTarget: 'shared',
    intrinsicComplexity: 'normal',
    lastProgressAt: null,
    createdAt: TIME,
    updatedAt: NOW,
  };
}

function sharesResourceEdge(id: string, from: string, to: string): Dependency {
  return {
    id,
    projectId: 'prj-res',
    fromTaskId: from,
    toTaskId: to,
    type: 'sharesResource',
    status: 'active',
    source: 'human',
    confirmedBy: { id: 'm-res', displayName: '组长', source: 'console' },
    createdAt: TIME,
    updatedAt: NOW,
  };
}

describe('classifyReason — sharesResource 边驱动 sharedResourceBusy 分支', () => {
  // 上游 t-res-car 占着实车（inProgress、未完成、无任何 Need）；下游 t-res-tune 经一条
  // sharesResource 互斥边被卡，其 owner idle → 产出归因，reason 应为 sharedResourceBusy。
  const snapshot: GovernanceSnapshot = {
    seasonId: 'season-res',
    projectId: 'prj-res',
    stage: 'build',
    groups: [group],
    members: [member('m-blocked', 'idle')],
    tasks: [
      task('t-res-car', 'inProgress', null), // 上游：占车，无 owner、无 Need
      task('t-res-tune', 'pending', 'm-blocked'), // 下游：owner idle、被互斥边卡
    ],
    dependencies: [sharesResourceEdge('dep-res-share', 't-res-car', 't-res-tune')],
    needs: [], // 关键：root 无 unmetNeed → classifyReason 跳过 unmetNeed 分支
    knowledgeNodes: [],
    taskKnowledgeTags: [],
    artifacts: [],
  };

  const attrs = deriveBlockAttributions(snapshot, NOW);

  test('产出唯一一条归因，命中被互斥资源卡住的下游任务', () => {
    expect(attrs).toHaveLength(1);
    expect(attrs[0]!.idleTaskId).toBe('t-res-tune');
    expect(attrs[0]!.rootBlockerTaskId).toBe('t-res-car');
  });

  test('reason === sharedResourceBusy（经 sharesResource 边、非 unmetNeed）', () => {
    const a = attrs[0]!;
    expect(a.reason).toBe('sharedResourceBusy');
    // 走的就是那条 sharesResource 边、且无未满足需求
    expect(a.blockingDependencyIds).toContain('dep-res-share');
    expect(a.unmetNeedIds).toHaveLength(0);
    expect(BlockAttributionSchema.safeParse(a).success).toBe(true);
  });

  test('归因输出无 memberId / 排名维度（I0 回归护栏）', () => {
    for (const key of Object.keys(attrs[0]!)) {
      expect(key).not.toMatch(/member|owner|count|score|rank|percent|completed|duration/i);
    }
  });
});

/**
 * B1 drift-canary（SSOT 收口护栏）：GovernanceSnapshotSchema 现单源于 attribution.ts，且 GovernanceSnapshot
 * 是手写 interface（非 z.infer，D-051）——两者会 drift。本测守两条不变量：
 * ① schema **声明字段集**（`.shape`，**非 parse 输出**——schema 带 `.passthrough()`，parse 会原样保留未知键、
 *    使 `Object.keys(parse(x))` 恒等于 `Object.keys(x)`，对漏字段完全失明）== fixture key 集：interface 加字段
 *    却漏加进 schema 时 `.shape` 缺该键 → 失败。
 * ② 数组键表 == fixture 上**全部**数组字段（双向集合相等）：interface 加数组字段却漏加进
 *    GOVERNANCE_SNAPSHOT_ARRAY_KEYS（克隆漏隔离、M7/M13 可变快照 bug）时 → 失败。
 * 另断言 parse(fixture) 不抛——确保 fixture 真合 schema（已声明字段的类型 drift 亦被捕获）。
 */
describe('GovernanceSnapshotSchema drift-canary（interface ↔ schema key 集一致）', () => {
  test('schema 声明字段集（.shape）== fixture 的 key 集——漏加字段即失败', () => {
    expect(Object.keys(GovernanceSnapshotSchema.shape).sort()).toEqual(
      Object.keys(governanceScenarioFixture).sort(),
    );
  });

  test('parse(fixture) 不抛——fixture 合 schema（已声明字段类型亦校验）', () => {
    const roundTripped = JSON.parse(JSON.stringify(governanceScenarioFixture));
    expect(() => GovernanceSnapshotSchema.parse(roundTripped)).not.toThrow();
  });

  test('GOVERNANCE_SNAPSHOT_ARRAY_KEYS == fixture 上全部数组字段——漏列即失败', () => {
    const actualArrayKeys = Object.keys(governanceScenarioFixture)
      .filter((k) =>
        Array.isArray(
          (governanceScenarioFixture as unknown as Record<string, unknown>)[k],
        ),
      )
      .sort();
    expect([...GOVERNANCE_SNAPSHOT_ARRAY_KEYS].sort()).toEqual(actualArrayKeys);
  });
});
