import { z } from 'zod';

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const ActorRefSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  source: z.enum(['lark', 'git', 'console', 'unknown']),
});

export const HubEventSourceSchema = z.enum([
  'lark',
  'hermes',
  'xiaolongxia',
  'claude-code',
  'console',
  'git',
  'system',
]);

export const HubEventTypeSchema = z.enum([
  'message.received',
  'command.received',
  'skill.requested',
  'skill.completed',
  'bridge.status.updated',
  'git.push',
  'release.created',
  'artifact.uploaded',
  'adapter.health.changed',
  'system.health.checked',
]);

export const HubEventSchema = z.object({
  id: z.string().min(1),
  source: HubEventSourceSchema,
  type: HubEventTypeSchema,
  actor: ActorRefSchema.optional(),
  createdAt: isoDateTimeSchema,
  correlationId: z.string().min(1).optional(),
  payload: z.unknown(),
});

export const AdapterDescriptorSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['ai', 'tool', 'ingress', 'git', 'artifact']),
  displayName: z.string().min(1),
  status: z.enum(['enabled', 'disabled', 'degraded', 'unconfigured']),
  capabilities: z.array(z.string().min(1)),
  healthCheckedAt: isoDateTimeSchema.optional(),
});

export const BridgeMemberStateSchema = z.object({
  memberId: z.string().min(1),
  displayName: z.string().min(1),
  currentTask: z.string().min(1).optional(),
  status: z.enum(['idle', 'working', 'blocked', 'offline']),
  blockedOn: z.string().min(1).optional(),
  neededSkills: z.array(z.string().min(1)),
  updatedAt: isoDateTimeSchema,
});

export const GitRepoRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  remoteUrl: z.string().min(1),
  defaultBranch: z.string().min(1),
  forge: z.enum(['forgejo', 'gitea', 'bare-git', 'github']).optional(),
});

export const ArtifactRefSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    'firmware',
    'log',
    'rosbag',
    'image',
    'video',
    'report',
    'other',
  ]),
  name: z.string().min(1),
  uri: z.string().min(1),
  relatedRepo: z.string().min(1).optional(),
  relatedCommit: z.string().min(1).optional(),
  createdAt: isoDateTimeSchema,
});

export const ErrorResponseSchema = z.object({
  detail: z.string().min(1),
});

export const HubEventsResponseSchema = z.object({
  events: z.array(HubEventSchema),
  nextCursor: z.string().min(1).nullable(),
});

export const AdaptersResponseSchema = z.object({
  adapters: z.array(AdapterDescriptorSchema),
});

export const BridgeMembersResponseSchema = z.object({
  members: z.array(BridgeMemberStateSchema),
});

export const GitReposResponseSchema = z.object({
  repos: z.array(GitRepoRefSchema),
});

export const ArtifactsResponseSchema = z.object({
  artifacts: z.array(ArtifactRefSchema),
});

export type ActorRef = z.infer<typeof ActorRefSchema>;
export type HubEventSource = z.infer<typeof HubEventSourceSchema>;
export type HubEventType = z.infer<typeof HubEventTypeSchema>;
export type HubEvent = z.infer<typeof HubEventSchema>;
export type AdapterDescriptor = z.infer<typeof AdapterDescriptorSchema>;
export type BridgeMemberState = z.infer<typeof BridgeMemberStateSchema>;
export type GitRepoRef = z.infer<typeof GitRepoRefSchema>;
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type HubEventsResponse = z.infer<typeof HubEventsResponseSchema>;
export type AdaptersResponse = z.infer<typeof AdaptersResponseSchema>;
export type BridgeMembersResponse = z.infer<
  typeof BridgeMembersResponseSchema
>;
export type GitReposResponse = z.infer<typeof GitReposResponseSchema>;
export type ArtifactsResponse = z.infer<typeof ArtifactsResponseSchema>;
