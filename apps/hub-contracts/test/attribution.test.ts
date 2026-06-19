import { describe, expect, test } from 'vitest';
import {
  BlockAttributionSchema,
  GOVERNANCE_SCENARIO_NOW,
  GOVERNANCE_SCENARIO_TIME,
  deriveBlockAttributions,
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
