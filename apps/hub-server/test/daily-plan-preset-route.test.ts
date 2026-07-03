import { describe, expect, test } from 'vitest';
import { buildHubServer } from '../src/server.js';
import {
  CreateResourceSessionsBatchResponseSchema,
  SCENARIO_WINDOW_WEEKDAY,
  UpdateResourceDefaultPresetResponseSchema,
} from '../src/contracts.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';

// 今日计划：每车预设写回（PATCH /api/resources/:id/preset）+ 表格页批量确认落盘
// （POST /api/resource-sessions/batch，D-082 daily-plan-presets）。res-r1/res-r2 defaultPreset seed
// 见 fixtures.ts；SCENARIO_WINDOW_WEEKDAY 场景甲窗口已有 sess-tonight-ec 占 res-r1 的 orderInWindow=0。

const CONFIRMED_BY = { id: 'm-progA', displayName: '程序A', source: 'console' };

describe('PATCH /api/resources/:id/preset：默认阵型写回 / 清除', () => {
  test('传对象 → 整体替换 defaultPreset', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ store });
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/resources/res-r2/preset',
        payload: { defaultPreset: { lineup: [{ groupId: 'grp-circuit' }] } },
      });
      expect(res.statusCode).toBe(200);
      const body = UpdateResourceDefaultPresetResponseSchema.parse(res.json());
      expect(body.resource.defaultPreset).toEqual({ lineup: [{ groupId: 'grp-circuit' }] });
      // 落库
      const live = (await store.listResources()).find((r) => r.id === 'res-r2');
      expect(live?.defaultPreset).toEqual({ lineup: [{ groupId: 'grp-circuit' }] });
    } finally {
      await app.close();
    }
  });

  test('传 null → 清除既有 defaultPreset', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ store });
    try {
      // res-r1 seed 自带 defaultPreset（fixtures.ts）
      const before = (await store.listResources()).find((r) => r.id === 'res-r1');
      expect(before?.defaultPreset).toBeDefined();

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/resources/res-r1/preset',
        payload: { defaultPreset: null },
      });
      expect(res.statusCode).toBe(200);
      const body = UpdateResourceDefaultPresetResponseSchema.parse(res.json());
      expect(body.resource.defaultPreset).toBeUndefined();
      const live = (await store.listResources()).find((r) => r.id === 'res-r1');
      expect(live?.defaultPreset).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  test('未知 id → 404', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/resources/res-nope/preset',
        payload: { defaultPreset: null },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('body 缺 defaultPreset 键 → 400', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/resources/res-r1/preset',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('lineup 条目缺 groupId → 400', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/resources/res-r1/preset',
        payload: { defaultPreset: { lineup: [{}] } },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/resource-sessions/batch：表格页【确认】批量原子落盘', () => {
  test('全部通过 → 201，逐条落盘，confirmedBy 由请求整体注入', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ store });
    try {
      const before = (await store.listResourceSessions()).length;
      const res = await app.inject({
        method: 'POST',
        url: '/api/resource-sessions/batch',
        payload: {
          windowLabel: SCENARIO_WINDOW_WEEKDAY,
          confirmedBy: CONFIRMED_BY,
          sessions: [
            {
              projectId: 'prj-robots',
              resourceId: 'res-r2',
              windowLabel: SCENARIO_WINDOW_WEEKDAY,
              orderInWindow: 0,
              holderGroupId: 'grp-mech',
              holderTaskId: 't-r2-spare',
              invitedMemberIds: [],
              note: null,
              eta: null,
            },
            {
              projectId: 'prj-robots',
              resourceId: 'res-r2',
              windowLabel: SCENARIO_WINDOW_WEEKDAY,
              orderInWindow: 1,
              holderGroupId: 'grp-ec',
              holderTaskId: null,
              invitedMemberIds: [],
              note: null,
              eta: null,
            },
          ],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = CreateResourceSessionsBatchResponseSchema.parse(res.json());
      expect(body.sessions).toHaveLength(2);
      expect(body.sessions.every((s) => s.source === 'human')).toBe(true);
      expect(body.sessions.every((s) => s.id.startsWith('sess-new-'))).toBe(true);
      // I0：响应剥 confirmedBy
      expect(body.sessions[0]).not.toHaveProperty('confirmedBy');
      // 落库
      expect((await store.listResourceSessions()).length).toBe(before + 2);
    } finally {
      await app.close();
    }
  });

  test('批内一条 orderInWindow 与既有 session 冲突 → 整批 400，一条都不落盘', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ store });
    try {
      const before = (await store.listResourceSessions()).length;
      const res = await app.inject({
        method: 'POST',
        url: '/api/resource-sessions/batch',
        payload: {
          windowLabel: SCENARIO_WINDOW_WEEKDAY,
          confirmedBy: CONFIRMED_BY,
          sessions: [
            {
              // 合法的一条（若单独提交会成功）
              projectId: 'prj-robots',
              resourceId: 'res-r2',
              windowLabel: SCENARIO_WINDOW_WEEKDAY,
              orderInWindow: 0,
              holderGroupId: 'grp-mech',
              holderTaskId: null,
              invitedMemberIds: [],
              note: null,
              eta: null,
            },
            {
              // res-r1 在 SCENARIO_WINDOW_WEEKDAY 的 orderInWindow=0 已被 sess-tonight-ec 占用（fixtures.ts）
              projectId: 'prj-robots',
              resourceId: 'res-r1',
              windowLabel: SCENARIO_WINDOW_WEEKDAY,
              orderInWindow: 0,
              holderGroupId: 'grp-ec',
              holderTaskId: null,
              invitedMemberIds: [],
              note: null,
              eta: null,
            },
          ],
        },
      });
      expect(res.statusCode).toBe(400);
      // 半成功检查：第一条本应合法，但整批必须一条都不落盘
      expect((await store.listResourceSessions()).length).toBe(before);
    } finally {
      await app.close();
    }
  });

  test('未知 holderGroupId → 整批 400，不落盘', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ store });
    try {
      const before = (await store.listResourceSessions()).length;
      const res = await app.inject({
        method: 'POST',
        url: '/api/resource-sessions/batch',
        payload: {
          windowLabel: SCENARIO_WINDOW_WEEKDAY,
          confirmedBy: CONFIRMED_BY,
          sessions: [
            {
              projectId: 'prj-robots',
              resourceId: 'res-r2',
              windowLabel: SCENARIO_WINDOW_WEEKDAY,
              orderInWindow: 0,
              holderGroupId: 'grp-nope',
              holderTaskId: null,
              invitedMemberIds: [],
              note: null,
              eta: null,
            },
          ],
        },
      });
      expect(res.statusCode).toBe(400);
      expect((await store.listResourceSessions()).length).toBe(before);
    } finally {
      await app.close();
    }
  });

  test('I0 双保险：请求夹带 invitedMemberIds 非空，仍强制落盘为 []', async () => {
    const store = new InMemoryGovStore();
    const app = buildHubServer({ store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/resource-sessions/batch',
        payload: {
          windowLabel: SCENARIO_WINDOW_WEEKDAY,
          confirmedBy: CONFIRMED_BY,
          sessions: [
            {
              projectId: 'prj-robots',
              resourceId: 'res-r2',
              windowLabel: SCENARIO_WINDOW_WEEKDAY,
              orderInWindow: 0,
              holderGroupId: 'grp-mech',
              holderTaskId: null,
              invitedMemberIds: ['m-mechC'], // 夹带成员 id：必须被服务端清空，不得落盘
              note: null,
              eta: null,
            },
          ],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = CreateResourceSessionsBatchResponseSchema.parse(res.json());
      expect(body.sessions[0].invitedMemberIds).toEqual([]);
      const live = (await store.listResourceSessions()).find((s) => s.id === body.sessions[0].id);
      expect(live?.invitedMemberIds).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test('sessions 空数组 → 400（min(1)）', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/resource-sessions/batch',
        payload: { windowLabel: SCENARIO_WINDOW_WEEKDAY, confirmedBy: CONFIRMED_BY, sessions: [] },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
