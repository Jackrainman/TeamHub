import type { GovernanceSnapshot } from './attribution.js';
import type { ScheduleSnapshot } from './schedule.js';
import type {
  AdapterCapabilitiesResponse,
  AdapterDescriptor,
  AdapterHealthResponse,
  AdapterInvokeResponse,
  ArtifactRef,
  BridgeMemberState,
  GitRepoRef,
  HubEvent,
} from './schemas.js';
import type { MemberKnowledge } from './growth.js';
import type { KbSnapshot } from './kb.js';

export const CONTRACT_FIXTURE_TIME = '2026-06-06T00:00:00.000Z';

export const hubEventFixtures: HubEvent[] = [
  {
    id: 'evt-message-001',
    source: 'lark',
    type: 'message.received',
    actor: {
      id: 'ou_mock_member',
      displayName: 'Mock Member',
      source: 'lark',
    },
    createdAt: CONTRACT_FIXTURE_TIME,
    correlationId: 'corr-debug-001',
    payload: {
      text: 'Chassis CAN bus is unstable after power-on',
      chatId: 'oc_mock_chat',
    },
  },
  {
    id: 'evt-adapter-health-001',
    source: 'system',
    type: 'adapter.health.changed',
    createdAt: CONTRACT_FIXTURE_TIME,
    payload: {
      adapterId: 'pf-skills',
      status: 'enabled',
    },
  },
];

export const adapterDescriptorFixtures: AdapterDescriptor[] = [
  {
    id: 'lark',
    kind: 'ingress',
    displayName: 'Feishu / Lark Ingress',
    status: 'unconfigured',
    capabilities: ['event.ingress', 'message.reply'],
  },
  {
    id: 'pf-skills',
    kind: 'tool',
    displayName: 'Teamhub pf-skills',
    status: 'enabled',
    capabilities: ['debug.checklist.mock'],
    healthCheckedAt: CONTRACT_FIXTURE_TIME,
  },
  {
    id: 'hermes',
    kind: 'ai',
    displayName: 'Hermes',
    status: 'unconfigured',
    capabilities: ['skill.invoke.stub'],
  },
  {
    id: 'xiaolongxia',
    kind: 'ai',
    displayName: 'Xiaolongxia',
    status: 'unconfigured',
    capabilities: ['skill.invoke.stub'],
  },
  {
    id: 'claude-code',
    kind: 'ai',
    displayName: 'Claude Code',
    status: 'unconfigured',
    capabilities: ['code.context.stub', 'skill.invoke.stub'],
  },
  {
    id: 'git-forge',
    kind: 'git',
    displayName: 'Git Forge',
    status: 'unconfigured',
    capabilities: ['repo.index.stub', 'release.index.stub'],
  },
  {
    id: 'artifact-store',
    kind: 'artifact',
    displayName: 'Artifact Store',
    status: 'unconfigured',
    capabilities: ['artifact.index.stub'],
  },
];

export const adapterHealthFixture: AdapterHealthResponse = {
  adapterId: 'hermes',
  status: 'unconfigured',
  checkedAt: CONTRACT_FIXTURE_TIME,
  detail: 'mock adapter only; real provider is not configured',
};

export const adapterCapabilitiesFixture: AdapterCapabilitiesResponse = {
  adapterId: 'hermes',
  mode: 'mock',
  capabilities: ['skill.invoke.stub', 'health.mock', 'capabilities.mock'],
};

export const adapterInvokeResponseFixture: AdapterInvokeResponse = {
  adapterId: 'hermes',
  mode: 'mock',
  status: 'accepted',
  createdAt: CONTRACT_FIXTURE_TIME,
  correlationId: 'corr-debug-001',
  output: {
    message: 'Hermes mock adapter received the request; no real provider was called.',
    inputEcho: {
      symptom: 'Chassis CAN bus is unstable after power-on',
    },
  },
};

export const bridgeMemberStateFixtures: BridgeMemberState[] = [
  {
    memberId: 'member-control-001',
    displayName: 'Control Engineer',
    currentTask: 'Debug chassis CAN bus',
    status: 'blocked',
    blockedOn: 'Waiting for oscilloscope retest',
    neededSkills: ['can', 'chassis'],
    updatedAt: CONTRACT_FIXTURE_TIME,
  },
  {
    memberId: 'member-vision-001',
    displayName: 'Vision Engineer',
    status: 'working',
    neededSkills: ['camera', 'calibration'],
    updatedAt: CONTRACT_FIXTURE_TIME,
  },
];

export const gitRepoRefFixtures: GitRepoRef[] = [
  {
    id: 'repo-infantry',
    name: 'infantry-control',
    remoteUrl: 'ssh://git.local/team/infantry-control.git',
    defaultBranch: 'main',
    forge: 'forgejo',
  },
  {
    id: 'repo-sentry',
    name: 'sentry-vision',
    remoteUrl: 'ssh://git.local/team/sentry-vision.git',
    defaultBranch: 'main',
    forge: 'forgejo',
  },
];

export const artifactRefFixtures: ArtifactRef[] = [
  {
    id: 'artifact-fw-001',
    kind: 'firmware',
    name: 'infantry-chassis-20260606.bin',
    uri: 'artifact://firmware/infantry-chassis-20260606.bin',
    relatedRepo: 'repo-infantry',
    relatedCommit: 'abc1234',
    createdAt: CONTRACT_FIXTURE_TIME,
  },
  {
    id: 'artifact-log-001',
    kind: 'log',
    name: 'can-bus-debug.log',
    uri: 'artifact://logs/can-bus-debug.log',
    relatedRepo: 'repo-infantry',
    createdAt: CONTRACT_FIXTURE_TIME,
  },
];

export const apiContractFixtures = {
  events: {
    events: hubEventFixtures,
    nextCursor: null,
  },
  adapters: {
    adapters: adapterDescriptorFixtures,
  },
  adapterHealth: adapterHealthFixture,
  adapterCapabilities: adapterCapabilitiesFixture,
  adapterInvoke: adapterInvokeResponseFixture,
  bridgeMembers: {
    members: bridgeMemberStateFixtures,
  },
  gitRepos: {
    repos: gitRepoRefFixtures,
  },
  artifacts: {
    artifacts: artifactRefFixtures,
  },
  notFound: {
    detail: 'Not found',
  },
};

// ---------------------------------------------------------------------------
// 治理真实场景样例（用户 2026-06-11 锚点事件）
//
// 视觉A 采 R1 数据集 / 电控B 没调完底盘(挂 RTOS 缺口) / 机械C 装机械臂 /
// 电路D 换新板要和电控一起看 / 视觉C 的简单任务被底盘卡住而空转 /
// 机械D 真正自由空闲 / 程序 AB 扛 R1+R2 两条联调收敛链。
//
// 验证目标：视觉C 派生为 blockedIdle（被卡而空闲，正当），与 机械D 的 freeIdle
// （自由空闲）在数据上结构可分；归因输出零人名。
// ---------------------------------------------------------------------------

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

export const governanceScenarioFixture: GovernanceSnapshot = {
  seasonId: 'season-robocon-2026',
  projectId: 'prj-robots',
  stage: '备赛-拼车调试',
  groups: [
    { id: 'grp-mech', seasonId: 'season-robocon-2026', parentGroupId: null, name: '机械', kind: 'mechanical' },
    { id: 'grp-circuit', seasonId: 'season-robocon-2026', parentGroupId: null, name: '电路', kind: 'electrical' },
    { id: 'grp-program', seasonId: 'season-robocon-2026', parentGroupId: null, name: '程序', kind: 'program' },
    { id: 'grp-ec', seasonId: 'season-robocon-2026', parentGroupId: 'grp-program', name: '电控', kind: 'electrical' },
    { id: 'grp-vision', seasonId: 'season-robocon-2026', parentGroupId: 'grp-program', name: '视觉', kind: 'custom' },
  ],
  members: [
    { id: 'm-visionA', displayName: '视觉A', role: 'member', grade: 'junior', groupId: 'grp-vision', status: 'working', currentTaskId: 't-r1-dataset', updatedBy: 'git', updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'm-ecB', displayName: '电控B', role: 'member', grade: 'sophomore', groupId: 'grp-ec', status: 'blocked', currentTaskId: 't-r1-chassis', updatedBy: 'derived', updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'm-mechC', displayName: '机械C', role: 'member', grade: 'freshman', groupId: 'grp-mech', status: 'working', currentTaskId: 't-r1-arm-mount', updatedBy: 'lark', updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'm-circuitD', displayName: '电路D', role: 'member', grade: 'junior', groupId: 'grp-circuit', status: 'working', currentTaskId: 't-r1-newboard', updatedBy: 'console', updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'm-visionC', displayName: '视觉C', role: 'member', grade: 'freshman', groupId: 'grp-vision', status: 'idle', currentTaskId: 't-r1-vision-stream', updatedBy: 'derived', updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'm-mechD', displayName: '机械D', role: 'member', grade: 'freshman', groupId: 'grp-mech', status: 'idle', currentTaskId: 't-r2-spare', updatedBy: 'derived', updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'm-progA', displayName: '程序A', role: 'groupAdmin', grade: 'senior', groupId: 'grp-program', status: 'working', currentTaskId: 't-r1-integration', updatedBy: 'git', updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'm-progB', displayName: '程序B', role: 'member', grade: 'junior', groupId: 'grp-program', status: 'working', currentTaskId: 't-r2-integration', updatedBy: 'git', updatedAt: GOVERNANCE_SCENARIO_NOW },
  ],
  tasks: [
    { id: 't-r1-arm-mount', projectId: 'prj-robots', groupId: 'grp-mech', title: 'R1 机械臂装配', rawSummary: '装好机械臂结构件', status: 'done', statusSource: 'console', ownerId: 'm-mechC', collaboratorIds: [], robotTarget: 'R1', intrinsicComplexity: 'normal', lastProgressAt: '2026-06-09T12:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 't-r1-newboard', projectId: 'prj-robots', groupId: 'grp-circuit', title: 'R1 新版电路板验证', rawSummary: '换新版要和电控一起看有没有问题', status: 'inProgress', statusSource: 'console', ownerId: 'm-circuitD', collaboratorIds: ['m-ecB'], robotTarget: 'R1', intrinsicComplexity: 'normal', lastProgressAt: '2026-06-10T22:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 't-r1-chassis', projectId: 'prj-robots', groupId: 'grp-ec', title: 'R1 底盘调试', rawSummary: '底盘还没调完，新版电路要一起看，中断时序有问题', status: 'blocked', statusSource: 'derived', ownerId: 'm-ecB', collaboratorIds: ['m-circuitD'], robotTarget: 'R1', intrinsicComplexity: 'hard', lastProgressAt: '2026-06-08T20:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 't-r1-dataset', projectId: 'prj-robots', groupId: 'grp-vision', title: 'R1 视觉数据集采集', rawSummary: '在 R1 上跑数据采集', status: 'inProgress', statusSource: 'git', ownerId: 'm-visionA', collaboratorIds: [], robotTarget: 'R1', intrinsicComplexity: 'normal', lastProgressAt: '2026-06-11T01:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 't-r1-vision-stream', projectId: 'prj-robots', groupId: 'grp-vision', title: 'R1 视觉→运动数据流', rawSummary: '本来很简单，就是把视觉结果接进运动', status: 'inProgress', statusSource: 'derived', ownerId: 'm-visionC', collaboratorIds: [], robotTarget: 'R1', intrinsicComplexity: 'trivial', lastProgressAt: '2026-06-08T18:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 't-r2-spare', projectId: 'prj-robots', groupId: 'grp-mech', title: 'R2 备件整理', rawSummary: '整理 R2 备件清单', status: 'inProgress', statusSource: 'console', ownerId: 'm-mechD', collaboratorIds: [], robotTarget: 'R2', intrinsicComplexity: 'trivial', lastProgressAt: '2026-06-10T09:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 't-r1-integration', projectId: 'prj-robots', groupId: 'grp-program', title: 'R1 总联调', rawSummary: 'R1 整车联调', status: 'inProgress', statusSource: 'git', ownerId: 'm-progA', collaboratorIds: ['m-visionC', 'm-ecB'], robotTarget: 'R1', intrinsicComplexity: 'hard', lastProgressAt: '2026-06-10T23:30:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 't-r2-integration', projectId: 'prj-robots', groupId: 'grp-program', title: 'R2 总联调', rawSummary: 'R2 整车联调', status: 'inProgress', statusSource: 'git', ownerId: 'm-progB', collaboratorIds: [], robotTarget: 'R2', intrinsicComplexity: 'hard', lastProgressAt: '2026-06-10T23:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
  ],
  dependencies: [
    { id: 'dep-001', projectId: 'prj-robots', fromTaskId: 't-r1-arm-mount', toTaskId: 't-r1-chassis', type: 'requires', status: 'satisfied', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'dep-002', projectId: 'prj-robots', fromTaskId: 't-r1-newboard', toTaskId: 't-r1-chassis', type: 'blocks', status: 'active', source: 'human', confirmedBy: PROVIDER_EC_B, createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'dep-003', projectId: 'prj-robots', fromTaskId: 't-r1-chassis', toTaskId: 't-r1-vision-stream', type: 'blocks', status: 'active', source: 'aiSuggested', confirmedBy: PROVIDER_VISION_A, createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'dep-004', projectId: 'prj-robots', fromTaskId: 't-r1-vision-stream', toTaskId: 't-r1-integration', type: 'blocks', status: 'active', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'dep-005', projectId: 'prj-robots', fromTaskId: 't-r1-chassis', toTaskId: 't-r1-integration', type: 'blocks', status: 'active', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
  ],
  needs: [
    { id: 'need-rtos', projectId: 'prj-robots', onTaskId: 't-r1-chassis', description: '需要懂 RTOS 的人协助底盘中断时序', providerGroupId: 'grp-program', claimedByMemberId: null, status: 'open', neededSkills: ['RTOS', 'CAN'], source: 'aiSuggested', confirmedBy: PROVIDER_EC_B, openedAt: '2026-06-08T20:00:00.000Z', escalatedAt: null },
    { id: 'need-board-review', projectId: 'prj-robots', onTaskId: 't-r1-chassis', description: '新版电路板需电控一起复核是否引入问题', providerGroupId: 'grp-circuit', claimedByMemberId: 'm-circuitD', status: 'claimed', neededSkills: ['circuit'], source: 'human', confirmedBy: PROVIDER_EC_B, openedAt: '2026-06-09T10:00:00.000Z', escalatedAt: null },
  ],
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

// 私有兴趣关系样例（D-027 护栏：visibility 默认 private，无 score/完成率）。
export const memberKnowledgeFixtures: MemberKnowledge[] = [
  { memberId: 'm-visionC', knowledgeNodeId: 'kn-vision-cal', relation: 'interested', visibility: 'private', updatedAt: GOVERNANCE_SCENARIO_NOW },
  { memberId: 'm-visionC', knowledgeNodeId: 'kn-rtos', relation: 'learning', visibility: 'private', updatedAt: GOVERNANCE_SCENARIO_NOW },
];

// ---------------------------------------------------------------------------
// 差异化在场排班样例（D-029）：治理快照 + 实车 + 今晚占用窗口。
//
// 今晚 R1 归程序组调「R1 总联调」。期望派生：
//   程序 = present（持有 R1，最后一关）；电控 / 电路 = onCall（上游链上仍在推进）；
//   视觉 = free（被底盘卡，挂"可看的资料"）；机械 = 沉默（机械臂已装完，链上无活）。
// down 变体：R1 撞坏 → R1 链相关组整片 free(resourceDown)。
// ---------------------------------------------------------------------------

export const scheduleScenarioFixture: ScheduleSnapshot = {
  ...governanceScenarioFixture,
  resources: [
    { id: 'res-r1', projectId: 'prj-robots', name: 'R1 比赛车', kind: 'robot', robotTarget: 'R1', status: 'inUse', statusReason: null, statusSource: 'console', updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'res-r2', projectId: 'prj-robots', name: 'R2 比赛车', kind: 'robot', robotTarget: 'R2', status: 'available', statusReason: null, statusSource: 'console', updatedAt: GOVERNANCE_SCENARIO_NOW },
  ],
  resourceSessions: [
    { id: 'sess-tonight-prog', projectId: 'prj-robots', resourceId: 'res-r1', windowLabel: '今晚', orderInWindow: 0, holderGroupId: 'grp-program', holderTaskId: 't-r1-integration', invitedMemberIds: ['m-progA'], note: '今晚 R1 归程序调总联调', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, createdAt: GOVERNANCE_SCENARIO_NOW },
  ],
};

export const scheduleResourceDownFixture: ScheduleSnapshot = {
  ...scheduleScenarioFixture,
  resources: [
    { ...scheduleScenarioFixture.resources[0], status: 'down', statusReason: '撞坏维修中' },
    scheduleScenarioFixture.resources[1],
  ],
};

/**
 * 战队知识库锚点场景（KB-CORE）：跨赛季重踩的真实 bug 历史（CAN / 3508 电机 / MicroROS），
 * 让 `GET /api/kb/similar` 从第一个请求起就能演示「同类 bug 跨赛季召回」的核心价值。
 * 全部 resolved/archived（isHistoricalIssue 通过）；error 表带根因/处理术语，喂相似度打分。
 */
export const kbScenarioFixture: KbSnapshot = {
  projectId: 'prj-robots',
  issueCards: [
    {
      id: 'iss-can-2025',
      projectId: 'prj-robots',
      title: 'CAN 总线丢包导致底盘电机失控',
      rawInput: '底盘跑着跑着突然一个电机不转，CAN 报文像是丢了',
      normalizedSummary: 'CAN 总线在高负载下丢包，底盘电机收不到指令偶发失控',
      symptomSummary: '底盘电机偶发失控、CAN 报文丢失',
      suspectedDirections: ['CAN 波特率/采样点配置', '总线终端电阻', '报文发送频率过高'],
      suggestedActions: ['示波器看 CAN_H/CAN_L 波形', '降低非关键报文频率', '检查 120Ω 终端电阻'],
      status: 'archived',
      severity: 'high',
      tags: ['CAN', '底盘', '通信', '电机'],
      relatedFiles: ['src/chassis/can_bus.c', 'src/chassis/motor.c'],
      relatedCommits: ['a1b2c3d'],
      relatedHistoricalIssueIds: [],
      createdAt: '2025-05-10T08:00:00.000Z',
      updatedAt: '2025-05-12T10:00:00.000Z',
    },
    {
      id: 'iss-motor-3508-2025',
      projectId: 'prj-robots',
      title: '3508 电机过热烧毁',
      rawInput: '连续跑了半小时，3508 烫手然后冒烟烧了',
      normalizedSummary: '3508 电机长时间堵转 + 散热不足导致绕组过热烧毁',
      symptomSummary: '3508 电机过热、烧毁',
      suspectedDirections: ['电流环限幅过高', '机械结构卡涩堵转', '散热不足'],
      suggestedActions: ['下调电流限幅', '检查传动是否卡涩', '加散热/降占空比'],
      status: 'resolved',
      severity: 'critical',
      tags: ['电机', '3508', '散热', '过热'],
      relatedFiles: ['src/chassis/motor.c'],
      relatedCommits: ['d4e5f6a'],
      relatedHistoricalIssueIds: [],
      createdAt: '2025-04-02T09:00:00.000Z',
      updatedAt: '2025-04-03T09:00:00.000Z',
    },
    {
      id: 'iss-microros-2025',
      projectId: 'prj-robots',
      title: 'MicroROS 串口握手超时连不上 agent',
      rawInput: 'microros 一直连不上 agent，串口好像握手超时',
      normalizedSummary: 'MicroROS 串口传输层波特率不匹配导致与 agent 握手超时',
      symptomSummary: 'MicroROS 与 agent 握手超时、连接失败',
      suspectedDirections: ['串口波特率不匹配', 'DMA 缓冲区配置', 'agent 端 transport 参数'],
      suggestedActions: ['核对两端波特率', '检查串口 DMA', '换 udp transport 对照'],
      status: 'archived',
      severity: 'medium',
      tags: ['MicroROS', '串口', '通信'],
      relatedFiles: ['src/comm/microros_transport.c'],
      relatedCommits: ['b7c8d9e'],
      relatedHistoricalIssueIds: [],
      createdAt: '2025-03-15T07:00:00.000Z',
      updatedAt: '2025-03-16T07:00:00.000Z',
    },
  ],
  errorEntries: [
    {
      id: 'err-can-2025',
      projectId: 'prj-robots',
      sourceIssueId: 'iss-can-2025',
      errorCode: 'DBG-20250512-001',
      title: 'CAN 总线丢包导致底盘电机失控',
      category: '通信',
      symptom: '底盘电机偶发失控、CAN 报文丢失',
      rootCause: 'CAN 采样点配置偏移 + 高频报文塞满总线导致仲裁丢包',
      resolution: '重算波特率采样点 + 把非关键遥测报文降到 50Hz',
      prevention: '关键控制报文与遥测报文分优先级，遥测限频',
      tags: ['CAN', '通信', '底盘'],
      relatedFiles: ['src/chassis/can_bus.c'],
      relatedCommits: ['a1b2c3d'],
      archiveFilePath: '.debug_workspace/archive/2025-05-12_can-bus-packet-loss.md',
      createdAt: '2025-05-12T10:00:00.000Z',
      updatedAt: '2025-05-12T10:00:00.000Z',
    },
    {
      id: 'err-motor-3508-2025',
      projectId: 'prj-robots',
      sourceIssueId: 'iss-motor-3508-2025',
      errorCode: 'DBG-20250403-001',
      title: '3508 电机过热烧毁',
      category: '电机',
      symptom: '3508 电机过热、烧毁',
      rootCause: '电流环限幅设置过高，机械卡涩时长时间堵转绕组过热',
      resolution: '下调电流限幅到安全值 + 加堵转检测自动降扭',
      prevention: '电流限幅按电机规格设上限，加堵转保护',
      tags: ['电机', '3508', '散热'],
      relatedFiles: ['src/chassis/motor.c'],
      relatedCommits: ['d4e5f6a'],
      archiveFilePath: '.debug_workspace/archive/2025-04-03_motor-3508-overheat.md',
      createdAt: '2025-04-03T09:00:00.000Z',
      updatedAt: '2025-04-03T09:00:00.000Z',
    },
  ],
  archiveDocuments: [
    {
      issueId: 'iss-can-2025',
      projectId: 'prj-robots',
      fileName: '2025-05-12_can-bus-packet-loss.md',
      filePath: '.debug_workspace/archive/2025-05-12_can-bus-packet-loss.md',
      markdownContent: '# CAN 总线丢包导致底盘电机失控\n\n根因：采样点偏移 + 总线拥塞。处理：重算采样点 + 遥测限频。',
      generatedBy: 'hybrid',
      generatedAt: '2025-05-12T10:00:00.000Z',
    },
  ],
};
