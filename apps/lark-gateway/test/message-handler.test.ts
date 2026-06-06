import { describe, test, expect, vi } from 'vitest';
import { handleMessage, stripMention } from '../src/message-handler';
import type { Config } from '../src/config';
import type { LarkMessageEvent } from '../src/types';

const cfg: Config = {
  LARK_APP_ID: 'app',
  LARK_APP_SECRET: 'secret',
  LARK_BOT_OPEN_ID: 'ou_bot',
  LARK_DOMAIN: 'feishu',
  PROBEFLASH_SKILL_MODE: 'mock',
};

interface MakeEventOpts {
  text?: string;
  type?: string;
  mentions?: Array<{ key: string; id: { open_id: string } }>;
}

function makeEvent(opts: MakeEventOpts): LarkMessageEvent {
  const type = opts.type ?? 'text';
  return {
    message: {
      chat_id: 'oc_chat',
      message_id: 'om_msg',
      message_type: type,
      content: type === 'text' ? JSON.stringify({ text: opts.text ?? '' }) : '{}',
      mentions: opts.mentions,
    },
    sender: { sender_id: { open_id: 'ou_user' } },
  };
}

function makeDeps() {
  return {
    toolkit: { reply: vi.fn().mockResolvedValue(undefined) },
    skills: {
      dispatch: vi
        .fn()
        .mockResolvedValue({ kind: 'mock' as const, text: '[mock] stub reply' }),
    },
  };
}

describe('handleMessage', () => {
  test('非 text 消息 → 不调度 skill 不回复', async () => {
    const deps = makeDeps();
    await handleMessage(makeEvent({ type: 'post' }), cfg, deps);
    expect(deps.toolkit.reply).not.toHaveBeenCalled();
    expect(deps.skills.dispatch).not.toHaveBeenCalled();
  });

  test('text 但非 @bot → 不调度 skill 不回复', async () => {
    const deps = makeDeps();
    await handleMessage(
      makeEvent({ text: '大家好', mentions: [] }),
      cfg,
      deps,
    );
    expect(deps.toolkit.reply).not.toHaveBeenCalled();
    expect(deps.skills.dispatch).not.toHaveBeenCalled();
  });

  test('text @ 别人但非 @bot → 不调度不回复', async () => {
    const deps = makeDeps();
    await handleMessage(
      makeEvent({
        text: '@_user_2 你看下',
        mentions: [{ key: '@_user_2', id: { open_id: 'ou_other' } }],
      }),
      cfg,
      deps,
    );
    expect(deps.toolkit.reply).not.toHaveBeenCalled();
    expect(deps.skills.dispatch).not.toHaveBeenCalled();
  });

  test('@bot 但 strip 后空 → 发 help reply，不调 skill', async () => {
    const deps = makeDeps();
    await handleMessage(
      makeEvent({
        text: '@_user_1 ',
        mentions: [{ key: '@_user_1', id: { open_id: 'ou_bot' } }],
      }),
      cfg,
      deps,
    );
    expect(deps.skills.dispatch).not.toHaveBeenCalled();
    expect(deps.toolkit.reply).toHaveBeenCalledOnce();
    const arg = deps.toolkit.reply.mock.calls[0][0];
    expect(arg.text).toContain('@我');
  });

  test('@bot 带症状 → 调 skills.dispatch(symptom) 然后 toolkit.reply', async () => {
    const deps = makeDeps();
    await handleMessage(
      makeEvent({
        text: '@_user_1 自动跑点又歪了',
        mentions: [{ key: '@_user_1', id: { open_id: 'ou_bot' } }],
      }),
      cfg,
      deps,
    );
    expect(deps.skills.dispatch).toHaveBeenCalledOnce();
    expect(deps.skills.dispatch).toHaveBeenCalledWith('自动跑点又歪了');
    expect(deps.toolkit.reply).toHaveBeenCalledOnce();
    const arg = deps.toolkit.reply.mock.calls[0][0];
    expect(arg).toMatchObject({
      chatId: 'oc_chat',
      replyToMessageId: 'om_msg',
      text: '[mock] stub reply',
    });
  });

  test('@bot 带症状 → 可选记录 HubEvent', async () => {
    const deps = {
      ...makeDeps(),
      hubEvents: { record: vi.fn().mockResolvedValue(undefined) },
    };

    await handleMessage(
      makeEvent({
        text: '@_user_1 自动跑点又歪了',
        mentions: [{ key: '@_user_1', id: { open_id: 'ou_bot' } }],
      }),
      cfg,
      deps,
    );

    expect(deps.hubEvents.record).toHaveBeenCalledOnce();
    expect(deps.hubEvents.record.mock.calls[0][0]).toMatchObject({
      source: 'lark',
      type: 'message.received',
      correlationId: 'om_msg',
    });
  });
});

describe('stripMention', () => {
  test('removes single @ token', () => {
    expect(stripMention('@_user_1 hello')).toBe('hello');
  });
  test('removes multiple @ tokens', () => {
    expect(stripMention('@_user_1 fix this @_user_2 thanks')).toBe(
      'fix this thanks',
    );
  });
  test('collapses extra whitespace', () => {
    expect(stripMention('@_user_1   spaced @_user_2   text')).toBe(
      'spaced text',
    );
  });
  test('empty when only @ tokens', () => {
    expect(stripMention('@_user_1 @_user_2')).toBe('');
  });
  test('preserves text without @ tokens', () => {
    expect(stripMention('自动跑点又歪了')).toBe('自动跑点又歪了');
  });
});
