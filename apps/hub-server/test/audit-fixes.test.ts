import { describe, expect, test } from 'vitest';
import { buildHubServer } from '../src/server.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';

// AUDIT-FIXES 部署前必修的路由层回归（H1 / M6 / H4 / H3）。
// H2（FileKbStore 写链失败隔离）见 kb-store-persist.test.ts；M9（errorCode 单调）见 kb-closeout-route.test.ts。

const taskBody = {
  projectId: 'prj-robots',
  groupId: 'grp-circuit',
  title: 'R1 新版电源板焊接',
  rawSummary: '把新版电源板焊好测一下',
  ownerId: 'm-circuitD',
  collaboratorIds: [],
  robotTarget: 'R1',
  intrinsicComplexity: 'normal',
};

function depBody(fromTaskId: string, toTaskId: string) {
  return {
    projectId: 'prj-robots',
    fromTaskId,
    toTaskId,
    type: 'blocks',
    source: 'human',
    confirmedBy: { id: 'm-ecB', displayName: '电控B', source: 'console' },
  };
}

describe('H1 依赖环 → POST /api/dependencies 落库前拒环/自环', () => {
  test('自环 from===to → 400', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/dependencies',
        payload: depBody('t-x', 't-x'),
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('成环（A→B 后再 B→A）→ 第二条 400，不落库', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ store });
    try {
      const first = await app.inject({
        method: 'POST',
        url: '/api/dependencies',
        payload: depBody('t-a', 't-b'),
      });
      expect(first.statusCode).toBe(201);
      const countAfterFirst = (await store.getSnapshot()).dependencies.length;

      const second = await app.inject({
        method: 'POST',
        url: '/api/dependencies',
        payload: depBody('t-b', 't-a'), // 会闭环 t-a→t-b→t-a
      });
      expect(second.statusCode).toBe(400);
      // 拒环边不落库
      expect((await store.getSnapshot()).dependencies.length).toBe(countAfterFirst);
    } finally {
      await app.close();
    }
  });
});

describe('M6 I0：create 响应剥掉 confirmedBy', () => {
  test('POST /api/dependencies 响应 dependency 不含 confirmedBy', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/dependencies',
        payload: depBody('t-m6a', 't-m6b'),
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().dependency).not.toHaveProperty('confirmedBy');
    } finally {
      await app.close();
    }
  });

  test('POST /api/needs 响应 need 不含 confirmedBy', async () => {
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
          neededSkills: ['RTOS'],
          source: 'human',
          confirmedBy: { id: 'm-ecB', displayName: '电控B', source: 'console' },
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().need).not.toHaveProperty('confirmedBy');
    } finally {
      await app.close();
    }
  });
});

describe('H4 写端点信任边界：拒客户端注入 done/shelved/derived', () => {
  test('status=done → 400（不能跳过工作伪造完成）', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: { ...taskBody, status: 'done' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('statusSource=derived → 400（不能冒充系统派生，违 C5）', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: { ...taskBody, statusSource: 'derived' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('合法派生信号 status=inProgress / statusSource=git → 201', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: { ...taskBody, status: 'inProgress', statusSource: 'git' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().task.status).toBe('inProgress');
      expect(res.json().task.statusSource).toBe('git');
    } finally {
      await app.close();
    }
  });
});

describe('H3 写端点鉴权 + 限流', () => {
  test('配了 writeToken：无 / 错 Bearer → 401，正确 → 201', async () => {
    const app = buildHubServer({ writeToken: 'sekret' });
    try {
      const noAuth = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: taskBody,
      });
      expect(noAuth.statusCode).toBe(401);

      const wrong = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        headers: { authorization: 'Bearer nope' },
        payload: taskBody,
      });
      expect(wrong.statusCode).toBe(401);

      const ok = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        headers: { authorization: 'Bearer sekret' },
        payload: taskBody,
      });
      expect(ok.statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });

  test('读路由（GET）不受鉴权影响', async () => {
    const app = buildHubServer({ writeToken: 'sekret' });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/tasks' });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  test('限流：超过 max 的写 → 429', async () => {
    const app = buildHubServer({ writeRateLimit: { max: 1, windowMs: 60_000 } });
    try {
      const first = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: taskBody,
      });
      expect(first.statusCode).toBe(201);
      const second = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: taskBody,
      });
      expect(second.statusCode).toBe(429);
    } finally {
      await app.close();
    }
  });
});
