import { z } from 'zod';
import { EnabledModulesSchema } from './assembly.js';
import {
  ConfigIdentityModeSchema,
  DataModeSchema,
  VerticalIdSchema,
} from './settings.js';
import { isoDateTimeSchema } from '../../common.js';

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

/**
 * 部署信息（K3 部署信息刀）：把 hub-server 启动时已知的**运维定位事实**回显到 `/api/system/status`，
 * 让设置页「部署信息」分区据此判断真实落盘 / 内存态、启用模块、构建标识——公测时不再靠服务器 stdout
 * 的 warn 猜，浏览器端一眼看清哪些域重启即丢。**敏感值绝不进来**（TEAMHUB_WRITE_TOKEN 等），只报后端
 * 类型与路径这类无害的运维定位信息。
 */
export const DeploymentStorageEntrySchema = z.object({
  // 数据域标识（'gov'|'kb'|'inv'|'baseline'|'checklist'）。console i18n 映射为人话标签，未知值原样显示。
  domain: z.string().min(1),
  // file/sqlite = 落盘（重启不丢）；memory = 内存（重启即丢，正式使用须配落盘）。
  backend: z.enum(['file', 'sqlite', 'memory']),
  // 落盘路径（file/sqlite 才有，memory 无）。运维定位用途，非密钥。
  path: z.string().optional(),
});

export const DeploymentInfoSchema = z.object({
  // 数据形态（SETUP-WIZARD 刀③）：'demo' = 演示锚点数据，'real' = 真空板。设置页「部署配置」据此决定
  // 是否显示「结束试驾，转正式」按钮（仅 demo 显示）。来源 = SQLite app_settings（main.ts 装配时透传）。
  dataMode: DataModeSchema,
  identityMode: ConfigIdentityModeSchema,
  verticalId: VerticalIdSchema,
  storage: z.array(DeploymentStorageEntrySchema),
  enabledModules: EnabledModulesSchema,
  // 是否配了 TEAMHUB_ARTIFACT_FILES_DIR：未配时图纸上传裸 400，console 据此禁用上传按钮 + 说明。
  artifactUploadEnabled: z.boolean(),
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
  // K3：部署信息（optional 增量）。旧 server 不回该字段 → 旧/新客户端均零影响（新 console 走「不可用」兜底）。
  deployment: DeploymentInfoSchema.optional(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type SystemStatusResponse = z.infer<typeof SystemStatusResponseSchema>;
export type DeploymentInfo = z.infer<typeof DeploymentInfoSchema>;
export type DeploymentStorageEntry = z.infer<typeof DeploymentStorageEntrySchema>;
