import { describe, expect, test } from 'vitest';
import {
  AdapterDescriptorSchema,
  HubEventSchema,
} from '@teamhub/hub-contracts';
import {
  buildLarkGatewayAdapterDescriptor,
  larkMessageEventToHubEvent,
} from '../src/hub';
import type { Config } from '../src/config';
import type { LarkMessageEvent } from '../src/types';

const cfg: Config = {
  LARK_APP_ID: 'app',
  LARK_APP_SECRET: 'secret',
  LARK_BOT_OPEN_ID: 'ou_bot',
  LARK_DOMAIN: 'feishu',
  PROBEFLASH_SKILL_MODE: 'mock',
};

describe('lark-gateway Hub contract adapter', () => {
  test('builds a schema-valid ingress adapter descriptor', () => {
    const descriptor = buildLarkGatewayAdapterDescriptor(
      cfg,
      new Date('2026-06-06T00:00:00.000Z'),
    );

    expect(AdapterDescriptorSchema.safeParse(descriptor).success).toBe(true);
    expect(descriptor).toMatchObject({
      id: 'lark-gateway',
      kind: 'ingress',
      status: 'enabled',
    });
    expect(descriptor.capabilities).toContain('hub.event.record');
  });

  test('normalizes a Lark message into a schema-valid HubEvent', () => {
    const event = larkMessageEventToHubEvent(makeEvent(), {
      createdAt: new Date('2026-06-06T00:00:00.000Z'),
      eventId: 'evt-lark-001',
    });

    expect(HubEventSchema.safeParse(event).success).toBe(true);
    expect(event).toMatchObject({
      id: 'evt-lark-001',
      source: 'lark',
      type: 'message.received',
      correlationId: 'om_msg',
    });
    expect(event.payload).toMatchObject({
      chatId: 'oc_chat',
      messageId: 'om_msg',
      text: '@_user_1 自动跑点又歪了',
      mentionOpenIds: ['ou_bot'],
    });
  });
});

function makeEvent(): LarkMessageEvent {
  return {
    message: {
      chat_id: 'oc_chat',
      message_id: 'om_msg',
      message_type: 'text',
      content: JSON.stringify({ text: '@_user_1 自动跑点又歪了' }),
      mentions: [{ key: '@_user_1', id: { open_id: 'ou_bot' } }],
    },
    sender: { sender_id: { open_id: 'ou_user' } },
  };
}
