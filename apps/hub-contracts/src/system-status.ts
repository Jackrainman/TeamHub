import { z } from 'zod';
import { isoDateTimeSchema } from './common.js';

/**
 * hub-server `/health` 与 `/api/system/status` 响应契约（单一源，D-052 重复真相收口）。
 * 此前 hub-server/src/contracts.ts 与 hub-console/src/api/schemas/system.ts 各声明一份、字段逐字重复，
 * 且 hub-server 还本地重声明 isoDateTimeSchema（common.ts 已是单一源）；现下沉至此，两端 import 同一份。
 *
 * 注：`mode: z.literal('mock-first')` 维持现状（本次仅去重、不改行为）；放宽为 z.string/z.enum 以容纳
 * 真实运行模式属独立决策（见 code-audit「模型口径分叉」/ now.md open_for_decision）。
 */
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
