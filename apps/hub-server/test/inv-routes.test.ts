import { describe, expect, test } from 'vitest';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import {
  InventoryResponseSchema,
  CreatePartTypeResponseSchema,
  CreatePartActionResponseSchema,
} from '@teamhub/hub-contracts';
import { InMemoryInvStore } from './support/inmemory-inv-store.js';

describe('库存 / BOM 路由（INV-BOM-CORE）', () => {
  test('GET /api/inventory → 矩阵 + 缺料告警；I0：返回体无 memberId', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/inventory' });
      expect(res.statusCode).toBe(200);
      const body = InventoryResponseSchema.parse(res.json());
      expect(body.partTypes.length).toBeGreaterThan(0);
      // 库存总表矩阵：GM6020 idle 3、车列复用资源
      const gm = body.ledger.find((r) => r.partType.id === 'parttype-gm6020');
      expect(gm?.idle).toBe(3);
      expect(gm?.perResource.some((p) => p.resourceId === 'res-r1')).toBe(true);
      // 缺料告警：主控板 idle 1 < threshold 2
      expect(body.shortfalls.some((p) => p.id === 'parttype-maincontroller')).toBe(true);
      // I0：整个返回体序列化后不含 memberId 字面
      expect(JSON.stringify(body)).not.toContain('memberId');
    } finally {
      await app.close();
    }
  });

  test('POST /api/inventory/actions：damage 一句话快记 → 201，总数减一', async () => {
    const store = new InMemoryInvStore();
    const app = buildTestHubServer({ invStore: store });
    try {
      const before = (await store.getInventorySnapshot()).partTypes.find(
        (p) => p.id === 'parttype-gm6020',
      )?.totalQuantity;
      const res = await app.inject({
        method: 'POST',
        url: '/api/inventory/actions',
        payload: {
          projectId: 'prj-robots',
          partTypeId: 'parttype-gm6020',
          trackedPartId: null,
          kind: 'damage',
          quantityDelta: 1,
          fromHolder: null,
          toHolder: null,
          note: '坏了一个 3508、烧了',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = CreatePartActionResponseSchema.parse(res.json());
      expect(body.action.kind).toBe('damage');
      // C5 + I0：server 钉 source=human，无 memberId
      expect(body.action.recordedBy.source).toBe('human');
      expect(body.action).not.toHaveProperty('memberId');
      const after = (await store.getInventorySnapshot()).partTypes.find(
        (p) => p.id === 'parttype-gm6020',
      )?.totalQuantity;
      expect(after).toBe((before ?? 0) - 1);
    } finally {
      await app.close();
    }
  });

  test('POST /api/inventory/actions：mount 到已知车 → 201；used +1', async () => {
    const store = new InMemoryInvStore();
    const app = buildTestHubServer({ invStore: store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/inventory/actions',
        payload: {
          projectId: 'prj-robots',
          partTypeId: 'parttype-gm6020',
          trackedPartId: 'part-gm-7',
          kind: 'mount',
          quantityDelta: 1,
          fromHolder: 'idle',
          toHolder: 'res-r1',
          note: null,
        },
      });
      expect(res.statusCode).toBe(201);
      const snap = await store.getInventorySnapshot();
      const r1 = snap.partTypes
        .find((p) => p.id === 'parttype-gm6020')
        ?.allocations.find((a) => a.resourceId === 'res-r1');
      expect(r1?.used).toBe(3); // 2 → 3
      const tracked = snap.trackedParts.find((t) => t.id === 'part-gm-7');
      expect(tracked?.currentHolder).toBe('res-r1');
    } finally {
      await app.close();
    }
  });

  test('POST /api/inventory/actions：未知 resourceId → 400', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/inventory/actions',
        payload: {
          projectId: 'prj-robots',
          partTypeId: 'parttype-gm6020',
          trackedPartId: null,
          kind: 'mount',
          quantityDelta: 1,
          fromHolder: 'idle',
          toHolder: 'res-nonexistent',
          note: null,
        },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('POST /api/inventory/actions：非法迁移（damage 超总数）→ 400', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/inventory/actions',
        payload: {
          projectId: 'prj-robots',
          partTypeId: 'parttype-gm6020',
          trackedPartId: null,
          kind: 'damage',
          quantityDelta: 9999,
          fromHolder: null,
          toHolder: null,
          note: null,
        },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('写鉴权：配 writeToken 后无 token POST → 401，带 token → 201', async () => {
    const app = buildTestHubServer({ writeToken: 'secret-x' });
    try {
      const payload = {
        projectId: 'prj-robots',
        partNumber: 'TEST-1',
        name: '测试件',
        category: 'other',
        unit: '个',
        trackIndividually: false,
        totalQuantity: 10,
        allocations: [],
        lowStockThreshold: 2,
      };
      const noToken = await app.inject({
        method: 'POST',
        url: '/api/inventory/part-types',
        payload,
      });
      expect(noToken.statusCode).toBe(401);
      const withToken = await app.inject({
        method: 'POST',
        url: '/api/inventory/part-types',
        headers: { authorization: 'Bearer secret-x' },
        payload,
      });
      expect(withToken.statusCode).toBe(201);
      const body = CreatePartTypeResponseSchema.parse(withToken.json());
      expect(body.partType.id).toMatch(/^parttype-new-/);
      expect(body.partType.lastCountedAt).not.toBeNull();
    } finally {
      await app.close();
    }
  });

  test('POST /api/inventory/part-types：带 id 命中 → 更新（调阈值）', async () => {
    const store = new InMemoryInvStore();
    const app = buildTestHubServer({ invStore: store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/inventory/part-types',
        payload: {
          id: 'parttype-gm6020',
          projectId: 'prj-robots',
          partNumber: 'GM6020',
          name: 'GM6020 电机',
          category: 'motor',
          unit: '个',
          trackIndividually: true,
          totalQuantity: 9,
          allocations: [
            { resourceId: 'res-r1', used: 2, reserved: 0 },
            { resourceId: 'res-r2', used: 4, reserved: 0 },
          ],
          lowStockThreshold: 5, // 调高阈值
        },
      });
      expect(res.statusCode).toBe(201);
      const body = CreatePartTypeResponseSchema.parse(res.json());
      expect(body.partType.id).toBe('parttype-gm6020'); // 不新建
      expect(body.partType.lowStockThreshold).toBe(5);
    } finally {
      await app.close();
    }
  });
});
