import { describe, expect, test } from 'vitest';
import { buildHubServer } from '../src/server.js';
import { CreateTaskResponseSchema } from '../src/contracts.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';

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
    const store = new InMemoryGovStore();
    const before = (await store.getSnapshot()).tasks.length;
    const app = buildHubServer({ store });
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
    const app = buildHubServer();
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
    const app = buildHubServer();
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
    const app = buildHubServer();
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
});
