import { describe, expect, test } from 'vitest';
import {
  AdapterDescriptorSchema,
  AdaptersResponseSchema,
  ArtifactRefSchema,
  ArtifactsResponseSchema,
  BridgeMemberStateSchema,
  BridgeMembersResponseSchema,
  ErrorResponseSchema,
  GitRepoRefSchema,
  GitReposResponseSchema,
  HubEventSchema,
  HubEventsResponseSchema,
  adapterDescriptorFixtures,
  apiContractFixtures,
  artifactRefFixtures,
  bridgeMemberStateFixtures,
  gitRepoRefFixtures,
  hubEventFixtures,
} from '../src/index.js';

describe('Team Hub contract fixtures', () => {
  test('core model fixtures satisfy their schemas', () => {
    for (const event of hubEventFixtures) {
      expect(HubEventSchema.safeParse(event).success).toBe(true);
    }
    for (const adapter of adapterDescriptorFixtures) {
      expect(AdapterDescriptorSchema.safeParse(adapter).success).toBe(true);
    }
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
      AdaptersResponseSchema.safeParse(apiContractFixtures.adapters).success,
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
      AdapterDescriptorSchema.safeParse({
        id: 'bad-adapter',
        kind: 'ai',
        displayName: 'Bad Adapter',
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
