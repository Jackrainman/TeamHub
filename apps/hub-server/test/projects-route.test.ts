import { describe, expect, test } from 'vitest';
import {
  ProjectResponseSchema,
  ProjectsResponseSchema,
  governanceScenarioFixture,
  type GovernanceSnapshot,
  type Member,
} from '@teamhub/hub-contracts';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { CUSTOM_TEST_USERNAMES, usernameOf } from './support/login-helpers.js';
import { InMemoryPmRepository } from './support/inmemory-pm-repository.js';

const START = '2026-09-01T00:00:00.000Z';
const END = '2026-10-01T00:00:00.000Z';

function member(over: Partial<Member> & Pick<Member, 'id' | 'displayName'>): Member {
  return {
    role: 'member', grade: 'sophomore', groupId: 'grp-mech', status: 'idle',
    currentTaskId: null, updatedBy: 'console', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
  };
}

async function login(app: ReturnType<typeof buildTestHubServer>, memberId: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/session', payload: { username: usernameOf(memberId, CUSTOM_TEST_USERNAMES) } });
  const cookie = res.cookies.find((item) => item.name === 'teamhub_session');
  expect(cookie?.value).toBeTruthy();
  const cookieHeader = `teamhub_session=${cookie!.value}`;
  const pinRes = await app.inject({ method: 'PUT', url: `/api/members/${memberId}/pin`, headers: { cookie: cookieHeader }, payload: { pin: '1234abcd' } });
  expect(pinRes.statusCode).toBe(200);
  return cookieHeader;
}

function identityApp() {
  const snapshot: GovernanceSnapshot = {
    ...governanceScenarioFixture,
    members: [
      member({ id: 'm-plain', displayName: '普通成员' }),
      member({ id: 'm-boss', displayName: '队长', projectManager: true, groupId: 'grp-ec' }),
      member({ id: 'm-mech-a', displayName: '机械甲' }),
      member({ id: 'm-mech-b', displayName: '机械乙' }),
      member({ id: 'm-vision', displayName: '视觉乙', groupId: 'grp-vision' }),
    ],
  };
  return buildTestHubServer({ store: new InMemoryPmRepository(snapshot), identityMode: 'identity' });
}

describe('GET /api/projects', () => {
  test('初始返回 1 条回填项目（id=meta.projectId），响应过 ProjectsResponseSchema', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/projects' });
      expect(res.statusCode).toBe(200);
      const body = ProjectsResponseSchema.parse(res.json());
      expect(body.projects).toHaveLength(1);
      expect(body.projects[0]).toMatchObject({ id: 'prj-robots', startsAt: null, endsAt: null });
    } finally {
      await app.close();
    }
  });

  test('POST 后按插入序出现在列表；新项目 id 匹配 /^project-new-/', async () => {
    const app = buildTestHubServer();
    try {
      const created = ProjectResponseSchema.parse((await app.inject({ method: 'POST', url: '/api/projects', payload: { name: '第二项目', startsAt: START } })).json()).project;
      expect(created.id).toMatch(/^project-new-/);
      const list = ProjectsResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/projects' })).json()).projects;
      expect(list.map((project) => project.id)).toEqual(['prj-robots', created.id]);
    } finally {
      await app.close();
    }
  });

  test('身份模式：未登录 401；普通成员（非持旗）200——读不设 PM 旗标门槛', async () => {
    const app = identityApp();
    try {
      expect((await app.inject({ method: 'GET', url: '/api/projects' })).statusCode).toBe(401);
      const cookie = await login(app, 'm-plain');
      expect((await app.inject({ method: 'GET', url: '/api/projects', headers: { cookie } })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/projects', () => {
  test('201：服务端钉 status=active、seasonId=当前 active 赛季、createdAt；客户端传 status/id 被忽略', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: '新项目', startsAt: START, id: 'client-id', status: 'archived' } });
      expect(res.statusCode).toBe(201);
      const project = ProjectResponseSchema.parse(res.json()).project;
      expect(project).toMatchObject({
        name: '新项目', status: 'active', startsAt: START, endsAt: null,
        seasonId: governanceScenarioFixture.seasons.find((season) => season.status === 'active')!.id,
      });
      expect(project.id).not.toBe('client-id');
      expect(project.createdAt).toBeTruthy();
      expect(project.createdBy).toBeUndefined();
      expect(project.groupIds).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test('endsAt 早于 startsAt → 400；缺 name → 400；缺 startsAt → 400', async () => {
    const app = buildTestHubServer();
    try {
      for (const payload of [
        { name: '倒置', startsAt: END, endsAt: START },
        { startsAt: START },
        { name: '缺开始日' },
      ]) {
        expect((await app.inject({ method: 'POST', url: '/api/projects', payload })).statusCode).toBe(400);
      }
    } finally {
      await app.close();
    }
  });

  test('同名 → 409；大小写不同视为不同名（不做大小写折叠，与组一致）', async () => {
    const app = buildTestHubServer();
    try {
      const payload = { name: 'Case Project', startsAt: START };
      expect((await app.inject({ method: 'POST', url: '/api/projects', payload })).statusCode).toBe(201);
      expect((await app.inject({ method: 'POST', url: '/api/projects', payload })).statusCode).toBe(409);
      expect((await app.inject({ method: 'POST', url: '/api/projects', payload: { ...payload, name: 'case project' } })).statusCode).toBe(201);
    } finally {
      await app.close();
    }
  });

  test('身份模式非持旗成员 403；持旗管理员 201', async () => {
    const app = identityApp();
    try {
      const payload = { name: '管理员项目', startsAt: START };
      const plain = await login(app, 'm-plain');
      expect((await app.inject({ method: 'POST', url: '/api/projects', headers: { cookie: plain }, payload })).statusCode).toBe(403);
      const boss = await login(app, 'm-boss');
      const created = await app.inject({ method: 'POST', url: '/api/projects', headers: { cookie: boss }, payload });
      expect(created.statusCode).toBe(201);
      expect(ProjectResponseSchema.parse(created.json()).project).toMatchObject({
        createdBy: 'm-boss',
        groupIds: ['grp-ec'],
      });
    } finally {
      await app.close();
    }
  });
});

describe('PUT /api/projects/:id', () => {
  test('改 name + 两个日期 → 200，GET 往返一致', async () => {
    const app = buildTestHubServer();
    try {
      const payload = { name: '改名项目', startsAt: START, endsAt: END };
      const res = await app.inject({ method: 'PUT', url: '/api/projects/prj-robots', payload });
      expect(res.statusCode).toBe(200);
      const updated = ProjectResponseSchema.parse(res.json()).project;
      const list = ProjectsResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/projects' })).json()).projects;
      expect(list.find((project) => project.id === updated.id)).toEqual(updated);
    } finally {
      await app.close();
    }
  });

  test('只给 endsAt 且与既有 startsAt 倒置 → 400（合并校验，非 schema 层）', async () => {
    const app = buildTestHubServer();
    try {
      expect((await app.inject({ method: 'PUT', url: '/api/projects/prj-robots', payload: { startsAt: END } })).statusCode).toBe(200);
      const res = await app.inject({ method: 'PUT', url: '/api/projects/prj-robots', payload: { endsAt: START } });
      expect(res.statusCode).toBe(400);
      expect(res.json().detail).toBe('endsAt must not be earlier than startsAt');
    } finally {
      await app.close();
    }
  });

  test('id 不存在 → 404（不得 upsert 造行）', async () => {
    const app = buildTestHubServer();
    try {
      const before = ProjectsResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/projects' })).json()).projects.length;
      const res = await app.inject({ method: 'PUT', url: '/api/projects/not-found', payload: { name: '不应创建' } });
      expect(res.statusCode).toBe(404);
      const after = ProjectsResponseSchema.parse((await app.inject({ method: 'GET', url: '/api/projects' })).json()).projects.length;
      expect(after).toBe(before);
    } finally {
      await app.close();
    }
  });

  test('改成其它项目已用的名字 → 409；改成自己原名 → 200（不误判重名）', async () => {
    const app = buildTestHubServer();
    try {
      await app.inject({ method: 'POST', url: '/api/projects', payload: { name: '其它项目', startsAt: START } });
      expect((await app.inject({ method: 'PUT', url: '/api/projects/prj-robots', payload: { name: '其它项目' } })).statusCode).toBe(409);
      expect((await app.inject({ method: 'PUT', url: '/api/projects/prj-robots', payload: { name: 'prj-robots' } })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  test('endsAt: null → 200，读回 endsAt 为 null', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({ method: 'PUT', url: '/api/projects/prj-robots', payload: { endsAt: null } });
      expect(res.statusCode).toBe(200);
      expect(ProjectResponseSchema.parse(res.json()).project.endsAt).toBeNull();
    } finally {
      await app.close();
    }
  });

  test('身份模式非持旗成员改参与人 403', async () => {
    const app = identityApp();
    try {
      const cookie = await login(app, 'm-plain');
      const res = await app.inject({ method: 'PUT', url: '/api/projects/prj-robots', headers: { cookie }, payload: { memberIds: ['m-plain'] } });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  test('持旗成员更新参与人：跨组派生去重，移除后 groupIds 不回缩', async () => {
    const app = identityApp();
    try {
      const cookie = await login(app, 'm-boss');
      const createdRes = await app.inject({
        method: 'POST', url: '/api/projects', headers: { cookie },
        payload: { name: '联合项目', startsAt: START },
      });
      const projectId = ProjectResponseSchema.parse(createdRes.json()).project.id;
      const joinedRes = await app.inject({
        method: 'PUT', url: `/api/projects/${projectId}`, headers: { cookie },
        payload: { memberIds: ['m-mech-a', 'm-mech-b'] },
      });
      expect(joinedRes.statusCode).toBe(200);
      expect(ProjectResponseSchema.parse(joinedRes.json()).project).toMatchObject({
        memberIds: ['m-mech-a', 'm-mech-b'],
        groupIds: ['grp-ec', 'grp-mech'],
      });

      const removedRes = await app.inject({
        method: 'PUT', url: `/api/projects/${projectId}`, headers: { cookie },
        payload: { memberIds: [] },
      });
      expect(removedRes.statusCode).toBe(200);
      expect(ProjectResponseSchema.parse(removedRes.json()).project).toMatchObject({
        memberIds: [],
        groupIds: ['grp-ec', 'grp-mech'],
      });
    } finally {
      await app.close();
    }
  });
});
