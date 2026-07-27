import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildHubServer } from '../src/server.js';
import { SqliteDatabase } from '../src/store/sqlite-db.js';
import { LarkIntegrationStore } from '../src/store/lark-integration-store.js';
import { openUnifiedDb, defaultSeeds } from '../src/store/sqlite-unified.js';
import {
  ClaimTaskResponseSchema,
  LarkPushReminderResponseSchema,
  CreateTaskResponseSchema,
} from '@teamhub/hub-contracts';

let dir: string;
let dbPath: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'teamhub-lark-outbound-'));
  dbPath = join(dir, 'teamhub.sqlite');
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchTokenOk() {
  const calls: { url: string; body?: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, body });
    if (url.includes('tenant_access_token')) {
      return new Response(JSON.stringify({ code: 0, tenant_access_token: 'fake-token' }), { status: 200 });
    }
    if (url.includes('im/v1/messages')) {
      return new Response(JSON.stringify({ code: 0 }), { status: 200 });
    }
    return new Response(JSON.stringify({ code: 1, msg: 'unknown' }), { status: 400 });
  }));
  return calls;
}

function buildAppWithLark(cfg: { appId: string; appSecret: string; chatId: string; status: 'connected' | 'error' | 'unconfigured' }) {
  const stores = openUnifiedDb(dbPath, { seeds: defaultSeeds(true) });
  const larkStore = LarkIntegrationStore.fromSharedDb(stores.db);
  larkStore.saveConfig(cfg);
  const app = buildHubServer({
    store: stores.gov,
    kbStore: stores.kb,
    invStore: stores.inv,
    baselineStore: stores.baseline,
    checklistStore: stores.checklist,
    larkStore,
  });
  return { app, stores, larkStore };
}

describe('LARK-OUTBOUND-PUSH：认领通知', () => {
  test('认领成功 → fire-and-forget 推飞书群消息', async () => {
    const calls = mockFetchTokenOk();
    const { app, stores } = buildAppWithLark({ appId: 'app1', appSecret: 'sec1', chatId: 'oc_123', status: 'connected' });
    try {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          projectId: 'prj-robots',
          groupId: 'grp-mech',
          title: '挂单：整理线束',
          rawSummary: '无主的活',
          ownerId: null,
          collaboratorIds: [],
          intrinsicComplexity: 'trivial',
        },
      });
      expect(created.statusCode).toBe(201);
      const posted = CreateTaskResponseSchema.parse(created.json()).task;

      const res = await app.inject({
        method: 'POST',
        url: `/api/tasks/${posted.id}/claim`,
        payload: { memberId: 'm-mechD' },
      });
      expect(res.statusCode).toBe(200);
      const body = ClaimTaskResponseSchema.parse(res.json());
      expect(body.task.ownerId).toBe('m-mechD');

      // fire-and-forget: 等微任务刷完
      await new Promise((r) => setTimeout(r, 50));
      const msgCall = calls.find((c) => c.url.includes('im/v1/messages'));
      expect(msgCall).toBeDefined();
      const content = JSON.parse((msgCall!.body as Record<string, unknown>).content as string);
      expect(content.text).toContain('整理线束');
      expect(content.text).toContain('认领');
    } finally {
      stores.close();
      await app.close();
    }
  });

  test('认领 409（已有主）→ 不推飞书', async () => {
    const calls = mockFetchTokenOk();
    const { app, stores } = buildAppWithLark({ appId: 'app1', appSecret: 'sec1', chatId: 'oc_123', status: 'connected' });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-arm-mount/claim',
        payload: { memberId: 'm-mechD' },
      });
      expect(res.statusCode).toBe(409);
      await new Promise((r) => setTimeout(r, 50));
      const msgCall = calls.find((c) => c.url.includes('im/v1/messages'));
      expect(msgCall).toBeUndefined();
    } finally {
      stores.close();
      await app.close();
    }
  });

  test('飞书未连接 → 认领正常但不推', async () => {
    const calls = mockFetchTokenOk();
    const { app, stores } = buildAppWithLark({ appId: '', appSecret: '', chatId: '', status: 'unconfigured' });
    try {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          projectId: 'prj-robots',
          groupId: 'grp-mech',
          title: '挂单：测试不推',
          rawSummary: 'x',
          ownerId: null,
          collaboratorIds: [],
          intrinsicComplexity: 'trivial',
        },
      });
      const posted = CreateTaskResponseSchema.parse(created.json()).task;
      const res = await app.inject({
        method: 'POST',
        url: `/api/tasks/${posted.id}/claim`,
        payload: { memberId: 'm-mechD' },
      });
      expect(res.statusCode).toBe(200);
      await new Promise((r) => setTimeout(r, 50));
      const msgCall = calls.find((c) => c.url.includes('im/v1/messages'));
      expect(msgCall).toBeUndefined();
    } finally {
      stores.close();
      await app.close();
    }
  });
});

describe('LARK-OUTBOUND-PUSH：push-reminder', () => {
  test('有红/黄里程碑 → 推消息、返回 pushed=true', async () => {
    const calls = mockFetchTokenOk();
    const { app, stores } = buildAppWithLark({ appId: 'app1', appSecret: 'sec1', chatId: 'oc_123', status: 'connected' });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/integrations/lark/push-reminder',
      });
      expect(res.statusCode).toBe(200);
      const body = LarkPushReminderResponseSchema.parse(res.json());
      // demo fixture 有红/黄里程碑（FrozenClock 钉在场景时间）
      expect(body.ok).toBe(true);
      expect(body.pushed).toBe(true);
      expect(body.redCount + body.yellowCount).toBeGreaterThan(0);
      const msgCall = calls.find((c) => c.url.includes('im/v1/messages'));
      expect(msgCall).toBeDefined();
      const content = JSON.parse((msgCall!.body as Record<string, unknown>).content as string);
      expect(content.text).toContain('里程碑提醒');
    } finally {
      stores.close();
      await app.close();
    }
  });

  test('飞书未配置 → 400', async () => {
    mockFetchTokenOk();
    const { app, stores } = buildAppWithLark({ appId: '', appSecret: '', chatId: '', status: 'unconfigured' });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/integrations/lark/push-reminder',
      });
      expect(res.statusCode).toBe(400);
    } finally {
      stores.close();
      await app.close();
    }
  });

  test('无 larkStore → 端点 404', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/integrations/lark/push-reminder',
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
