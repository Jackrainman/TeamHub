import { afterAll, describe, expect, test } from 'vitest';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { InMemoryInvStore } from '../src/store/mock-inv-store.js';
import {
  inventoryScenarioFixture,
  HermesInboundResponseSchema,
} from '@teamhub/hub-contracts';

function hermesApp() {
  const invStore = new InMemoryInvStore(inventoryScenarioFixture);
  const app = buildTestHubServer({ invStore });
  return { app, invStore };
}

describe('POST /api/hermes/inbound — inv-query', () => {
  const { app } = hermesApp();
  afterAll(() => app.close());

  test('结构化 inv-query 按名称 → 返回匹配件', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/hermes/inbound',
      payload: { command: 'inv-query', args: { name: 'GM6020' } },
    });
    expect(res.statusCode).toBe(200);
    const body = HermesInboundResponseSchema.parse(res.json());
    expect(body.ok).toBe(true);
    expect(body.text).toContain('GM6020');
    expect(body.text).toContain('总9');
  });

  test('文本 "3508还有几个" → 规则匹配 → 查不到（fixture 无 3508）→ ok:false', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/hermes/inbound',
      payload: { text: '3508还有几个' },
    });
    expect(res.statusCode).toBe(200);
    const body = HermesInboundResponseSchema.parse(res.json());
    expect(body.ok).toBe(false);
    expect(body.text).toContain('没找到');
  });

  test('文本 "GM6020还有几个" → 规则匹配 → 查到', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/hermes/inbound',
      payload: { text: 'GM6020还有几个' },
    });
    expect(res.statusCode).toBe(200);
    const body = HermesInboundResponseSchema.parse(res.json());
    expect(body.ok).toBe(true);
    expect(body.text).toContain('GM6020');
  });

  test('按类别查 → motor 类有 GM6020', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/hermes/inbound',
      payload: { command: 'inv-query', args: { category: 'motor' } },
    });
    expect(res.statusCode).toBe(200);
    const body = HermesInboundResponseSchema.parse(res.json());
    expect(body.ok).toBe(true);
    expect(body.text).toContain('GM6020');
  });

  test('按机器人查装配 → R1 有件', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/hermes/inbound',
      payload: { command: 'inv-query', args: { robot: 'R1' } },
    });
    expect(res.statusCode).toBe(200);
    const body = HermesInboundResponseSchema.parse(res.json());
    expect(body.ok).toBe(true);
    expect(body.text).toContain('装配清单');
  });

  test('按不存在的机器人查 → ok:false', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/hermes/inbound',
      payload: { command: 'inv-query', args: { robot: 'R99' } },
    });
    expect(res.statusCode).toBe(200);
    const body = HermesInboundResponseSchema.parse(res.json());
    expect(body.ok).toBe(false);
    expect(body.text).toContain('没找到');
  });
});

describe('POST /api/hermes/inbound — inv-record', () => {
  test('入库 +3 → totalQuantity 增加', async () => {
    const { app, invStore } = hermesApp();
    try {
      const before = (await invStore.getInventorySnapshot()).partTypes.find(
        (p) => p.id === 'parttype-gm6020',
      )!;
      const res = await app.inject({
        method: 'POST',
        url: '/api/hermes/inbound',
        payload: {
          command: 'inv-record',
          args: { name: 'GM6020', action: 'add', quantity: 3 },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = HermesInboundResponseSchema.parse(res.json());
      expect(body.ok).toBe(true);
      expect(body.text).toContain('+3');
      const after = (await invStore.getInventorySnapshot()).partTypes.find(
        (p) => p.id === 'parttype-gm6020',
      )!;
      expect(after.totalQuantity).toBe(before.totalQuantity + 3);
    } finally {
      await app.close();
    }
  });

  test('损耗 -1 → totalQuantity 减少', async () => {
    const { app, invStore } = hermesApp();
    try {
      const before = (await invStore.getInventorySnapshot()).partTypes.find(
        (p) => p.id === 'parttype-gm6020',
      )!;
      const res = await app.inject({
        method: 'POST',
        url: '/api/hermes/inbound',
        payload: {
          command: 'inv-record',
          args: { name: 'GM6020', action: 'subtract', quantity: 1 },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = HermesInboundResponseSchema.parse(res.json());
      expect(body.ok).toBe(true);
      expect(body.text).toContain('-1');
      const after = (await invStore.getInventorySnapshot()).partTypes.find(
        (p) => p.id === 'parttype-gm6020',
      )!;
      expect(after.totalQuantity).toBe(before.totalQuantity - 1);
    } finally {
      await app.close();
    }
  });

  test('文本 "新到了5个GM6020" → 规则匹配入库', async () => {
    const { app, invStore } = hermesApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/hermes/inbound',
        payload: { text: '新到了5个GM6020' },
      });
      expect(res.statusCode).toBe(200);
      const body = HermesInboundResponseSchema.parse(res.json());
      expect(body.ok).toBe(true);
      expect(body.text).toContain('+5');
      const after = (await invStore.getInventorySnapshot()).partTypes.find(
        (p) => p.id === 'parttype-gm6020',
      )!;
      expect(after.totalQuantity).toBe(14);
    } finally {
      await app.close();
    }
  });

  test('文本 "GM6020烧了" → 规则匹配损耗 -1', async () => {
    const { app, invStore } = hermesApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/hermes/inbound',
        payload: { text: 'GM6020烧了' },
      });
      expect(res.statusCode).toBe(200);
      const body = HermesInboundResponseSchema.parse(res.json());
      expect(body.ok).toBe(true);
      expect(body.text).toContain('-1');
      const after = (await invStore.getInventorySnapshot()).partTypes.find(
        (p) => p.id === 'parttype-gm6020',
      )!;
      expect(after.totalQuantity).toBe(8);
    } finally {
      await app.close();
    }
  });

  test('调拨 R1→R2 → allocations 变化', async () => {
    const { app, invStore } = hermesApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/hermes/inbound',
        payload: {
          command: 'inv-record',
          args: { name: 'GM6020', action: 'transfer', quantity: 1, from: 'R1', to: 'R2' },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = HermesInboundResponseSchema.parse(res.json());
      expect(body.ok).toBe(true);
      expect(body.text).toContain('调到');
      const after = (await invStore.getInventorySnapshot()).partTypes.find(
        (p) => p.id === 'parttype-gm6020',
      )!;
      const r1 = after.allocations.find((a) => a.resourceId === 'res-r1')!;
      const r2 = after.allocations.find((a) => a.resourceId === 'res-r2')!;
      expect(r1.used).toBe(1);
      expect(r2.used).toBe(5);
    } finally {
      await app.close();
    }
  });

  test('记账不存在的件 → ok:false', async () => {
    const { app } = hermesApp();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/hermes/inbound',
        payload: {
          command: 'inv-record',
          args: { name: '不存在的件', action: 'add', quantity: 1 },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = HermesInboundResponseSchema.parse(res.json());
      expect(body.ok).toBe(false);
      expect(body.text).toContain('没找到');
    } finally {
      await app.close();
    }
  });

  test('source 钉 hermes（action log 可追溯）', async () => {
    const { app, invStore } = hermesApp();
    try {
      await app.inject({
        method: 'POST',
        url: '/api/hermes/inbound',
        payload: {
          command: 'inv-record',
          args: { name: 'GM6020', action: 'add', quantity: 1 },
        },
      });
      const snap = await invStore.getInventorySnapshot();
      const lastAction = snap.actions[snap.actions.length - 1];
      expect(lastAction.recordedBy.source).toBe('hermes');
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/hermes/inbound — 边界', () => {
  const { app } = hermesApp();
  afterAll(() => app.close());

  test('无法匹配的文本 → ok:false + 提示', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/hermes/inbound',
      payload: { text: '今天天气不错' },
    });
    expect(res.statusCode).toBe(200);
    const body = HermesInboundResponseSchema.parse(res.json());
    expect(body.ok).toBe(false);
    expect(body.text).toContain('没听懂');
  });

  test('空 body → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/hermes/inbound',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  test('inv-query 无参数 → ok:false', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/hermes/inbound',
      payload: { command: 'inv-query', args: {} },
    });
    expect(res.statusCode).toBe(200);
    const body = HermesInboundResponseSchema.parse(res.json());
    expect(body.ok).toBe(false);
  });

  test('写门鉴权：有 WRITE_TOKEN 时无 Bearer → 401', async () => {
    const gatedApp = buildTestHubServer({
      invStore: new InMemoryInvStore(inventoryScenarioFixture),
      writeToken: 'test-secret',
    });
    try {
      const res = await gatedApp.inject({
        method: 'POST',
        url: '/api/hermes/inbound',
        payload: { command: 'inv-query', args: { name: 'GM6020' } },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await gatedApp.close();
    }
  });

  test('写门鉴权：有 WRITE_TOKEN + Bearer → 200', async () => {
    const gatedApp = buildTestHubServer({
      invStore: new InMemoryInvStore(inventoryScenarioFixture),
      writeToken: 'test-secret',
    });
    try {
      const res = await gatedApp.inject({
        method: 'POST',
        url: '/api/hermes/inbound',
        headers: { authorization: 'Bearer test-secret' },
        payload: { command: 'inv-query', args: { name: 'GM6020' } },
      });
      expect(res.statusCode).toBe(200);
      const body = HermesInboundResponseSchema.parse(res.json());
      expect(body.ok).toBe(true);
    } finally {
      await gatedApp.close();
    }
  });
});
