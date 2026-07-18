import type { GovernanceSnapshot } from './attribution.js';
import type { ScheduleSnapshot } from './schedule.js';
// deriveDisplayCode 已移至 robotics 垂直包（HUB-MODULARIZATION 第6步，见 verticals/robotics.ts）。
import { deriveDisplayCode } from './verticals/robotics.js';
import type {
  AgentBackend,
  AgentBackendCapabilitiesResponse,
  AgentBackendHealthResponse,
  AgentBackendInvokeResponse,
  ArtifactRef,
  BotChannel,
  BridgeMemberState,
  DataSource,
  GitRepoRef,
  HubEvent,
} from './schemas.js';
import type { Dependency, Group, Member, Need, Season, Task } from './pm-core.js';
import { generateRoboconBaselineTemplate } from './baseline.js';
import type { SeasonBaseline } from './baseline.js';
import type { GateChecklistItem } from './checklist.js';
import type { KnowledgeNode, MemberKnowledge, TaskKnowledgeTag } from './growth.js';
import type { KbSnapshot } from './kb.js';
import type { InventorySnapshot, TrackedPart } from './inventory.js';

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
      backendId: 'hermes',
      status: 'enabled',
    },
  },
];

// 公共 BOT 接口：飞书是真的（lark-gateway/toolkit 已实现收发，但 hub 侧未配置 → status 诚实）；
// 微信 / QQ 为占位，未接入。
export const botChannelFixtures: BotChannel[] = [
  {
    id: 'feishu',
    platform: 'feishu',
    displayName: '飞书 / Feishu',
    status: 'unconfigured',
    credentialsConfigured: false,
    inbound: true,
    outbound: true,
  },
  {
    id: 'wechat',
    platform: 'wechat',
    displayName: '微信 / WeChat',
    status: 'unconfigured',
    credentialsConfigured: false,
    inbound: false,
    outbound: false,
  },
  {
    id: 'qq',
    platform: 'qq',
    displayName: 'QQ',
    status: 'unconfigured',
    credentialsConfigured: false,
    inbound: false,
    outbound: false,
  },
];

// Agent 接口：hermes / openclaw / claude-code，全 mock 桩，未接真 provider。
export const agentBackendFixtures: AgentBackend[] = [
  {
    id: 'hermes',
    displayName: 'Hermes',
    mode: 'mock',
    status: 'unconfigured',
    capabilities: ['skill.invoke.stub'],
  },
  {
    id: 'openclaw',
    displayName: 'OpenClaw',
    mode: 'mock',
    status: 'unconfigured',
    capabilities: ['skill.invoke.stub'],
  },
  {
    id: 'claude-code',
    displayName: 'Claude Code',
    mode: 'mock',
    status: 'unconfigured',
    capabilities: ['code.context.stub', 'skill.invoke.stub'],
  },
];

// 数据源（只读出处锚）：git 仓库源 / 图纸-产物库。artifact-store 预留 Filebrowser 落点。
export const dataSourceFixtures: DataSource[] = [
  {
    id: 'git-forge',
    displayName: 'Git Forge',
    kind: 'git',
    status: 'unconfigured',
    sourceRef: 'ssh://git.local/team',
  },
  {
    id: 'artifact-store',
    displayName: 'Artifact Store',
    kind: 'artifact',
    status: 'unconfigured',
    sourceRef: 'filebrowser://artifacts',
  },
];

export const agentBackendHealthFixture: AgentBackendHealthResponse = {
  backendId: 'hermes',
  status: 'unconfigured',
  checkedAt: CONTRACT_FIXTURE_TIME,
  detail: 'mock agent backend only; real provider is not configured',
};

export const agentBackendCapabilitiesFixture: AgentBackendCapabilitiesResponse =
  {
    backendId: 'hermes',
    mode: 'mock',
    capabilities: ['skill.invoke.stub', 'health.mock', 'capabilities.mock'],
  };

export const agentBackendInvokeResponseFixture: AgentBackendInvokeResponse = {
  backendId: 'hermes',
  mode: 'mock',
  status: 'accepted',
  createdAt: CONTRACT_FIXTURE_TIME,
  correlationId: 'corr-debug-001',
  output: {
    message:
      'Hermes mock agent backend received the request; no real provider was called.',
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

// ---------------------------------------------------------------------------
// 图纸提交日志 / 版本时间线 seed：跨机构跨日期的真实迭代历史，让档案页时间线一上来就有料。
//
// 维度：组别 ownerGroup（机械/电路/电控/视觉）+ 赛季 season + 机构 mechanism（分组键）
// + 适配机器人 robotCode（R1/R2/universal，是版本属性·不进版本键）+ 版本号 versionNo（按 组别+赛季+机构 连续）。
// 底盘 v1(R1,6/1)/v2(R2,6/4)/v3(R1,6/6)——同一机构版本线跨机器人、编号仍连续；抬升机构 v1/v2(R1)；
// 夹爪 v1(通用)；视觉模组固件 v1/v2(R1,视觉组)。名字不再硬写「 vN」（版本走 versionNo/徽章）。
// 无人维度：记录主键是 组别+赛季+机构+版本，不存"谁提交"作排名依据（I0/A4）。
// ---------------------------------------------------------------------------
export const artifactVersionLogFixtures: ArtifactRef[] = [
  {
    id: 'artifact-chassis-v1',
    kind: 'report',
    name: '底盘结构图纸',
    uri: 'artifact://drawings/chassis/v1.pdf',
    ownerGroup: 'mechanical',
    season: '26',
    robotCode: 'R1',
    mechanism: '底盘',
    versionNo: 1,
    revision: 'v1',
    submittedVia: 'console',
    relatedRepo: 'repo-infantry',
    createdAt: '2026-06-01T09:00:00.000Z',
  },
  {
    id: 'artifact-lift-v1',
    kind: 'report',
    name: '抬升机构图纸',
    uri: 'artifact://drawings/lift/v1.pdf',
    ownerGroup: 'mechanical',
    season: '26',
    robotCode: 'R1',
    mechanism: '抬升机构',
    versionNo: 1,
    revision: 'v1',
    submittedVia: 'console',
    createdAt: '2026-06-02T10:30:00.000Z',
  },
  {
    id: 'artifact-vision-fw-v1',
    kind: 'firmware',
    name: '视觉模组固件',
    uri: 'artifact://firmware/vision-module-v1.bin',
    ownerGroup: 'vision',
    season: '26',
    robotCode: 'R1',
    mechanism: '视觉模组固件',
    versionNo: 1,
    revision: 'v1',
    submittedVia: 'git',
    relatedRepo: 'repo-sentry',
    relatedCommit: 'fa11ce0',
    createdAt: '2026-06-03T14:00:00.000Z',
  },
  {
    id: 'artifact-chassis-v2',
    kind: 'report',
    name: '底盘结构图纸',
    uri: 'artifact://drawings/chassis/v2.pdf',
    ownerGroup: 'mechanical',
    season: '26',
    robotCode: 'R2',
    mechanism: '底盘',
    versionNo: 2,
    revision: 'v2',
    submittedVia: 'console',
    relatedRepo: 'repo-infantry',
    relatedCommit: 'c0ffee1',
    createdAt: '2026-06-04T11:15:00.000Z',
  },
  {
    id: 'artifact-gripper-v1',
    kind: 'report',
    name: '夹爪图纸',
    uri: 'artifact://drawings/gripper/v1.pdf',
    ownerGroup: 'mechanical',
    season: '26',
    robotCode: 'universal',
    mechanism: '夹爪',
    versionNo: 1,
    revision: 'v1',
    submittedVia: 'console',
    createdAt: '2026-06-05T16:45:00.000Z',
  },
  {
    id: 'artifact-chassis-v3',
    kind: 'report',
    name: '底盘结构图纸',
    uri: 'artifact://drawings/chassis/v3.pdf',
    ownerGroup: 'mechanical',
    season: '26',
    robotCode: 'R1',
    mechanism: '底盘',
    versionNo: 3,
    revision: 'v3',
    submittedVia: 'console',
    relatedRepo: 'repo-infantry',
    relatedCommit: 'd00d1ee',
    createdAt: '2026-06-06T08:30:00.000Z',
  },
  {
    id: 'artifact-vision-fw-v2',
    kind: 'firmware',
    name: '视觉模组固件',
    uri: 'artifact://firmware/vision-module-v2.bin',
    ownerGroup: 'vision',
    season: '26',
    robotCode: 'R1',
    mechanism: '视觉模组固件',
    versionNo: 2,
    revision: 'v2',
    submittedVia: 'git',
    relatedRepo: 'repo-sentry',
    relatedCommit: 'b0bca7e',
    createdAt: '2026-06-07T13:20:00.000Z',
  },
  {
    id: 'artifact-lift-v2',
    kind: 'report',
    name: '抬升机构图纸',
    uri: 'artifact://drawings/lift/v2.pdf',
    ownerGroup: 'mechanical',
    season: '26',
    robotCode: 'R1',
    mechanism: '抬升机构',
    versionNo: 2,
    revision: 'v2',
    submittedVia: 'console',
    relatedCommit: 'e1e7a70',
    createdAt: '2026-06-08T09:50:00.000Z',
  },
];

export const apiContractFixtures = {
  events: {
    events: hubEventFixtures,
    nextCursor: null,
  },
  botChannels: {
    botChannels: botChannelFixtures,
  },
  agentBackends: {
    agentBackends: agentBackendFixtures,
  },
  dataSources: {
    dataSources: dataSourceFixtures,
  },
  agentBackendHealth: agentBackendHealthFixture,
  agentBackendCapabilities: agentBackendCapabilitiesFixture,
  agentBackendInvoke: agentBackendInvokeResponseFixture,
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

/**
 * PM 核心域 seed builder（模块化第5步·§5）：season/project/stage + groups/members/tasks/
 * dependencies/needs —— 纯 PM 实体，不含 KB 成长树 / artifacts / schedule 资源。
 * 与 buildKbSeed() 组合即"无机器人租户"干净首屏（不出现任何 R1/R2 SharedResource）。
 */
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
  // S1 接线（product-redefine-2026-07 §4.1/§9-①）：种一条 active season，id 与上方 seasonId 字面量对齐
  // （两者共存，见 attribution.ts GovernanceSnapshot 注释）。startsAt 用赛季场景锚点时间占位，
  // 真实赛季起止日待 BASELINE-DESIGN 回填（docs/design/baseline-design.md §6）。
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
    // 哨兵组（PRESENCE-RECONCILE-LOCK 路线 C）：仅承载总联调收敛任务（convergenceScope='allLeafGroups'）
    // 的 DAG/PM 归属——无成员、parentGroupId=null（非叶子）、绝不进派生在场输出/归因（schedule render 跳过）。
    { id: 'grp-convergence', seasonId: 'season-robocon-2026', parentGroupId: null, name: '全组联调', kind: 'custom' },
  ],
  members: [
    { id: 'm-visionA', displayName: '视觉A', role: 'member', grade: 'junior', groupId: 'grp-vision', status: 'working', currentTaskId: 't-r1-dataset', updatedBy: 'git', updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'm-ecB', displayName: '电控B', role: 'member', grade: 'sophomore', groupId: 'grp-ec', status: 'blocked', currentTaskId: 't-r1-chassis', updatedBy: 'derived', updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'm-mechC', displayName: '机械C', role: 'member', grade: 'freshman', groupId: 'grp-mech', status: 'working', currentTaskId: 't-r1-arm-mount', updatedBy: 'lark', updatedAt: GOVERNANCE_SCENARIO_NOW },
    // gateReviewer:true（GATE-CHECKLIST-IOU 验收人名单 demo，D-087 拍板②）：大三=有权豁免欠条 + 门验收兜底。
    { id: 'm-circuitD', displayName: '电路D', role: 'member', grade: 'junior', groupId: 'grp-circuit', status: 'working', currentTaskId: 't-r1-newboard', updatedBy: 'console', updatedAt: GOVERNANCE_SCENARIO_NOW, gateReviewer: true },
    { id: 'm-visionC', displayName: '视觉C', role: 'member', grade: 'freshman', groupId: 'grp-vision', status: 'idle', currentTaskId: 't-r1-vision-stream', updatedBy: 'derived', updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'm-mechD', displayName: '机械D', role: 'member', grade: 'freshman', groupId: 'grp-mech', status: 'idle', currentTaskId: 't-r2-spare', updatedBy: 'derived', updatedAt: GOVERNANCE_SCENARIO_NOW },
    // PRESENCE-RECONCILE-LOCK：程序 AB 归口电控/视觉，程序组去领任务身份（仅留汇报视角）。
    // m-progA 降为 member（Q6 不突出组长）、改持新常规任务 t-r1-system-tune（电控做 R1 系统调试）。
    // gateReviewer:true：大四/学长同在验收人名单（跨组各留一名验收人 demo）。
    { id: 'm-progA', displayName: '程序A', role: 'member', grade: 'senior', groupId: 'grp-ec', status: 'working', currentTaskId: 't-r1-system-tune', updatedBy: 'git', updatedAt: GOVERNANCE_SCENARIO_NOW, gateReviewer: true },
    { id: 'm-progB', displayName: '程序B', role: 'member', grade: 'junior', groupId: 'grp-vision', status: 'working', currentTaskId: 't-r2-integration', updatedBy: 'git', updatedAt: GOVERNANCE_SCENARIO_NOW },
  ],
  tasks: [
    { id: 't-r1-arm-mount', projectId: 'prj-robots', groupId: 'grp-mech', title: 'R1 机械臂装配', rawSummary: '装好机械臂结构件', status: 'done', statusSource: 'console', ownerId: 'm-mechC', collaboratorIds: [], robotTarget: 'R1', intrinsicComplexity: 'normal', lastProgressAt: '2026-06-09T12:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    // 挂 G4 门（S6 演示基准线）：新版电路板验证是 G4 整车试跑前的电路组任务。
    { id: 't-r1-newboard', projectId: 'prj-robots', groupId: 'grp-circuit', title: 'R1 新版电路板验证', rawSummary: '换新版要和电控一起看有没有问题', status: 'inProgress', statusSource: 'console', ownerId: 'm-circuitD', collaboratorIds: ['m-ecB'], robotTarget: 'R1', intrinsicComplexity: 'normal', milestoneId: 'm-g4', lastProgressAt: '2026-06-10T22:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    // 挂 G3 门（V3 出车）：底盘调试未完成 → 演示里 G3 逾期 → 电控组显示落后（单位=组，非人名）。
    { id: 't-r1-chassis', projectId: 'prj-robots', groupId: 'grp-ec', title: 'R1 底盘调试', rawSummary: '底盘还没调完，新版电路要一起看，中断时序有问题', status: 'blocked', statusSource: 'derived', ownerId: 'm-ecB', collaboratorIds: ['m-circuitD'], robotTarget: 'R1', intrinsicComplexity: 'hard', milestoneId: 'm-g3', lastProgressAt: '2026-06-08T20:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 't-r1-dataset', projectId: 'prj-robots', groupId: 'grp-vision', title: 'R1 视觉数据集采集', rawSummary: '在 R1 上跑数据采集', status: 'inProgress', statusSource: 'git', ownerId: 'm-visionA', collaboratorIds: [], robotTarget: 'R1', intrinsicComplexity: 'normal', lastProgressAt: '2026-06-11T01:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    // 挂 G3 门 + 投资标签（未来赛季×高价值：接进运动的数据流是后期少调参的地基）：已停滞两周 → 演示「正在砍未来」示警。
    { id: 't-r1-vision-stream', projectId: 'prj-robots', groupId: 'grp-vision', title: 'R1 视觉→运动数据流', rawSummary: '本来很简单，就是把视觉结果接进运动', status: 'inProgress', statusSource: 'derived', ownerId: 'm-visionC', collaboratorIds: [], robotTarget: 'R1', intrinsicComplexity: 'trivial', milestoneId: 'm-g3', investment: { horizon: 'future', value: 'high', timeAccumulation: 'low' }, lastProgressAt: '2026-06-08T18:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 't-r2-spare', projectId: 'prj-robots', groupId: 'grp-mech', title: 'R2 备件整理', rawSummary: '整理 R2 备件清单', status: 'inProgress', statusSource: 'console', ownerId: 'm-mechD', collaboratorIds: [], robotTarget: 'R2', intrinsicComplexity: 'trivial', lastProgressAt: '2026-06-10T09:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    // 总联调 = 收敛任务（convergenceScope='allLeafGroups'）：挂哨兵组 grp-convergence、无单一负责组长
    // （ownerId=null、collaboratorIds=[]）；在场由派生给「全组各一人」。仍是最长链终点 → isCritical=true 不变。
    { id: 't-r1-integration', projectId: 'prj-robots', groupId: 'grp-convergence', title: 'R1 总联调', rawSummary: 'R1 整机联调', status: 'inProgress', statusSource: 'git', ownerId: null, collaboratorIds: [], robotTarget: 'R1', intrinsicComplexity: 'hard', convergenceScope: 'allLeafGroups', lastProgressAt: '2026-06-10T23:30:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 't-r2-integration', projectId: 'prj-robots', groupId: 'grp-convergence', title: 'R2 总联调', rawSummary: 'R2 整机联调', status: 'inProgress', statusSource: 'git', ownerId: null, collaboratorIds: [], robotTarget: 'R2', intrinsicComplexity: 'hard', convergenceScope: 'allLeafGroups', lastProgressAt: '2026-06-10T23:00:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    // 路线 C 新增常规 sink：今晚电控做「R1 系统调试」（非总联调）。owner m-progA(working) → 节点 working、
    // 不计 idle、不抢关键链（dep-004/005 仍指 integration，等长但 taskId 升序 integration 先到）。
    // 投资标签（高时间积累：调参手感突击无效、只能早开始摊）→ 演示「早开始摊、突击无效」小标注。
    { id: 't-r1-system-tune', projectId: 'prj-robots', groupId: 'grp-ec', title: 'R1 系统调试', rawSummary: 'R1 子系统联合调试（常规、非总联调）', status: 'inProgress', statusSource: 'git', ownerId: 'm-progA', collaboratorIds: [], robotTarget: 'R1', intrinsicComplexity: 'hard', investment: { horizon: 'season', value: 'high', timeAccumulation: 'high' }, lastProgressAt: '2026-06-10T23:30:00.000Z', createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
  ],
  dependencies: [
    { id: 'dep-001', projectId: 'prj-robots', fromTaskId: 't-r1-arm-mount', toTaskId: 't-r1-chassis', type: 'blocks', status: 'satisfied', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'dep-002', projectId: 'prj-robots', fromTaskId: 't-r1-newboard', toTaskId: 't-r1-chassis', type: 'blocks', status: 'active', source: 'human', confirmedBy: PROVIDER_EC_B, createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'dep-003', projectId: 'prj-robots', fromTaskId: 't-r1-chassis', toTaskId: 't-r1-vision-stream', type: 'blocks', status: 'active', source: 'aiSuggested', confirmedBy: PROVIDER_VISION_A, createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'dep-004', projectId: 'prj-robots', fromTaskId: 't-r1-vision-stream', toTaskId: 't-r1-integration', type: 'blocks', status: 'active', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'dep-005', projectId: 'prj-robots', fromTaskId: 't-r1-chassis', toTaskId: 't-r1-integration', type: 'blocks', status: 'active', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    // 路线 C：现有上游链接到常规 sink t-r1-system-tune（复刻今晚三态）。不动 dep-004/005（→ integration，保关键链）。
    { id: 'dep-006', projectId: 'prj-robots', fromTaskId: 't-r1-vision-stream', toTaskId: 't-r1-system-tune', type: 'blocks', status: 'active', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
    { id: 'dep-007', projectId: 'prj-robots', fromTaskId: 't-r1-chassis', toTaskId: 't-r1-system-tune', type: 'blocks', status: 'active', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
  ],
  needs: [
    { id: 'need-rtos', projectId: 'prj-robots', onTaskId: 't-r1-chassis', description: '需要懂 RTOS 的人协助底盘中断时序', providerGroupId: 'grp-ec', claimedByMemberId: null, status: 'open', neededSkills: ['RTOS', 'CAN'], source: 'aiSuggested', confirmedBy: PROVIDER_EC_B, openedAt: '2026-06-08T20:00:00.000Z', escalatedAt: null },
    { id: 'need-board-review', projectId: 'prj-robots', onTaskId: 't-r1-chassis', description: '新版电路板需电控一起复核是否引入问题', providerGroupId: 'grp-circuit', claimedByMemberId: 'm-circuitD', status: 'claimed', neededSkills: ['circuit'], source: 'human', confirmedBy: PROVIDER_EC_B, openedAt: '2026-06-09T10:00:00.000Z', escalatedAt: null },
  ],
  };
}

/**
 * KB 成长树 seed builder：GovernanceSnapshot 内嵌的 knowledgeNodes/taskKnowledgeTags
 * （growth.ts 知识树部分，随 knowledge-base 模块走）。kb.ts 域自身的 KbSnapshot（bug 追踪归档，
 * 见下方 kbScenarioFixture）本就独立于本 spread，未纳入本 builder——不是本次多域耦合的对象。
 */
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

/**
 * archive 模块 seed builder：图纸/固件提交时间线（ArtifactRef[]，v1，A6，8 条跨机构跨日期迭代历史），
 * GET /api/artifacts 读这个数组；随 archive 模块走。
 */
export function buildArchiveSeed(): ArtifactRef[] {
  return artifactVersionLogFixtures;
}

/**
 * 组合 PM + KB成长 + archive 三个 builder 成 GovernanceSnapshot——替掉原先手写的多域大字面量
 * （fixtures.ts 原 :406-473）。无机器人租户只需调 buildPmSeed()+buildKbSeed()，不触发本函数、
 * 不出现任何 R1/R2 SharedResource；机器人全套 seed 由本函数组合，保持不变。
 */
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

// ---------------------------------------------------------------------------
// 倒排基准线演示 seed（BASELINE-CORE S6）：一条 season-robocon-2026 的三版车节奏基准线，
// 由 `generateRoboconBaselineTemplate` 按两锚点相对周展开（同 InMemoryInvStore 缺省 seed 先例
// —— 保证 demo 首屏「基准线 vs 实际」非空）。
//
// 演示锚点（固定示范日期，非动态；与 SCENARIO_WINDOW_* 同一「静态锚点、换天演示改这里」纪律）：
//   秋季开学 2025-09-08 → 赛日 2026-08-16。对 2026-07 前后打开演示：G1/M1/G2 已过门（绿）、
//   G3（≈06-21，逾期未过门）红、G4（≈07-19，临近）黄、M2（≈07-26）绿 —— 一眼看出「V3 出车逾期」。
//   早期三门 seed 成 passed（大三验收留名；读视图按 I0 剥 passedBy）。
// 真实时间线赛后回填（baseline-design.md §6），届时锚点换真日期。
// ---------------------------------------------------------------------------
const BASELINE_DEMO_ANCHORS = {
  semesterStart: '2025-09-08T00:00:00.000Z',
  competitionDate: '2026-08-16T00:00:00.000Z',
};
const DEMO_GATE_REVIEWER = { id: 'm-senior-1', displayName: '大三验收', source: 'console' as const };
const DEMO_PASSED_MILESTONE_IDS = new Set(['m-g1', 'm-m1', 'm-g2']);

export const baselineScenarioFixture: SeasonBaseline[] = [
  (() => {
    const template = generateRoboconBaselineTemplate(BASELINE_DEMO_ANCHORS);
    return {
      id: 'baseline-season-robocon-2026',
      seasonId: 'season-robocon-2026',
      anchors: template.anchors,
      segments: template.segments,
      phases: template.phases,
      milestones: template.milestones.map((m) =>
        DEMO_PASSED_MILESTONE_IDS.has(m.id)
          ? { ...m, status: 'passed' as const, passedBy: DEMO_GATE_REVIEWER }
          : m,
      ),
    };
  })(),
];

// ---------------------------------------------------------------------------
// 门检查单 / 欠条演示 seed（GATE-CHECKLIST-IOU S-store，D-087 / gate-checklist-iou.md §2）：
// 挂 demo 基准线 baseline-season-robocon-2026 的两条示例欠条，保证 demo 首屏「门详情检查单卡」+
// 「总览告警区欠条未清提示」非空（同 baselineScenarioFixture / InMemoryInvStore 缺省 seed 先例）。
// 模板（ChecklistTemplate）seed 留空——等复盘导入（2026 一轮游检查单初稿为第一批，§4）。
//
//   ① 挂门欠条：24V→5V 模块无溯源（gate-checklist-iou.md §2 原句），挂「下一道整车级门」m-g4
//      （整车试跑，pending）→ 过门硬闸 demo：该门未清欠条前不可过。
//   ② 自选到期日欠条：anchorDueAt 已过 GOVERNANCE_SCENARIO_NOW（2026-06-11）→ deriveChecklistDrift
//      判红，总览告警区 demo 见红（自选日期欠条走周粒度红黄绿，到期未清=红）。
//      文案为演示新拟（设计 §2 仅给出挂门欠条一条原句、无自选日期示例，记入 deviations）。
// ---------------------------------------------------------------------------
export const checklistScenarioFixture: GateChecklistItem[] = [
  {
    id: 'chk-demo-1',
    seasonBaselineId: 'baseline-season-robocon-2026',
    title: '24V→5V 模块无溯源，先用着',
    anchorMilestoneId: 'm-g4', // 下一道整车级门（整车试跑，pending）
    origin: 'iou',
    status: 'pending',
    note: '实验车随手用完全合法，但整车试跑门前必须补验证记录或书面豁免。',
    createdAt: GOVERNANCE_SCENARIO_NOW,
  },
  {
    id: 'chk-demo-2',
    seasonBaselineId: 'baseline-season-robocon-2026',
    title: '备用电池组没做过流保护测试，先用着',
    anchorDueAt: '2026-06-05T00:00:00.000Z', // 已过 NOW（2026-06-11）→ deriveChecklistDrift 判红
    origin: 'iou',
    status: 'pending',
    createdAt: '2026-05-28T00:00:00.000Z',
  },
];

// 私有兴趣关系样例（D-027 护栏：visibility 默认 private，无 score/完成率）。
export const memberKnowledgeFixtures: MemberKnowledge[] = [
  { memberId: 'm-visionC', knowledgeNodeId: 'kn-vision-cal', relation: 'interested', visibility: 'private', updatedAt: GOVERNANCE_SCENARIO_NOW },
  { memberId: 'm-visionC', knowledgeNodeId: 'kn-rtos', relation: 'learning', visibility: 'private', updatedAt: GOVERNANCE_SCENARIO_NOW },
];

// ---------------------------------------------------------------------------
// 差异化在场排班样例（D-029；PRESENCE-RECONCILE-LOCK 路线 C 拆两场景）。
//
// windowLabel = 真实日期串 'YYYY-MM-DD'（A1 / SCHED 设计：接力画布默认按今天日期查；旧 '今晚'/'总联调日'
//   文本标签已退役——它们永不等于任何真实日期，导致首屏示例 / 各组详情整块不显）。演示锚点日落进种子=
//   数据库（resourceSessions 走内存、重启回 seed=本 fixture，D-029）。队长在画布按当天「+加一棒」录真实
//   占用，或用「查找特定日期」切到锚点日即见示例。两常量为单一真相，供 contracts / server 测试复用；
//   要刷新演示日期只改这两行。
//
// 场景甲·平日差异化（SCENARIO_WINDOW_WEEKDAY）：R1 归电控做「R1 系统调试」（常规、非总联调）。
//   电控 = present（持有 R1）；电路 = onCall（上游 t-r1-newboard 仍在推进）；
//   视觉 = free（被底盘卡，挂"可看的资料"）；机械 = 沉默（链上无活）。→ 三态俱在。
// 场景乙·总联调日（SCENARIO_WINDOW_CONVERGENCE）：收敛任务 t-r1/r2-integration → 四叶子组各 present
//   （电控/视觉/机械/电路全组各一人）。两场景同 fixture，靠 windowLabel 分流、互不串场。
// down 变体：R1 撞坏 → R1 链相关组整片 free(resourceDown)（仍跑平日窗口）。
// ---------------------------------------------------------------------------

// 演示锚点日（固定示范日期，非动态——不引入运行期 remap"模式"，直接落数据）。
export const SCENARIO_WINDOW_WEEKDAY = '2026-06-21'; // 场景甲·平日差异化（接力画布首屏默认即今天时命中）
export const SCENARIO_WINDOW_CONVERGENCE = '2026-06-28'; // 场景乙·总联调日

/**
 * SCHEDULE（presence-schedule，robotics-only）模块 seed builder：在 base（任意 GovernanceSnapshot——
 * 机器人租户传 governanceScenarioFixture，未来别的垂直包可传自己的 PM+KB+ARTIFACT 组合）之上叠
 * resources/resourceSessions/relayHandoffs。函数组合替掉原顶层对象 spread
 * （fixtures.ts 原 :503 `scheduleScenarioFixture = {...governanceScenarioFixture, resources, ...}`）。
 * 不注册 presence-schedule 模块的租户永不调用本函数、永不出现 resources。
 */
export function buildScheduleSeed(base: GovernanceSnapshot): ScheduleSnapshot {
  return {
    ...base,
    // D-072 §3.2「机器人 = 带编号对象」：26 赛季 R1 / R2 两台，displayCode 派生（禁手写，decision I/K）。
    // displayCode 同时被库存总表（INV-BOM-CORE）当机器人列表头复用（displayCode ?? name → 26R1 / 26R2）。
    resources: [
      // defaultPreset（D-082）：R1 单组阵型——平日常驻电控做「R1 系统调试」（挂现有常驻任务，复用优先）。
      { id: 'res-r1', projectId: 'prj-robots', name: 'R1 比赛机器人', kind: 'robot', robotTarget: 'R1', status: 'inUse', statusReason: null, statusSource: 'console', season: '26', version: 1, displayCode: deriveDisplayCode('26', 'R1', 1), defaultPreset: { lineup: [{ groupId: 'grp-ec', taskId: 't-r1-system-tune' }] }, updatedAt: GOVERNANCE_SCENARIO_NOW },
      // defaultPreset：R2 双组阵型——机械挂常驻「R2 备件整理」+ 电控只定组、任务每天现场填（taskId 可空示例）。
      { id: 'res-r2', projectId: 'prj-robots', name: 'R2 比赛机器人', kind: 'robot', robotTarget: 'R2', status: 'available', statusReason: null, statusSource: 'console', season: '26', version: 1, displayCode: deriveDisplayCode('26', 'R2', 1), defaultPreset: { lineup: [{ groupId: 'grp-mech', taskId: 't-r2-spare' }, { groupId: 'grp-ec' }] }, updatedAt: GOVERNANCE_SCENARIO_NOW },
    ],
    resourceSessions: [
      // 平日差异化：电控持 R1 做「R1 系统调试」（非总联调 → 三态成立）。id 改名 sess-tonight-ec
      // （Q1，仅不透明键）；invitedMemberIds 留空（Q2，永不进派生输出）。
      { id: 'sess-tonight-ec', projectId: 'prj-robots', resourceId: 'res-r1', windowLabel: SCENARIO_WINDOW_WEEKDAY, orderInWindow: 0, holderGroupId: 'grp-ec', holderTaskId: 't-r1-system-tune', invitedMemberIds: [], note: 'R1 归电控做系统调试（平日差异化场景）', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, eta: null, createdAt: GOVERNANCE_SCENARIO_NOW },
      // 总联调日 = 全组各一人：收敛任务（convergenceScope='allLeafGroups'）→ 派生四叶子组全 present。
      // 持有组填哨兵 grp-convergence；R1+R2 两台车都演示（Q4）。windowLabel 与平日不同，互不串场（C-4）。
      { id: 'sess-convergence-day-r1', projectId: 'prj-robots', resourceId: 'res-r1', windowLabel: SCENARIO_WINDOW_CONVERGENCE, orderInWindow: 0, holderGroupId: 'grp-convergence', holderTaskId: 't-r1-integration', invitedMemberIds: [], note: '总联调日：R1 全组各到一人', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, eta: null, createdAt: GOVERNANCE_SCENARIO_NOW },
      { id: 'sess-convergence-day-r2', projectId: 'prj-robots', resourceId: 'res-r2', windowLabel: SCENARIO_WINDOW_CONVERGENCE, orderInWindow: 0, holderGroupId: 'grp-convergence', holderTaskId: 't-r2-integration', invitedMemberIds: [], note: '总联调日：R2 全组各到一人', source: 'human', confirmedBy: PROVIDER_PROGRAM_A, eta: null, createdAt: GOVERNANCE_SCENARIO_NOW },
    ],
    // 接力交接线（R1）：默认空，重启回 seed（D-029，内存态）。队长在接力画布拉线产生。
    relayHandoffs: [],
  };
}

export const scheduleScenarioFixture: ScheduleSnapshot = buildScheduleSeed(governanceScenarioFixture);

/**
 * down 变体 builder：R1 撞坏 → status down，其余不变。替掉原顶层再 spread
 * （fixtures.ts 原 :524 `scheduleResourceDownFixture = {...scheduleScenarioFixture, resources: [...]}`）。
 */
export function buildScheduleResourceDownVariant(base: ScheduleSnapshot): ScheduleSnapshot {
  return {
    ...base,
    resources: [
      { ...base.resources[0], status: 'down', statusReason: '撞坏维修中' },
      base.resources[1],
    ],
  };
}

export const scheduleResourceDownFixture: ScheduleSnapshot = buildScheduleResourceDownVariant(scheduleScenarioFixture);

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

function makeTrackedParts(
  partTypeId: string,
  prefix: string,
  holders: string[],
): TrackedPart[] {
  return holders.map((holder, i) => ({
    id: `${prefix}-${i + 1}`,
    projectId: 'prj-robots',
    partTypeId,
    serialLabel: `${prefix.toUpperCase()}-${String(i + 1).padStart(2, '0')}`,
    currentHolder: holder,
    reserved: false,
    status: 'ok' as const,
    updatedAt: GOVERNANCE_SCENARIO_NOW,
  }));
}

/**
 * ledger（INV-BOM-CORE）跨域外键注入点：机器人矩阵列轴的两个持有方引用，由调用方注入
 * （机器人租户传 schedule 的 res-r1/res-r2 id；不启用 presence-schedule 的租户可传自己的
 * deployable-unit id）。ledger 模块内部不硬编码 SCHEDULE 域资源 id 字面量
 * （修 fixtures.ts 原 :671-673 `GM6020_HOLDERS/C620_HOLDERS/MC_HOLDERS` 硬编 res-r1/res-r2 的
 * INV→SCHEDULE 跨域外键）。
 */
export interface LedgerAllocationRefs {
  primary: string;
  secondary: string;
}

function resolveHolderPattern(
  pattern: ReadonlyArray<'primary' | 'secondary' | 'idle'>,
  refs: LedgerAllocationRefs,
): string[] {
  return pattern.map((tag) => (tag === 'idle' ? 'idle' : refs[tag]));
}

/**
 * 库存 / BOM 锚点场景（INV-BOM-CORE，demo 模式才注入；config.dataMode='real' → 空板）。
 * 机器人列引用由 resourceRefs 注入（不直连 SCHEDULE 资源 id 字面量，见上）。
 * 三个 trackIndividually 件（电机/电调/主控）+ 一个按数量件（M4 螺丝）；个体实例与 allocations.used 计数一致：
 *  - GM6020 电机 total 9：primary 用 2 / secondary 用 4 / 闲置 3（历史：盘点 10 → 烧坏 1 → 9）。
 *  - C620 电调 total 9：同上分布。
 *  - 主控板 total 3：primary / secondary 各 1 / 闲置 1，threshold 2 → 闲置 1 < 2 触发缺料告警（demo 红）。
 *  - M4 螺丝 total 200（按数量、无个体件），threshold 50。
 */
export function buildLedgerSeed(resourceRefs: LedgerAllocationRefs): InventorySnapshot {
  const GM6020_HOLDERS = resolveHolderPattern(
    ['primary', 'primary', 'secondary', 'secondary', 'secondary', 'secondary', 'idle', 'idle', 'idle'],
    resourceRefs,
  );
  const C620_HOLDERS = resolveHolderPattern(
    ['primary', 'primary', 'secondary', 'secondary', 'secondary', 'secondary', 'idle', 'idle', 'idle'],
    resourceRefs,
  );
  const MC_HOLDERS = resolveHolderPattern(['primary', 'secondary', 'idle'], resourceRefs);

  return {
    projectId: 'prj-robots',
    partTypes: [
      {
        id: 'parttype-gm6020',
        projectId: 'prj-robots',
        partNumber: 'GM6020',
        name: 'GM6020 电机',
        category: 'motor',
        unit: '个',
        trackIndividually: true,
        totalQuantity: 9,
        allocations: [
          { resourceId: resourceRefs.primary, used: 2, reserved: 0 },
          { resourceId: resourceRefs.secondary, used: 4, reserved: 0 },
        ],
        lowStockThreshold: 2,
        lastCountedAt: GOVERNANCE_SCENARIO_TIME,
        updatedAt: GOVERNANCE_SCENARIO_NOW,
      },
      {
        id: 'parttype-c620',
        projectId: 'prj-robots',
        partNumber: 'C620',
        name: 'C620 电调',
        category: 'esc',
        unit: '个',
        trackIndividually: true,
        totalQuantity: 9,
        allocations: [
          { resourceId: resourceRefs.primary, used: 2, reserved: 0 },
          { resourceId: resourceRefs.secondary, used: 4, reserved: 0 },
        ],
        lowStockThreshold: 2,
        lastCountedAt: GOVERNANCE_SCENARIO_TIME,
        updatedAt: GOVERNANCE_SCENARIO_NOW,
      },
      {
        id: 'parttype-maincontroller',
        projectId: 'prj-robots',
        partNumber: 'main-controller',
        name: '主控板',
        category: 'controller',
        unit: '块',
        trackIndividually: true,
        totalQuantity: 3,
        allocations: [
          { resourceId: resourceRefs.primary, used: 1, reserved: 0 },
          { resourceId: resourceRefs.secondary, used: 1, reserved: 0 },
        ],
        lowStockThreshold: 2,
        lastCountedAt: GOVERNANCE_SCENARIO_TIME,
        updatedAt: GOVERNANCE_SCENARIO_NOW,
      },
      {
        id: 'parttype-m4screw',
        projectId: 'prj-robots',
        partNumber: 'M4x10',
        name: 'M4 螺丝',
        category: 'mechanical',
        unit: '颗',
        trackIndividually: false,
        totalQuantity: 200,
        allocations: [],
        lowStockThreshold: 50,
        lastCountedAt: GOVERNANCE_SCENARIO_TIME,
        updatedAt: GOVERNANCE_SCENARIO_NOW,
      },
    ],
    trackedParts: [
      ...makeTrackedParts('parttype-gm6020', 'part-gm', GM6020_HOLDERS),
      ...makeTrackedParts('parttype-c620', 'part-c620', C620_HOLDERS),
      ...makeTrackedParts('parttype-maincontroller', 'part-mc', MC_HOLDERS),
    ],
    actions: [
      {
        id: 'act-gm-stocktake',
        projectId: 'prj-robots',
        partTypeId: 'parttype-gm6020',
        trackedPartId: null,
        kind: 'stocktake',
        quantityDelta: 10,
        fromHolder: null,
        toHolder: null,
        note: '赛季初盘点 GM6020 电机',
        recordedBy: { source: 'human', at: GOVERNANCE_SCENARIO_TIME },
        recordedAt: GOVERNANCE_SCENARIO_TIME,
      },
      {
        id: 'act-gm-mount-r2',
        projectId: 'prj-robots',
        partTypeId: 'parttype-gm6020',
        trackedPartId: 'part-gm-3',
        kind: 'mount',
        quantityDelta: 1,
        fromHolder: 'idle',
        toHolder: resourceRefs.secondary,
        note: 'GM6020 装到 R2 底盘',
        recordedBy: { source: 'human', at: '2026-06-10T03:00:00.000Z' },
        recordedAt: '2026-06-10T03:00:00.000Z',
      },
      {
        id: 'act-gm-damage',
        projectId: 'prj-robots',
        partTypeId: 'parttype-gm6020',
        trackedPartId: null,
        kind: 'damage',
        quantityDelta: 1,
        fromHolder: null,
        toHolder: null,
        note: '坏了一个 3508、烧了',
        recordedBy: { source: 'human', at: GOVERNANCE_SCENARIO_NOW },
        recordedAt: GOVERNANCE_SCENARIO_NOW,
      },
      {
        id: 'act-mc-stocktake',
        projectId: 'prj-robots',
        partTypeId: 'parttype-maincontroller',
        trackedPartId: null,
        kind: 'stocktake',
        quantityDelta: 3,
        fromHolder: null,
        toHolder: null,
        note: '盘点主控板',
        recordedBy: { source: 'human', at: GOVERNANCE_SCENARIO_TIME },
        recordedAt: GOVERNANCE_SCENARIO_TIME,
      },
    ],
  };
}

// 机器人租户全套 seed：主/副机分别注入 schedule 的 res-r1/res-r2（本 fixture 自身的资源 id 单一真相
// 仍是 scheduleScenarioFixture.resources，ledger 不重复硬编码——修跨域外键）。
export const inventoryScenarioFixture: InventorySnapshot = buildLedgerSeed({
  primary: scheduleScenarioFixture.resources[0].id,
  secondary: scheduleScenarioFixture.resources[1].id,
});
