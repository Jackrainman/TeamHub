import type { Config } from './config.js';
import type { LarkMessageEvent } from './types.js';
import type { Toolkit } from '@probeflash/lark-toolkit';
import type { SkillDispatcher } from '@probeflash/pf-skills';
import type { HubEventSink } from './hub.js';
import { larkMessageEventToHubEvent } from './hub.js';

export interface HandlerDeps {
  toolkit: Toolkit;
  skills: SkillDispatcher;
  hubEvents?: HubEventSink;
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
