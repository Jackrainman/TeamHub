import * as lark from '@larksuiteoapi/node-sdk';
import type { Toolkit } from '@probeflash/lark-toolkit';
import type { SkillDispatcher } from '@probeflash/pf-skills';
import type { Config } from './config.js';
import type { LarkMessageEvent } from './types.js';
import { handleMessage } from './message-handler.js';
import { createRateLimiter } from './rate-limiter.js';
import { logger } from './logger.js';

/**
 * Wire `im.message.receive_v1` events to `handleMessage` with the
 * caller-provided toolkit + skill dispatcher. Exceptions are swallowed
 * (logged) so they cannot bubble up and close the WS connection.
 *
 * L6：`rateLimiter` is created once here (not inside the per-event handler)
 * so its per-sender window state accumulates across the process lifetime.
 * If `LARK_ALLOWED_TENANT_KEY` is unset we log a one-time startup warning —
 * tenant validation stays disabled (existing deployments keep working) but
 * the operator is told the trust boundary is open.
 */
export function buildEventDispatcher(
  cfg: Config,
  toolkit: Toolkit,
  skills: SkillDispatcher,
): lark.EventDispatcher {
  if (!cfg.LARK_ALLOWED_TENANT_KEY) {
    logger.warn(
      'LARK_ALLOWED_TENANT_KEY not configured — tenant_key validation disabled, accepting inbound events from any tenant',
    );
  }
  const rateLimiter = createRateLimiter(cfg.LARK_RATE_LIMIT_PER_MINUTE);

  return new lark.EventDispatcher({}).register({
    'im.message.receive_v1': async (data: LarkMessageEvent) => {
      try {
        await handleMessage(data, cfg, { toolkit, skills, rateLimiter });
      } catch (err) {
        logger.error('handler error', {
          chat_id: data?.message?.chat_id,
          message_id: data?.message?.message_id,
          error: (err as Error).message,
        });
      }
      return { ok: true };
    },
  });
}
