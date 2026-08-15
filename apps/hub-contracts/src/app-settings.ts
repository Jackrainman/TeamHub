import { z } from 'zod';
import { EnabledModulesSchema } from './assembly.js';
import { isoDateTimeSchema } from './common.js';

/** 数据形态：demo 为演示库，real 为正式库。 */
export const DataModeSchema = z.enum(['demo', 'real']);
export type DataMode = z.infer<typeof DataModeSchema>;

/** 登录方式：anonymous 为匿名共用，identity 为轻身份登录。 */
export const ConfigIdentityModeSchema = z.enum(['anonymous', 'identity']);
export type ConfigIdentityMode = z.infer<typeof ConfigIdentityModeSchema>;

/** 当前唯一注册的垂直包。新增垂直包必须先扩展共享契约。 */
export const VerticalIdSchema = z.literal('robotics');
export type VerticalId = z.infer<typeof VerticalIdSchema>;

/**
 * SQLite app_settings 的完整运行期快照。所有字段都由服务端持久化，陌生字段和陌生枚举 fail-closed。
 */
export const AppSettingsSchema = z.object({
  schemaVersion: z.literal(1),
  dataMode: DataModeSchema,
  identityMode: ConfigIdentityModeSchema,
  verticalId: VerticalIdSchema,
  enabledModules: EnabledModulesSchema,
  initializedAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict();
export type AppSettings = z.infer<typeof AppSettingsSchema>;

/** 严格解析持久化设置；坏数据不做默认值回退。 */
export function parseAppSettings(raw: unknown): AppSettings {
  return AppSettingsSchema.parse(raw);
}

/** 首启只允许人选择数据形态与身份模式，其余设置由服务端补齐。 */
export const SetupInitRequestSchema = z.object({
  dataMode: DataModeSchema,
  identityMode: ConfigIdentityModeSchema,
}).strict();
export type SetupInitRequest = z.infer<typeof SetupInitRequestSchema>;

export const SetupInitResponseSchema = z.object({
  restarting: z.literal(true),
}).strict();
export type SetupInitResponse = z.infer<typeof SetupInitResponseSchema>;

/**
 * 未初始化时区分空数据库与存在业务数据但尚未认领的数据库；初始化后返回唯一设置快照。
 */
export const SetupStateResponseSchema = z.discriminatedUnion('initialized', [
  z.object({
    initialized: z.literal(false),
    databaseState: z.enum(['empty', 'unclaimed']),
  }).strict(),
  z.object({
    initialized: z.literal(true),
    settings: AppSettingsSchema,
  }).strict(),
]);
export type SetupStateResponse = z.infer<typeof SetupStateResponseSchema>;

/** 已初始化部署只允许单独修改身份模式。 */
export const SetupConfigRequestSchema = z.object({
  identityMode: ConfigIdentityModeSchema,
}).strict();
export type SetupConfigRequest = z.infer<typeof SetupConfigRequestSchema>;

export const SetupConfigResponseSchema = z.object({
  restarting: z.literal(true),
}).strict();
export type SetupConfigResponse = z.infer<typeof SetupConfigResponseSchema>;

export const SetupGraduateResponseSchema = z.object({
  restarting: z.literal(true),
}).strict();
export type SetupGraduateResponse = z.infer<typeof SetupGraduateResponseSchema>;
