import type { GovernanceSnapshot } from '../attribution.js';
import type { ArtifactRef } from '../domains/artifacts/index.js';
import type { Dependency, Group, Member, Need, Season, Task } from '../pm-core.js';
import { CONVERGENCE_SENTINEL_GROUP_ID } from '../pm-core.js';
import type { KnowledgeNode, TaskKnowledgeTag } from '../growth.js';
import { artifactVersionLogFixtures } from './api-contracts.js';

export const GOVERNANCE_SCENARIO_TIME = '2026-06-09T00:00:00.000Z';
export const GOVERNANCE_SCENARIO_NOW = '2026-06-11T02:00:00.000Z';

const PROVIDER_PROGRAM_A = {
  id: 'm-progA',
  displayName: '程序A',
  source: 'console' as const,
};
const PROVIDER_VISION_A = {
  id: 'm-visionA',
  displayName: '视觉A',
  source: 'console' as const,
};
const PROVIDER_EC_B = {
  id: 'm-ecB',
  displayName: '电控B',
  source: 'console' as const,
};

export interface PmSeedFixture {
  seasonId: string;
  seasons: Season[];
  projectId: string;
  stage: string;
  groups: Group[];
  members: Member[];
  tasks: Task[];
  dependencies: Dependency[];
  needs: Need[];
}

export function buildPmSeed(): PmSeedFixture {
  return {
  seasonId: 'season-robocon-2026',
  seasons: [
    { id: 'season-robocon-2026', name: '2026 赛季', startsAt: GOVERNANCE_SCENARIO_TIME, endsAt: null, status: 'active' },
  ],
  projectId: 'prj-robots',
  stage: '备赛-整机调试',
  groups: [
    { id: 'grp-mech', seasonId: 'season-robocon-2026', parentGroupId: null, name: '机械', kind: 'mechanical' },
    { id: 'grp-circuit', seasonId: 'season-robocon-2026', parentGroupId: null, name: '电路', kind: 'electrical' },
    { id: 'grp-program', seasonId: 'season-robocon-2026', parentGroupId: null, name: '程序', kind: 'program' },
    { id: 'grp-ec', seasonId: 'season-robocon-2026', parentGroupId: 'grp-program', name: '电控', kind: 'electrical' },
    { id: 'grp-vision', seasonId: 'season-robocon-2026', parentGroupId: 'grp-program', name: '视觉', kind: 'custom' },
    { id: 'grp-convergence', seasonId: 'season-robocon-2026', parentGroupId: null, name: '全组联调', kind: 'custom' },
  ],
  members: [
    { id: 'm-visionA', displayName: '视觉A', role: 'member', grade: 'junior', groupId: 'grp-vision', status: 'working', currentTaskId: 't-r1-dataset', updatedBy: 'git', updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'm-ecB', displayName: '电控B', role: 'member', grade: 'sophomore', groupId: 'grp-ec', status: 'blocked', currentTaskId: 't-r1-chassis', updatedBy: 'derived', updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'm-mechC', displayName: '机械C', role: 'member', grade: 'freshman', groupId: 'grp-mech', status: 'working', currentTaskId: 't-r1-arm-mount', updatedBy: 'lark', updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'm-circuitD', displayName: '电路D', role: 'member', grade: 'junior', groupId: 'grp-circuit', status: 'working', currentTaskId: 't-r1-newboard', updatedBy: 'console', updatedAt: GOVERNANCE_SCENARIO_NOW, gateReviewer: true },
    { id: 'm-visionC', displayName: '视觉C', role: 'member', grade: 'freshman', groupId: 'grp-vision', status: 'idle', currentTaskId: 't-r1-vision-stream', updatedBy: 'derived', updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'm-mechD', displayName: '机械D', role: 'member', grade: 'freshman', groupId: 'grp-mech', status: 'idle', currentTaskId: 't-r2-spare', updatedBy: 'derived', updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'm-progA', displayName: '程序A', role: 'member', grade: 'senior', groupId: 'grp-ec', status: 'working', currentTaskId: 't-r1-system-tune', updatedBy: 'git', updatedAt: GOVERNANCE_SCENARIO_NOW, gateReviewer: true, projectManager: true },
    { id: 'm-progB', displayName: '程序B', role: 'member', grade: 'junior', groupId: 'grp-vision', status: 'working', currentTaskId: 't-r2-integration', updatedBy: 'git', updatedAt: GOVERNANCE_SCENARIO_NOW },
  ],
  tasks: [
    { id: 't-r1-arm-mount', projectId: 'prj-robots', groupId: 'grp-mech', title: 'R1 机械臂装配', rawSummary: '装好机械臂结构件', status: 'done', statusSource: 'console', ownerId: 'm-mechC', collaboratorIds: [], robotTarget: 'R1', intrinsicComplexity: 'normal', lastProgressAt: '2026-06-09T12:00:00.000Z', transitions: [{ from: 'pending', to: 'inProgress', at: '2026-06-07T09:00:00.000Z', by: { id: 'm-mechC', displayName: '机械C', source: 'console' } }, { from: 'inProgress', to: 'done', at: '2026-06-09T12:00:00.000Z', by: { id: 'm-mechC', displayName: '机械C', source: 'console' } }], createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 't-r1-newboard', projectId: 'prj-robots', groupId: 'grp-circuit', title: 'R1 新版电路板验证', rawSummary: '换新版要和电控一起看有没有问题', status: 'inProgress', statusSource: 'console', ownerId: 'm-circuitD', collaboratorIds: ['m-ecB'], robotTarget: 'R1', intrinsicComplexity: 'normal', milestoneId: 'm-g4', lastProgressAt: '2026-06-10T22:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 't-r1-chassis', projectId: 'prj-robots', groupId: 'grp-ec', title: 'R1 底盘调试', rawSummary: '底盘还没调完，新版电路要一起看，中断时序有问题', status: 'blocked', statusSource: 'derived', ownerId: 'm-ecB', collaboratorIds: ['m-circuitD'], robotTarget: 'R1', intrinsicComplexity: 'hard', milestoneId: 'm-g3', lastProgressAt: '2026-06-08T20:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 't-r1-dataset', projectId: 'prj-robots', groupId: 'grp-vision', title: 'R1 视觉数据集采集', rawSummary: '在 R1 上跑数据采集', status: 'inProgress', statusSource: 'git', ownerId: 'm-visionA', collaboratorIds: [], robotTarget: 'R1', intrinsicComplexity: 'normal', lastProgressAt: '2026-06-11T01:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 't-r1-vision-stream', projectId: 'prj-robots', groupId: 'grp-vision', title: 'R1 视觉→运动数据流', rawSummary: '本来很简单，就是把视觉结果接进运动', status: 'inProgress', statusSource: 'derived', ownerId: 'm-visionC', collaboratorIds: [], robotTarget: 'R1', intrinsicComplexity: 'trivial', milestoneId: 'm-g3', investment: { horizon: 'future', value: 'high', timeAccumulation: 'low' }, lastProgressAt: '2026-06-08T18:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 't-r2-spare', projectId: 'prj-robots', groupId: 'grp-mech', title: 'R2 备件整理', rawSummary: '整理 R2 备件清单', status: 'inProgress', statusSource: 'console', ownerId: 'm-mechD', collaboratorIds: [], robotTarget: 'R2', intrinsicComplexity: 'trivial', lastProgressAt: '2026-06-10T09:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 't-r1-integration', projectId: 'prj-robots', groupId: 'grp-convergence', title: 'R1 总联调', rawSummary: 'R1 整机联调', status: 'inProgress', statusSource: 'git', ownerId: null, collaboratorIds: [], robotTarget: 'R1', intrinsicComplexity: 'hard', convergenceScope: 'allLeafGroups', lastProgressAt: '2026-06-10T23:30:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 't-r2-integration', projectId: 'prj-robots', groupId: 'grp-convergence', title: 'R2 总联调', rawSummary: 'R2 整机联调', status: 'inProgress', statusSource: 'git', ownerId: null, collaboratorIds: [], robotTarget: 'R2', intrinsicComplexity: 'hard', convergenceScope: 'allLeafGroups', lastProgressAt: '2026-06-10T23:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 't-r1-system-tune', projectId: 'prj-robots', groupId: 'grp-ec', title: 'R1 系统调试', rawSummary: 'R1 子系统联合调试（常规、非总联调）', status: 'inProgress', statusSource: 'git', ownerId: 'm-progA', collaboratorIds: [], robotTarget: 'R1', intrinsicComplexity: 'hard', investment: { horizon: 'season', value: 'high', timeAccumulation: 'high' }, lastProgressAt: '2026-06-10T23:30:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
  ],
  dependencies: [
    { id: 'dep-001', projectId: 'prj-robots', fromTaskId: 't-r1-arm-mount', toTaskId: 't-r1-chassis', type: 'blocks', status: 'satisfied', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'dep-002', projectId: 'prj-robots', fromTaskId: 't-r1-newboard', toTaskId: 't-r1-chassis', type: 'blocks', status: 'active', source: 'human', confirmedBy: PROVIDER_EC_B, createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'dep-003', projectId: 'prj-robots', fromTaskId: 't-r1-chassis', toTaskId: 't-r1-vision-stream', type: 'blocks', status: 'active', source: 'aiSuggested', confirmedBy: PROVIDER_VISION_A, createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'dep-004', projectId: 'prj-robots', fromTaskId: 't-r1-vision-stream', toTaskId: 't-r1-integration', type: 'blocks', status: 'active', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'dep-005', projectId: 'prj-robots', fromTaskId: 't-r1-chassis', toTaskId: 't-r1-integration', type: 'blocks', status: 'active', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'dep-006', projectId: 'prj-robots', fromTaskId: 't-r1-vision-stream', toTaskId: 't-r1-system-tune', type: 'blocks', status: 'active', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'dep-007', projectId: 'prj-robots', fromTaskId: 't-r1-chassis', toTaskId: 't-r1-system-tune', type: 'blocks', status: 'active', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
  ],
  needs: [
    { id: 'need-rtos', projectId: 'prj-robots', onTaskId: 't-r1-chassis', description: '需要懂 RTOS 的人协助底盘中断时序', providerGroupId: 'grp-ec', claimedByMemberId: null, status: 'open', neededSkills: ['RTOS', 'CAN'], source: 'aiSuggested', confirmedBy: PROVIDER_EC_B, openedAt: '2026-06-08T20:00:00.000Z', escalatedAt: null },
    { id: 'need-board-review', projectId: 'prj-robots', onTaskId: 't-r1-chassis', description: '新版电路板需电控一起复核是否引入问题', providerGroupId: 'grp-circuit', claimedByMemberId: 'm-circuitD', status: 'claimed', neededSkills: ['circuit'], source: 'human', confirmedBy: PROVIDER_EC_B, openedAt: '2026-06-09T10:00:00.000Z', escalatedAt: null },
  ],
  };
}

export function buildDefaultGroupTree(seasonId: string): Group[] {
  return [
    { id: 'grp-mech', seasonId, parentGroupId: null, name: '机械', kind: 'mechanical' },
    { id: 'grp-circuit', seasonId, parentGroupId: null, name: '电路', kind: 'electrical' },
    { id: 'grp-program', seasonId, parentGroupId: null, name: '程序', kind: 'program' },
    { id: 'grp-ec', seasonId, parentGroupId: 'grp-program', name: '电控', kind: 'electrical' },
    { id: 'grp-vision', seasonId, parentGroupId: 'grp-program', name: '视觉', kind: 'custom' },
    // 收敛哨兵组（CONVERGENCE-TASK-ENTRY）：承载总联调任务归属（无成员、不进在场派生、
    // 不算可选组——deriveLeafGroups 按 id 剔除）。空板不预建则总联调任务无合法挂靠组。
    { id: CONVERGENCE_SENTINEL_GROUP_ID, seasonId, parentGroupId: null, name: '全组联调', kind: 'custom' },
  ];
}

export interface KbGrowthSeedFixture {
  knowledgeNodes: KnowledgeNode[];
  taskKnowledgeTags: TaskKnowledgeTag[];
}

export function buildKbSeed(): KbGrowthSeedFixture {
  return {
    knowledgeNodes: [
      { id: 'kn-rtos', name: 'FreeRTOS 中断与任务调度', groupId: 'grp-ec', parentNodeId: null, resourceLinks: [{ label: '去年底盘中断笔记', uri: 'repo://r1-chassis/notes/irq.md' }], createdAt: GOVERNANCE_SCENARIO_TIME },
      { id: 'kn-can', name: '底盘 CAN 通信协议', groupId: 'grp-ec', parentNodeId: null, resourceLinks: [{ label: 'CAN 协议文档', uri: 'doc://can-protocol' }], createdAt: GOVERNANCE_SCENARIO_TIME },
      { id: 'kn-vision-cal', name: 'R1 视觉标定流程', groupId: 'grp-vision', parentNodeId: null, resourceLinks: [{ label: 'R2 同款视觉代码', uri: 'repo://r2-vision/src' }], createdAt: GOVERNANCE_SCENARIO_TIME },
    ],
    taskKnowledgeTags: [
      { id: 'tkt-1', taskId: 't-r1-chassis', knowledgeNodeId: 'kn-rtos', source: 'aiSuggested', confirmedBy: PROVIDER_EC_B },
      { id: 'tkt-2', taskId: 't-r1-chassis', knowledgeNodeId: 'kn-can', source: 'human', confirmedBy: PROVIDER_EC_B },
      { id: 'tkt-3', taskId: 't-r1-vision-stream', knowledgeNodeId: 'kn-vision-cal', source: 'human', confirmedBy: PROVIDER_VISION_A },
    ],
  };
}

export function buildArchiveSeed(): ArtifactRef[] {
  return artifactVersionLogFixtures;
}

export function buildGovernanceSeed(): GovernanceSnapshot {
  const pm = buildPmSeed();
  const kb = buildKbSeed();
  return {
    ...pm,
    knowledgeNodes: kb.knowledgeNodes,
    taskKnowledgeTags: kb.taskKnowledgeTags,
    artifacts: buildArchiveSeed(),
  };
}

export const governanceScenarioFixture: GovernanceSnapshot = buildGovernanceSeed();
