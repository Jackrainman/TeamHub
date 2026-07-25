import { describe, expect, test } from 'vitest';
import {
  GroupsResponseSchema,
  GroupResponseSchema,
  governanceScenarioFixture,
  type GovernanceSnapshot,
  type Member,
} from '@teamhub/hub-contracts';
import { buildHubServer } from '../src/server.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';

/**
 * 组端点（PROGRAM-GROUP-ABSTRACT，公测补强刀④）：
 *  - GET /api/groups：groups 全量（组树/汇报视角需要非叶子+哨兵在场）+ 派生位 assignableGroupIds
 *    （叶子组且非哨兵，deriveLeafGroups 结构派生——grp-program 有子组、grp-convergence 哨兵，双双排除）。
 *  - POST /api/groups：新建叶子组（同名 409）；PUT /api/groups/:id：改名（仅叶子；非叶子/哨兵 409、
 *    撞名 409、不存在 404）；DELETE /api/groups/:id：仅叶子 + 防孤儿（有成员/有任务 409）。
 *  - 鉴权：身份模式非持旗成员 403（匿名模式=写门即可，与 PUT members/:id/role 同律）。
 */

function member(over: Partial<Member> & Pick<Member, 'id' | 'displayName'>): Member {
  return {
    role: 'member',
    grade: 'sophomore',
    groupId: 'grp-mech',
    status: 'idle',
    currentTaskId: null,
    updatedBy: 'console',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

/** 身份模式登录，回带 session cookie（member 无 pinHash 免 PIN）。 */
async function login(app: ReturnType<typeof buildHubServer>, memberId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/session',
    payload: { memberId },
  });
  const cookie = res.cookies.find((c) => c.name === 'teamhub_session');
  expect(cookie?.value).toBeTruthy();
  return `teamhub_session=${cookie!.value}`;
}

describe('GET /api/groups — 刀④ 派生位', () => {
  test('groups 全量 + assignableGroupIds = 叶子组且非哨兵（排除 grp-program / grp-convergence）', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/groups' });
      expect(res.statusCode).toBe(200);
      const body = GroupsResponseSchema.parse(res.json());
      // 全量仍在（组树展示/汇报视角需要）。
      expect(body.groups.some((g) => g.id === 'grp-program')).toBe(true);
      expect(body.groups.some((g) => g.id === 'grp-convergence')).toBe(true);
      // 派生位：fixture 四叶子组；「程序」（有子组）与「全组联调」（哨兵）双双排除。
      expect(body.assignableGroupIds.sort()).toEqual(
        ['grp-circuit', 'grp-ec', 'grp-mech', 'grp-vision'].sort(),
      );
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/groups — 新建叶子组', () => {
  test('201：只给 name，id/seasonId/parentGroupId=null/kind 由 server 钉；出现在 assignableGroupIds', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: '运营' },
      });
      expect(res.statusCode).toBe(201);
      const body = GroupResponseSchema.parse(res.json());
      expect(body.group.id).toMatch(/^grp-new-/);
      expect(body.group.name).toBe('运营');
      expect(body.group.parentGroupId).toBeNull();
      expect(body.group.kind).toBe('custom');
      const list = GroupsResponseSchema.parse(
        (await app.inject({ method: 'GET', url: '/api/groups' })).json(),
      );
      expect(list.assignableGroupIds).toContain(body.group.id); // 新建组天然叶子=可选
    } finally {
      await app.close();
    }
  });

  test('同名（含非叶子组「程序」）→ 409', async () => {
    const app = buildHubServer();
    try {
      const dup = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: '机械' },
      });
      expect(dup.statusCode).toBe(409);
      const dupAbstract = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: '程序' },
      });
      expect(dupAbstract.statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });
});

describe('PUT /api/groups/:id — 改名（仅叶子组）', () => {
  test('叶子组改名 200；撞其它组同名 → 409；id 不存在 → 404', async () => {
    const app = buildHubServer();
    try {
      const ok = await app.inject({
        method: 'PUT',
        url: '/api/groups/grp-mech',
        payload: { name: '机械结构' },
      });
      expect(ok.statusCode).toBe(200);
      expect(GroupResponseSchema.parse(ok.json()).group.name).toBe('机械结构');

      const dup = await app.inject({
        method: 'PUT',
        url: '/api/groups/grp-ec',
        payload: { name: '视觉' },
      });
      expect(dup.statusCode).toBe(409);

      const missing = await app.inject({
        method: 'PUT',
        url: '/api/groups/grp-nope',
        payload: { name: '谁' },
      });
      expect(missing.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('非叶子组（grp-program）/ 哨兵组（grp-convergence）→ 409（汇报视角不可改名）', async () => {
    const app = buildHubServer();
    try {
      for (const id of ['grp-program', 'grp-convergence']) {
        const res = await app.inject({
          method: 'PUT',
          url: `/api/groups/${id}`,
          payload: { name: '新名' },
        });
        expect(res.statusCode).toBe(409);
        expect(res.json().detail).toContain('汇报视角');
      }
    } finally {
      await app.close();
    }
  });
});

describe('DELETE /api/groups/:id — 仅叶子 + 防孤儿', () => {
  test('新建的空叶子组可删（200 回带被删组）；有成员的叶子组 → 409', async () => {
    const app = buildHubServer();
    try {
      const created = GroupResponseSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: '/api/groups',
            payload: { name: '临时组' },
          })
        ).json(),
      ).group;
      const del = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${created.id}`,
      });
      expect(del.statusCode).toBe(200);
      expect(GroupResponseSchema.parse(del.json()).group.id).toBe(created.id);
      const list = GroupsResponseSchema.parse(
        (await app.inject({ method: 'GET', url: '/api/groups' })).json(),
      );
      expect(list.groups.some((g) => g.id === created.id)).toBe(false);

      // fixture 叶子组 grp-mech 下有成员 → 409 防孤儿。
      const busy = await app.inject({ method: 'DELETE', url: '/api/groups/grp-mech' });
      expect(busy.statusCode).toBe(409);
      expect(busy.json().detail).toContain('成员');
    } finally {
      await app.close();
    }
  });

  test('有任务的空叶子组 → 409（先迁走任务再删）；非叶子/哨兵 → 409；不存在 → 404', async () => {
    const app = buildHubServer();
    try {
      // 造一个无成员但挂了任务的叶子组。
      const created = GroupResponseSchema.parse(
        (
          await app.inject({
            method: 'POST',
            url: '/api/groups',
            payload: { name: '任务组' },
          })
        ).json(),
      ).group;
      const taskRes = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        payload: {
          projectId: 'prj-robots',
          groupId: created.id,
          title: '占位任务',
          rawSummary: '占位',
          ownerId: null,
          collaboratorIds: [],
          robotTarget: 'shared',
          intrinsicComplexity: 'trivial',
        },
      });
      expect(taskRes.statusCode).toBe(201);
      const withTasks = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${created.id}`,
      });
      expect(withTasks.statusCode).toBe(409);
      expect(withTasks.json().detail).toContain('任务');

      for (const id of ['grp-program', 'grp-convergence']) {
        const res = await app.inject({ method: 'DELETE', url: `/api/groups/${id}` });
        expect(res.statusCode).toBe(409);
      }
      const missing = await app.inject({ method: 'DELETE', url: '/api/groups/grp-nope' });
      expect(missing.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('组管理鉴权 — 身份模式', () => {
  test('已登录但非持旗成员 → 三写口全 403；持旗管理员 → 放行', async () => {
    const snapshot: GovernanceSnapshot = {
      ...governanceScenarioFixture,
      members: [
        member({ id: 'm-plain', displayName: '普通成员' }),
        member({ id: 'm-boss', displayName: '队长', projectManager: true }),
      ],
    };
    const app = buildHubServer({
      store: new InMemoryGovStore(snapshot),
      identityMode: 'identity',
    });
    try {
      const plain = await login(app, 'm-plain');
      const denied = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: '新组' },
        headers: { cookie: plain },
      });
      expect(denied.statusCode).toBe(403);
      const deniedPut = await app.inject({
        method: 'PUT',
        url: '/api/groups/grp-mech',
        payload: { name: '谁' },
        headers: { cookie: plain },
      });
      expect(deniedPut.statusCode).toBe(403);
      const deniedDel = await app.inject({
        method: 'DELETE',
        url: '/api/groups/grp-mech',
        headers: { cookie: plain },
      });
      expect(deniedDel.statusCode).toBe(403);

      const boss = await login(app, 'm-boss');
      const ok = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: '新组' },
        headers: { cookie: boss },
      });
      expect(ok.statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });
});
