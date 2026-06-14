import { describe, expect, test } from 'vitest';
import { buildHubServer } from '../src/server.js';
import {
  CreateDependencyResponseSchema,
  CreateNeedResponseSchema,
} from '../src/contracts.js';
import { TasksResponseSchema } from '@teamhub/hub-contracts';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';

describe('PM 读视图 + 依赖/缺口录入', () => {
  test('GET /api/tasks → 任务列表（I0 安全：Task 无 confirmedBy / 无完成量维度）', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/tasks' });
      expect(res.statusCode).toBe(200);
      const body = TasksResponseSchema.parse(res.json());
      expect(body.tasks.length).toBeGreaterThan(0);
      for (const t of body.tasks) {
        expect(t).not.toHaveProperty('confirmedBy');
        expect(t).not.toHaveProperty('completedCount');
      }
    } finally {
      await app.close();
    }
  });

  test('POST /api/dependencies → 201；server clamp status=active（D-042 初始态）；持久化', async () => {
    const store = new InMemoryGovStore();
    const before = (await store.getSnapshot()).dependencies.length;
    const app = buildHubServer({ store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/dependencies',
        payload: {
          projectId: 'prj-robots',
          fromTaskId: 't-r1-newboard',
          toTaskId: 't-r1-chassis',
          type: 'blocks',
          source: 'human',
          confirmedBy: { id: 'm-ecB', displayName: '电控B', source: 'console' },
        },
      });
      expect(res.statusCode).toBe(201);
      const body = CreateDependencyResponseSchema.parse(res.json());
      expect(body.dependency.id).toMatch(/^dep-new-/);
      // 即便请求里没给 status，server 也 clamp 为 active
      expect(body.dependency.status).toBe('active');
      expect((await store.getSnapshot()).dependencies.length).toBe(before + 1);
    } finally {
      await app.close();
    }
  });

  test('POST /api/dependencies：请求无法夹带 status（被 omit，clamp 生效）', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/dependencies',
        payload: {
          projectId: 'prj-robots',
          fromTaskId: 't-r1-newboard',
          toTaskId: 't-r1-chassis',
          type: 'blocks',
          source: 'human',
          confirmedBy: null,
          status: 'satisfied', // 试图夹带——应被忽略，clamp 为 active
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().dependency.status).toBe('active');
    } finally {
      await app.close();
    }
  });

  test('POST /api/needs → 201；clamp status=open / escalatedAt=null；A1 缺口归组', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/needs',
        payload: {
          projectId: 'prj-robots',
          onTaskId: 't-r1-chassis',
          description: '需要懂 RTOS 的人协助中断时序',
          providerGroupId: 'grp-program',
          claimedByMemberId: null,
          neededSkills: ['RTOS'],
          source: 'human',
          confirmedBy: { id: 'm-ecB', displayName: '电控B', source: 'console' },
        },
      });
      expect(res.statusCode).toBe(201);
      const body = CreateNeedResponseSchema.parse(res.json());
      expect(body.need.status).toBe('open');
      expect(body.need.escalatedAt).toBeNull();
      // A1：缺口归组不归人
      expect(body.need.providerGroupId).toBe('grp-program');
      expect(body.need.claimedByMemberId).toBeNull();
    } finally {
      await app.close();
    }
  });

  test('POST /api/dependencies 缺必填 → 400', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/dependencies',
        payload: { fromTaskId: 't-a' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
