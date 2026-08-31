import { describe, expect, test } from 'vitest';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { CreateTaskResponseSchema } from '@teamhub/hub-contracts';
import { InMemoryPmRepository } from './support/inmemory-gov-store.js';

const validBody = {
  projectId: 'prj-robots',
  groupId: 'grp-circuit',
  title: 'R1 新版电源板焊接',
  rawSummary: '把新版电源板焊好测一下',
  ownerId: 'm-circuitD',
  collaboratorIds: [],
  robotTarget: 'R1',
  intrinsicComplexity: 'normal',
};

describe('POST /api/tasks', () => {
  test('单条任务录入 → 201 + server 补 id/时间戳/默认；持久到 store', async () => {
    const store = new InMemoryPmRepository();
    const before = (await store.getSnapshot()).tasks.length;
    const app = buildTestHubServer({ store });
    try {
      const res = await app.inject({ method: 'POST', url: '/api/tasks', payload: validBody });
      expect(res.statusCode).toBe(201);
      const body = CreateTaskResponseSchema.parse(res.json());
      expect(body.task.id).toMatch(/^task-new-/);
      expect(body.task.status).toBe('pending');
      expect(body.task.statusSource).toBe('console');
      expect(body.task.lastProgressAt).toBeNull();
      // G4：无 dueDate；C2：无完成量维度
      expect(body.task).not.toHaveProperty('dueDate');
      const after = (await store.getSnapshot()).tasks.length;
      expect(after).toBe(before + 1);
    } finally {
      await app.close();
    }
  });

  test('端到端往返：POST 新建的任务出现在 GET /api/tasks 列表（同 app 同 store）', async () => {
    const app = buildTestHubServer();
    try {
      const before = await app.inject({ method: 'GET', url: '/api/tasks' });
      const beforeCount = before.json().tasks.length;

      const created = await app.inject({ method: 'POST', url: '/api/tasks', payload: validBody });
      const newId = created.json().task.id;

      const after = await app.inject({ method: 'GET', url: '/api/tasks' });
      const tasks = after.json().tasks as Array<{ id: string }>;
      expect(tasks.length).toBe(beforeCount + 1);
      expect(tasks.some((t) => t.id === newId)).toBe(true);
    } finally {
      await app.close();
    }
  });

  test('显式 status/statusSource 生效（如 git 派生信号建任务）', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: { ...validBody, status: 'inProgress', statusSource: 'git' },
      });
      expect(res.statusCode).toBe(201);
      const body = CreateTaskResponseSchema.parse(res.json());
      expect(body.task.status).toBe('inProgress');
      expect(body.task.statusSource).toBe('git');
    } finally {
      await app.close();
    }
  });

  test('缺必填（D-042：title+groupId 过不了 Zod）→ 400', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: { title: '只有标题', groupId: 'grp-mech' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  // 刀④ PROGRAM-GROUP-ABSTRACT：任务只能挂具体叶子组——命中组表里的非叶子组 → 400；
  // 组表里不存在的 id 维持既有宽松（历史任务可引用未入表的组）。
  // CONVERGENCE-TASK-ENTRY：哨兵组 grp-convergence 仅接纳带 convergenceScope 的总联调任务。
  test('刀④：groupId 命中非叶子组（grp-program）→ 400', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: { ...validBody, groupId: 'grp-program' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().detail).toContain('汇报视角');
    } finally {
      await app.close();
    }
  });

  test('总联调：哨兵组 + convergenceScope=allLeafGroups → 201（正解通道）', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          ...validBody,
          groupId: 'grp-convergence',
          title: 'R1 总联调',
          ownerId: null,
          convergenceScope: 'allLeafGroups',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = CreateTaskResponseSchema.parse(res.json());
      expect(body.task.groupId).toBe('grp-convergence');
      expect(body.task.convergenceScope).toBe('allLeafGroups');
    } finally {
      await app.close();
    }
  });

  test('总联调 scope/哨兵组必须同现：只挂哨兵组或只带 scope → 400', async () => {
    const app = buildTestHubServer();
    try {
      // 挂哨兵组但没带 scope（普通任务混进无成员组）→ 400
      const sentinelOnly = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: { ...validBody, groupId: 'grp-convergence' },
      });
      expect(sentinelOnly.statusCode).toBe(400);
      // 带 scope 但挂叶子组（乱挂收敛标记）→ 400
      const scopeOnly = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: { ...validBody, groupId: 'grp-vision', convergenceScope: 'allLeafGroups' },
      });
      expect(scopeOnly.statusCode).toBe(400);
      expect(scopeOnly.json().detail).toContain('总联调');
    } finally {
      await app.close();
    }
  });

  test('刀④：叶子组照常 201；组表里不存在的 id 维持宽松（201）', async () => {
    const app = buildTestHubServer();
    try {
      const leaf = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: { ...validBody, groupId: 'grp-vision' },
      });
      expect(leaf.statusCode).toBe(201);
      const unknown = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: { ...validBody, groupId: 'grp-not-in-table' },
      });
      expect(unknown.statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });
});
