import { describe, expect, test } from 'vitest';
import FormData from 'form-data';
import {
  RosterImportReportSchema,
  governanceScenarioFixture,
  type GovernanceSnapshot,
  type Member,
} from '@teamhub/hub-contracts';
import { buildHubServer } from '../src/server.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';

/**
 * 名册导入端到端（ROSTER-IMPORT，K8）：GET 模板 + POST 导入（匿名成功 / 身份空板豁免 / 身份非管理员
 * 403 / 重导更新且 superAdmin 保护 / 自动建组 / missingFromSheet / GBK 编码 / 编码识别失败 400）。
 */

// 构造单文件 multipart 请求体（照 artifact-upload.test.ts 先例）。content 为 Buffer 时按原字节发（GBK 用）。
function multipart(content: Buffer | string, filename = 'roster.csv') {
  const form = new FormData();
  form.append('file', Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'), {
    filename,
  });
  return { payload: form.getBuffer(), headers: form.getHeaders() };
}

const GRP_MECH = {
  id: 'grp-mech',
  seasonId: 'season-robocon-2026',
  parentGroupId: null,
  name: '机械',
  kind: 'mechanical',
} as const;

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

// 干净种子：保留 fixture 的 seasonId/seasons/projectId/stage（建组需 active 赛季），其余数组自定/清空。
function seedWith(members: Member[], groups: readonly (typeof GRP_MECH)[] = [GRP_MECH]): GovernanceSnapshot {
  return {
    ...governanceScenarioFixture,
    groups: [...groups],
    members,
    tasks: [],
    dependencies: [],
    needs: [],
    knowledgeNodes: [],
    taskKnowledgeTags: [],
    artifacts: [],
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

describe('GET /api/roster/template', () => {
  test('200 + CSV 带 BOM + 五列表头 + 附件下载头', async () => {
    const app = buildHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/roster/template' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.body.charCodeAt(0)).toBe(0xfeff); // BOM
      expect(res.body).toContain('姓名,年级,组,组长,验收人');
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/roster/import — 匿名模式', () => {
  test('创建/更新/自动建组/missingFromSheet/autoReviewers 一次到位', async () => {
    const store = new InMemoryGovStore(
      seedWith([
        member({ id: 'm-old1', displayName: '老队员甲', grade: 'freshman' }),
        member({ id: 'm-old2', displayName: '老队员乙' }),
      ]),
    );
    const app = buildHubServer({ store });
    try {
      const csv =
        '姓名,年级,组,组长,验收人\n' +
        '老队员甲,大三,机械,✓,\n' + // 更新既有：grade→junior、组长、验收人默认 true(auto)
        '新人丙,大一,电路,,\n' + // 新建 + 自动建组「电路」
        '新人丁,大四,机械,,否\n'; // 新建，显式验收人否
      const res = await app.inject({
        method: 'POST',
        url: '/api/roster/import',
        ...multipart(csv),
      });
      expect(res.statusCode).toBe(200);
      const report = RosterImportReportSchema.parse(res.json());
      expect(report.created.sort()).toEqual(['新人丁', '新人丙']);
      expect(report.updated).toEqual(['老队员甲']);
      expect(report.createdGroups).toEqual(['电路']);
      expect(report.autoReviewers).toEqual(['老队员甲']);
      expect(report.missingFromSheet).toEqual(['老队员乙']);
      expect(report.failed).toEqual([]);

      // 落库核实：老队员甲 role→groupAdmin、grade→junior、gateReviewer true；老队员乙不动、绝不删。
      const snap = await store.getSnapshot();
      const jiaa = snap.members.find((m) => m.displayName === '老队员甲')!;
      expect(jiaa.role).toBe('groupAdmin');
      expect(jiaa.grade).toBe('junior');
      expect(jiaa.gateReviewer).toBe(true);
      expect(jiaa.updatedBy).toBe('console');
      expect(snap.members.find((m) => m.displayName === '老队员乙')).toBeDefined();
      // 新组「电路」已建、id 自动生成；新人挂到正确组。
      const dianlu = snap.groups.find((g) => g.name === '电路')!;
      expect(dianlu.id).toMatch(/^grp-new-/);
      const bing = snap.members.find((m) => m.displayName === '新人丙')!;
      expect(bing.id).toMatch(/^member-new-/);
      expect(bing.groupId).toBe(dianlu.id);
      expect(bing.gateReviewer).toBe(false);
    } finally {
      await app.close();
    }
  });

  test('坏行进 failed（年级非法）不中断整批；末行无换行也解析', async () => {
    const store = new InMemoryGovStore(seedWith([]));
    const app = buildHubServer({ store });
    try {
      const csv = '姓名,年级,组,组长,验收人\n错的,大五,机械,,\n阿甲,大三,机械,,'; // 无尾换行
      const res = await app.inject({
        method: 'POST',
        url: '/api/roster/import',
        ...multipart(csv),
      });
      expect(res.statusCode).toBe(200);
      const report = RosterImportReportSchema.parse(res.json());
      expect(report.created).toEqual(['阿甲']);
      expect(report.failed).toHaveLength(1);
      expect(report.failed[0].line).toBe(2);
      expect(report.failed[0].reason).toContain('年级');
    } finally {
      await app.close();
    }
  });

  test('superAdmin 保护：重导时目标现为 superAdmin → role 不动、pinHash 不动', async () => {
    const store = new InMemoryGovStore(
      seedWith([
        member({
          id: 'm-boss',
          displayName: '队长',
          role: 'superAdmin',
          grade: 'senior',
          pinHash: 'scrypt:aa:bb',
        }),
      ]),
    );
    const app = buildHubServer({ store });
    try {
      // 表里把「队长」标成普通成员（无组长）——role 应保持 superAdmin。
      const csv = '姓名,年级,组,组长,验收人\n队长,大四,机械,,\n';
      const res = await app.inject({
        method: 'POST',
        url: '/api/roster/import',
        ...multipart(csv),
      });
      expect(res.statusCode).toBe(200);
      const snap = await store.getSnapshot();
      const boss = snap.members.find((m) => m.displayName === '队长')!;
      expect(boss.role).toBe('superAdmin'); // 保护：role 不动
      expect(boss.pinHash).toBe('scrypt:aa:bb'); // pinHash 永不动
      expect(boss.grade).toBe('senior'); // 大四 → senior，其余字段仍更新
    } finally {
      await app.close();
    }
  });

  test('GBK 编码（无 BOM）端到端导入成功', async () => {
    // 表头「姓名,年级,组\r\n」+ 行「李四,大三,电控\r\n」全 GBK 字节。
    const gbk = Buffer.from([
      0xd0, 0xd5, 0xc3, 0xfb, 0x2c, 0xc4, 0xea, 0xbc, 0xb6, 0x2c, 0xd7, 0xe9, 0x0d, 0x0a, 0xc0,
      0xee, 0xcb, 0xc4, 0x2c, 0xb4, 0xf3, 0xc8, 0xfd, 0x2c, 0xb5, 0xe7, 0xbf, 0xd8, 0x0d, 0x0a,
    ]);
    const store = new InMemoryGovStore(seedWith([]));
    const app = buildHubServer({ store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/roster/import',
        ...multipart(gbk),
      });
      expect(res.statusCode).toBe(200);
      const report = RosterImportReportSchema.parse(res.json());
      expect(report.created).toEqual(['李四']);
      expect(report.createdGroups).toEqual(['电控']);
    } finally {
      await app.close();
    }
  });

  test('无法识别的编码 → 400', async () => {
    const store = new InMemoryGovStore(seedWith([]));
    const app = buildHubServer({ store });
    try {
      const bad = Buffer.from([0x41, 0xff, 0x42]); // UTF-8 与 GBK 皆非法
      const res = await app.inject({
        method: 'POST',
        url: '/api/roster/import',
        ...multipart(bad),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().detail).toContain('编码');
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/roster/import — 身份模式', () => {
  test('空板豁免：名册为空 + 无会话 → 200 导入（解开空板死锁）', async () => {
    const store = new InMemoryGovStore(seedWith([]));
    const app = buildHubServer({ store, identityMode: 'identity' });
    try {
      const csv = '姓名,年级,组,组长,验收人\n首个队员,大三,机械,✓,\n';
      const res = await app.inject({
        method: 'POST',
        url: '/api/roster/import',
        ...multipart(csv), // 无 cookie
      });
      expect(res.statusCode).toBe(200);
      const report = RosterImportReportSchema.parse(res.json());
      expect(report.created).toEqual(['首个队员']);
    } finally {
      await app.close();
    }
  });

  test('名册非空 + 已登录但非 superAdmin → 403', async () => {
    const store = new InMemoryGovStore(
      seedWith([member({ id: 'm-plain', displayName: '普通成员', role: 'member' })]),
    );
    const app = buildHubServer({ store, identityMode: 'identity' });
    try {
      const cookie = await login(app, 'm-plain'); // 非 superAdmin
      const csv = '姓名,年级,组,组长,验收人\n谁,大三,机械,,\n';
      const payload = multipart(csv);
      const res = await app.inject({
        method: 'POST',
        url: '/api/roster/import',
        payload: payload.payload,
        headers: { ...payload.headers, cookie },
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  test('名册非空 + superAdmin 登录 → 200 导入', async () => {
    const store = new InMemoryGovStore(
      seedWith([member({ id: 'm-boss', displayName: '队长', role: 'superAdmin' })]),
    );
    const app = buildHubServer({ store, identityMode: 'identity' });
    try {
      const cookie = await login(app, 'm-boss');
      const csv = '姓名,年级,组,组长,验收人\n新兵,大一,机械,,\n';
      const payload = multipart(csv);
      const res = await app.inject({
        method: 'POST',
        url: '/api/roster/import',
        payload: payload.payload,
        headers: { ...payload.headers, cookie },
      });
      expect(res.statusCode).toBe(200);
      const report = RosterImportReportSchema.parse(res.json());
      expect(report.created).toEqual(['新兵']);
    } finally {
      await app.close();
    }
  });

  test('名册非空 + 无会话 → 401（引导豁免只对空板生效）', async () => {
    const store = new InMemoryGovStore(
      seedWith([member({ id: 'm-plain', displayName: '普通成员' })]),
    );
    const app = buildHubServer({ store, identityMode: 'identity' });
    try {
      const csv = '姓名,年级,组,组长,验收人\n谁,大三,机械,,\n';
      const res = await app.inject({
        method: 'POST',
        url: '/api/roster/import',
        ...multipart(csv),
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
