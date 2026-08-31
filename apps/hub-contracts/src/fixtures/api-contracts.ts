import type {
  AgentBackend,
  AgentBackendCapabilitiesResponse,
  AgentBackendHealthResponse,
  AgentBackendInvokeResponse,
  BotChannel,
  BridgeMemberState,
  DataSource,
  GitRepoRef,
  HubEvent,
} from '../schemas.js';
import type { ArtifactRef } from '../domains/artifacts/index.js';

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
