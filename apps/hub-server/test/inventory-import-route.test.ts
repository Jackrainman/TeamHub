import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import FormData from 'form-data';
import {
  InventoryImportReportSchema,
  InventoryPreviewResponseSchema,
  InventorySnapshotSchema,
  governanceScenarioFixture,
  inventoryScenarioFixture,
  type GovernanceSnapshot,
  type Group,
  type InventorySnapshot,
  type Member,
} from '@teamhub/hub-contracts';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { InMemoryGovStore } from './support/inmemory-gov-store.js';
import { InMemoryInvStore } from './support/inmemory-inv-store.js';

/**
 * 库存批量导入端到端（INV-BULK-IMPORT 刀⑪）：GET 模板 + POST preview（只解析不落库）+
 * POST import 双收（multipart / JSON 等价）+ partNumber 幂等 upsert（重导不翻倍、totalQuantity 覆盖、
 * trackIndividually/allocations 不动）+ GBK 编码 + 鉴权（身份非持旗 403 / 写门 Bearer）。
 */

// 构造单文件 multipart 请求体（照 roster-import-route.test.ts 先例）。
function multipart(content: Buffer | string, filename = 'inventory.csv') {
  const form = new FormData();
  form.append('file', Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'), {
    filename,
  });
  return { payload: form.getBuffer(), headers: form.getHeaders() };
}

/** 干净库存种子：保留 fixture 的 projectId，三数组清空。 */
function emptyInv(): InventorySnapshot {
  return { projectId: 'prj-robots', partTypes: [], trackedParts: [], actions: [] };
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

function seedGov(members: Member[], groups: readonly Group[] = [GRP_MECH]): GovernanceSnapshot {
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
async function login(app: ReturnType<typeof buildTestHubServer>, memberId: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/session', payload: { memberId } });
  const cookie = res.cookies.find((c) => c.name === 'teamhub_session');
  expect(cookie?.value).toBeTruthy();
  return `teamhub_session=${cookie!.value}`;
}

describe('GET /api/inventory/template', () => {
  test('200 + CSV 带 BOM + 六列表头 + 附件下载头', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/inventory/template' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.body.charCodeAt(0)).toBe(0xfeff);
      expect(res.body).toContain('件号,名称,类别,单位,总数,低储阈值');
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/inventory/preview — 只解析不落库', () => {
  test('解析返回 rows/failed，库存快照零变化', async () => {
    const invStore = new InMemoryInvStore(emptyInv());
    const app = buildTestHubServer({ invStore });
    try {
      const before = await invStore.getInventorySnapshot();
      const csv =
        '件号,名称,类别,单位,总数,低储阈值\n' +
        'GM6020,6020 云台电机,motor,个,6,2\n' +
        '坏行,,motor,个,1,\n';
      const res = await app.inject({
        method: 'POST',
        url: '/api/inventory/preview',
        ...multipart(csv),
      });
      expect(res.statusCode).toBe(200);
      const preview = InventoryPreviewResponseSchema.parse(res.json());
      expect(preview.rows).toHaveLength(1);
      expect(preview.rows[0]).toMatchObject({
        partNumber: 'GM6020',
        totalQuantity: 6,
        lowStockThreshold: 2,
        line: 2,
      });
      expect(preview.failed).toHaveLength(1);
      expect(preview.failed[0].line).toBe(3);
      // 不落库：三数组与调用前逐字相等。
      const after = await invStore.getInventorySnapshot();
      expect(after.partTypes).toEqual(before.partTypes);
      expect(after.actions).toEqual(before.actions);
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/inventory/import — 匿名模式', () => {
  test('multipart 导入：新建 + 坏行进 failed 不中断', async () => {
    const invStore = new InMemoryInvStore(emptyInv());
    const app = buildTestHubServer({ invStore });
    try {
      const csv =
        '件号,名称,类别,单位,总数,低储阈值\n' +
        'GM6020,6020 云台电机,motor,个,6,2\n' +
        'M4x10,M4 螺丝,mechanical,颗,200,\n' + // 阈值留空 → 新建钉 0
        '坏行,缺总数,motor,个,abc,\n';
      const res = await app.inject({
        method: 'POST',
        url: '/api/inventory/import',
        ...multipart(csv),
      });
      expect(res.statusCode).toBe(200);
      const report = InventoryImportReportSchema.parse(res.json());
      expect(report.created).toEqual(['GM6020', 'M4x10']);
      expect(report.updated).toEqual([]);
      expect(report.failed).toHaveLength(1);
      expect(report.failed[0].line).toBe(4);

      const snap = await invStore.getInventorySnapshot();
      expect(snap.partTypes).toHaveLength(2);
      const gm = snap.partTypes.find((p) => p.partNumber === 'GM6020')!;
      expect(gm.id).toMatch(/^parttype-new-/);
      expect(gm.projectId).toBe('prj-robots');
      expect(gm.trackIndividually).toBe(false); // 导入不产个体追踪
      expect(gm.allocations).toEqual([]);
      expect(gm.lowStockThreshold).toBe(2);
      const m4 = snap.partTypes.find((p) => p.partNumber === 'M4x10')!;
      expect(m4.lowStockThreshold).toBe(0); // 阈值留空 → 新建钉 0
    } finally {
      await app.close();
    }
  });

  test('幂等重导不翻倍：同件号 → updated，totalQuantity 覆盖不累加，trackIndividually/allocations/lastCountedAt 不动', async () => {
    // fixture GM6020：trackIndividually=true、allocations 两台车占用、lastCountedAt=场景时刻。
    const invStore = new InMemoryInvStore(inventoryScenarioFixture);
    const app = buildTestHubServer({ invStore });
    try {
      const before = await invStore.getInventorySnapshot();
      const gmBefore = before.partTypes.find((p) => p.partNumber === 'GM6020')!;
      const csv =
        '件号,名称,类别,单位,总数,低储阈值\n' +
        'GM6020,6020 云台电机（改名）,motor,个,12,\n'; // 阈值留空 → 保留既有 2
      for (let round = 0; round < 2; round++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/inventory/import',
          ...multipart(csv),
        });
        expect(res.statusCode).toBe(200);
        const report = InventoryImportReportSchema.parse(res.json());
        expect(report.created).toEqual([]);
        expect(report.updated).toEqual(['GM6020']);
      }
      const after = await invStore.getInventorySnapshot();
      expect(after.partTypes).toHaveLength(before.partTypes.length); // 不翻倍
      const gm = after.partTypes.find((p) => p.partNumber === 'GM6020')!;
      expect(gm.name).toBe('6020 云台电机（改名）');
      expect(gm.totalQuantity).toBe(12); // 覆盖，不是 9+12
      expect(gm.lowStockThreshold).toBe(2); // 行里没给 → 保留既有
      expect(gm.trackIndividually).toBe(true); // 不动既有行
      expect(gm.allocations).toEqual(gmBefore.allocations); // 占用不动
      expect(gm.lastCountedAt).toBe(gmBefore.lastCountedAt); // 盘点时刻不动
      // 其余零件（库里有但表里没有）原样保留、绝不删。
      expect(after.partTypes.find((p) => p.partNumber === 'C620')).toBeDefined();
    } finally {
      await app.close();
    }
  });

  test('JSON 与 multipart 等价：同语义的行 → 同一报告', async () => {
    const csv = '件号,名称,类别,单位,总数,低储阈值\nGM6020,6020 电机,motor,个,6,2\n';
    const rows = [
      {
        partNumber: 'GM6020',
        name: '6020 电机',
        category: 'motor',
        unit: '个',
        totalQuantity: 6,
        lowStockThreshold: 2,
        line: 2,
      },
    ];
    const appMultipart = buildTestHubServer({ invStore: new InMemoryInvStore(emptyInv()) });
    const appJson = buildTestHubServer({ invStore: new InMemoryInvStore(emptyInv()) });
    try {
      const resMultipart = await appMultipart.inject({
        method: 'POST',
        url: '/api/inventory/import',
        ...multipart(csv),
      });
      const resJson = await appJson.inject({
        method: 'POST',
        url: '/api/inventory/import',
        payload: { rows },
      });
      expect(resMultipart.statusCode).toBe(200);
      expect(resJson.statusCode).toBe(200);
      expect(InventoryImportReportSchema.parse(resJson.json())).toEqual(
        InventoryImportReportSchema.parse(resMultipart.json()),
      );
    } finally {
      await appMultipart.close();
      await appJson.close();
    }
  });

  test('JSON 非法 body（缺 rows / 负总数）→ 400，不落库', async () => {
    const invStore = new InMemoryInvStore(emptyInv());
    const app = buildTestHubServer({ invStore });
    try {
      const bad1 = await app.inject({
        method: 'POST',
        url: '/api/inventory/import',
        payload: { nope: true },
      });
      expect(bad1.statusCode).toBe(400);
      const bad2 = await app.inject({
        method: 'POST',
        url: '/api/inventory/import',
        payload: {
          rows: [
            { partNumber: 'X', name: '某件', category: 'motor', unit: '个', totalQuantity: -1 },
          ],
        },
      });
      expect(bad2.statusCode).toBe(400);
      expect((await invStore.getInventorySnapshot()).partTypes).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  test('GBK 编码（无 BOM）端到端导入成功', async () => {
    // 表头「件号,名称,类别,单位,总数,低储阈值\r\n」+ 行「GM6020,电机,motor,个,6,\r\n」全 GBK 字节。
    const gbk = Buffer.from([
      0xbc, 0xfe, 0xba, 0xc5, 0x2c, 0xc3, 0xfb, 0xb3, 0xc6, 0x2c, 0xc0, 0xe0, 0xb1, 0xf0, 0x2c,
      0xb5, 0xa5, 0xce, 0xbb, 0x2c, 0xd7, 0xdc, 0xca, 0xfd, 0x2c, 0xb5, 0xcd, 0xb4, 0xa2, 0xe3,
      0xd6, 0xd6, 0xb5, 0x0d, 0x0a, 0x47, 0x4d, 0x36, 0x30, 0x32, 0x30, 0x2c, 0xb5, 0xe7, 0xbb, 0xfa,
      0x2c, 0x6d, 0x6f, 0x74, 0x6f, 0x72, 0x2c, 0xb8, 0xf6, 0x2c, 0x36, 0x2c, 0x0d, 0x0a,
    ]);
    const invStore = new InMemoryInvStore(emptyInv());
    const app = buildTestHubServer({ invStore });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/inventory/import',
        ...multipart(gbk),
      });
      expect(res.statusCode).toBe(200);
      const report = InventoryImportReportSchema.parse(res.json());
      expect(report.created).toEqual(['GM6020']);
      const gm = (await invStore.getInventorySnapshot()).partTypes[0];
      expect(gm.name).toBe('电机');
      expect(gm.unit).toBe('个');
    } finally {
      await app.close();
    }
  });

  test('无法识别的编码 → 400', async () => {
    const app = buildTestHubServer({ invStore: new InMemoryInvStore(emptyInv()) });
    try {
      const bad = Buffer.from([0x41, 0xff, 0x42]); // UTF-8 与 GBK 皆非法
      const res = await app.inject({
        method: 'POST',
        url: '/api/inventory/import',
        ...multipart(bad),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().detail).toContain('编码');
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/inventory/import — 身份模式鉴权（无空板豁免，向导走到这步操作者已持旗）', () => {
  const csv = '件号,名称,类别,单位,总数,低储阈值\nGM6020,6020 电机,motor,个,6,\n';

  test('已登录但非持旗成员 → 403', async () => {
    const app = buildTestHubServer({
      store: new InMemoryGovStore(seedGov([member({ id: 'm-plain', displayName: '普通成员' })])),
      invStore: new InMemoryInvStore(emptyInv()),
      identityMode: 'identity',
    });
    try {
      const cookie = await login(app, 'm-plain');
      const payload = multipart(csv);
      const res = await app.inject({
        method: 'POST',
        url: '/api/inventory/import',
        payload: payload.payload,
        headers: { ...payload.headers, cookie },
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  test('持旗管理员登录 → 200 导入', async () => {
    const invStore = new InMemoryInvStore(emptyInv());
    const app = buildTestHubServer({
      store: new InMemoryGovStore(
        seedGov([member({ id: 'm-boss', displayName: '队长', projectManager: true })]),
      ),
      invStore,
      identityMode: 'identity',
    });
    try {
      const cookie = await login(app, 'm-boss');
      const payload = multipart(csv);
      const res = await app.inject({
        method: 'POST',
        url: '/api/inventory/import',
        payload: payload.payload,
        headers: { ...payload.headers, cookie },
      });
      expect(res.statusCode).toBe(200);
      expect(InventoryImportReportSchema.parse(res.json()).created).toEqual(['GM6020']);
    } finally {
      await app.close();
    }
  });

  test('无会话 → 401（写门「须有会话」段先挡，无空板豁免）', async () => {
    const app = buildTestHubServer({
      store: new InMemoryGovStore(seedGov([member({ id: 'm-plain', displayName: '普通成员' })])),
      invStore: new InMemoryInvStore(emptyInv()),
      identityMode: 'identity',
    });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/inventory/import',
        ...multipart(csv),
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  test('preview 同律：非持旗 403', async () => {
    const app = buildTestHubServer({
      store: new InMemoryGovStore(seedGov([member({ id: 'm-plain', displayName: '普通成员' })])),
      invStore: new InMemoryInvStore(emptyInv()),
      identityMode: 'identity',
    });
    try {
      const cookie = await login(app, 'm-plain');
      const payload = multipart(csv);
      const res = await app.inject({
        method: 'POST',
        url: '/api/inventory/preview',
        payload: payload.payload,
        headers: { ...payload.headers, cookie },
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});

describe('写门 × writeToken（匿名模式走 Bearer，照名册双轨范式）', () => {
  const csv = '件号,名称,类别,单位,总数,低储阈值\nGM6020,6020 电机,motor,个,6,\n';

  test('匿名 + 配 writeToken：无 Bearer 401；带 Bearer 200', async () => {
    const app = buildTestHubServer({
      invStore: new InMemoryInvStore(emptyInv()),
      writeToken: 'sekret',
    });
    try {
      const noAuth = await app.inject({
        method: 'POST',
        url: '/api/inventory/import',
        ...multipart(csv),
      });
      expect(noAuth.statusCode).toBe(401);
      const payload = multipart(csv);
      const withAuth = await app.inject({
        method: 'POST',
        url: '/api/inventory/import',
        payload: payload.payload,
        headers: { ...payload.headers, authorization: 'Bearer sekret' },
      });
      expect(withAuth.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
