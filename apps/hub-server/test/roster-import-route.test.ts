import { describe, expect, test } from 'vitest';
import FormData from 'form-data';
import {
  RosterImportReportSchema,
  RosterPreviewResponseSchema,
  governanceScenarioFixture,
  type GovernanceSnapshot,
  type Group,
  type Member,
} from '@teamhub/hub-contracts';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { InMemoryPmRepository } from './support/inmemory-gov-store.js';

/**
 * 名册导入端到端（ROSTER-IMPORT，K8）：GET 模板 + POST 导入（匿名成功 / 身份空板豁免 / 身份非管理员
 * 403 / 重导更新且旗标保护 / 自动建组 / missingFromSheet / GBK 编码 / 编码识别失败 400）。
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
function seedWith(members: Member[], groups: readonly Group[] = [GRP_MECH]): GovernanceSnapshot {
  return {
    ...governanceScenarioFixture,
    groups: [...groups],
    members,
    tasks: [],
    dependencies: [],
    needs: [],
    knowledgeNodes: [],
    taskKnowledgeTags: [],
  };
}

/** 身份模式登录，回带 session cookie（member 无 pinHash 免 PIN）。 */
async function login(app: ReturnType<typeof buildTestHubServer>, memberId: string): Promise<string> {
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
  test('200 + CSV 带 BOM + 三列表头 + 附件下载头（刀③）', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/roster/template' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.body.charCodeAt(0)).toBe(0xfeff); // BOM
      expect(res.body).toContain('姓名,年级,组');
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/roster/import — 匿名模式', () => {
  test('创建/更新/自动建组/missingFromSheet/autoReviewers 一次到位', async () => {
    const store = new InMemoryPmRepository(
      seedWith([
        member({ id: 'm-old1', displayName: '老队员甲', grade: 'freshman' }),
        member({ id: 'm-old2', displayName: '老队员乙' }),
      ]),
    );
    const app = buildTestHubServer({ store });
    try {
      const csv =
        '姓名,年级,组\n' +
        '老队员甲,大三,机械\n' + // 更新既有：grade→junior、验收人默认 true(auto)
        '新人丙,大一,电路\n' + // 新建 + 自动建组「电路」
        '新人丁,大四,机械\n'; // 新建，验收人默认 true（大四）
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
      expect(report.autoReviewers.sort()).toEqual(['新人丁', '老队员甲']);
      expect(report.missingFromSheet).toEqual(['老队员乙']);
      expect(report.failed).toEqual([]);

      // 落库核实：老队员甲 grade→junior、gateReviewer true、role 不动（刀③ 导入不写 role）；老队员乙不动、绝不删。
      const snap = await store.getSnapshot();
      const jiaa = snap.members.find((m) => m.displayName === '老队员甲')!;
      expect(jiaa.role).toBe('member');
      expect(jiaa.grade).toBe('junior');
      expect(jiaa.gateReviewer).toBe(true);
      expect(jiaa.updatedBy).toBe('console');
      expect(snap.members.find((m) => m.displayName === '老队员乙')).toBeDefined();
      // 新组「电路」已建、id 自动生成；新人挂到正确组、role 恒 member。
      const dianlu = snap.groups.find((g) => g.name === '电路')!;
      expect(dianlu.id).toMatch(/^grp-new-/);
      const bing = snap.members.find((m) => m.displayName === '新人丙')!;
      expect(bing.id).toMatch(/^member-new-/);
      expect(bing.groupId).toBe(dianlu.id);
      expect(bing.role).toBe('member');
      expect(bing.gateReviewer).toBe(false);
    } finally {
      await app.close();
    }
  });

  test('坏行进 failed（年级非法）不中断整批；末行无换行也解析', async () => {
    const store = new InMemoryPmRepository(seedWith([]));
    const app = buildTestHubServer({ store });
    try {
      const csv = '姓名,年级,组\n错的,大五,机械\n阿甲,大三,机械'; // 无尾换行
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

  test('旗标 + role 双保护：重导时目标持旗且已是组长 → 旗标 / role / pinHash 全不动（刀③ 导入不写 role）', async () => {
    const store = new InMemoryPmRepository(
      seedWith([
        member({
          id: 'm-boss',
          displayName: '队长',
          role: 'groupAdmin',
          projectManager: true,
          grade: 'senior',
          pinHash: 'scrypt:aa:bb',
        }),
      ]),
    );
    const app = buildTestHubServer({ store });
    try {
      // 重导（不含任何 role 信息）——旗标 / role / pinHash 全不动，其余字段照表更新。
      const csv = '姓名,年级,组\n队长,大四,机械\n';
      const res = await app.inject({
        method: 'POST',
        url: '/api/roster/import',
        ...multipart(csv),
      });
      expect(res.statusCode).toBe(200);
      const snap = await store.getSnapshot();
      const boss = snap.members.find((m) => m.displayName === '队长')!;
      expect(boss.role).toBe('groupAdmin'); // role 永不动（重导幂等不洗已任命组长）
      expect(boss.projectManager).toBe(true); // 旗标永不动（导入不洗）
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
    const store = new InMemoryPmRepository(seedWith([]));
    const app = buildTestHubServer({ store });
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
    const store = new InMemoryPmRepository(seedWith([]));
    const app = buildTestHubServer({ store });
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

  // 刀④ PROGRAM-GROUP-ABSTRACT：CSV 写「程序」不再静默命中 grp-program——非叶子/哨兵组是汇报视角、
  // 不可挂人，该行拒进 failed（说明原因 + 指回原行）；叶子组与本批新建组不受影响。
  test('刀④：组名命中非叶子/哨兵组 → 拒行进 failed（指回原行+说明）；叶子组正常导入', async () => {
    const store = new InMemoryPmRepository(
      seedWith(
        [],
        [
          { id: 'grp-program', seasonId: 'season-robocon-2026', parentGroupId: null, name: '程序', kind: 'program' },
          { id: 'grp-ec', seasonId: 'season-robocon-2026', parentGroupId: 'grp-program', name: '电控', kind: 'electrical' },
          { id: 'grp-convergence', seasonId: 'season-robocon-2026', parentGroupId: null, name: '全组联调', kind: 'custom' },
        ],
      ),
    );
    const app = buildTestHubServer({ store });
    try {
      const csv =
        '姓名,年级,组\n' +
        '程甲,大三,程序\n' + // 行2：非叶子（有子组 grp-ec）→ 拒
        '联乙,大二,全组联调\n' + // 行3：哨兵组 → 拒
        '电丙,大一,电控\n'; // 行4：叶子组 → 正常
      const res = await app.inject({
        method: 'POST',
        url: '/api/roster/import',
        ...multipart(csv),
      });
      expect(res.statusCode).toBe(200);
      const report = RosterImportReportSchema.parse(res.json());
      expect(report.created).toEqual(['电丙']);
      expect(report.failed).toHaveLength(2);
      expect(report.failed.map((f) => f.line)).toEqual([2, 3]);
      expect(report.failed[0].reason).toContain('程序');
      expect(report.failed[0].reason).toContain('汇报视角');
      // 被拒的成员没落库（不建不改）；叶子组那位正常挂 grp-ec。
      const snap = await store.getSnapshot();
      expect(snap.members.find((m) => m.displayName === '程甲')).toBeUndefined();
      expect(snap.members.find((m) => m.displayName === '联乙')).toBeUndefined();
      expect(snap.members.find((m) => m.displayName === '电丙')?.groupId).toBe('grp-ec');
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/roster/import — 身份模式', () => {
  test('空板豁免：名册为空 + 无会话 → 200 导入（解开空板死锁）', async () => {
    const store = new InMemoryPmRepository(seedWith([]));
    const app = buildTestHubServer({ store, identityMode: 'identity' });
    try {
      const csv = '姓名,年级,组\n首个队员,大三,机械\n';
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

  test('名册非空 + 已登录但非持旗成员 → 403', async () => {
    const store = new InMemoryPmRepository(
      seedWith([member({ id: 'm-plain', displayName: '普通成员', role: 'member' })]),
    );
    const app = buildTestHubServer({ store, identityMode: 'identity' });
    try {
      const cookie = await login(app, 'm-plain'); // 非持旗成员
      const csv = '姓名,年级,组\n谁,大三,机械\n';
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

  test('名册非空 + 持旗管理员登录 → 200 导入', async () => {
    const store = new InMemoryPmRepository(
      seedWith([member({ id: 'm-boss', displayName: '队长', projectManager: true })]),
    );
    const app = buildTestHubServer({ store, identityMode: 'identity' });
    try {
      const cookie = await login(app, 'm-boss');
      const csv = '姓名,年级,组\n新兵,大一,机械\n';
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
    const store = new InMemoryPmRepository(
      seedWith([member({ id: 'm-plain', displayName: '普通成员' })]),
    );
    const app = buildTestHubServer({ store, identityMode: 'identity' });
    try {
      const csv = '姓名,年级,组\n谁,大三,机械\n';
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

describe('POST /api/roster/preview — 只解析不落库（ROSTER-IMPORT-PREVIEW 刀⑦）', () => {
  test('解析返回 rows/failed，store 快照零变化（不落库）', async () => {
    const store = new InMemoryPmRepository(
      seedWith([member({ id: 'm-old', displayName: '老队员' })]),
    );
    const app = buildTestHubServer({ store });
    try {
      const before = await store.getSnapshot();
      const csv = '姓名,年级,组\n新人甲,大三,电控\n错的,大五,机械\n';
      const res = await app.inject({
        method: 'POST',
        url: '/api/roster/preview',
        ...multipart(csv),
      });
      expect(res.statusCode).toBe(200);
      const preview = RosterPreviewResponseSchema.parse(res.json());
      expect(preview.rows).toHaveLength(1);
      expect(preview.rows[0]).toMatchObject({
        displayName: '新人甲',
        grade: 'junior',
        groupName: '电控',
        gateReviewer: true,
        gateReviewerAuto: true,
        line: 2,
      });
      expect(preview.failed).toHaveLength(1);
      expect(preview.failed[0].line).toBe(3);
      expect(preview.failed[0].reason).toContain('年级');
      // 不落库：成员 / 组快照与调用前逐字相等（preview 不建人也不建组）。
      const after = await store.getSnapshot();
      expect(after.members).toEqual(before.members);
      expect(after.groups).toEqual(before.groups);
    } finally {
      await app.close();
    }
  });

  test('GBK 字节（无 BOM）可解析返回行', async () => {
    // 表头「姓名,年级,组\r\n」+ 行「李四,大三,电控\r\n」全 GBK 字节（同 import 的 GBK 用例）。
    const gbk = Buffer.from([
      0xd0, 0xd5, 0xc3, 0xfb, 0x2c, 0xc4, 0xea, 0xbc, 0xb6, 0x2c, 0xd7, 0xe9, 0x0d, 0x0a, 0xc0,
      0xee, 0xcb, 0xc4, 0x2c, 0xb4, 0xf3, 0xc8, 0xfd, 0x2c, 0xb5, 0xe7, 0xbf, 0xd8, 0x0d, 0x0a,
    ]);
    const store = new InMemoryPmRepository(seedWith([]));
    const app = buildTestHubServer({ store });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/roster/preview',
        ...multipart(gbk),
      });
      expect(res.statusCode).toBe(200);
      const preview = RosterPreviewResponseSchema.parse(res.json());
      expect(preview.rows).toHaveLength(1);
      expect(preview.rows[0].displayName).toBe('李四');
      expect(preview.rows[0].groupName).toBe('电控');
      expect(preview.failed).toEqual([]);
      expect((await store.getSnapshot()).members).toHaveLength(0); // 不落库
    } finally {
      await app.close();
    }
  });

  test('鉴权三态：空板匿名放行 / 非空无会话 401 / 非持旗 403（与 import 同律）', async () => {
    const csv = '姓名,年级,组\n谁,大三,机械\n';
    // ① 空板匿名（identity 模式、无会话）→ 200
    const emptyStore = new InMemoryPmRepository(seedWith([]));
    const appEmpty = buildTestHubServer({ store: emptyStore, identityMode: 'identity' });
    try {
      const res = await appEmpty.inject({
        method: 'POST',
        url: '/api/roster/preview',
        ...multipart(csv),
      });
      expect(res.statusCode).toBe(200);
      expect((await emptyStore.getSnapshot()).members).toHaveLength(0); // 放行也不落库
    } finally {
      await appEmpty.close();
    }
    // ② 非空 + 无会话 → 401
    const appNoSession = buildTestHubServer({
      store: new InMemoryPmRepository(seedWith([member({ id: 'm-plain', displayName: '普通成员' })])),
      identityMode: 'identity',
    });
    try {
      const res = await appNoSession.inject({
        method: 'POST',
        url: '/api/roster/preview',
        ...multipart(csv),
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await appNoSession.close();
    }
    // ③ 非空 + 已登录但非持旗 → 403
    const appForbidden = buildTestHubServer({
      store: new InMemoryPmRepository(seedWith([member({ id: 'm-plain', displayName: '普通成员' })])),
      identityMode: 'identity',
    });
    try {
      const cookie = await login(appForbidden, 'm-plain');
      const payload = multipart(csv);
      const res = await appForbidden.inject({
        method: 'POST',
        url: '/api/roster/preview',
        payload: payload.payload,
        headers: { ...payload.headers, cookie },
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await appForbidden.close();
    }
  });
});

describe('POST /api/roster/import — JSON body（刀⑦ 双收）', () => {
  test('JSON 与 multipart 等价：同语义的行 → 同一报告', async () => {
    // 两个同种子 store：一个走 multipart CSV，一个走 JSON {rows}（行草稿 = 编辑载体）。
    const csv = '姓名,年级,组\n新人丙,大一,电路\n新人丁,大四,机械\n';
    const rows = [
      {
        displayName: '新人丙',
        grade: 'freshman',
        groupName: '电路',
        gateReviewer: false,
        gateReviewerAuto: false,
        line: 2,
      },
      {
        displayName: '新人丁',
        grade: 'senior',
        groupName: '机械',
        gateReviewer: true,
        gateReviewerAuto: true,
        line: 3,
      },
    ];
    const appMultipart = buildTestHubServer({ store: new InMemoryPmRepository(seedWith([])) });
    const appJson = buildTestHubServer({ store: new InMemoryPmRepository(seedWith([])) });
    try {
      const resMultipart = await appMultipart.inject({
        method: 'POST',
        url: '/api/roster/import',
        ...multipart(csv),
      });
      const resJson = await appJson.inject({
        method: 'POST',
        url: '/api/roster/import',
        payload: { rows },
      });
      expect(resMultipart.statusCode).toBe(200);
      expect(resJson.statusCode).toBe(200);
      const reportMultipart = RosterImportReportSchema.parse(resMultipart.json());
      const reportJson = RosterImportReportSchema.parse(resJson.json());
      expect(reportJson).toEqual(reportMultipart);
      expect(reportJson.created.sort()).toEqual(['新人丁', '新人丙']); // 码点序：丁(U+4E01) < 丙(U+4E19)
      expect(reportJson.createdGroups).toEqual(['电路']);
    } finally {
      await appMultipart.close();
      await appJson.close();
    }
  });

  test('JSON 非法 body（缺 rows / 年级非法）→ 400，不落库', async () => {
    const store = new InMemoryPmRepository(seedWith([]));
    const app = buildTestHubServer({ store });
    try {
      const bad1 = await app.inject({
        method: 'POST',
        url: '/api/roster/import',
        payload: { nope: true },
      });
      expect(bad1.statusCode).toBe(400);
      const bad2 = await app.inject({
        method: 'POST',
        url: '/api/roster/import',
        payload: {
          rows: [
            {
              displayName: '谁',
              grade: '大五',
              groupName: '机械',
              gateReviewer: false,
              gateReviewerAuto: false,
            },
          ],
        },
      });
      expect(bad2.statusCode).toBe(400);
      expect((await store.getSnapshot()).members).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  test('JSON 鉴权三态：空板匿名放行 / 非空无会话 401 / 非持旗 403', async () => {
    const body = {
      rows: [
        {
          displayName: '谁',
          grade: 'junior',
          groupName: '机械',
          gateReviewer: true,
          gateReviewerAuto: true,
        },
      ],
    };
    // ① 空板匿名 → 200 导入
    const appEmpty = buildTestHubServer({
      store: new InMemoryPmRepository(seedWith([])),
      identityMode: 'identity',
    });
    try {
      const res = await appEmpty.inject({
        method: 'POST',
        url: '/api/roster/import',
        payload: body,
      });
      expect(res.statusCode).toBe(200);
      expect(RosterImportReportSchema.parse(res.json()).created).toEqual(['谁']);
    } finally {
      await appEmpty.close();
    }
    // ② 非空 + 无会话 → 401
    const appNoSession = buildTestHubServer({
      store: new InMemoryPmRepository(seedWith([member({ id: 'm-plain', displayName: '普通成员' })])),
      identityMode: 'identity',
    });
    try {
      const res = await appNoSession.inject({
        method: 'POST',
        url: '/api/roster/import',
        payload: body,
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await appNoSession.close();
    }
    // ③ 非空 + 非持旗 → 403
    const appForbidden = buildTestHubServer({
      store: new InMemoryPmRepository(seedWith([member({ id: 'm-plain', displayName: '普通成员' })])),
      identityMode: 'identity',
    });
    try {
      const cookie = await login(appForbidden, 'm-plain');
      const res = await appForbidden.inject({
        method: 'POST',
        url: '/api/roster/import',
        payload: body,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await appForbidden.close();
    }
  });
});

describe('写门 × writeToken（刀⑦ preview 豁免，照 authz-route 双轨范式）', () => {
  test('身份 + 配 writeToken：无 Bearer 调 preview 不被写门 401 挡在路由外（鉴权收敛路由内）', async () => {
    // 空板：写门放行（豁免面同 import），路由内空板豁免 → 200。若误被写门拦截会回 401 'unauthorized'。
    const appEmpty = buildTestHubServer({
      store: new InMemoryPmRepository(seedWith([])),
      identityMode: 'identity',
      writeToken: 'sekret',
    });
    try {
      const res = await appEmpty.inject({
        method: 'POST',
        url: '/api/roster/preview',
        ...multipart('姓名,年级,组\n谁,大三,机械\n'), // 无 Bearer、无会话
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await appEmpty.close();
    }
    // 非空 + 无会话：仍放行过写门，由路由判 401 'login required'（非写门的 'unauthorized'）。
    const appNonEmpty = buildTestHubServer({
      store: new InMemoryPmRepository(seedWith([member({ id: 'm-plain', displayName: '普通成员' })])),
      identityMode: 'identity',
      writeToken: 'sekret',
    });
    try {
      const res = await appNonEmpty.inject({
        method: 'POST',
        url: '/api/roster/preview',
        ...multipart('姓名,年级,组\n谁,大三,机械\n'),
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().detail).toBe('login required');
    } finally {
      await appNonEmpty.close();
    }
  });
});
