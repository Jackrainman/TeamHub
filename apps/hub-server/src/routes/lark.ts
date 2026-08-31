import type { FastifyInstance } from 'fastify';
import {
  LarkConfigSaveRequestSchema,
  LarkPushReminderResponseSchema,
  LarkChatsResponseSchema,
  LarkCreateChatRequestSchema,
  LarkCreateChatResponseSchema,
  deriveBaselineDrift,
} from '@teamhub/hub-contracts';
import type { PmRepository } from '../modules/pm/repository.js';
import type { BaselineRepository } from '../modules/baseline/repository.js';
import type { Clock } from '../clock.js';
import type { LarkIntegrationStore } from '../store/lark-integration-store.js';
import {
  sendLarkMessage,
  getTenantAccessToken,
  listLarkChats,
  createLarkChat,
} from '../lark-client.js';
import { parseBody, isLoopbackOperator } from './helpers.js';

export interface LarkRouteDeps {
  store: PmRepository;
  clock: Clock;
  baselineRepository: Pick<BaselineRepository, 'getBaseline'>;
  larkStore: LarkIntegrationStore;
  trustProxy: boolean | string;
}

export function registerLarkRoutes(app: FastifyInstance, deps: LarkRouteDeps): void {
  const { store, clock, baselineRepository, larkStore, trustProxy } = deps;

  app.get('/api/integrations/lark', async () => {
    const config = larkStore.getConfig();
    if (!config || !config.appId) {
      return { configured: false, status: 'unconfigured' };
    }
    const masked = config.appSecret
      ? `****${config.appSecret.slice(-4)}`
      : undefined;
    return {
      configured: true,
      appId: config.appId,
      appSecretMasked: masked,
      chatId: config.chatId,
      status: config.status,
      lastCheckedAt: config.lastCheckedAt,
      error: config.error,
    };
  });

  app.put('/api/integrations/lark', async (request, reply) => {
    const parsed = parseBody(LarkConfigSaveRequestSchema, request, reply);
    if (!parsed) return;
    const { appId, appSecret, chatId } = parsed;
    const checkedAt = new Date().toISOString();
    try {
      const { token, error: tokenError } = await getTenantAccessToken(appId, appSecret);
      if (!token) {
        const error = tokenError ?? 'auth failed';
        larkStore.saveConfig({ appId, appSecret, chatId, status: 'error', lastCheckedAt: checkedAt, error });
        return { ok: false, status: 'error' as const, error };
      }
      // chat_id 实测：真发一条测试消息，无效群/机器人不在群立即暴露（此前只验 token，chat_id 无效也显示"连接正常"）
      const probe = await sendLarkMessage(appId, appSecret, chatId, '[TeamHub] 飞书连接测试成功，此群已接通。');
      if (!probe.ok) {
        const error = `chat_id 验证失败：${probe.error ?? 'send failed'}`;
        larkStore.saveConfig({ appId, appSecret, chatId, status: 'error', lastCheckedAt: checkedAt, error });
        return { ok: false, status: 'error' as const, error };
      }
      larkStore.saveConfig({ appId, appSecret, chatId, status: 'connected', lastCheckedAt: checkedAt });
      return { ok: true, status: 'connected' as const };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'network error';
      larkStore.saveConfig({ appId, appSecret, chatId, status: 'error', lastCheckedAt: checkedAt, error: msg });
      return { ok: false, status: 'error' as const, error: msg };
    }
  });

  app.delete('/api/integrations/lark', async () => {
    larkStore.clearConfig();
    larkStore.rotateWriteToken();
    return { ok: true };
  });

  // 列机器人所在群（配置页 chat_id 下拉替代手填，docs/domains/integrations.md）。
  app.get('/api/integrations/lark/chats', async (_request, reply) => {
    const cfg = larkStore.getConfig();
    if (!cfg || !cfg.appId || !cfg.appSecret) {
      void reply.code(400).send({ detail: '飞书未配置，先保存 App ID / App Secret' });
      return;
    }
    const { chats, error } = await listLarkChats(cfg.appId, cfg.appSecret);
    if (!chats) {
      void reply.code(502).send({ detail: error ?? 'list chats failed' });
      return;
    }
    return LarkChatsResponseSchema.parse({ chats });
  });

  // 建群 + 机器人自动入群（im/v1/chats 创建者即机器人，docs/domains/integrations.md）。
  app.post('/api/integrations/lark/chats', async (request, reply) => {
    const parsed = parseBody(LarkCreateChatRequestSchema, request, reply);
    if (!parsed) return;
    const cfg = larkStore.getConfig();
    if (!cfg || !cfg.appId || !cfg.appSecret) {
      void reply.code(400).send({ detail: '飞书未配置，先保存 App ID / App Secret' });
      return;
    }
    const { chat, error } = await createLarkChat(cfg.appId, cfg.appSecret, parsed.name);
    if (!chat) {
      void reply.code(502).send({ detail: error ?? 'create chat failed' });
      return;
    }
    return LarkCreateChatResponseSchema.parse(chat);
  });

  app.get('/api/hermes/credential', async (request, reply) => {
    if (!isLoopbackOperator(request, trustProxy)) {
      void reply.code(403).send({ detail: 'forbidden' });
      return;
    }
    return { token: larkStore.getWriteToken() };
  });

  app.post('/api/integrations/lark/push-reminder', async (request, reply) => {
    const cfg = larkStore.getConfig();
    if (!cfg || cfg.status !== 'connected') {
      void reply.code(400).send({ detail: '飞书未配置或未连接' });
      return;
    }
    const snapshot = await store.getSnapshot();
    const now = clock.now();
    let redCount = 0;
    let yellowCount = 0;
    const lines: string[] = [];
    for (const season of snapshot.seasons) {
      const baseline = await baselineRepository.getBaseline(season.id);
      if (!baseline) continue;
      const drifts = deriveBaselineDrift(baseline, snapshot.tasks, now);
      for (const d of drifts) {
        if (d.level === 'green') continue;
        const ms = baseline.milestones.find((m) => m.id === d.milestoneId);
        if (!ms) continue;
        if (d.level === 'red') redCount++;
        else yellowCount++;
        const icon = d.level === 'red' ? '🔴' : '🟡';
        lines.push(`${icon} ${ms.title}（挂接任务 ${d.attachedDone}/${d.attachedTotal} 完成）`);
      }
    }
    if (lines.length === 0) {
      return LarkPushReminderResponseSchema.parse({ ok: true, pushed: false, redCount: 0, yellowCount: 0 });
    }
    const text = `[里程碑提醒]\n${lines.join('\n')}`;
    const result = await sendLarkMessage(cfg.appId, cfg.appSecret, cfg.chatId, text);
    if (!result.ok) {
      void reply.code(502).send({ detail: result.error ?? 'send failed' });
      return;
    }
    return LarkPushReminderResponseSchema.parse({ ok: true, pushed: true, redCount, yellowCount });
  });
}
