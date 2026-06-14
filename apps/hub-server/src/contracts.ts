import { z } from 'zod';
import { SimilarIssueMatchSchema } from '@teamhub/hub-contracts';
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
  DepGraphSchema,
  toDepGraphView,
  GOVERNANCE_SCENARIO_NOW,
  apiContractFixtures,
  SimilarIssueMatchSchema,
  rankSimilarIssues,
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

/**
 * KB-CORE `GET /api/kb/similar` 路由契约。querystring 全为字符串：tags 逗号分隔、limit/minScore coerce 成数。
 * 响应固定带 `note` 把 **A4 护栏措辞**焊进 API——「以下为候选，按 reasons 自行判断，系统不断言同因、由人选用」。
 */
export const KB_SIMILAR_NOTE =
  '以下为候选相似记录（按 reasons 词重合排序）；系统只列候选、不断言「同因」，请按 reasons 自行判断后选用。';

export const KbSimilarQuerySchema = z.object({
  symptom: z.string().min(1),
  tags: z
    .string()
    .optional()
    .transform((s) =>
      s
        ? s
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        : [],
    ),
  projectId: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(20).optional(),
  minScore: z.coerce.number().int().nonnegative().optional(),
});

export const KbSimilarResponseSchema = z.object({
  query: z.object({
    symptom: z.string(),
    tags: z.array(z.string()),
  }),
  items: z.array(SimilarIssueMatchSchema),
  note: z.string(),
});

export type KbSimilarResponse = z.infer<typeof KbSimilarResponseSchema>;
