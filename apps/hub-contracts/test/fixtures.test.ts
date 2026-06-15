import { describe, expect, test } from 'vitest';
import {
  AgentBackendSchema,
  AgentBackendCapabilitiesResponseSchema,
  AgentBackendHealthResponseSchema,
  AgentBackendInvokeResponseSchema,
  AgentBackendsResponseSchema,
  ArtifactRefSchema,
  ArtifactsResponseSchema,
  BotChannelSchema,
  BotChannelsResponseSchema,
  BridgeMemberStateSchema,
  BridgeMembersResponseSchema,
  DataSourceSchema,
  DataSourcesResponseSchema,
  ErrorResponseSchema,
  GitRepoRefSchema,
  GitReposResponseSchema,
  HubEventSchema,
  HubEventsResponseSchema,
  agentBackendCapabilitiesFixture,
  agentBackendFixtures,
  agentBackendHealthFixture,
  agentBackendInvokeResponseFixture,
  apiContractFixtures,
  artifactRefFixtures,
  botChannelFixtures,
  bridgeMemberStateFixtures,
  dataSourceFixtures,
  gitRepoRefFixtures,
  hubEventFixtures,
} from '../src/index.js';

describe('Team Hub contract fixtures', () => {
  test('core model fixtures satisfy their schemas', () => {
    for (const event of hubEventFixtures) {
      expect(HubEventSchema.safeParse(event).success).toBe(true);
    }
    for (const channel of botChannelFixtures) {
      expect(BotChannelSchema.safeParse(channel).success).toBe(true);
    }
    for (const backend of agentBackendFixtures) {
      expect(AgentBackendSchema.safeParse(backend).success).toBe(true);
    }
    for (const source of dataSourceFixtures) {
      expect(DataSourceSchema.safeParse(source).success).toBe(true);
    }
    expect(
      AgentBackendHealthResponseSchema.safeParse(agentBackendHealthFixture)
        .success,
    ).toBe(true);
    expect(
      AgentBackendCapabilitiesResponseSchema.safeParse(
        agentBackendCapabilitiesFixture,
      ).success,
    ).toBe(true);
    expect(
      AgentBackendInvokeResponseSchema.safeParse(
        agentBackendInvokeResponseFixture,
      ).success,
    ).toBe(true);
    for (const member of bridgeMemberStateFixtures) {
      expect(BridgeMemberStateSchema.safeParse(member).success).toBe(true);
    }
    for (const repo of gitRepoRefFixtures) {
      expect(GitRepoRefSchema.safeParse(repo).success).toBe(true);
    }
    for (const artifact of artifactRefFixtures) {
      expect(ArtifactRefSchema.safeParse(artifact).success).toBe(true);
    }
  });

  test('API contract fixtures satisfy response schemas', () => {
    expect(HubEventsResponseSchema.safeParse(apiContractFixtures.events).success)
      .toBe(true);
    expect(
      BotChannelsResponseSchema.safeParse(apiContractFixtures.botChannels)
        .success,
    ).toBe(true);
    expect(
      AgentBackendsResponseSchema.safeParse(apiContractFixtures.agentBackends)
        .success,
    ).toBe(true);
    expect(
      DataSourcesResponseSchema.safeParse(apiContractFixtures.dataSources)
        .success,
    ).toBe(true);
    expect(
      AgentBackendHealthResponseSchema.safeParse(
        apiContractFixtures.agentBackendHealth,
      ).success,
    ).toBe(true);
    expect(
      AgentBackendCapabilitiesResponseSchema.safeParse(
        apiContractFixtures.agentBackendCapabilities,
      ).success,
    ).toBe(true);
    expect(
      AgentBackendInvokeResponseSchema.safeParse(
        apiContractFixtures.agentBackendInvoke,
      ).success,
    ).toBe(true);
    expect(
      BridgeMembersResponseSchema.safeParse(apiContractFixtures.bridgeMembers)
        .success,
    ).toBe(true);
    expect(GitReposResponseSchema.safeParse(apiContractFixtures.gitRepos).success)
      .toBe(true);
    expect(ArtifactsResponseSchema.safeParse(apiContractFixtures.artifacts).success)
      .toBe(true);
    expect(ErrorResponseSchema.safeParse(apiContractFixtures.notFound).success)
      .toBe(true);
  });

  test('schemas reject invalid status and empty identifiers', () => {
    expect(
      AgentBackendSchema.safeParse({
        id: 'bad-backend',
        displayName: 'Bad Backend',
        mode: 'mock',
        status: 'ready',
        capabilities: [],
      }).success,
    ).toBe(false);
    expect(
      HubEventSchema.safeParse({
        id: '',
        source: 'lark',
        type: 'message.received',
        createdAt: 'not-a-date',
        payload: {},
      }).success,
    ).toBe(false);
  });
});
