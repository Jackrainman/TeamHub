import { z } from 'zod';
export {
  AdapterCapabilitiesResponseSchema,
  AdapterDescriptorSchema,
  AdapterHealthResponseSchema,
  AdapterInvokeRequestSchema,
  AdapterInvokeResponseSchema,
  AdaptersResponseSchema,
  ArtifactRefSchema,
  ArtifactsResponseSchema,
  BridgeMemberStateSchema,
  BridgeMembersResponseSchema,
  GitRepoRefSchema,
  GitReposResponseSchema,
  HubEventsResponseSchema,
  HubEventSchema,
  apiContractFixtures,
} from '@teamhub/hub-contracts';
export type {
  AdapterCapabilitiesResponse,
  AdapterDescriptor,
  AdapterHealthResponse,
  AdapterInvokeRequest,
  AdapterInvokeResponse,
  AdaptersResponse,
  ArtifactRef,
  ArtifactsResponse,
  BridgeMemberState,
  BridgeMembersResponse,
  GitRepoRef,
  GitReposResponse,
  HubEvent,
  HubEventsResponse,
} from '@teamhub/hub-contracts';

export const isoDateTimeSchema = z.string().datetime({ offset: true });

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

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type SystemStatusResponse = z.infer<typeof SystemStatusResponseSchema>;
