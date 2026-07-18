import { z } from 'zod';
import { isoDateTimeSchema } from './common.js';

/**
 * 部署配置落盘层（SETUP-WIZARD 刀①，setup-wizard.md §2/§3）。
 *
 * `config.json`（默认 `~/teamhub-data/config.json`，路径由 `TEAMHUB_CONFIG_FILE` 覆盖）是**模式的唯一真相**
 * （v2 裁决）：演示态开关 / 身份模式两个模式类 env 已退役，dataMode / identityMode
 * 全部取自本文件。server 启动严格 zod 解析，坏文件 fail-closed 拒启动（同 gov.json 纪律）；文件不存在 →
 * 首启动向导（setup 模式）。运维类 env（端口 / 落盘路径 / WRITE_TOKEN / TRUST_PROXY / GOV_BACKEND）仍是
 * 环境属性、**不进** config.json。
 */

/** 数据形态：demo = 演示锚点（冻结钟 + 演示车 / 排班 / 语料），real = 真空板（真实钟 + 空业务数组）。
 *  对应旧演示态开关（true / 缺省 = demo，false = real），该 env 已退役、来源改本 config。 */
export const DataModeSchema = z.enum(['demo', 'real']);
export type DataMode = z.infer<typeof DataModeSchema>;

/** 登录方式：anonymous = 匿名共用（写口令），identity = 登录制（认领 / 验收留名）。 */
export const ConfigIdentityModeSchema = z.enum(['anonymous', 'identity']);
export type ConfigIdentityMode = z.infer<typeof ConfigIdentityModeSchema>;

/**
 * `config.json` 落盘契约。schemaVersion 钉死字面量 1——将来演进靠 bump 版本 + 迁移，坏 / 陌生版本一律
 * fail-closed（不做静默降级）。
 */
export const DeployConfigSchema = z.object({
  schemaVersion: z.literal(1),
  dataMode: DataModeSchema,
  identityMode: ConfigIdentityModeSchema,
  // 向导 / 首次固化写入的 ISO 时间戳（带时区，同 common.ts 全局约定）。
  initializedAt: isoDateTimeSchema,
});
export type DeployConfig = z.infer<typeof DeployConfigSchema>;

/** 严格解析入口：坏 / 缺字段 / 陌生 schemaVersion 直接抛（server 侧包成 fail-closed 拒启动）。 */
export function parseDeployConfig(raw: unknown): DeployConfig {
  return DeployConfigSchema.parse(raw);
}

/**
 * `POST /api/setup/init` 请求体（setup 模式）：向导只让人选 dataMode + identityMode，
 * schemaVersion / initializedAt 由服务端补齐后落盘（客户端不自报时间戳 / 版本）。
 */
export const SetupInitRequestSchema = z.object({
  dataMode: DataModeSchema,
  identityMode: ConfigIdentityModeSchema,
});
export type SetupInitRequest = z.infer<typeof SetupInitRequestSchema>;

/** `POST /api/setup/init` 回执：受理 → 服务将自动重启（exit 42 → 循环 / restart:on-failure 拉起正常模式）。 */
export const SetupInitResponseSchema = z.object({
  restarting: z.literal(true),
});
export type SetupInitResponse = z.infer<typeof SetupInitResponseSchema>;

/**
 * `GET /api/setup/state` 响应：前端据此决定渲染向导还是正常 app。
 *  - initialized：config.json 是否已落盘（setup 模式 false / 正常模式 true）。
 *  - dataDirHasData：五域（gov/kb/inv/baseline/checklist）任一落盘文件是否已存在——供**升级迁移**提示
 *    （既有 v0.25.x 部署升级后见一次向导时，提示「检测到已有数据，本次只写配置、不动数据」）。
 */
export const SetupStateResponseSchema = z.object({
  initialized: z.boolean(),
  dataDirHasData: z.boolean(),
});
export type SetupStateResponse = z.infer<typeof SetupStateResponseSchema>;

/**
 * `PUT /api/setup/config` 请求体（SETUP-WIZARD 刀③，setup-wizard.md §6.3）：设置页「部署配置」里
 * 改**登录方式**（匿名 ⇄ 身份）。只让改 identityMode——dataMode 走单向的 graduate 门（不反向），
 * schemaVersion / initializedAt 由服务端保留原值，客户端不自报。
 */
export const SetupConfigRequestSchema = z.object({
  identityMode: ConfigIdentityModeSchema,
});
export type SetupConfigRequest = z.infer<typeof SetupConfigRequestSchema>;

/** `PUT /api/setup/config` 回执：受理 → 服务将自动重启（exit 42 → 循环 / restart:on-failure 拉起）。 */
export const SetupConfigResponseSchema = z.object({
  restarting: z.literal(true),
});
export type SetupConfigResponse = z.infer<typeof SetupConfigResponseSchema>;

/**
 * `POST /api/setup/graduate` 回执（SETUP-WIZARD 刀③，setup-wizard.md §6.2）：结束试驾转正式（单向门，
 * 仅 dataMode==='demo' 可调）。服务端先把五域落盘 JSON + 归档物目录内容挪进 `demo-archive-<时间戳>/`
 * （挪走不删、可手工找回）→ 写 dataMode=real → exit 42 重启进真空板。请求无 body（当前部署即目标）。
 */
export const SetupGraduateResponseSchema = z.object({
  restarting: z.literal(true),
});
export type SetupGraduateResponse = z.infer<typeof SetupGraduateResponseSchema>;
