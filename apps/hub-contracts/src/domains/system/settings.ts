import { z } from 'zod';
import { isoDateTimeSchema } from '../../common.js';

export const DataModeSchema = z.enum(['demo', 'real']);
export const ConfigIdentityModeSchema = z.enum(['anonymous', 'identity']);
export const IdentityModeSchema = ConfigIdentityModeSchema;
export const AppSettingsSchema = z.object({
  schemaVersion: z.literal(1),
  dataMode: DataModeSchema,
  identityMode: ConfigIdentityModeSchema,
  initializedAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict();
export const SetupInitRequestSchema = z.object({
  dataMode: DataModeSchema,
  identityMode: ConfigIdentityModeSchema,
}).strict();
export const SetupStateResponseSchema = z.discriminatedUnion('initialized', [
  z.object({ initialized: z.literal(false), databaseState: z.enum(['empty', 'unclaimed']) }).strict(),
  z.object({ initialized: z.literal(true), settings: AppSettingsSchema, hasPmMember: z.boolean() }).strict(),
]);
export const SetupConfigRequestSchema = z.object({ identityMode: ConfigIdentityModeSchema }).strict();
export const SetupInitResponseSchema = z.object({ restarting: z.literal(true) }).strict();
export const SetupConfigResponseSchema = SetupInitResponseSchema;
export const SetupGraduateResponseSchema = SetupInitResponseSchema;
export function parseAppSettings(raw: unknown): AppSettings {
  return AppSettingsSchema.parse(raw);
}
export type DataMode = z.infer<typeof DataModeSchema>;
export type ConfigIdentityMode = z.infer<typeof ConfigIdentityModeSchema>;
export type IdentityMode = ConfigIdentityMode;
export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type SetupInitRequest = z.infer<typeof SetupInitRequestSchema>;
export type SetupStateResponse = z.infer<typeof SetupStateResponseSchema>;
export type SetupConfigRequest = z.infer<typeof SetupConfigRequestSchema>;
export type SetupInitResponse = z.infer<typeof SetupInitResponseSchema>;
export type SetupConfigResponse = SetupInitResponse;
export type SetupGraduateResponse = SetupInitResponse;
