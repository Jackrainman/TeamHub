import { z } from 'zod';
import { isoDateTimeSchema } from './common.js';

/**
 * hub-server `/health` 与 `/api/system/status` 响应契约（单一源，D-052 重复真相收口）。
 * 此前 hub-server/src/contracts.ts 与 hub-console/src/api/schemas/system.ts 各声明一份、字段逐字重复，
 * 且 hub-server 还本地重声明 isoDateTimeSchema（common.ts 已是单一源）；现下沉至此，两端 import 同一份。
 *
 * `mode` 放宽为 `z.enum(['mock-first','real','hybrid'])`：此前锁死 `z.literal('mock-first')`，real / hybrid
 * 部署时 server 自解析自身响应即 500、总览页随之崩——部署前必改。当前仍只产出 `mock-first`（见 status.ts
 * buildSystemStatusResponse 的 mode 默认值），真实运行模式由部署方注入，schema 先放行以解部署阻断。
 */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('teamhub-hub-server'),
  checkedAt: isoDateTimeSchema,
  // 活体戳（feiyue `?v=<ver>` + cache MISS 的等价）：区分「同 version 不同构建」。运行进程注入
  // TEAMHUB_BUILD_ID（git SHA / 构建时戳），缺省回落 package.json version。重启后一行
  // `curl /health | grep buildId` 即知在服的是哪个构建，不必靠日志猜。
  buildId: z.string().min(1),
});

export const SystemStatusResponseSchema = z.object({
  service: z.literal('teamhub-hub-server'),
  version: z.string().min(1),
  mode: z.enum(['mock-first', 'real', 'hybrid']),
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
