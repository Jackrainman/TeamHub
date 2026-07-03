import type { Config } from './config.js';
import { parseAllowedSenderIds } from './config.js';
import type { LarkMessageEvent } from './types.js';
import type { Toolkit } from '@probeflash/lark-toolkit';
import type { SkillDispatcher } from '@probeflash/pf-skills';
import type { HubEventSink } from './hub.js';
import { larkMessageEventToHubEvent } from './hub.js';
import type { RateLimiter } from './rate-limiter.js';
import { logger } from './logger.js';

export interface HandlerDeps {
  toolkit: Toolkit;
  skills: SkillDispatcher;
  hubEvents?: HubEventSink;
  // L6：按发送者维度的限流器，由调用方（event-router）持有一个跨事件共享的长生命周期
  // 实例并注入，配额才能累积生效。省略时不限流（测试等不关心限流的场景可不传）。
  rateLimiter?: RateLimiter;
}

/**
 * L6 入站信任边界校验矩阵（docs/planning/code-audit-2026-06-14.md）——三项全部只在
 * 对应 env 配置时启用，未配置保持放行（不 fail-closed）；限流阈值本身恒生效：
 *   1. tenant_key allow-list  — LARK_ALLOWED_TENANT_KEY 未设 → 放行
 *   2. sender open_id allow-list — LARK_ALLOWED_SENDER_IDS 未设 → 放行
 *   3. 按 sender 的每分钟限流 — 恒启用，阈值来自 LARK_RATE_LIMIT_PER_MINUTE 或默认值
 * 任一项未过 → 丢弃事件（不进入 hub 记录 / skill 调度 / 回复）并记一条 warn 日志。
 */
function isTenantAllowed(cfg: Config, tenantKey: string | undefined): boolean {
  if (!cfg.LARK_ALLOWED_TENANT_KEY) return true;
  return tenantKey === cfg.LARK_ALLOWED_TENANT_KEY;
}

function isSenderAllowed(cfg: Config, senderId: string | undefined): boolean {
  const allowed = parseAllowedSenderIds(cfg);
  if (!allowed) return true;
  return senderId != null && allowed.includes(senderId);
}

/**
 * Strip "@username" tokens (e.g. `@_user_1`) and collapse whitespace.
 * Feishu webhook content places the bot mention as a `@_user_N` placeholder
 * keyed against the `mentions[]` array; the raw text contains those tokens
 * verbatim, so removing them yields the user's actual symptom.
 */
export function stripMention(text: string): string {
  return text.replace(/@\S+/g, '').replace(/\s+/g, ' ').trim();
}

export async function handleMessage(
  data: LarkMessageEvent,
  cfg: Config,
  deps: HandlerDeps,
): Promise<void> {
  if (data.message.message_type !== 'text') return;

  const mentions = data.message.mentions ?? [];
  const isBotMentioned = mentions.some(
    (m) => m.id.open_id === cfg.LARK_BOT_OPEN_ID,
  );
  if (!isBotMentioned) return;

  const senderId = data.sender?.sender_id?.open_id;
  const tenantKey = data.sender?.tenant_key;
  const chatId = data.message.chat_id;

  if (!isTenantAllowed(cfg, tenantKey)) {
    logger.warn('lark event dropped: tenant not allowed', {
      tenant_key: tenantKey,
      chat_id: chatId,
    });
    return;
  }
  if (!isSenderAllowed(cfg, senderId)) {
    logger.warn('lark event dropped: sender not allowlisted', {
      sender_id: senderId,
      chat_id: chatId,
    });
    return;
  }
  if (deps.rateLimiter && !deps.rateLimiter.allow(senderId ?? 'unknown')) {
    logger.warn('lark event dropped: rate limit exceeded', {
      sender_id: senderId,
      chat_id: chatId,
    });
    return;
  }

  try {
    await deps.hubEvents?.record(larkMessageEventToHubEvent(data));
  } catch {
    // Hub event capture is best-effort in the lark-gateway process.
  }

  let rawText = '';
  try {
    const parsed = JSON.parse(data.message.content) as { text?: string };
    rawText = parsed.text ?? '';
  } catch {
    // Malformed content payload — treat as empty so we send help, not crash
    rawText = '';
  }
  const symptom = stripMention(rawText);

  if (symptom.length === 0) {
    await deps.toolkit.reply({
      chatId: data.message.chat_id,
      replyToMessageId: data.message.message_id,
      text: '@我 + 一句调试症状（如"自动跑点又歪了"），我会生成检查清单。',
    });
    return;
  }

  const reply = await deps.skills.dispatch(symptom);
  await deps.toolkit.reply({
    chatId: data.message.chat_id,
    replyToMessageId: data.message.message_id,
    text: reply.text,
  });
}
