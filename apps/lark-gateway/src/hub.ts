import {
  AdapterDescriptorSchema,
  HubEventSchema,
  type AdapterDescriptor,
  type HubEvent,
} from '@teamhub/hub-contracts';
import type { Config } from './config.js';
import type { LarkMessageEvent } from './types.js';

export interface HubEventSink {
  record(event: HubEvent): Promise<void> | void;
}

export interface HubEventOptions {
  createdAt?: Date;
  eventId?: string;
}

export function buildLarkGatewayAdapterDescriptor(
  cfg?: Pick<Config, 'LARK_DOMAIN'>,
  now = new Date(),
): AdapterDescriptor {
  return AdapterDescriptorSchema.parse({
    id: 'lark-gateway',
    kind: 'ingress',
    displayName: 'Lark Gateway',
    status: cfg ? 'enabled' : 'unconfigured',
    capabilities: [
      'lark.long-connection',
      'message.received.normalize',
      'hub.event.record',
    ],
    healthCheckedAt: cfg ? now.toISOString() : undefined,
  });
}

export function larkMessageEventToHubEvent(
  data: LarkMessageEvent,
  options: HubEventOptions = {},
): HubEvent {
  const messageId = data.message.message_id;
  const text = parseTextContent(data.message.content);
  const actorId = data.sender?.sender_id?.open_id;

  return HubEventSchema.parse({
    id: options.eventId ?? `lark-message-${messageId}`,
    source: 'lark',
    type: 'message.received',
    actor: actorId
      ? {
          id: actorId,
          displayName: actorId,
          source: 'lark',
        }
      : undefined,
    createdAt: (options.createdAt ?? new Date()).toISOString(),
    correlationId: messageId,
    payload: {
      chatId: data.message.chat_id,
      messageId,
      messageType: data.message.message_type,
      text,
      mentionOpenIds: (data.message.mentions ?? [])
        .map((mention) => mention.id.open_id)
        .filter((openId): openId is string => Boolean(openId)),
    },
  });
}

function parseTextContent(content: string): string {
  try {
    const parsed = JSON.parse(content) as { text?: unknown };
    return typeof parsed.text === 'string' ? parsed.text : '';
  } catch {
    return '';
  }
}
