import type {
  AdapterDescriptor,
  ArtifactRef,
  BridgeMemberState,
  GitRepoRef,
  HubEvent,
} from './schemas.js';

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
