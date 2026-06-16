import { describe, expect, test } from 'vitest';
import { buildHubServer } from '../src/server.js';
import {
  CreateArtifactResponseSchema,
  CreateDependencyResponseSchema,
  CreateNeedResponseSchema,
  TransitionTaskStatusResponseSchema,
  WaiveDependencyResponseSchema,
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

  test('POST /api/artifacts → 201；server 钉 submittedVia=console（C5）；落盘累积；夹带来源被 omit', async () => {
    const store = new InMemoryGovStore();
    const before = (await store.getSnapshot()).artifacts.length;
    const app = buildHubServer({ store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/artifacts',
        payload: {
          kind: 'image',
          name: '底盘装配图',
          uri: 'artifact://chassis/v4',
          mechanism: '底盘',
          revision: 'v4',
          relatedCommit: 'abc1234',
          submittedVia: 'lark', // 试图夹带来源——应被 omit 忽略，server 钉 console（C5）
        },
      });
      expect(res.statusCode).toBe(201);
      const body = CreateArtifactResponseSchema.parse(res.json());
      expect(body.artifact.id).toMatch(/^artifact-new-/);
      // C5：submittedVia 由 server 钉 console（请求夹带的 lark 被 omit）
      expect(body.artifact.submittedVia).toBe('console');
      expect(body.artifact.mechanism).toBe('底盘');
      expect(body.artifact.revision).toBe('v4');
      // 落盘累积：快照 artifacts +1
      expect((await store.getSnapshot()).artifacts.length).toBe(before + 1);
    } finally {
      await app.close();
    }
  });

  test('POST /api/artifacts：mechanism/revision 必填，缺失 → 400', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/artifacts',
        payload: { kind: 'image', name: '无机构图', uri: 'artifact://x' }, // 缺 mechanism/revision
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('POST /api/needs → 201；clamp status=open / claimedByMemberId=null（A2 反派单）/ A1 归组', async () => {
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
          claimedByMemberId: 'm-victim', // 试图创建即派单 → 应被 omit + clamp 为 null
          neededSkills: ['RTOS'],
          source: 'human',
          confirmedBy: { id: 'm-ecB', displayName: '电控B', source: 'console' },
        },
      });
      expect(res.statusCode).toBe(201);
      const body = CreateNeedResponseSchema.parse(res.json());
      expect(body.need.status).toBe('open');
      expect(body.need.escalatedAt).toBeNull();
      // A2：创建即派单被拒——新缺口必未认领
      expect(body.need.claimedByMemberId).toBeNull();
      // A1：缺口归组不归人
      expect(body.need.providerGroupId).toBe('grp-program');
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

describe('PM 受限状态机迁移：任务状态流转 + 连线作废', () => {
  test('POST /api/tasks/:id/status：inProgress→done → 200；statusSource clamp 为 console（C5）', async () => {
    // t-r1-dataset 原 statusSource='git'，人工流转后应被 server 钉为 'console'（最低优先源）。
    const store = new InMemoryGovStore();
    const app = buildHubServer({ store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-dataset/status',
        payload: { status: 'done' },
      });
      expect(res.statusCode).toBe(200);
      const body = TransitionTaskStatusResponseSchema.parse(res.json());
      expect(body.task.id).toBe('t-r1-dataset');
      expect(body.task.status).toBe('done');
      expect(body.task.statusSource).toBe('console');
      expect(body.task).not.toHaveProperty('confirmedBy');
      // 落库生效
      const snap = await store.getSnapshot();
      expect(snap.tasks.find((t) => t.id === 't-r1-dataset')?.status).toBe('done');
    } finally {
      await app.close();
    }
  });

  test('POST /api/tasks/:id/status：请求夹带 statusSource 被忽略，仍 clamp console', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-newboard/status',
        payload: { status: 'blocked', statusSource: 'git' }, // 试图冒充 git 派生 → 应被 omit
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().task.statusSource).toBe('console');
      expect(res.json().task.status).toBe('blocked');
    } finally {
      await app.close();
    }
  });

  test('POST /api/tasks/:id/status：未知 id → 404', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-does-not-exist/status',
        payload: { status: 'done' },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('POST /api/tasks/:id/status：非法 status → 400', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/tasks/t-r1-newboard/status',
        payload: { status: 'frobnicate' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('POST /api/dependencies/:id/waive：已有边 → 200；status=waived；响应剥 confirmedBy（I0）', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/dependencies/dep-002/waive',
      });
      expect(res.statusCode).toBe(200);
      const body = WaiveDependencyResponseSchema.parse(res.json());
      expect(body.dependency.id).toBe('dep-002');
      expect(body.dependency.status).toBe('waived');
      // I0：读响应永不回 confirmedBy（ActorRef）
      expect(body.dependency).not.toHaveProperty('confirmedBy');
      // 落库：仍保留 confirmedBy（G2 可审计），只是状态转 waived
      const dep = (await store.getSnapshot()).dependencies.find((d) => d.id === 'dep-002');
      expect(dep?.status).toBe('waived');
      expect(dep?.confirmedBy).not.toBeNull();
    } finally {
      await app.close();
    }
  });

  test('POST /api/dependencies/:id/waive：未知 id → 404', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/dependencies/dep-nope/waive',
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('waive 后 GET /api/dep-graph：该边从图消失，satisfied 边(dep-001)仍在', async () => {
    const app = buildHubServer();
    try {
      await app.inject({ method: 'POST', url: '/api/dependencies/dep-002/waive' });
      const res = await app.inject({ method: 'GET', url: '/api/dep-graph' });
      expect(res.statusCode).toBe(200);
      const ids = res.json().edges.map((e: { id: string }) => e.id);
      expect(ids).not.toContain('dep-002'); // waived → 隐藏
      expect(ids).toContain('dep-001'); // satisfied → 仍可见
    } finally {
      await app.close();
    }
  });
});
