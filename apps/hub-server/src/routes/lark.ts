import type { FastifyInstance } from 'fastify';
import {
  LarkConfigSaveRequestSchema,
  LarkPushReminderResponseSchema,
  deriveBaselineDrift,
} from '../contracts.js';
import type { GovStore } from '../store/gov-store.js';
import type { BaselineStore } from '../store/baseline-store.js';
import type { Clock } from '../clock.js';
import type { LarkIntegrationStore } from '../store/lark-integration-store.js';
import { sendLarkMessage } from '../lark-client.js';
import { parseBody, isLoopbackOperator } from './helpers.js';

export interface LarkRouteDeps {
  store: GovStore;
  clock: Clock;
  baselineStore: BaselineStore;
  larkStore: LarkIntegrationStore;
  trustProxy: boolean | string;
}

export function registerLarkRoutes(app: FastifyInstance, deps: LarkRouteDeps): void {
  const { store, clock, baselineStore, larkStore, trustProxy } = deps;

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
      const tokenRes = await fetch(
        'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      const tokenJson = (await tokenRes.json()) as { code?: number; msg?: string };
      if (tokenJson.code !== 0) {
        larkStore.saveConfig({ appId, appSecret, chatId, status: 'error', lastCheckedAt: checkedAt, error: tokenJson.msg ?? 'auth failed' });
        return { ok: false, status: 'error' as const, error: tokenJson.msg ?? 'auth failed' };
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
      const baseline = await baselineStore.getBaseline(season.id);
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
