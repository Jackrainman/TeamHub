import { z } from 'zod';

export const ConfigSchema = z.object({
  LARK_APP_ID: z.string().min(1, 'LARK_APP_ID required'),
  LARK_APP_SECRET: z.string().min(1, 'LARK_APP_SECRET required'),
  LARK_BOT_OPEN_ID: z.string().min(1, 'LARK_BOT_OPEN_ID required'),
  LARK_DOMAIN: z.enum(['feishu', 'lark']).default('feishu'),
  PROBEFLASH_SKILL_MODE: z.enum(['mock', 'claude', 'deepseek']).default('mock'),
  // L6（docs/planning/code-audit-2026-06-14.md）入站信任边界。三者全部可选——未配置时保持
  // 现行为、不 fail-closed，避免破坏现有部署：
  // - LARK_ALLOWED_TENANT_KEY：租户白名单（单租户），与事件 `sender.tenant_key` 比对；
  //   未配置 = 不校验（放行），gateway 启动时打一条 warn 提醒运营者。
  // - LARK_ALLOWED_SENDER_IDS：发送者 open_id 白名单，逗号分隔；未配置 = 不校验（放行）。
  // - LARK_RATE_LIMIT_PER_MINUTE：按发送者维度每分钟条数上限；未配置时用
  //   `rate-limiter.ts` 的 `DEFAULT_RATE_LIMIT_PER_MINUTE`（限流本身恒启用，不受本字段是否
  //   配置影响，只是阈值可调）。
  LARK_ALLOWED_TENANT_KEY: z.string().min(1).optional(),
  LARK_ALLOWED_SENDER_IDS: z.string().optional(),
  LARK_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Parse `LARK_ALLOWED_SENDER_IDS` (comma-separated open_ids) into a list.
 * Returns `undefined` when unset/empty so callers can treat that as
 * "allow list not configured" and preserve the pre-L6 behavior.
 */
export function parseAllowedSenderIds(cfg: Config): string[] | undefined {
  const raw = cfg.LARK_ALLOWED_SENDER_IDS;
  if (!raw) return undefined;
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return ids.length > 0 ? ids : undefined;
}

export function loadConfigFrom(
  env: Record<string, string | undefined>,
): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`invalid config: ${issues}`);
  }
  return parsed.data;
}

export function loadConfig(): Config {
  return loadConfigFrom(process.env as Record<string, string | undefined>);
}
