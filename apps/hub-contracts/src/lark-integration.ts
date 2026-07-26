import { z } from 'zod';

// ─── 飞书集成配置（LARK-INTEG-CONFIG）─────────────────────────────────────────

export const LarkConfigSchema = z.object({
  appId: z.string().min(1),
  appSecret: z.string().min(1),
  chatId: z.string().min(1),
});
export type LarkConfig = z.infer<typeof LarkConfigSchema>;

export const LarkConfigResponseSchema = z.object({
  configured: z.boolean(),
  appId: z.string().optional(),
  appSecretMasked: z.string().optional(),
  chatId: z.string().optional(),
  status: z.enum(['unconfigured', 'connected', 'error']),
  lastCheckedAt: z.string().optional(),
  error: z.string().optional(),
});
export type LarkConfigResponse = z.infer<typeof LarkConfigResponseSchema>;

export const LarkConfigSaveRequestSchema = z.object({
  appId: z.string().min(1).max(100),
  appSecret: z.string().min(1).max(200),
  chatId: z.string().min(1).max(100),
});
export type LarkConfigSaveRequest = z.infer<typeof LarkConfigSaveRequestSchema>;

export const LarkConfigSaveResponseSchema = z.object({
  ok: z.boolean(),
  status: z.enum(['connected', 'error']),
  error: z.string().optional(),
});
export type LarkConfigSaveResponse = z.infer<typeof LarkConfigSaveResponseSchema>;

// ─── Hermes credential（loopback-only）────────────────────────────────────────

export const HermesCredentialResponseSchema = z.object({
  token: z.string().min(1),
});
export type HermesCredentialResponse = z.infer<typeof HermesCredentialResponseSchema>;
