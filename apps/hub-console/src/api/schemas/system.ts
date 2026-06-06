import { z } from 'zod';
import {
  AdaptersResponseSchema,
  ArtifactsResponseSchema,
  BridgeMembersResponseSchema,
  GitReposResponseSchema,
  HubEventsResponseSchema,
  isoDateTimeSchema,
} from '@teamhub/hub-contracts';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('teamhub-hub-server'),
  checkedAt: isoDateTimeSchema,
});

export const SystemStatusResponseSchema = z.object({
  service: z.literal('teamhub-hub-server'),
  version: z.string().min(1),
  mode: z.literal('mock-first'),
  generatedAt: isoDateTimeSchema,
  uptimeSeconds: z.number().nonnegative(),
  adapters: z.object({
    total: z.number().int().nonnegative(),
    enabled: z.number().int().nonnegative(),
    degraded: z.number().int().nonnegative(),
    unconfigured: z.number().int().nonnegative(),
  }),
});

export const OverviewSnapshotSchema = z.object({
  health: HealthResponseSchema,
  system: SystemStatusResponseSchema,
  adapters: AdaptersResponseSchema,
  events: HubEventsResponseSchema,
  bridgeMembers: BridgeMembersResponseSchema,
  gitRepos: GitReposResponseSchema,
  artifacts: ArtifactsResponseSchema,
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type SystemStatusResponse = z.infer<typeof SystemStatusResponseSchema>;
export type OverviewSnapshot = z.infer<typeof OverviewSnapshotSchema>;
