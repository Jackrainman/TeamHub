import type { AdapterDescriptor } from './contracts.js';

const MOCK_CHECKED_AT = '2026-06-06T00:00:00.000Z';

export const mockAdapters: AdapterDescriptor[] = [
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
    healthCheckedAt: MOCK_CHECKED_AT,
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

export function listMockAdapters(): AdapterDescriptor[] {
  return mockAdapters.map((adapter) => ({
    ...adapter,
    capabilities: [...adapter.capabilities],
  }));
}
