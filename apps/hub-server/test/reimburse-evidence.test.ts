import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import FormData from 'form-data';
import {
  CreateReimburseEntryResponseSchema,
  ReimburseBatchResponseSchema,
  governanceScenarioFixture,
} from '@teamhub/hub-contracts';
import type { GovernanceSnapshot, Group, Member, ReimburseEvidence } from '@teamhub/hub-contracts';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { usernameOf } from './support/login-helpers.js';
import { InMemoryPmRepository } from './support/inmemory-pm-repository.js';
import { InMemoryInvStore } from './support/inmemory-inv-store.js';
import { InMemoryReimburseStore } from './support/inmemory-reimburse-store.js';

/**
 * 凭证受控留档端到端（REIMBURSE-EVIDENCE-STORE / D-094）：
 *  - 上传只认条目本人（超管也不能代传），字节落受控卷、元数据挂条目行；
 *  - 下载/删除/留痕查询走「本人→管理员」读者链，每次成功下载留一条操作者痕迹；
 *  - 拒绝的后缀/越权不得留下孤儿字节；批次提交后快照锁同样锁凭证。
 * 身份与批次搭建照 reimburse-routes.test.ts 先例，落卷断言照 artifact-upload.test.ts 先例。
 */

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

const MEMBERS: Member[] = [
  member({ id: 'm-a', displayName: '成员A' }),
  member({ id: 'm-b', displayName: '成员B' }),
  member({ id: 'm-admin', displayName: '管理员', projectManager: true }),
];

function seedGov(): GovernanceSnapshot {
  return {
    ...governanceScenarioFixture,
    groups: [GRP_MECH as Group],
    members: MEMBERS.map((m) => ({ ...m })),
    tasks: [],
    dependencies: [],
    needs: [],
    knowledgeNodes: [],
    taskKnowledgeTags: [],
  };
}

const REIMB_USERNAMES: Readonly<Record<string, string>> = {
  'm-a': '成员A',
  'm-b': '成员B',
  'm-admin': '管理员',
};

async function login(app: FastifyInstance, memberId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/session',
    payload: { username: usernameOf(memberId, REIMB_USERNAMES) },
  });
  const cookie = res.cookies.find((c) => c.name === 'teamhub_session');
  expect(cookie?.value).toBeTruthy();
  const cookieHeader = `teamhub_session=${cookie!.value}`;
  await app.inject({
    method: 'PUT',
    url: `/api/members/${memberId}/pin`,
    headers: { cookie: cookieHeader },
    payload: { pin: '1234abcd' },
  });
  return cookieHeader;
}

function buildTestApp() {
  return buildTestHubServer({
    store: new InMemoryPmRepository(seedGov()),
    inventoryRepository: new InMemoryInvStore(),
    reimburseStore: new InMemoryReimburseStore(),
    identityMode: 'identity',
  });
}

let invoiceSeq = 0;
/** goods 写体（每次调用给唯一发票号，防用例间互撞查重）。 */
function goodsEntryPayload() {
  invoiceSeq += 1;
  return {
    projectId: 'prj-robots',
    kind: 'goods',
    invoiceNo: `20260701${String(invoiceSeq).padStart(12, '0')}`,
    invoiceDate: '2026-07-01',
    seller: '某某五金店',
    purchaserName: '哈尔滨工业大学',
    purchaserTaxNo: '12100000400000456B',
    recognitionSource: 'xml',
    totalAmountFen: 2500,
    items: [{ name: 'M3×8 螺丝', unit: '个', quantity: 20, unitPriceFen: 100, amountFen: 2000 }],
    actualItemName: null,
    materials: { paymentShot: false, inspection: false },
    note: null,
  };
}

async function createEntry(app: FastifyInstance, cookie: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/reimburse/entries',
    headers: { cookie },
    payload: goodsEntryPayload(),
  });
  expect(res.statusCode).toBe(201);
  return CreateReimburseEntryResponseSchema.parse(res.json()).entry;
}

/** kind 必须先于 file 拼（busboy 才保证字段在文件回调前可读）。 */
function evidenceForm(kind: string, filename: string, content: string) {
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', Buffer.from(content), { filename });
  return form;
}

async function upload(
  app: FastifyInstance,
  cookie: string,
  entryId: string,
  kind: string,
  filename: string,
  content = '%PDF-1.4 fake invoice',
) {
  const form = evidenceForm(kind, filename, content);
  return app.inject({
    method: 'POST',
    url: `/api/reimburse/entries/${entryId}/evidence`,
    headers: { ...form.getHeaders(), cookie },
    payload: form.getBuffer(),
  });
}

async function listEvidence(app: FastifyInstance, cookie: string, entryId: string) {
  const res = await app.inject({
    method: 'GET',
    url: `/api/reimburse/entries/${entryId}/evidence`,
    headers: { cookie },
  });
  expect(res.statusCode).toBe(200);
  return res.json().evidence as ReimburseEvidence[];
}

const PREV_DIR = process.env.TEAMHUB_EVIDENCE_FILES_DIR;
let dir: string;
let app: FastifyInstance;
let cookieA: string;
let cookieB: string;
let cookieAdmin: string;

beforeAll(async () => {
  app = buildTestApp();
  cookieA = await login(app, 'm-a');
  cookieB = await login(app, 'm-b');
  cookieAdmin = await login(app, 'm-admin');
});

afterAll(async () => {
  await app.close();
  if (PREV_DIR === undefined) delete process.env.TEAMHUB_EVIDENCE_FILES_DIR;
  else process.env.TEAMHUB_EVIDENCE_FILES_DIR = PREV_DIR;
});

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'reimburse-evidence-'));
  process.env.TEAMHUB_EVIDENCE_FILES_DIR = dir;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('POST /api/reimburse/entries/:id/evidence — 上传', () => {
  test('本人上传发票 PDF → 201 + 条目挂元数据 + 字节以 <evidenceId>.pdf 落卷', async () => {
    const entry = await createEntry(app, cookieA);
    const res = await upload(app, cookieA, entry.id, 'invoice', '发票 第一联.pdf');
    expect(res.statusCode).toBe(201);

    const body = res.json();
    expect(body.evidence.kind).toBe('invoice');
    expect(body.evidence.originalName).toBe('发票 第一联.pdf');
    expect(body.evidence.ext).toBe('.pdf');
    expect(body.evidence.sizeBytes).toBe(Buffer.byteLength('%PDF-1.4 fake invoice'));
    expect(body.evidence.sha256).toHaveLength(64);
    expect(body.evidence.uploadedBy).toBe('m-a');
    expect(body.entry).toBeUndefined(); // 回执不回条目对象：清单只走专属端点
    expect((await listEvidence(app, cookieA, entry.id)).map((e) => e.id)).toEqual([body.evidence.id]);
    expect(await readdir(dir)).toEqual([`${body.evidence.id}.pdf`]);
  });

  test('原始名带路径段 → 剥成基名（下载名不可注入路径）', async () => {
    const entry = await createEntry(app, cookieA);
    const res = await upload(app, cookieA, entry.id, 'paymentShot', 'C:\\截图\\wechat.png');
    expect(res.statusCode).toBe(201);
    expect(res.json().evidence.originalName).toBe('wechat.png');
    expect(res.json().evidence.ext).toBe('.png');
  });

  test('非本人上传 → 403 且不留孤儿字节；超管也不能代传', async () => {
    const entry = await createEntry(app, cookieA);
    expect((await upload(app, cookieB, entry.id, 'invoice', 'x.pdf')).statusCode).toBe(403);
    expect((await upload(app, cookieAdmin, entry.id, 'invoice', 'x.pdf')).statusCode).toBe(403);
    expect(await readdir(dir)).toEqual([]);
  });

  test('未知条目 → 404 且不落卷', async () => {
    const res = await upload(app, cookieA, 'reimb-new-nope', 'invoice', 'x.pdf');
    expect(res.statusCode).toBe(404);
    expect(await readdir(dir)).toEqual([]);
  });

  test('.exe 后缀 → 415；kind 非法 → 400', async () => {
    const entry = await createEntry(app, cookieA);
    expect((await upload(app, cookieA, entry.id, 'invoice', 'evil.exe')).statusCode).toBe(415);
    expect((await upload(app, cookieA, entry.id, 'receipt', 'x.pdf')).statusCode).toBe(400);
    expect(await readdir(dir)).toEqual([]);
  });

  test('未配置留档目录 → 400 STORAGE_UNCONFIGURED', async () => {
    const entry = await createEntry(app, cookieA);
    delete process.env.TEAMHUB_EVIDENCE_FILES_DIR;
    try {
      const res = await upload(app, cookieA, entry.id, 'invoice', 'x.pdf');
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('REIMBURSE_EVIDENCE_STORAGE_UNCONFIGURED');
    } finally {
      process.env.TEAMHUB_EVIDENCE_FILES_DIR = dir;
    }
  });

  test('批次提交后上传 → 409 快照锁', async () => {
    const entry = await createEntry(app, cookieA);
    await submitWithEntry(entry.id);
    const res = await upload(app, cookieA, entry.id, 'invoice', 'x.pdf');
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('REIMBURSE_BATCH_LOCKED');
    expect(await readdir(dir)).toEqual([]);
  });

  test('创建体注入 evidence → parse 阶段剥掉，新条目恒空留档', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/reimburse/entries',
      headers: { cookie: cookieA },
      payload: {
        ...goodsEntryPayload(),
        evidence: [
          {
            id: 'revd-new-999',
            kind: 'invoice',
            originalName: '伪造.pdf',
            ext: '.pdf',
            sizeBytes: 1,
            sha256: '0'.repeat(64),
            uploadedBy: 'm-b',
            uploadedAt: '2026-07-01T00:00:00.000Z',
          },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().entry.evidence).toEqual([]);
    expect(await readdir(dir)).toEqual([]);
  });
});

describe('GET /api/reimburse/entries/:id/evidence/:evidenceId/download — 读者链与留痕', () => {
  test('本人下载 → 200 + 原始名回显 + 留痕记本人', async () => {
    const entry = await createEntry(app, cookieA);
    const up = await upload(app, cookieA, entry.id, 'invoice', '发票.pdf');
    const evidenceId = up.json().evidence.id;

    const res = await app.inject({
      method: 'GET',
      url: `/api/reimburse/entries/${entry.id}/evidence/${evidenceId}/download`,
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain(encodeURIComponent('发票.pdf'));
    expect(res.body).toContain('%PDF-1.4');

    const log = await app.inject({
      method: 'GET',
      url: `/api/reimburse/entries/${entry.id}/evidence-downloads`,
      headers: { cookie: cookieA },
    });
    expect(log.json().downloads).toMatchObject([{ entryId: entry.id, evidenceId, actorId: 'm-a' }]);
  });

  test('超管下载 → 200 且留痕记超管；他人下载 → 403 且不写留痕', async () => {
    const entry = await createEntry(app, cookieA);
    const evidenceId = (await upload(app, cookieA, entry.id, 'inspection', '查验单.png'))
      .json().evidence.id;

    const asAdmin = await app.inject({
      method: 'GET',
      url: `/api/reimburse/entries/${entry.id}/evidence/${evidenceId}/download`,
      headers: { cookie: cookieAdmin },
    });
    expect(asAdmin.statusCode).toBe(200);
    expect(asAdmin.headers['content-type']).toBe('image/png');

    const asOther = await app.inject({
      method: 'GET',
      url: `/api/reimburse/entries/${entry.id}/evidence/${evidenceId}/download`,
      headers: { cookie: cookieB },
    });
    expect(asOther.statusCode).toBe(403);

    const log = await app.inject({
      method: 'GET',
      url: `/api/reimburse/entries/${entry.id}/evidence-downloads`,
      headers: { cookie: cookieAdmin },
    });
    expect(log.json().downloads.map((d: { actorId: string }) => d.actorId)).toEqual(['m-admin']);
  });

  test('元数据在、字节不在 → 404；未知凭证 id → 404', async () => {
    const entry = await createEntry(app, cookieA);
    const evidenceId = (await upload(app, cookieA, entry.id, 'invoice', 'x.pdf')).json().evidence
      .id as string;
    expect(await readdir(dir)).toEqual([`${evidenceId}.pdf`]);
    await rm(path.join(dir, `${evidenceId}.pdf`));

    const missing = await app.inject({
      method: 'GET',
      url: `/api/reimburse/entries/${entry.id}/evidence/${evidenceId}/download`,
      headers: { cookie: cookieA },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe('REIMBURSE_EVIDENCE_FILE_MISSING');

    const unknown = await app.inject({
      method: 'GET',
      url: `/api/reimburse/entries/${entry.id}/evidence/revd-new-999/download`,
      headers: { cookie: cookieA },
    });
    expect(unknown.statusCode).toBe(404);
  });

  test('未登录 → 401', async () => {
    const entry = await createEntry(app, cookieA);
    const res = await app.inject({
      method: 'GET',
      url: `/api/reimburse/entries/${entry.id}/evidence-downloads`,
    });
    expect(res.statusCode).toBe(401);
  });

  test('跨条目取他人凭证 → 404/403（不得靠条目 id 绕过读者链）', async () => {
    const mine = await createEntry(app, cookieA);
    const theirs = await createEntry(app, cookieB);
    const evidenceId = (await upload(app, cookieB, theirs.id, 'invoice', 'b.pdf')).json().evidence.id;

    const res = await app.inject({
      method: 'GET',
      url: `/api/reimburse/entries/${mine.id}/evidence/${evidenceId}/download`,
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/reimburse/entries/:id/evidence/:evidenceId — 删除', () => {
  test('本人删除 → 元数据剥掉 + 字节清掉 + 留痕保留（审计面不随删）', async () => {
    const entry = await createEntry(app, cookieA);
    const evidenceId = (await upload(app, cookieA, entry.id, 'invoice', 'x.pdf')).json().evidence.id;
    await app.inject({
      method: 'GET',
      url: `/api/reimburse/entries/${entry.id}/evidence/${evidenceId}/download`,
      headers: { cookie: cookieA },
    });

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/reimburse/entries/${entry.id}/evidence/${evidenceId}`,
      headers: { cookie: cookieA },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().evidence).toEqual([]);
    expect(await readdir(dir)).toEqual([]);

    const log = await app.inject({
      method: 'GET',
      url: `/api/reimburse/entries/${entry.id}/evidence-downloads`,
      headers: { cookie: cookieA },
    });
    expect(log.json().downloads).toHaveLength(1);
  });

  test('他人删除 → 403 且字节仍在', async () => {
    const entry = await createEntry(app, cookieA);
    const evidenceId = (await upload(app, cookieA, entry.id, 'invoice', 'x.pdf')).json().evidence.id;
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/reimburse/entries/${entry.id}/evidence/${evidenceId}`,
      headers: { cookie: cookieB },
    });
    expect(res.statusCode).toBe(403);
    expect(await readdir(dir)).toEqual([`${evidenceId}.pdf`]);
  });

  test('批次提交后删除 → 409 快照锁', async () => {
    const entry = await createEntry(app, cookieA);
    const evidenceId = (await upload(app, cookieA, entry.id, 'invoice', 'x.pdf')).json().evidence.id;
    await submitWithEntry(entry.id);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/reimburse/entries/${entry.id}/evidence/${evidenceId}`,
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('凭证不出列表面（D-094「永不进列表」）', () => {
  test('GET/POST/PATCH 的条目对象一律不含凭证元数据（本人与超管都一样）', async () => {
    const entry = await createEntry(app, cookieA);
    await upload(app, cookieA, entry.id, 'invoice', 'x.pdf');

    const asOwner = await app.inject({
      method: 'GET',
      url: '/api/reimburse/entries',
      headers: { cookie: cookieA },
    });
    expect(asOwner.json().entries.find((e: { id: string }) => e.id === entry.id).evidence).toEqual([]);

    const asAdmin = await app.inject({
      method: 'GET',
      url: '/api/reimburse/entries',
      headers: { cookie: cookieAdmin },
    });
    expect(JSON.stringify(asAdmin.json())).not.toMatch(/sha256|originalName|uploadedBy/);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/reimburse/entries/${entry.id}`,
      headers: { cookie: cookieA },
      payload: { note: '补备注' },
    });
    expect(patched.json().entry.evidence).toEqual([]);
    expect(await listEvidence(app, cookieA, entry.id)).toHaveLength(1);
  });

  test('清单端点读者链：本人 200、超管 200、他人 403、未登录 401', async () => {
    const entry = await createEntry(app, cookieA);
    await upload(app, cookieA, entry.id, 'paymentShot', 'pay.png', 'png-bytes');

    expect(await listEvidence(app, cookieAdmin, entry.id)).toHaveLength(1);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/reimburse/entries/${entry.id}/evidence`,
          headers: { cookie: cookieB },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({ method: 'GET', url: `/api/reimburse/entries/${entry.id}/evidence` })
      ).statusCode,
    ).toBe(401);
  });
});

describe('凭证不出聚合面（D-094）', () => {
  test('批次聚合响应不含任何凭证字段', async () => {
    const entry = await createEntry(app, cookieA);
    await upload(app, cookieA, entry.id, 'invoice', 'x.pdf');
    const { batchId } = await submitWithEntry(entry.id);

    const list = await app.inject({
      method: 'GET',
      url: '/api/reimburse/batches',
      headers: { cookie: cookieAdmin },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().batches.map((b: { id: string }) => b.id)).toContain(batchId);
    expect(JSON.stringify(list.json())).not.toMatch(/evidence|sha256|originalName/i);
  });
});

/**
 * 条目装批（本人 PATCH，材料补齐过质量门）→ 超管提交批次。此后条目进快照锁。
 */
async function submitWithEntry(entryId: string): Promise<{ batchId: string }> {
  const batchRes = await app.inject({
    method: 'POST',
    url: '/api/reimburse/batches',
    headers: { cookie: cookieAdmin },
    payload: { projectId: 'prj-robots', name: '留档锁批' },
  });
  expect(batchRes.statusCode).toBe(201);
  const batchId = ReimburseBatchResponseSchema.parse(batchRes.json()).batch.id;

  const assign = await app.inject({
    method: 'PATCH',
    url: `/api/reimburse/entries/${entryId}`,
    headers: { cookie: cookieA },
    payload: { batchId, materials: { paymentShot: true, inspection: true } },
  });
  expect(assign.statusCode).toBe(200);

  const submit = await app.inject({
    method: 'PATCH',
    url: `/api/reimburse/batches/${batchId}`,
    headers: { cookie: cookieAdmin },
    payload: { status: 'submitted' },
  });
  expect(submit.statusCode).toBe(200);
  return { batchId };
}
